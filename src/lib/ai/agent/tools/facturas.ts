/**
 * GO Assistant — F4, el último paso: de la foto de la factura a la factura
 * registrada.
 *
 * `leer_documento` extrae y concilia (proveedor por NIT, productos por SKU o
 * nombre). Esta herramienta toma ESO —ya revisado por el usuario en la
 * conversación— y lo registra en una sola transacción
 * (`assistant_register_purchase_invoice`): proveedor (existente o nuevo por
 * NIT), factura en `received` con su asiento, líneas, cuenta por pagar y, si
 * la mercancía ya llegó, entrada de inventario de las líneas con producto.
 *
 * `risk: high`: mueve contabilidad, cartera e inventario. La tarjeta repite
 * el resumen —proveedor, número, total, cuántas líneas entran a stock— y avisa
 * de lo que NO va a pasar (líneas sin producto no mueven stock).
 */

import { formatMoney } from '@/lib/ai/assistant/orgCurrency';
import type { ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINEAS = 200;

interface LineaFactura {
  product_id?: number;
  description: string;
  qty: number;
  unit_price: number;
  tax_rate?: number;
  discount_amount?: number;
}

interface FacturaCompraArgs {
  attachment_id?: string;
  supplier_id?: number;
  supplier?: { name: string; nit?: string; dv?: string };
  number_ext: string;
  issue_date?: string;
  due_date?: string;
  payment_method?: 'credit' | 'cash' | 'transfer' | 'card';
  tax_included: boolean;
  receive_stock: boolean;
  items: LineaFactura[];
  notes?: string;
}

const fecha = (v: unknown): string | undefined =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : undefined;

function parseLineas(raw: unknown): LineaFactura[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINEAS) return null;
  const out: LineaFactura[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const o = entry as Record<string, unknown>;
    const qty = Number(o.qty);
    const price = Number(o.unit_price);
    const description = typeof o.description === 'string' ? o.description.trim().slice(0, 200) : '';
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) return null;
    const linea: LineaFactura = { description: description || 'Producto', qty, unit_price: price };
    const pid = Number(o.product_id);
    if (o.product_id !== undefined && o.product_id !== null && Number.isInteger(pid) && pid > 0) linea.product_id = pid;
    const tax = Number(o.tax_rate);
    if (o.tax_rate !== undefined && o.tax_rate !== null && Number.isFinite(tax) && tax >= 0 && tax <= 100) linea.tax_rate = tax;
    const disc = Number(o.discount_amount);
    if (o.discount_amount !== undefined && o.discount_amount !== null && Number.isFinite(disc) && disc >= 0) linea.discount_amount = disc;
    out.push(linea);
  }
  return out;
}

/** Totales calculados igual que la RPC, para que la tarjeta y la base coincidan. */
function totalizar(items: LineaFactura[], taxIncluded: boolean): { subtotal: number; tax: number; total: number } {
  let subtotal = 0;
  let tax = 0;
  let total = 0;
  for (const l of items) {
    const base = l.qty * l.unit_price - (l.discount_amount ?? 0);
    const rate = (l.tax_rate ?? 0) / 100;
    if (taxIncluded) {
      const t = Math.round((base - base / (1 + rate)) * 100) / 100;
      subtotal += base - t;
      tax += t;
      total += base;
    } else {
      const t = Math.round(base * rate * 100) / 100;
      subtotal += base;
      tax += t;
      total += base + t;
    }
  }
  return { subtotal, tax, total };
}

export function mapFacturaError(message: string): ToolResult | null {
  if (message.includes('Could not find the function') || message.includes('does not exist') || message.includes('schema cache')) {
    return { ok: false, errorCode: 'not_deployed', message: 'Todavía no puedo registrar facturas de compra: falta aplicar un cambio en la base de datos. Avisa a soporte.' };
  }
  if (message.includes('DUPLICATE_INVOICE')) {
    const n = message.split('DUPLICATE_INVOICE:')[1]?.split('\n')[0]?.trim() ?? '';
    return { ok: false, errorCode: 'duplicate', message: `La factura ${n} de ese proveedor ya está registrada. No la repetí.` };
  }
  if (message.includes('NUMBER_REQUIRED')) return { ok: false, errorCode: 'missing_fields', message: 'Me falta el número de la factura.' };
  if (message.includes('SUPPLIER_REQUIRED')) return { ok: false, errorCode: 'missing_fields', message: 'Me falta el proveedor: al menos su nombre (y su NIT si lo tienes).' };
  if (message.includes('SUPPLIER_NOT_IN_ORG')) return { ok: false, errorCode: 'not_found', message: 'Ese proveedor no existe en esta organización.' };
  if (message.includes('BRANCH_NOT_IN_ORG')) return { ok: false, errorCode: 'not_found', message: 'Esa sucursal no existe en esta organización.' };
  if (message.includes('PRODUCT_NOT_IN_ORG')) return { ok: false, errorCode: 'not_found', message: 'Uno de los productos no existe en esta organización.' };
  if (message.includes('ITEMS_REQUIRED')) return { ok: false, errorCode: 'missing_fields', message: 'La factura no tiene líneas.' };
  if (message.includes('ITEM_INVALID')) return { ok: false, errorCode: 'bad_input', message: 'Alguna línea no tiene cantidad o precio válidos.' };
  return null;
}

async function resolveBranch(ctx: ToolContext): Promise<number | null> {
  if (ctx.branchId) return ctx.branchId;
  const { data } = await ctx.supabase
    .from('branches')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .order('is_main', { ascending: false })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: number } | null)?.id ?? null;
}

export const registrarFacturaCompra: ToolDefinition<FacturaCompraArgs> = {
  name: 'registrar_factura_compra',
  description:
    'Registra una factura de compra de un proveedor (la que el usuario adjuntó y leíste con leer_documento, o la que te dicte): crea el proveedor si no existe (por NIT), la factura con sus líneas, la cuenta por pagar y, si la mercancía ya llegó (receive_stock), la entrada de inventario de las líneas que tengan product_id. Usa los product_id que devolvió la conciliación de leer_documento o buscar_productos; una línea sin product_id se registra pero NO mueve stock. Antes de llamarla, confirma con el usuario proveedor, número, fecha y total.',
  parameters: {
    type: 'object',
    properties: {
      attachment_id: { type: 'string', description: 'Adjunto del que salió la factura, para enlazar el original.' },
      supplier_id: { type: 'integer', description: 'Proveedor existente (de leer_documento o buscar_proveedores).' },
      supplier: {
        type: 'object',
        description: 'Si el proveedor no existe: nombre y NIT para crearlo.',
        properties: {
          name: { type: 'string' },
          nit: { type: 'string' },
          dv: { type: 'string', description: 'Dígito de verificación, si viene en la factura.' },
        },
        required: ['name'],
      },
      number_ext: { type: 'string', description: 'Número de la factura tal como lo imprime el proveedor.' },
      issue_date: { type: 'string', description: 'Fecha de emisión YYYY-MM-DD.' },
      due_date: { type: 'string', description: 'Fecha de vencimiento YYYY-MM-DD. Si no viene, 30 días.' },
      payment_method: { type: 'string', enum: ['credit', 'cash', 'transfer', 'card'], description: 'credit si queda a crédito (lo habitual).' },
      tax_included: { type: 'boolean', description: 'true si los precios unitarios ya incluyen el IVA.' },
      receive_stock: { type: 'boolean', description: 'true (por defecto) si la mercancía ya llegó y debe entrar al inventario.' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            product_id: { type: 'integer', description: 'Producto del catálogo. Omítelo si la línea no es un producto conocido.' },
            description: { type: 'string' },
            qty: { type: 'number' },
            unit_price: { type: 'number' },
            tax_rate: { type: 'number', description: 'IVA en porcentaje (19, 5, 0).' },
            discount_amount: { type: 'number' },
          },
          required: ['description', 'qty', 'unit_price'],
        },
      },
      notes: { type: 'string' },
    },
    required: ['number_ext', 'items'],
    additionalProperties: false,
  },
  risk: 'high',
  permissions: ['inventory.create', 'inventory_management', 'finance.view'],
  minLevel: 'write_full',
  requiredModule: 'inventory',
  availableInVoice: false,

  parseArgs(raw: unknown): FacturaCompraArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const number_ext = typeof o.number_ext === 'string' ? o.number_ext.trim().slice(0, 60) : '';
    const items = parseLineas(o.items);
    if (!number_ext || !items) return null;

    const args: FacturaCompraArgs = {
      number_ext,
      items,
      tax_included: o.tax_included === true,
      receive_stock: o.receive_stock !== false,
    };
    if (typeof o.attachment_id === 'string' && UUID_RE.test(o.attachment_id.trim())) args.attachment_id = o.attachment_id.trim();
    const sid = Number(o.supplier_id);
    if (Number.isInteger(sid) && sid > 0) args.supplier_id = sid;
    if (o.supplier && typeof o.supplier === 'object') {
      const s = o.supplier as Record<string, unknown>;
      const name = typeof s.name === 'string' ? s.name.trim().slice(0, 200) : '';
      if (name) {
        args.supplier = { name };
        if (typeof s.nit === 'string' && s.nit.trim()) args.supplier.nit = s.nit.trim().slice(0, 30);
        if (typeof s.dv === 'string' && /^\d$/.test(s.dv.trim())) args.supplier.dv = s.dv.trim();
      }
    }
    if (!args.supplier_id && !args.supplier) return null;
    const issue = fecha(o.issue_date);
    if (issue) args.issue_date = issue;
    const due = fecha(o.due_date);
    if (due) args.due_date = due;
    if (o.payment_method === 'credit' || o.payment_method === 'cash' || o.payment_method === 'transfer' || o.payment_method === 'card') {
      args.payment_method = o.payment_method;
    }
    if (typeof o.notes === 'string' && o.notes.trim()) args.notes = o.notes.trim().slice(0, 500);
    return args;
  },

  async preview(ctx: ToolContext, args: FacturaCompraArgs): Promise<ToolPreview> {
    const warnings: string[] = [];

    let proveedor = args.supplier?.name ?? null;
    let proveedorNuevo = false;
    if (args.supplier_id) {
      const { data } = await ctx.supabase.from('suppliers').select('name').eq('organization_id', ctx.organizationId).eq('id', args.supplier_id).maybeSingle();
      proveedor = (data as { name: string } | null)?.name ?? null;
      if (!proveedor) warnings.push(`No encontré el proveedor ${args.supplier_id} en esta organización.`);
    } else if (args.supplier?.nit) {
      const nit = args.supplier.nit.replace(/\D/g, '');
      const { data } = await ctx.supabase.from('suppliers').select('id, name').eq('organization_id', ctx.organizationId).ilike('nit', `%${nit}%`).limit(1).maybeSingle();
      const existente = data as { id: number; name: string } | null;
      if (existente) proveedor = existente.name;
      else proveedorNuevo = true;
    } else {
      proveedorNuevo = true;
    }
    if (proveedorNuevo) warnings.push(`El proveedor "${args.supplier?.name}" no existe: se creará${args.supplier?.nit ? ` con NIT ${args.supplier.nit}` : ' sin NIT'}.`);

    // Duplicado antes de proponer (§7.2.6).
    const dupQuery = ctx.supabase
      .from('invoice_purchase')
      .select('id, total, status')
      .eq('organization_id', ctx.organizationId)
      .ilike('number_ext', args.number_ext)
      .neq('status', 'void')
      .limit(1);
    const { data: dup } = await (args.supplier_id ? dupQuery.eq('supplier_id', args.supplier_id) : dupQuery).maybeSingle();
    if (dup) warnings.push(`Ya hay una factura ${args.number_ext} registrada${args.supplier_id ? ' de este proveedor' : ''}. Si es la misma, no la confirmes.`);

    const ids = args.items.map((l) => l.product_id).filter((v): v is number => typeof v === 'number');
    const nombres = new Map<number, string>();
    if (ids.length > 0) {
      const { data } = await ctx.supabase.from('products').select('id, name').eq('organization_id', ctx.organizationId).in('id', ids);
      for (const p of (data ?? []) as Array<{ id: number; name: string }>) nombres.set(p.id, p.name);
    }

    const { subtotal, tax, total } = totalizar(args.items, args.tax_included);
    const conStock = args.items.filter((l) => l.product_id && nombres.has(l.product_id)).length;
    const sinProducto = args.items.length - conStock;

    const lines = [
      { label: 'Proveedor', value: proveedor ?? args.supplier?.name ?? '—' },
      { label: 'Número', value: args.number_ext },
      { label: 'Fecha', value: args.issue_date ?? 'hoy' },
      { label: 'Vence', value: args.due_date ?? '30 días' },
      { label: 'Pago', value: args.payment_method === 'credit' || !args.payment_method ? 'A crédito (queda en cuentas por pagar)' : args.payment_method },
      ...args.items.map((l) => ({
        label: l.product_id && nombres.has(l.product_id) ? nombres.get(l.product_id)! : `${l.description} (sin producto)`,
        value: `${l.qty} × ${formatMoney(l.unit_price, ctx.currency)}${l.tax_rate ? ` +IVA ${l.tax_rate}%` : ''}`,
      })),
    ];

    for (const l of args.items) {
      if (l.product_id && !nombres.has(l.product_id)) warnings.push(`El producto ${l.product_id} no existe en tu catálogo.`);
    }
    if (args.receive_stock) {
      warnings.push(
        conStock > 0
          ? `Entrarán al inventario ${conStock} ${conStock === 1 ? 'línea' : 'líneas'}${sinProducto > 0 ? `; ${sinProducto} sin producto se registran pero no mueven stock` : ''}.`
          : 'Ninguna línea tiene producto del catálogo: la factura se registra sin mover inventario.'
      );
    } else {
      warnings.push('No se moverá inventario (receive_stock = false).');
    }
    warnings.push('Genera asiento contable y cuenta por pagar.');

    return {
      title: 'Registrar factura de compra',
      summary: `Registrar la factura ${args.number_ext} de ${proveedor ?? args.supplier?.name ?? 'proveedor'} por ${formatMoney(total, ctx.currency)}, con ${args.items.length} ${
        args.items.length === 1 ? 'línea' : 'líneas'
      }${args.receive_stock && conStock > 0 ? ` y entrada de ${conStock} al inventario` : ''}.`,
      lines,
      warnings,
      totals: { Subtotal: formatMoney(subtotal, ctx.currency), IVA: formatMoney(tax, ctx.currency), Total: formatMoney(total, ctx.currency) },
      estimatedCredits: 2,
      reversible: true,
    };
  },

  async execute(ctx: ToolContext, args: FacturaCompraArgs): Promise<ToolResult> {
    const branchId = await resolveBranch(ctx);
    if (!branchId) return { ok: false, errorCode: 'no_branch', message: 'No encontré la sucursal donde registrar la compra. Dime cuál.' };

    const { data, error } = await ctx.supabase.rpc('assistant_register_purchase_invoice', {
      p_organization_id: ctx.organizationId,
      p_branch_id: branchId,
      p_user_id: ctx.userId,
      p_payload: {
        supplier_id: args.supplier_id ?? null,
        supplier: args.supplier ?? null,
        number_ext: args.number_ext,
        issue_date: args.issue_date ?? null,
        due_date: args.due_date ?? null,
        currency: ctx.currency,
        payment_method: args.payment_method ?? 'credit',
        tax_included: args.tax_included,
        receive_stock: args.receive_stock,
        items: args.items,
        notes: args.notes ?? (args.attachment_id ? 'Registrada por GO Assistant desde un documento adjunto' : 'Registrada por GO Assistant'),
      },
    });

    if (error) {
      const mapped = mapFacturaError(error.message);
      if (mapped) return mapped;
      return { ok: false, errorCode: 'execution_error', message: `No pude registrar la factura: ${error.message}` };
    }

    const row = data as {
      invoice_id: string;
      number_ext: string;
      supplier_id: number;
      proveedor: string;
      proveedor_nuevo: boolean;
      total: number;
      lineas: number;
      lineas_con_stock: number;
      accounts_payable_id: string;
      stock_lines: Array<{ product_id: number; quantity: number }>;
    };

    // El original queda enlazado a la factura (§7.2.7): "¿de dónde salió esto?".
    if (args.attachment_id) {
      await ctx.supabase
        .from('ai_attachments')
        .update({ linked_entity_type: 'invoice_purchase', linked_entity_id: row.invoice_id })
        .eq('id', args.attachment_id)
        .eq('organization_id', ctx.organizationId);
    }

    return {
      ok: true,
      message: `Factura ${row.number_ext} de ${row.proveedor}${row.proveedor_nuevo ? ' (proveedor nuevo)' : ''} registrada por ${formatMoney(
        row.total,
        ctx.currency
      )}: ${row.lineas} ${row.lineas === 1 ? 'línea' : 'líneas'}, ${row.lineas_con_stock} al inventario, y su cuenta por pagar.`,
      entity: { type: 'invoice_purchase', id: row.invoice_id },
      data: row,
      undo: {
        kind: 'void_purchase_invoice',
        payload: {
          invoice_id: row.invoice_id,
          accounts_payable_id: row.accounts_payable_id,
          branch_id: branchId,
          stock_lines: row.stock_lines,
          supplier_id: row.supplier_id,
          supplier_created: row.proveedor_nuevo,
        },
      },
    };
  },
};

// ─── Factura de venta ────────────────────────────────────────────────────────

interface LineaVenta {
  product_id?: number;
  description?: string;
  qty: number;
  unit_price?: number;
  tax_rate?: number;
  discount_amount?: number;
}

interface FacturaVentaArgs {
  customer_id?: string;
  issue: boolean;
  issue_date?: string;
  due_date?: string;
  payment_terms?: number;
  payment_method?: 'credit' | 'cash' | 'transfer' | 'card';
  tax_included: boolean;
  items: LineaVenta[];
  notes?: string;
}

function parseLineasVenta(raw: unknown): LineaVenta[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINEAS) return null;
  const out: LineaVenta[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const o = entry as Record<string, unknown>;
    const qty = Number(o.qty);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    const linea: LineaVenta = { qty };
    const pid = Number(o.product_id);
    if (o.product_id !== undefined && o.product_id !== null && Number.isInteger(pid) && pid > 0) linea.product_id = pid;
    if (typeof o.description === 'string' && o.description.trim()) linea.description = o.description.trim().slice(0, 200);
    const price = Number(o.unit_price);
    if (o.unit_price !== undefined && o.unit_price !== null && Number.isFinite(price) && price >= 0) linea.unit_price = price;
    // Una línea sin producto necesita descripción y precio: no hay catálogo del que sacarlos.
    if (!linea.product_id && (!linea.description || linea.unit_price === undefined)) return null;
    const tax = Number(o.tax_rate);
    if (o.tax_rate !== undefined && o.tax_rate !== null && Number.isFinite(tax) && tax >= 0 && tax <= 100) linea.tax_rate = tax;
    const disc = Number(o.discount_amount);
    if (o.discount_amount !== undefined && o.discount_amount !== null && Number.isFinite(disc) && disc >= 0) linea.discount_amount = disc;
    out.push(linea);
  }
  return out;
}

export function mapFacturaVentaError(message: string): ToolResult | null {
  if (message.includes('Could not find the function') || message.includes('does not exist') || message.includes('schema cache')) {
    return { ok: false, errorCode: 'not_deployed', message: 'Todavía no puedo crear facturas de venta: falta aplicar un cambio en la base de datos. Avisa a soporte.' };
  }
  if (message.includes('CUSTOMER_NOT_IN_ORG')) return { ok: false, errorCode: 'not_found', message: 'Ese cliente no existe en esta organización.' };
  if (message.includes('PRODUCT_NOT_IN_ORG')) return { ok: false, errorCode: 'not_found', message: 'Uno de los productos no existe en esta organización.' };
  if (message.includes('PRICE_UNKNOWN')) {
    const n = message.split('PRICE_UNKNOWN:')[1]?.split('\n')[0]?.trim() ?? 'ese producto';
    return { ok: false, errorCode: 'no_price', message: `"${n}" no tiene precio de venta registrado. Dime a qué precio va y lo pongo en la factura.` };
  }
  if (message.includes('BRANCH_NOT_IN_ORG')) return { ok: false, errorCode: 'not_found', message: 'Esa sucursal no existe en esta organización.' };
  if (message.includes('ITEMS_REQUIRED')) return { ok: false, errorCode: 'missing_fields', message: 'La factura no tiene líneas.' };
  if (message.includes('ITEM_INVALID')) return { ok: false, errorCode: 'bad_input', message: 'Alguna línea no tiene cantidad o precio válidos.' };
  return null;
}

export const registrarFacturaVenta: ToolDefinition<FacturaVentaArgs> = {
  name: 'registrar_factura_venta',
  description:
    'Crea una factura de venta a un cliente con sus líneas (venta + factura FACT-#### + líneas, como en Finanzas → Facturas de venta → Nueva). Usa buscar_clientes para el customer_id y buscar_productos para los product_id; el precio lo pone el catálogo si no dices otro. Por defecto queda en BORRADOR (issue=false); pregunta al usuario con preguntar_opciones si la emite ya (issue=true: genera cuenta por cobrar y asiento) o la deja en borrador. NO descuenta inventario: eso lo hace la venta POS o el despacho.',
  parameters: {
    type: 'object',
    properties: {
      customer_id: { type: 'string', description: 'Cliente (uuid de buscar_clientes). Omítelo solo si el usuario dice que es sin cliente.' },
      issue: { type: 'boolean', description: 'true = emitida (CxC y asiento). false (por defecto) = borrador.' },
      issue_date: { type: 'string', description: 'YYYY-MM-DD. Hoy si se omite.' },
      due_date: { type: 'string', description: 'YYYY-MM-DD. Si se omite, payment_terms días.' },
      payment_terms: { type: 'integer', description: 'Días de plazo. 30 por defecto.' },
      payment_method: { type: 'string', enum: ['credit', 'cash', 'transfer', 'card'] },
      tax_included: { type: 'boolean', description: 'true si los precios ya incluyen IVA.' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            product_id: { type: 'integer' },
            description: { type: 'string', description: 'Obligatoria si no hay product_id.' },
            qty: { type: 'number' },
            unit_price: { type: 'number', description: 'Omítelo para usar el precio del catálogo.' },
            tax_rate: { type: 'number', description: 'IVA en porcentaje (19, 5, 0).' },
            discount_amount: { type: 'number' },
          },
          required: ['qty'],
        },
      },
      notes: { type: 'string' },
    },
    required: ['items'],
    additionalProperties: false,
  },
  risk: 'high',
  permissions: ['pos.create', 'finance.view'],
  minLevel: 'write_full',
  requiredModule: 'finance',
  availableInVoice: false,

  parseArgs(raw: unknown): FacturaVentaArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const items = parseLineasVenta(o.items);
    if (!items) return null;
    const args: FacturaVentaArgs = { items, issue: o.issue === true, tax_included: o.tax_included === true };
    if (typeof o.customer_id === 'string' && UUID_RE.test(o.customer_id.trim())) args.customer_id = o.customer_id.trim();
    const issue = fecha(o.issue_date);
    if (issue) args.issue_date = issue;
    const due = fecha(o.due_date);
    if (due) args.due_date = due;
    const terms = Number(o.payment_terms);
    if (Number.isInteger(terms) && terms >= 0 && terms <= 365) args.payment_terms = terms;
    if (o.payment_method === 'credit' || o.payment_method === 'cash' || o.payment_method === 'transfer' || o.payment_method === 'card') {
      args.payment_method = o.payment_method;
    }
    if (typeof o.notes === 'string' && o.notes.trim()) args.notes = o.notes.trim().slice(0, 500);
    return args;
  },

  async preview(ctx: ToolContext, args: FacturaVentaArgs): Promise<ToolPreview> {
    const warnings: string[] = [];
    let cliente: string | null = null;
    if (args.customer_id) {
      const { data } = await ctx.supabase.from('customers').select('full_name').eq('organization_id', ctx.organizationId).eq('id', args.customer_id).maybeSingle();
      cliente = (data as { full_name: string | null } | null)?.full_name ?? null;
      if (!cliente) warnings.push('No encontré ese cliente en esta organización.');
    } else {
      warnings.push('Factura sin cliente. Para facturación electrónica hará falta uno.');
    }

    const ids = args.items.map((l) => l.product_id).filter((v): v is number => typeof v === 'number');
    const catalogo = new Map<number, { name: string; price: number | null }>();
    if (ids.length > 0) {
      const { data } = await ctx.supabase
        .from('products')
        .select('id, name, product_prices(price, effective_to)')
        .eq('organization_id', ctx.organizationId)
        .in('id', ids);
      for (const row of (data ?? []) as Array<{ id: number; name: string; product_prices: Array<{ price: number; effective_to: string | null }> | null }>) {
        const vigente = (row.product_prices ?? []).find((p) => p.effective_to === null);
        catalogo.set(row.id, { name: row.name, price: vigente ? Number(vigente.price) : null });
      }
    }

    let subtotal = 0;
    let tax = 0;
    let total = 0;
    const lines = args.items.map((l) => {
      const info = l.product_id ? catalogo.get(l.product_id) : undefined;
      if (l.product_id && !info) warnings.push(`El producto ${l.product_id} no existe en tu catálogo.`);
      const precio = l.unit_price ?? info?.price ?? null;
      if (info && precio === null) warnings.push(`"${info.name}" no tiene precio de venta registrado.`);
      const base = precio !== null ? l.qty * precio - (l.discount_amount ?? 0) : 0;
      const rate = (l.tax_rate ?? 0) / 100;
      let t = 0;
      let lineTotal = base;
      if (args.tax_included) {
        t = Math.round((base - base / (1 + rate)) * 100) / 100;
        subtotal += base - t;
      } else {
        t = Math.round(base * rate * 100) / 100;
        subtotal += base;
        lineTotal = base + t;
      }
      tax += t;
      total += lineTotal;
      return {
        label: info?.name ?? l.description ?? `Producto ${l.product_id}`,
        value: precio !== null ? `${l.qty} × ${formatMoney(precio, ctx.currency)}${l.tax_rate ? ` +IVA ${l.tax_rate}%` : ''}` : `${l.qty} × (sin precio)`,
      };
    });

    lines.unshift({ label: 'Cliente', value: cliente ?? 'Sin cliente' });
    lines.push({ label: 'Estado', value: args.issue ? 'Emitida (genera cuenta por cobrar y asiento)' : 'Borrador (se emite después desde Finanzas)' });
    if (!args.items.some((l) => l.tax_rate)) warnings.push('Ninguna línea lleva IVA. Si aplica, dímelo antes de confirmar.');
    warnings.push('No descuenta inventario: la factura de venta en este ERP no mueve stock.');

    return {
      title: args.issue ? 'Emitir factura de venta' : 'Crear factura de venta (borrador)',
      summary: `${args.issue ? 'Emitir' : 'Crear en borrador'} una factura de venta a ${cliente ?? 'sin cliente'} por ${formatMoney(total, ctx.currency)} con ${args.items.length} ${
        args.items.length === 1 ? 'línea' : 'líneas'
      }.`,
      lines,
      warnings,
      totals: { Subtotal: formatMoney(subtotal, ctx.currency), IVA: formatMoney(tax, ctx.currency), Total: formatMoney(total, ctx.currency) },
      estimatedCredits: 2,
      reversible: true,
    };
  },

  async execute(ctx: ToolContext, args: FacturaVentaArgs): Promise<ToolResult> {
    const branchId = await resolveBranch(ctx);
    if (!branchId) return { ok: false, errorCode: 'no_branch', message: 'No encontré la sucursal donde facturar. Dime cuál.' };

    const { data, error } = await ctx.supabase.rpc('assistant_register_sales_invoice', {
      p_organization_id: ctx.organizationId,
      p_branch_id: branchId,
      p_user_id: ctx.userId,
      p_payload: {
        customer_id: args.customer_id ?? null,
        issue: args.issue,
        issue_date: args.issue_date ?? null,
        due_date: args.due_date ?? null,
        payment_terms: args.payment_terms ?? 30,
        payment_method: args.payment_method ?? 'credit',
        currency: ctx.currency,
        tax_included: args.tax_included,
        items: args.items,
        notes: args.notes ?? 'Creada por GO Assistant',
      },
    });

    if (error) {
      const mapped = mapFacturaVentaError(error.message);
      if (mapped) return mapped;
      return { ok: false, errorCode: 'execution_error', message: `No pude crear la factura: ${error.message}` };
    }

    const row = data as { invoice_id: string; sale_id: string; number: string; cliente: string | null; estado: string; total: number; lineas: number };
    return {
      ok: true,
      message: `Factura ${row.number} ${row.estado === 'issued' ? 'emitida' : 'creada en borrador'}${row.cliente ? ` a ${row.cliente}` : ''} por ${formatMoney(
        row.total,
        ctx.currency
      )} con ${row.lineas} ${row.lineas === 1 ? 'línea' : 'líneas'}.${row.estado === 'draft' ? ' La emites desde Finanzas → Facturas de venta cuando quieras.' : ''}`,
      entity: { type: 'invoice_sales', id: row.invoice_id, url: `/app/finanzas/facturas-venta/${row.invoice_id}` },
      data: row,
      undo: { kind: 'void_sales_invoice', payload: { invoice_id: row.invoice_id } },
    };
  },
};

export const FACTURAS_TOOLS = [registrarFacturaCompra, registrarFacturaVenta];
