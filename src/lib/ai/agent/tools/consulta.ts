/**
 * GO Assistant — herramientas de lectura.
 *
 * Riesgo `low`: se ejecutan sin confirmación (§6.2). No escriben nada, así que
 * pedirle permiso al usuario para *mirar* su propio catálogo sería ruido.
 *
 * Son las que hacen que el resto funcione: sin `buscar_productos`, el usuario
 * tiene que dictar identificadores numéricos, que es exactamente el formulario
 * que la Fase 3 viene a eliminar.
 */

import type { ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';

/** El preview de una herramienta de lectura nunca se enseña: se ejecuta directo. */
const READ_PREVIEW: ToolPreview = {
  title: 'Consulta',
  summary: 'Consulta de solo lectura.',
  lines: [],
  warnings: [],
  estimatedCredits: 0,
  reversible: true,
};

/**
 * Divide la consulta del usuario en tokens para `buscar_productos`.
 *
 * La función SQL espera un array de tokens ya separados: es ella quien
 * normaliza acentos, agrupa variantes y tolera erratas por trigram. No se
 * reimplementa nada de eso aquí (§16.4 del plan: "no reescribas la búsqueda de
 * catálogo").
 */
function tokenize(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
    .slice(0, 8);
}

interface BuscarProductosArgs {
  consulta: string;
  limite: number;
}

interface ProductoEncontrado {
  id: number;
  nombre: string;
  sku: string;
  precio: number | null;
  stock: number | null;
  puntaje: number;
  presentaciones: number;
}

export const buscarProductos: ToolDefinition<BuscarProductosArgs> = {
  name: 'buscar_productos',
  description:
    'Busca productos en el catálogo de la organización por nombre, marca o código. Tolera erratas y acentos. Úsala SIEMPRE antes de referirte a un producto: nunca inventes un identificador.',
  parameters: {
    type: 'object',
    properties: {
      consulta: {
        type: 'string',
        description: 'Lo que el usuario dijo del producto. Ej: "jabon rey 300", "clorox 2 litros".',
      },
      limite: {
        type: 'number',
        description: 'Cuántos resultados devolver como máximo. Por defecto 8.',
      },
    },
    required: ['consulta'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: ['inventory.view', 'inventory_management', 'product_management'],
  minLevel: 'read',
  requiredModule: 'inventory',
  availableInVoice: true,

  parseArgs(raw: unknown): BuscarProductosArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const consulta = typeof obj.consulta === 'string' ? obj.consulta.trim() : '';
    if (!consulta) return null;
    const limiteRaw = Number(obj.limite);
    const limite = Number.isFinite(limiteRaw) ? Math.min(Math.max(Math.trunc(limiteRaw), 1), 20) : 8;
    return { consulta: consulta.slice(0, 200), limite };
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext, args: BuscarProductosArgs): Promise<ToolResult> {
    const tokens = tokenize(args.consulta);
    if (tokens.length === 0) {
      return { ok: false, errorCode: 'bad_input', message: 'La búsqueda está vacía.' };
    }

    const { data, error } = await ctx.supabase.rpc('buscar_productos', {
      p_org: ctx.organizationId,
      p_tokens: tokens,
      p_limite: args.limite,
      p_umbral: 0.3,
    });

    if (error) {
      return { ok: false, errorCode: 'query_error', message: `No pude buscar en el catálogo: ${error.message}` };
    }

    const rows = (data ?? []) as ProductoEncontrado[];
    if (rows.length === 0) {
      return {
        ok: true,
        message: `No encontré ningún producto que coincida con "${args.consulta}".`,
        data: { productos: [] },
      };
    }

    // El modelo recibe los datos, no una frase: es él quien decide cómo
    // presentárselos al usuario y cuál elegir si hay que desambiguar.
    const productos = rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      sku: r.sku,
      precio: r.precio,
      stock: r.stock,
      presentaciones: r.presentaciones,
    }));

    return {
      ok: true,
      message: `${rows.length} coincidencia${rows.length === 1 ? '' : 's'} en el catálogo.`,
      data: { productos },
    };
  },
};

interface ConsultarStockArgs {
  product_id: number;
}

export const consultarStock: ToolDefinition<ConsultarStockArgs> = {
  name: 'consultar_stock',
  description:
    'Devuelve las existencias de un producto por sucursal. Necesita el identificador que devuelve buscar_productos.',
  parameters: {
    type: 'object',
    properties: {
      product_id: { type: 'integer', description: 'Identificador del producto (de buscar_productos).' },
    },
    required: ['product_id'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: ['inventory.view', 'inventory_management'],
  minLevel: 'read',
  requiredModule: 'inventory',
  availableInVoice: true,

  parseArgs(raw: unknown): ConsultarStockArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const id = Number((raw as Record<string, unknown>).product_id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return { product_id: id };
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext, args: ConsultarStockArgs): Promise<ToolResult> {
    // La pertenencia se comprueba explícitamente: `stock_levels` no lleva
    // `organization_id`, cuelga del producto.
    const { data: product } = await ctx.supabase
      .from('products')
      .select('id, name')
      .eq('id', args.product_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!product) {
      return { ok: false, errorCode: 'not_found', message: 'Ese producto no existe en esta organización.' };
    }

    const { data, error } = await ctx.supabase
      .from('stock_levels')
      .select('branch_id, qty_on_hand, qty_reserved, branches(name)')
      .eq('product_id', args.product_id);

    if (error) {
      return { ok: false, errorCode: 'query_error', message: `No pude leer las existencias: ${error.message}` };
    }

    const rows = (data ?? []) as Array<{
      branch_id: number;
      qty_on_hand: number | null;
      qty_reserved: number | null;
      branches: { name: string } | { name: string }[] | null;
    }>;

    const existencias = rows.map((r) => {
      const branch = Array.isArray(r.branches) ? r.branches[0] : r.branches;
      return {
        sucursal: branch?.name ?? `Sucursal ${r.branch_id}`,
        disponible: Number(r.qty_on_hand ?? 0) - Number(r.qty_reserved ?? 0),
        en_mano: Number(r.qty_on_hand ?? 0),
        reservado: Number(r.qty_reserved ?? 0),
      };
    });

    const total = existencias.reduce((acc, e) => acc + e.en_mano, 0);
    const nombre = (product as { name: string }).name;

    return {
      ok: true,
      message:
        existencias.length === 0
          ? `"${nombre}" no tiene existencias registradas en ninguna sucursal.`
          : `"${nombre}": ${total} unidades en ${existencias.length} sucursal${existencias.length === 1 ? '' : 'es'}.`,
      data: { producto: nombre, total, existencias },
    };
  },
};

interface BuscarProveedoresArgs {
  consulta: string;
}

/**
 * Sin esta herramienta, `crear_orden_compra` obliga al usuario a dictar el
 * identificador numérico del proveedor. Búsqueda simple por nombre o NIT: los
 * proveedores de una organización se cuentan por decenas, no por miles.
 */
export const buscarProveedores: ToolDefinition<BuscarProveedoresArgs> = {
  name: 'buscar_proveedores',
  description:
    'Busca proveedores de la organización por nombre o NIT. Úsala antes de crear una orden de compra: nunca inventes un supplier_id.',
  parameters: {
    type: 'object',
    properties: {
      consulta: { type: 'string', description: 'Nombre (o parte) o NIT del proveedor. Vacío para listar los primeros.' },
    },
    required: ['consulta'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: ['inventory.view', 'inventory_management'],
  minLevel: 'read',
  requiredModule: 'inventory',
  availableInVoice: true,

  parseArgs(raw: unknown): BuscarProveedoresArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const q = (raw as Record<string, unknown>).consulta;
    return { consulta: typeof q === 'string' ? q.trim().slice(0, 80) : '' };
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext, args: BuscarProveedoresArgs): Promise<ToolResult> {
    let query = ctx.supabase
      .from('suppliers')
      .select('id, name, nit, contact, phone, email')
      .eq('organization_id', ctx.organizationId)
      .order('name', { ascending: true })
      .limit(10);
    if (args.consulta) {
      // `%` y `_` son comodines de ILIKE: se escapan para que "100%" no
      // busque "cualquier cosa".
      const safe = args.consulta.replace(/[%_\\]/g, (c) => `\\${c}`);
      query = query.or(`name.ilike.%${safe}%,nit.ilike.%${safe}%`);
    }
    const { data, error } = await query;
    if (error) {
      return { ok: false, errorCode: 'query_error', message: `No pude buscar proveedores: ${error.message}` };
    }
    const rows = (data ?? []) as Array<{
      id: number;
      name: string;
      nit: string | null;
      contact: string | null;
      phone: string | null;
      email: string | null;
    }>;
    return {
      ok: true,
      message:
        rows.length === 0
          ? `No encontré proveedores que coincidan con "${args.consulta}".`
          : `${rows.length} proveedor${rows.length === 1 ? '' : 'es'} encontrado${rows.length === 1 ? '' : 's'}.`,
      data: { proveedores: rows.map((r) => ({ id: r.id, nombre: r.name, nit: r.nit, contacto: r.contact })) },
    };
  },
};

/** Las sucursales activas, para traslados y para saber dónde registrar. */
export const listarSucursales: ToolDefinition<Record<string, never>> = {
  name: 'listar_sucursales',
  description:
    'Lista las sucursales activas de la organización con su identificador. Úsala antes de un traslado: nunca inventes un branch_id.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  risk: 'low',
  permissions: [],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: true,

  parseArgs(): Record<string, never> {
    return {};
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const { data, error } = await ctx.supabase
      .from('branches')
      .select('id, name, is_main, city')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name', { ascending: true });
    if (error) {
      return { ok: false, errorCode: 'query_error', message: `No pude leer las sucursales: ${error.message}` };
    }
    const rows = (data ?? []) as Array<{ id: number; name: string; is_main: boolean | null; city: string | null }>;
    return {
      ok: true,
      message: `${rows.length} sucursal${rows.length === 1 ? '' : 'es'} activa${rows.length === 1 ? '' : 's'}.`,
      data: {
        sucursales: rows.map((r) => ({ id: r.id, nombre: r.name, principal: Boolean(r.is_main), ciudad: r.city })),
        actual: ctx.branchId,
      },
    };
  },
};

interface BuscarClientesArgs {
  consulta: string;
}

/**
 * Para facturar o vender a un cliente registrado hace falta su id. Búsqueda
 * por nombre, documento, teléfono o correo; devuelve también si es persona
 * o empresa para que el modelo no se confunda.
 */
export const buscarClientes: ToolDefinition<BuscarClientesArgs> = {
  name: 'buscar_clientes',
  description:
    'Busca clientes de la organización por nombre, documento, teléfono o correo. Úsala antes de registrar una venta o una factura a un cliente: nunca inventes un customer_id. Si hay varios parecidos, pregunta cuál con preguntar_opciones.',
  parameters: {
    type: 'object',
    properties: {
      consulta: { type: 'string', description: 'Nombre (o parte), documento, teléfono o correo del cliente.' },
    },
    required: ['consulta'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: ['crm.customers.view', 'crm.contacts.view', 'customer_management', 'pos.view'],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: true,

  parseArgs(raw: unknown): BuscarClientesArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const q = (raw as Record<string, unknown>).consulta;
    const consulta = typeof q === 'string' ? q.trim().slice(0, 80) : '';
    return consulta ? { consulta } : null;
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext, args: BuscarClientesArgs): Promise<ToolResult> {
    const safe = args.consulta.replace(/[%_\\]/g, (c) => `\\${c}`);
    const { data, error } = await ctx.supabase
      .from('customers')
      .select('id, full_name, company_name, customer_type, doc_type, doc_number, phone, email')
      .eq('organization_id', ctx.organizationId)
      .or(`full_name.ilike.%${safe}%,company_name.ilike.%${safe}%,doc_number.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`)
      .order('full_name', { ascending: true })
      .limit(8);
    if (error) {
      return { ok: false, errorCode: 'query_error', message: `No pude buscar clientes: ${error.message}` };
    }
    const rows = (data ?? []) as Array<{
      id: string;
      full_name: string | null;
      company_name: string | null;
      customer_type: string | null;
      doc_type: string | null;
      doc_number: string | null;
      phone: string | null;
      email: string | null;
    }>;
    return {
      ok: true,
      message:
        rows.length === 0
          ? `No encontré clientes que coincidan con "${args.consulta}".`
          : `${rows.length} cliente${rows.length === 1 ? '' : 's'} encontrado${rows.length === 1 ? '' : 's'}.`,
      data: {
        clientes: rows.map((r) => ({
          id: r.id,
          nombre: r.full_name,
          empresa: r.company_name,
          tipo: r.customer_type === 'company' ? 'empresa' : 'persona',
          documento: r.doc_number ? `${r.doc_type ?? ''} ${r.doc_number}`.trim() : null,
          telefono: r.phone,
          email: r.email,
        })),
      },
    };
  },
};

export const CONSULTA_TOOLS = [buscarProductos, consultarStock, buscarProveedores, listarSucursales, buscarClientes];
