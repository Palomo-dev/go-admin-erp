/**
 * GO Assistant — herramientas de explicación sobre el estado real (F6, §12).
 *
 * Esto es la respuesta a C10: hoy el asistente explica el ERP desde un prompt
 * con módulos y rutas escritos a mano, así que a una organización de gimnasio
 * le habla de Inventario → Productos, una pantalla que no tiene. La corrección
 * no es "mejorar el prompt": es **dejar de contar y empezar a mirar**.
 *
 * De dónde sale cada cosa, sin excepción:
 *
 * | Qué                    | Fuente real                                    |
 * |------------------------|------------------------------------------------|
 * | módulos                | `organization_modules` × `modules`             |
 * | rutas                  | `organization_module_pages` de ESA organización|
 * | estado de arranque     | las tablas de configuración, contando filas     |
 *
 * Ninguna lista de módulos ni de rutas está escrita en este archivo. Lo único
 * cableado son *pistas de búsqueda* (palabras) que se usan para elegir, entre
 * las páginas que la organización realmente tiene, cuál corresponde a cada
 * punto del checklist. Si ninguna coincide, la ruta va `null` y el asistente
 * dice dónde está el ajuste sin inventarse una URL.
 *
 * Las tres son riesgo `low`: leen y no escriben. Pedirle permiso al usuario
 * para mirar su propia configuración sería ruido (§6.2).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { JsonSchemaObject, ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';

/** El preview de una herramienta de lectura nunca se enseña: se ejecuta directo. */
const READ_PREVIEW: ToolPreview = {
  title: 'Consulta',
  summary: 'Consulta de solo lectura sobre la configuración de la organización.',
  lines: [],
  warnings: [],
  estimatedCredits: 0,
  reversible: true,
};

/** Esquema de las herramientas que no reciben nada. */
const SIN_ARGUMENTOS: JsonSchemaObject = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

type SinArgs = Record<string, never>;

/** Minúsculas y sin tildes, para comparar lo que dijo el usuario con la base. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// Lecturas compartidas
// ---------------------------------------------------------------------------

interface ModuloActivo {
  codigo: string;
  nombre: string;
  descripcion: string | null;
  es_nucleo: boolean;
  rank: number | null;
}

interface FilaModulo {
  module_code: string;
  modules:
    | { name: string; description: string | null; is_core: boolean | null; rank: number | null }
    | Array<{ name: string; description: string | null; is_core: boolean | null; rank: number | null }>
    | null;
}

/**
 * Módulos activos de la organización.
 *
 * `capabilities.activeModules` ya trae los códigos, pero solo los códigos: aquí
 * hacen falta el nombre y la descripción para poder explicárselos a una
 * persona. Se lee de la base y no se cablea nada.
 */
async function cargarModulosActivos(
  supabase: SupabaseClient,
  organizationId: number
): Promise<ModuloActivo[] | null> {
  const { data, error } = await supabase
    .from('organization_modules')
    .select('module_code, modules(name, description, is_core, rank)')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (error) {
    console.error('[GO Assistant] No se pudieron leer los módulos activos:', error.message);
    return null;
  }

  const filas = (data ?? []) as FilaModulo[];
  return filas
    .map((f) => {
      const m = Array.isArray(f.modules) ? f.modules[0] : f.modules;
      return {
        codigo: f.module_code,
        nombre: m?.name ?? f.module_code,
        descripcion: m?.description ?? null,
        es_nucleo: m?.is_core === true,
        rank: m?.rank ?? null,
      };
    })
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.nombre.localeCompare(b.nombre));
}

interface PaginaModulo {
  modulo: string;
  nombre: string;
  ruta: string;
}

/** Las pantallas que ESTA organización tiene habilitadas. Nunca una lista fija. */
async function cargarPaginas(
  supabase: SupabaseClient,
  organizationId: number,
  codigos?: string[]
): Promise<PaginaModulo[]> {
  let q = supabase
    .from('organization_module_pages')
    .select('module_code, page_name, page_href')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (codigos && codigos.length > 0) q = q.in('module_code', codigos);

  const { data, error } = await q;
  if (error) {
    console.warn('[GO Assistant] No se pudieron leer las páginas de los módulos:', error.message);
    return [];
  }

  const filas = (data ?? []) as Array<{ module_code: string; page_name: string; page_href: string }>;
  return filas
    .map((f) => ({ modulo: f.module_code, nombre: f.page_name, ruta: f.page_href }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Elige, entre las páginas reales de la organización, la que corresponde a un
 * punto del checklist.
 *
 * Las `pistas` son palabras, no rutas. Si la organización no tiene ninguna
 * página que encaje, se devuelve `null` y el asistente lo dice sin inventar.
 */
function rutaPorPistas(paginas: PaginaModulo[], pistas: string[]): string | null {
  const normalizadas = pistas.map(normalizar);
  for (const pista of normalizadas) {
    const encontrada = paginas.find((p) => normalizar(p.nombre).includes(pista));
    if (encontrada) return encontrada.ruta;
  }
  return null;
}

/**
 * Cuenta filas sin traérselas.
 *
 * Devuelve `null` —no 0— cuando la consulta falla: "no pude comprobarlo" y "no
 * hay ninguno" son cosas distintas, y confundirlas haría que el asistente le
 * dijera a un cliente que no tiene impuestos configurados porque falló la RLS.
 */
async function contarFilas(
  supabase: SupabaseClient,
  tabla: string,
  columna: string,
  filtros: Array<[string, string | number | boolean]>
): Promise<number | null> {
  let q = supabase.from(tabla).select(columna, { count: 'exact', head: true });
  for (const [col, val] of filtros) q = q.eq(col, val);

  const { count, error } = await q;
  if (error) {
    console.warn(`[GO Assistant] No se pudo contar ${tabla}:`, error.message);
    return null;
  }
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// listar_modulos_activos
// ---------------------------------------------------------------------------

export const listarModulosActivos: ToolDefinition<SinArgs> = {
  name: 'listar_modulos_activos',
  description:
    'Devuelve los módulos que esta organización tiene activos según su plan, con su nombre y las pantallas que puede abrir. Úsala ANTES de explicar cómo hacer algo: si el módulo no está en la lista, esa parte del ERP no existe para este cliente y no debes mencionarla.',
  parameters: SIN_ARGUMENTOS,
  risk: 'low',
  // Sin permisos: saber qué módulos contrató su propia organización no es un
  // dato sensible, y negárselo dejaría al asistente explicando a ciegas.
  permissions: [],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: true,

  parseArgs(): SinArgs {
    return {};
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const modulos = await cargarModulosActivos(ctx.supabase, ctx.organizationId);
    if (modulos === null) {
      return {
        ok: false,
        errorCode: 'query_error',
        message: 'No pude leer los módulos de la organización.',
      };
    }
    if (modulos.length === 0) {
      return {
        ok: true,
        message: 'Esta organización no tiene ningún módulo activo todavía.',
        data: { modulos: [] },
      };
    }

    const paginas = await cargarPaginas(
      ctx.supabase,
      ctx.organizationId,
      modulos.map((m) => m.codigo)
    );

    const conRutas = modulos.map((m) => ({
      ...m,
      paginas: paginas.filter((p) => p.modulo === m.codigo).map((p) => ({ nombre: p.nombre, ruta: p.ruta })),
    }));

    return {
      ok: true,
      message: `${modulos.length} módulo${modulos.length === 1 ? '' : 's'} activo${
        modulos.length === 1 ? '' : 's'
      }: ${modulos.map((m) => m.nombre).join(', ')}.`,
      data: { total: modulos.length, modulos: conRutas },
    };
  },
};

// ---------------------------------------------------------------------------
// estado_configuracion
// ---------------------------------------------------------------------------

interface PuntoChecklist {
  clave: string;
  titulo: string;
  /** Módulo bajo el que vive el ajuste, para buscar su ruta real. */
  modulo: string;
  /** Palabras con las que reconocer la página. NO son rutas. */
  pistas: string[];
  /** `null` = no se pudo comprobar. */
  contar(supabase: SupabaseClient, organizationId: number): Promise<number | null>;
  detalle(n: number): string;
  /** Qué hacer si falta. */
  falta: string;
}

/**
 * El checklist de arranque (§12).
 *
 * Cada punto es una consulta contra una tabla verificada. No hay ningún caso
 * en el que se responda de memoria: o hay filas, o no las hay, o no se pudo
 * comprobar.
 */
const CHECKLIST: PuntoChecklist[] = [
  {
    clave: 'sucursales',
    titulo: 'Sucursales',
    modulo: 'configuracion',
    pistas: ['sucursal', 'configuraci'],
    contar: (s, org) => contarFilas(s, 'branches', 'id', [['organization_id', org]]),
    detalle: (n) => `${n} sucursal${n === 1 ? '' : 'es'} registrada${n === 1 ? '' : 's'}.`,
    falta: 'Sin sucursales no se puede registrar stock ni facturar: el stock y la numeración cuelgan de una sucursal.',
  },
  {
    clave: 'moneda',
    titulo: 'Moneda base',
    modulo: 'finance',
    pistas: ['moneda'],
    contar: (s, org) =>
      contarFilas(s, 'organization_currencies', 'currency_code', [
        ['organization_id', org],
        ['is_base', true],
      ]),
    detalle: (n) => (n > 0 ? 'Hay una moneda base definida.' : 'No hay moneda base.'),
    falta: 'Sin moneda base los importes se muestran sin formato y los informes no cuadran.',
  },
  {
    clave: 'metodos_pago',
    titulo: 'Métodos de pago',
    modulo: 'finance',
    pistas: ['metodos de pago', 'metodo de pago', 'pago'],
    contar: (s, org) =>
      contarFilas(s, 'organization_payment_methods', 'id', [
        ['organization_id', org],
        ['is_active', true],
      ]),
    detalle: (n) => `${n} método${n === 1 ? '' : 's'} de pago activo${n === 1 ? '' : 's'}.`,
    falta: 'Sin métodos de pago activos no se puede cerrar una venta en el POS.',
  },
  {
    clave: 'impuestos',
    titulo: 'Impuestos',
    modulo: 'finance',
    pistas: ['impuesto'],
    contar: (s, org) =>
      contarFilas(s, 'organization_taxes', 'id', [
        ['organization_id', org],
        ['is_active', true],
      ]),
    detalle: (n) => `${n} impuesto${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}.`,
    falta: 'Sin impuestos configurados las ventas salen sin IVA y la contabilidad queda mal desde el primer día.',
  },
  {
    clave: 'numeracion_facturas',
    titulo: 'Numeración de facturas',
    modulo: 'finance',
    pistas: ['facturas de venta', 'facturaci', 'factura'],
    contar: (s, org) =>
      contarFilas(s, 'invoice_sequences', 'id', [
        ['organization_id', org],
        ['is_active', true],
      ]),
    detalle: (n) => `${n} resolución${n === 1 ? '' : 'es'} de numeración activa${n === 1 ? '' : 's'}.`,
    falta: 'Sin resolución de numeración las facturas no llevan consecutivo legal.',
  },
  {
    clave: 'facturacion_electronica',
    titulo: 'Facturación electrónica',
    modulo: 'finance',
    pistas: ['electronica', 'electr'],
    contar: (s, org) =>
      contarFilas(s, 'electronic_invoicing_config', 'id', [
        ['organization_id', org],
        ['is_active', true],
      ]),
    detalle: (n) => (n > 0 ? 'Hay un proveedor de facturación electrónica conectado.' : 'No hay proveedor conectado.'),
    falta: 'La facturación electrónica ante la DIAN necesita un proveedor conectado y la resolución cargada.',
  },
];

export const estadoConfiguracion: ToolDefinition<SinArgs> = {
  name: 'estado_configuracion',
  description:
    'Revisa el estado real de la puesta en marcha de la organización: sucursales, moneda base, métodos de pago, impuestos, numeración de facturas y facturación electrónica. Devuelve qué está listo, qué falta y en qué pantalla se arregla. Úsala cuando el usuario pregunte "qué me falta configurar" o antes de explicar por qué algo no funciona.',
  parameters: SIN_ARGUMENTOS,
  risk: 'low',
  permissions: [],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: true,

  parseArgs(): SinArgs {
    return {};
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext): Promise<ToolResult> {
    const paginas = await cargarPaginas(ctx.supabase, ctx.organizationId);

    const resultados = await Promise.all(
      CHECKLIST.map(async (punto) => {
        const n = await punto.contar(ctx.supabase, ctx.organizationId);
        const delModulo = paginas.filter((p) => p.modulo === punto.modulo);
        return {
          clave: punto.clave,
          titulo: punto.titulo,
          // `null` = no se pudo comprobar. Se distingue de "no hay ninguno".
          estado: n === null ? ('desconocido' as const) : n > 0 ? ('listo' as const) : ('pendiente' as const),
          detalle: n === null ? 'No se pudo comprobar.' : punto.detalle(n),
          por_que_importa: n !== null && n > 0 ? null : punto.falta,
          ruta: rutaPorPistas(delModulo, punto.pistas),
        };
      })
    );

    const pendientes = resultados.filter((r) => r.estado === 'pendiente');
    const desconocidos = resultados.filter((r) => r.estado === 'desconocido');

    let message: string;
    if (pendientes.length === 0 && desconocidos.length === 0) {
      message = 'La configuración de arranque está completa.';
    } else if (pendientes.length === 0) {
      message = `No pude comprobar ${desconocidos.length} punto${desconocidos.length === 1 ? '' : 's'} de la configuración.`;
    } else {
      message = `Faltan ${pendientes.length} de ${resultados.length}: ${pendientes.map((p) => p.titulo).join(', ')}.`;
    }

    return {
      ok: true,
      message,
      data: {
        total: resultados.length,
        listos: resultados.length - pendientes.length - desconocidos.length,
        puntos: resultados,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// explicar_configuracion
// ---------------------------------------------------------------------------

/**
 * Comprobaciones adicionales por módulo.
 *
 * Esto **no** es la lista de módulos del ERP: esa sale de `modules` y de
 * `organization_modules`, siempre. Es un mapa de extras opcionales, y un módulo
 * que no esté aquí se explica igual (estado, pantallas y checklist general).
 * Solo se incluyen módulos cuyas tablas se verificaron contra la base; añadir
 * una entrada aquí sin comprobar la tabla es exactamente el bug que este
 * proyecto ya cometió con `inventory` / `orders` / `order_items`.
 */
const EXTRAS_POR_MODULO: Record<
  string,
  Array<{
    titulo: string;
    pistas: string[];
    contar(supabase: SupabaseClient, organizationId: number): Promise<number | null>;
    falta: string;
  }>
> = {
  inventory: [
    {
      titulo: 'Productos',
      pistas: ['producto'],
      contar: (s, org) => contarFilas(s, 'products', 'id', [['organization_id', org]]),
      falta: 'El catálogo está vacío: sin productos no hay ventas ni existencias.',
    },
    {
      titulo: 'Categorías',
      pistas: ['categor'],
      contar: (s, org) =>
        contarFilas(s, 'categories', 'id', [
          ['organization_id', org],
          ['is_active', true],
        ]),
      falta: 'Sin categorías el catálogo no se puede filtrar ni agrupar en informes.',
    },
    {
      titulo: 'Proveedores',
      pistas: ['proveedor'],
      contar: (s, org) =>
        contarFilas(s, 'suppliers', 'id', [
          ['organization_id', org],
          ['is_active', true],
        ]),
      falta: 'Sin proveedores no se pueden registrar compras ni facturas de compra.',
    },
  ],
  pos: [
    {
      titulo: 'Numeración de ventas',
      pistas: ['venta'],
      contar: (s, org) =>
        contarFilas(s, 'sale_sequences', 'id', [
          ['organization_id', org],
          ['is_active', true],
        ]),
      falta: 'Sin secuencia de ventas los tiquetes salen sin consecutivo.',
    },
  ],
  finance: [
    {
      titulo: 'Plan de cuentas',
      pistas: ['plan de cuentas', 'contabilidad'],
      contar: (s, org) =>
        contarFilas(s, 'chart_of_accounts', 'organization_id', [
          ['organization_id', org],
          ['is_active', true],
        ]),
      falta: 'Sin plan de cuentas no se pueden generar asientos ni estados financieros.',
    },
  ],
  crm: [
    {
      titulo: 'Embudos de venta',
      pistas: ['pipeline', 'oportunidad', 'embudo'],
      contar: (s, org) => contarFilas(s, 'pipelines', 'id', [['organization_id', org]]),
      falta: 'Sin un embudo con etapas no se pueden mover oportunidades.',
    },
  ],
  clientes: [
    {
      titulo: 'Clientes',
      pistas: ['cliente'],
      contar: (s, org) => contarFilas(s, 'customers', 'id', [['organization_id', org]]),
      falta: 'Todavía no hay clientes registrados.',
    },
  ],
  notifications: [
    {
      titulo: 'Canales de notificación',
      pistas: ['canal'],
      contar: (s, org) =>
        contarFilas(s, 'notification_channels', 'id', [
          ['organization_id', org],
          ['is_active', true],
        ]),
      falta: 'Sin canales activos las alertas no salen a ninguna parte.',
    },
  ],
};

interface ExplicarArgs {
  modulo: string;
}

export const explicarConfiguracion: ToolDefinition<ExplicarArgs> = {
  name: 'explicar_configuracion',
  description:
    'Explica qué está configurado y qué falta en un módulo concreto de esta organización, con las pantallas reales que el usuario puede abrir. Acepta el código del módulo o su nombre en español ("inventario", "ventas", "finanzas"). Si el módulo no está activo, lo dice en vez de explicar algo que el cliente no tiene.',
  parameters: {
    type: 'object',
    properties: {
      modulo: {
        type: 'string',
        description: 'Código o nombre del módulo. Ej: "inventory", "inventario", "ventas", "finanzas", "crm".',
      },
    },
    required: ['modulo'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: [],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: true,

  parseArgs(raw: unknown): ExplicarArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const modulo = (raw as Record<string, unknown>).modulo;
    if (typeof modulo !== 'string') return null;
    const limpio = modulo.trim().slice(0, 60);
    if (!limpio) return null;
    return { modulo: limpio };
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext, args: ExplicarArgs): Promise<ToolResult> {
    const modulos = await cargarModulosActivos(ctx.supabase, ctx.organizationId);
    if (modulos === null) {
      return { ok: false, errorCode: 'query_error', message: 'No pude leer los módulos de la organización.' };
    }

    const buscado = normalizar(args.modulo);
    const modulo =
      modulos.find((m) => normalizar(m.codigo) === buscado) ??
      modulos.find((m) => normalizar(m.nombre) === buscado) ??
      modulos.find((m) => normalizar(m.nombre).includes(buscado) || buscado.includes(normalizar(m.codigo)));

    if (!modulo) {
      // Se enumeran los que SÍ tiene: es la diferencia entre "no puedo" y
      // "no existe para ti, pero esto sí".
      return {
        ok: true,
        message: `Esta organización no tiene activo ningún módulo que corresponda a "${args.modulo}". Los activos son: ${
          modulos.map((m) => m.nombre).join(', ') || 'ninguno'
        }.`,
        data: {
          encontrado: false,
          consultado: args.modulo,
          modulos_activos: modulos.map((m) => ({ codigo: m.codigo, nombre: m.nombre })),
        },
      };
    }

    const paginas = await cargarPaginas(ctx.supabase, ctx.organizationId, [modulo.codigo]);

    // El checklist general se filtra al módulo pedido; los extras son los
    // específicos de ese módulo, si los hay.
    const generales = CHECKLIST.filter((p) => p.modulo === modulo.codigo);
    const extras = EXTRAS_POR_MODULO[modulo.codigo] ?? [];

    const puntos = await Promise.all([
      ...generales.map(async (p) => {
        const n = await p.contar(ctx.supabase, ctx.organizationId);
        return {
          titulo: p.titulo,
          estado: n === null ? 'desconocido' : n > 0 ? 'listo' : 'pendiente',
          detalle: n === null ? 'No se pudo comprobar.' : p.detalle(n),
          por_que_importa: n !== null && n > 0 ? null : p.falta,
          ruta: rutaPorPistas(paginas, p.pistas),
        };
      }),
      ...extras.map(async (p) => {
        const n = await p.contar(ctx.supabase, ctx.organizationId);
        return {
          titulo: p.titulo,
          estado: n === null ? 'desconocido' : n > 0 ? 'listo' : 'pendiente',
          detalle: n === null ? 'No se pudo comprobar.' : `${n} registro${n === 1 ? '' : 's'}.`,
          por_que_importa: n !== null && n > 0 ? null : p.falta,
          ruta: rutaPorPistas(paginas, p.pistas),
        };
      }),
    ]);

    const pendientes = puntos.filter((p) => p.estado === 'pendiente');

    return {
      ok: true,
      message:
        pendientes.length === 0
          ? `${modulo.nombre} está activo y no le veo nada pendiente de configurar.`
          : `${modulo.nombre} está activo. Falta: ${pendientes.map((p) => p.titulo).join(', ')}.`,
      data: {
        encontrado: true,
        modulo: { codigo: modulo.codigo, nombre: modulo.nombre, descripcion: modulo.descripcion },
        // Las rutas son las de ESTA organización. Si el array viene vacío, el
        // asistente debe describir la pantalla, no inventarse una URL.
        pantallas: paginas.map((p) => ({ nombre: p.nombre, ruta: p.ruta })),
        puntos,
      },
    };
  },
};

export const NAVEGACION_TOOLS = [listarModulosActivos, estadoConfiguracion, explicarConfiguracion];
