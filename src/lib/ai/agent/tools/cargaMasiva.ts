/**
 * GO Assistant — Fase 2 (§6.3): carga masiva de productos.
 *
 * "Sube este listado" desde un CSV/Excel adjunto o desde filas dictadas.
 *
 * Todo el trabajo de interpretar el archivo es DETERMINISTA y gratis: se lee
 * con `xlsx`, se reconocen las columnas por su cabecera y se concilia contra el
 * catálogo real. No pasa por ningún modelo: un listado de productos ya es
 * texto exacto, y pagar por que una IA lo "adivine" es tirar créditos y meter
 * errores donde no los había.
 *
 * Política de duplicados, explícita y dicha en la tarjeta (§6.3): por `sku`,
 * si no por `barcode`, si no por nombre normalizado. Lo que ya existe se
 * ACTUALIZA (stock y precio si vienen), lo nuevo se CREA, lo que no se
 * entiende se OMITE y se dice por qué.
 *
 * `preview()` calcula el plan y lo enseña con las filas problemáticas arriba.
 * `execute()` lo recalcula (el catálogo pudo cambiar entre la tarjeta y el
 * "sí") y lo manda a UNA RPC transaccional: o entran todas o ninguna.
 */

import type { ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';

const BUCKET = 'ai-attachments';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILAS_DICTADAS = 100;
const MAX_NOMBRE = 200;

type StockMode = 'add' | 'set';

export interface FilaEntrada {
  name?: string;
  sku?: string;
  barcode?: string;
  brand?: string;
  description?: string;
  price?: number;
  cost?: number;
  stock?: number;
}

interface CargaMasivaArgs {
  attachment_id?: string;
  rows?: FilaEntrada[];
  stock_mode: StockMode;
  reason?: string;
}

/** Una fila ya decidida. */
export interface FilaPlan {
  n: number;
  nombre: string;
  sku: string | null;
  barcode: string | null;
  precio: number | null;
  costo: number | null;
  stock: number | null;
  estado: 'nuevo' | 'existente' | 'error';
  /** Para `existente`: el producto con el que coincide y por qué. */
  productId: number | null;
  coincidePor: 'sku' | 'barcode' | 'nombre' | null;
  motivo: string | null;
}

export interface PlanCarga {
  filas: FilaPlan[];
  nuevos: number;
  existentes: number;
  errores: number;
  /** Columnas que se reconocieron en el archivo. */
  columnas: string[];
}

// ─── Reconocimiento de columnas ──────────────────────────────────────────────

type Campo = keyof FilaEntrada;

/**
 * Cabeceras que la gente escribe de verdad en sus listados. Se compara sin
 * acentos, en minúsculas y sin espacios: "Código de barras" → "codigodebarras".
 */
const ALIAS: Record<Campo, string[]> = {
  name: ['nombre', 'producto', 'name', 'descripcion', 'articulo', 'item', 'referencia', 'detalle', 'nombreproducto'],
  sku: ['sku', 'codigo', 'code', 'cod', 'codigoproducto', 'codigointerno', 'ref', 'plu', 'clave'],
  barcode: ['barcode', 'codigodebarras', 'codigobarras', 'ean', 'upc', 'codbarras', 'barras'],
  brand: ['marca', 'brand', 'fabricante'],
  description: ['descripcionlarga', 'observaciones', 'notas', 'description', 'detalles'],
  price: ['precio', 'price', 'precioventa', 'pvp', 'valor', 'valorventa', 'preciounitario', 'precioalpublico'],
  cost: ['costo', 'cost', 'preciocosto', 'preciocompra', 'costounitario', 'valorcompra'],
  stock: ['stock', 'cantidad', 'existencias', 'inventario', 'qty', 'quantity', 'unidades', 'cant', 'saldo'],
};

function normalizarCabecera(h: unknown): string {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Cabecera → campo. `null` si no se reconoce. Exportado para tests. */
export function reconocerColumnas(cabeceras: unknown[]): Array<Campo | null> {
  const usados = new Set<Campo>();
  return cabeceras.map((h) => {
    const norm = normalizarCabecera(h);
    if (!norm) return null;
    for (const campo of Object.keys(ALIAS) as Campo[]) {
      if (usados.has(campo)) continue;
      if (ALIAS[campo].includes(norm)) {
        usados.add(campo);
        return campo;
      }
    }
    // "descripcion" es ambiguo: si ya hay nombre, es la descripción larga.
    if (norm.startsWith('descripcion') && !usados.has('description') && usados.has('name')) {
      usados.add('description');
      return 'description';
    }
    return null;
  });
}

/** "1.234,50" y "1,234.50" y "$ 12.000" → 12000. Exportado para tests. */
export function parseNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    // El último separador es el decimal; el otro, de miles.
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma > -1) {
    // Solo comas: si hay exactamente 3 dígitos detrás, son miles ("12,000").
    s = /,\d{3}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '') : s.replace(',', '.');
  } else if (punto > -1 && /\.\d{3}$/.test(s) && s.split('.').length === 2 && s.length > 5) {
    // "12.000" en Colombia son doce mil; "12.50" no llega aquí (2 decimales).
    s = s.replace('.', '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Convierte una matriz (cabecera + filas) en filas de entrada. Exportado para tests. */
export function matrizAFilas(matriz: unknown[][]): { filas: FilaEntrada[]; columnas: string[] } {
  if (matriz.length === 0) return { filas: [], columnas: [] };

  // La cabecera es la primera fila con al menos una columna reconocible. Los
  // Excel reales traen títulos y filas vacías arriba.
  let idx = 0;
  let mapa: Array<Campo | null> = [];
  for (; idx < Math.min(matriz.length, 10); idx++) {
    mapa = reconocerColumnas(matriz[idx] ?? []);
    if (mapa.some((m) => m === 'name')) break;
  }
  if (!mapa.some((m) => m === 'name')) return { filas: [], columnas: [] };

  const filas: FilaEntrada[] = [];
  for (const fila of matriz.slice(idx + 1)) {
    if (!fila || fila.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
    const f: FilaEntrada = {};
    mapa.forEach((campo, i) => {
      if (!campo) return;
      const v = fila[i];
      if (v === null || v === undefined || String(v).trim() === '') return;
      if (campo === 'price' || campo === 'cost' || campo === 'stock') {
        const n = parseNumero(v);
        if (n !== null) f[campo] = n;
      } else {
        f[campo] = String(v).trim();
      }
    });
    filas.push(f);
  }
  return { filas, columnas: mapa.filter((m): m is Campo => m !== null) };
}

async function leerHoja(buffer: Buffer, mime: string): Promise<unknown[][]> {
  const XLSX = await import('xlsx');
  const libro =
    mime === 'text/csv'
      ? XLSX.read(buffer.toString('utf8'), { type: 'string', raw: true })
      : XLSX.read(buffer, { type: 'buffer' });
  const nombre = libro.SheetNames[0];
  const hoja = nombre ? libro.Sheets[nombre] : undefined;
  if (!hoja) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: null, raw: true });
}

// ─── Conciliación contra el catálogo ─────────────────────────────────────────

export interface ProductoCatalogo {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
}

async function cargarCatalogo(ctx: ToolContext): Promise<ProductoCatalogo[]> {
  const todos: ProductoCatalogo[] = [];
  const PAGINA = 1000;
  for (let desde = 0; desde < 20_000; desde += PAGINA) {
    const { data, error } = await ctx.supabase
      .from('products')
      .select('id, sku, barcode, name')
      .eq('organization_id', ctx.organizationId)
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ProductoCatalogo[];
    todos.push(...page);
    if (page.length < PAGINA) break;
  }
  return todos;
}

/** Decide, fila a fila, qué hacer. Exportado para tests. */
export function planificar(filas: FilaEntrada[], catalogo: ProductoCatalogo[], columnas: string[]): PlanCarga {
  const porSku = new Map<string, ProductoCatalogo>();
  const porBarcode = new Map<string, ProductoCatalogo>();
  const porNombre = new Map<string, ProductoCatalogo>();
  for (const p of catalogo) {
    if (p.sku) porSku.set(p.sku.trim().toLowerCase(), p);
    if (p.barcode) porBarcode.set(p.barcode.trim(), p);
    porNombre.set(normalizarNombre(p.name), p);
  }

  const vistosSku = new Set<string>();
  const vistosNombre = new Set<string>();
  const plan: FilaPlan[] = [];

  filas.forEach((f, i) => {
    const nombre = (f.name ?? '').trim().slice(0, MAX_NOMBRE);
    const sku = f.sku?.trim() || null;
    const barcode = f.barcode?.trim() || null;
    const base: FilaPlan = {
      n: i + 1,
      nombre,
      sku,
      barcode,
      precio: f.price ?? null,
      costo: f.cost ?? null,
      stock: f.stock ?? null,
      estado: 'nuevo',
      productId: null,
      coincidePor: null,
      motivo: null,
    };

    const error = (motivo: string) => plan.push({ ...base, estado: 'error', motivo });

    if (!nombre) return error('Sin nombre.');
    if (f.price !== undefined && f.price < 0) return error('Precio negativo.');
    if (f.cost !== undefined && f.cost < 0) return error('Costo negativo.');
    if (f.stock !== undefined && f.stock < 0) return error('Stock negativo.');

    // Duplicados dentro del propio archivo: la segunda vez es un error, no una
    // segunda creación silenciosa.
    const claveSku = sku?.toLowerCase();
    const claveNombre = normalizarNombre(nombre);
    if (claveSku && vistosSku.has(claveSku)) return error(`SKU "${sku}" repetido en el archivo.`);
    if (!claveSku && vistosNombre.has(claveNombre)) return error('Nombre repetido en el archivo.');
    if (claveSku) vistosSku.add(claveSku);
    vistosNombre.add(claveNombre);

    const existente =
      (claveSku ? porSku.get(claveSku) : undefined) ??
      (barcode ? porBarcode.get(barcode) : undefined) ??
      porNombre.get(claveNombre);
    if (existente) {
      const por = claveSku && porSku.get(claveSku) ? 'sku' : barcode && porBarcode.get(barcode) ? 'barcode' : 'nombre';
      plan.push({ ...base, estado: 'existente', productId: existente.id, coincidePor: por });
      return;
    }
    plan.push(base);
  });

  // Problemáticas arriba, como pide §6.3.
  plan.sort((a, b) => (a.estado === 'error' ? -1 : 0) - (b.estado === 'error' ? -1 : 0) || a.n - b.n);

  return {
    filas: plan,
    nuevos: plan.filter((p) => p.estado === 'nuevo').length,
    existentes: plan.filter((p) => p.estado === 'existente').length,
    errores: plan.filter((p) => p.estado === 'error').length,
    columnas,
  };
}

// ─── Obtener las filas (adjunto o dictado) ──────────────────────────────────

async function obtenerFilas(
  ctx: ToolContext,
  args: CargaMasivaArgs
): Promise<{ filas: FilaEntrada[]; columnas: string[] } | { error: ToolResult }> {
  if (args.rows) {
    return { filas: args.rows, columnas: Object.keys(args.rows[0] ?? {}) };
  }

  const { data, error } = await ctx.supabase
    .from('ai_attachments')
    .select('id, storage_path, mime, kind')
    .eq('id', args.attachment_id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) return { error: { ok: false, errorCode: 'query_error', message: `No pude abrir el adjunto: ${error.message}` } };
  const fila = data as { storage_path: string; mime: string; kind: string } | null;
  if (!fila) {
    return { error: { ok: false, errorCode: 'not_found', message: 'No encuentro ese archivo adjunto. ¿Lo volvemos a subir?' } };
  }
  if (fila.kind !== 'spreadsheet') {
    return {
      error: {
        ok: false,
        errorCode: 'not_spreadsheet',
        message:
          'Ese adjunto no es un CSV ni un Excel. Si es una foto o un PDF de un listado, primero léelo con leer_documento y luego pásame las filas.',
      },
    };
  }

  const descarga = await ctx.supabase.storage.from(BUCKET).download(fila.storage_path);
  if (descarga.error || !descarga.data) {
    return { error: { ok: false, errorCode: 'download_failed', message: 'No pude abrir el archivo adjunto. Puede que se haya borrado.' } };
  }
  const buffer = Buffer.from(await descarga.data.arrayBuffer());
  let matriz: unknown[][];
  try {
    matriz = await leerHoja(buffer, fila.mime);
  } catch (err) {
    return {
      error: {
        ok: false,
        errorCode: 'parse_failed',
        message: `No pude leer el archivo: ${err instanceof Error ? err.message : 'formato no reconocido'}.`,
      },
    };
  }
  const { filas, columnas } = matrizAFilas(matriz);
  if (filas.length === 0) {
    return {
      error: {
        ok: false,
        errorCode: 'no_rows',
        message:
          'No encontré una columna de nombre de producto en el archivo. Necesito al menos una cabecera como "Nombre" o "Producto"; opcionalmente SKU, Código de barras, Precio, Costo y Stock.',
      },
    };
  }
  return { filas, columnas };
}

async function construirPlan(
  ctx: ToolContext,
  args: CargaMasivaArgs
): Promise<{ plan: PlanCarga } | { error: ToolResult }> {
  const origen = await obtenerFilas(ctx, args);
  if ('error' in origen) return origen;
  let catalogo: ProductoCatalogo[];
  try {
    catalogo = await cargarCatalogo(ctx);
  } catch (err) {
    return { error: { ok: false, errorCode: 'query_error', message: `No pude leer tu catálogo: ${err instanceof Error ? err.message : ''}` } };
  }
  return { plan: planificar(origen.filas, catalogo, origen.columnas) };
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

export function mapCargaError(message: string): ToolResult | null {
  if (message.includes('Could not find the function') || message.includes('does not exist') || message.includes('schema cache')) {
    return { ok: false, errorCode: 'not_deployed', message: 'Todavía no puedo cargar listados: falta aplicar un cambio en la base de datos. Avisa a soporte.' };
  }
  if (message.includes('TOO_MANY_ROWS')) {
    const [, total, tope] = message.split('TOO_MANY_ROWS:')[1]?.split('\n')[0]?.split(':').map((x) => x?.trim()) ?? [];
    return { ok: false, errorCode: 'too_many_rows', message: `El listado tiene ${total ?? '?'} filas y el tope es ${tope ?? '?'}. Pártelo en varios archivos.` };
  }
  if (message.includes('SKU_TAKEN')) {
    return { ok: false, errorCode: 'sku_taken', message: 'Uno de los SKU del listado ya existe con otro nombre. No cargué nada: corrige ese SKU y lo intentamos de nuevo.' };
  }
  if (message.includes('PRODUCT_NOT_IN_ORG')) {
    return { ok: false, errorCode: 'not_found', message: 'Uno de los productos a actualizar ya no existe. No cargué nada.' };
  }
  if (message.includes('BRANCH_NOT_IN_ORG')) {
    return { ok: false, errorCode: 'not_found', message: 'Esa sucursal no existe en esta organización.' };
  }
  if (message.includes('ROWS_REQUIRED')) {
    return { ok: false, errorCode: 'missing_fields', message: 'No hay filas válidas para cargar.' };
  }
  return null;
}

// ─── La herramienta ──────────────────────────────────────────────────────────

export const cargarProductosMasivo: ToolDefinition<CargaMasivaArgs> = {
  name: 'cargar_productos_masivo',
  description:
    'Carga un listado de productos al inventario desde un CSV o Excel adjunto (attachment_id) o desde filas que te dicten (rows). Reconoce columnas de nombre, SKU, código de barras, marca, precio, costo y stock. Lo que ya existe (por SKU, código de barras o nombre) se actualiza; lo nuevo se crea; todo en una sola transacción. Usa stock_mode=set solo si el listado es un CONTEO de lo que hay; por defecto (add) las cantidades ENTRAN al inventario.',
  parameters: {
    type: 'object',
    properties: {
      attachment_id: { type: 'string', description: 'Identificador del CSV/Excel adjunto. Te lo da el sistema; nunca lo inventes.' },
      rows: {
        type: 'array',
        description: 'Filas dictadas, si no hay archivo. Máximo 100.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            sku: { type: 'string' },
            barcode: { type: 'string' },
            brand: { type: 'string' },
            price: { type: 'number' },
            cost: { type: 'number' },
            stock: { type: 'number' },
          },
          required: ['name'],
        },
      },
      stock_mode: {
        type: 'string',
        enum: ['add', 'set'],
        description: 'add = las cantidades entran al inventario (por defecto). set = las cantidades son el conteo real y se ajusta la diferencia.',
      },
      reason: { type: 'string', description: 'Motivo que quedará en el ajuste de inventario (p. ej. "inventario inicial", "llegada de mercancía").' },
    },
    additionalProperties: false,
  },
  risk: 'high',
  permissions: ['inventory.create', 'inventory_management', 'product_management'],
  minLevel: 'write_full',
  requiredModule: 'inventory',
  availableInVoice: false,

  parseArgs(raw: unknown): CargaMasivaArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const args: CargaMasivaArgs = { stock_mode: obj.stock_mode === 'set' ? 'set' : 'add' };

    if (typeof obj.attachment_id === 'string' && UUID_RE.test(obj.attachment_id.trim())) {
      args.attachment_id = obj.attachment_id.trim();
    }
    if (Array.isArray(obj.rows) && obj.rows.length > 0 && obj.rows.length <= MAX_FILAS_DICTADAS) {
      const rows: FilaEntrada[] = [];
      for (const r of obj.rows) {
        if (!r || typeof r !== 'object') return null;
        const o = r as Record<string, unknown>;
        const f: FilaEntrada = {};
        for (const k of ['name', 'sku', 'barcode', 'brand', 'description'] as const) {
          if (typeof o[k] === 'string' && (o[k] as string).trim()) f[k] = (o[k] as string).trim();
        }
        for (const k of ['price', 'cost', 'stock'] as const) {
          const n = parseNumero(o[k]);
          if (n !== null) f[k] = n;
        }
        rows.push(f);
      }
      args.rows = rows;
    }
    if (!args.attachment_id && !args.rows) return null;
    // Con archivo, el archivo manda: no se mezclan dos orígenes.
    if (args.attachment_id) delete args.rows;
    if (typeof obj.reason === 'string' && obj.reason.trim()) args.reason = obj.reason.trim().slice(0, 200);
    return args;
  },

  async preview(ctx: ToolContext, args: CargaMasivaArgs): Promise<ToolPreview> {
    const construido = await construirPlan(ctx, args);
    if ('error' in construido) {
      return {
        title: 'Cargar productos',
        summary: construido.error.message,
        lines: [],
        warnings: [construido.error.message],
        estimatedCredits: 0,
        reversible: true,
      };
    }
    const { plan } = construido;
    const tope = ctx.capabilities.bulkMaxRows;
    const aCargar = plan.nuevos + plan.existentes;
    const warnings: string[] = [];

    if (aCargar > tope) {
      warnings.push(`El listado tiene ${aCargar} filas válidas y el tope es ${tope}. Hay que partirlo: no se cargará hasta que quepa.`);
    }
    if (plan.errores > 0) warnings.push(`${plan.errores} ${plan.errores === 1 ? 'fila se omite' : 'filas se omiten'} por errores (arriba en la tabla, con el motivo).`);
    if (plan.existentes > 0) {
      warnings.push(
        args.stock_mode === 'set'
          ? `${plan.existentes} ya existen: su stock se AJUSTARÁ al conteo del listado (entrada o salida según la diferencia).`
          : `${plan.existentes} ya existen: las cantidades del listado ENTRAN al inventario y el precio se actualiza si viene.`
      );
    }
    const sinPrecio = plan.filas.filter((f) => f.estado === 'nuevo' && f.precio === null).length;
    if (sinPrecio > 0) warnings.push(`${sinPrecio} productos nuevos vienen sin precio: no se podrán vender hasta ponérselo.`);
    warnings.push('Duplicados: por SKU, si no por código de barras, si no por nombre. Se carga todo o nada.');

    return {
      title: `Cargar ${aCargar} productos a inventario`,
      summary: `Cargar ${aCargar} ${aCargar === 1 ? 'producto' : 'productos'}: ${plan.nuevos} nuevos, ${plan.existentes} existentes${
        plan.errores > 0 ? `, ${plan.errores} con problemas` : ''
      }. Columnas reconocidas: ${plan.columnas.join(', ') || 'ninguna'}.`,
      lines: [
        { label: 'Nuevos', value: String(plan.nuevos) },
        { label: 'Ya existen', value: `${plan.existentes} → se actualiza ${args.stock_mode === 'set' ? 'al conteo' : 'el stock'}` },
        { label: 'Con problemas', value: `${plan.errores} → se omiten` },
      ],
      warnings,
      bulk: {
        total: plan.filas.length,
        nuevos: plan.nuevos,
        duplicados: plan.existentes,
        conErrores: plan.errores,
        rows: plan.filas.map((f) => ({
          n: f.n,
          estado: f.estado,
          nombre: f.nombre,
          sku: f.sku,
          barcode: f.barcode,
          precio: f.precio,
          costo: f.costo,
          stock: f.stock,
          coincide: f.coincidePor,
          motivo: f.motivo,
        })),
      },
      estimatedCredits: 3,
      reversible: true,
    };
  },

  async execute(ctx: ToolContext, args: CargaMasivaArgs): Promise<ToolResult> {
    const construido = await construirPlan(ctx, args);
    if ('error' in construido) return construido.error;
    const { plan } = construido;
    const validas = plan.filas.filter((f) => f.estado !== 'error');
    if (validas.length === 0) {
      return { ok: false, errorCode: 'no_rows', message: 'Ninguna fila del listado es válida. Revisa los motivos en la tabla.' };
    }
    const tope = ctx.capabilities.bulkMaxRows;
    if (validas.length > tope) {
      return { ok: false, errorCode: 'too_many_rows', message: `El listado tiene ${validas.length} filas válidas y el tope es ${tope}. Pártelo en varios archivos.` };
    }

    const branchId = await resolveBranch(ctx);
    if (!branchId) return { ok: false, errorCode: 'no_branch', message: 'No encontré la sucursal donde cargar el inventario. Dime cuál.' };

    const rows = validas.map((f) =>
      f.estado === 'nuevo'
        ? {
            op: 'create',
            name: f.nombre,
            sku: f.sku,
            barcode: f.barcode,
            price: f.precio,
            cost: f.costo,
            stock: f.stock,
          }
        : { op: 'update', product_id: f.productId, stock: f.stock, price: f.precio }
    );

    const { data, error } = await ctx.supabase.rpc('assistant_bulk_load_products', {
      p_organization_id: ctx.organizationId,
      p_branch_id: branchId,
      p_user_id: ctx.userId,
      p_payload: { rows, stock_mode: args.stock_mode, reason: args.reason ?? 'Carga masiva desde el asistente' },
      p_max_rows: tope,
    });

    if (error) {
      const mapped = mapCargaError(error.message);
      if (mapped) return mapped;
      return { ok: false, errorCode: 'execution_error', message: `No pude cargar el listado: ${error.message}` };
    }

    const row = data as {
      total: number;
      creados: number;
      actualizados: number;
      productos_creados: Array<{ product_id: number; sku: string; name: string }>;
      ajustes: Array<{ adjustment_id: number; type: 'gain' | 'loss'; items: Array<{ product_id: number; quantity: number }> }>;
      precios: Array<{ product_id: number; previous_price_id: number | null; new_price_id: number }>;
    };

    const omitidas = plan.errores > 0 ? ` ${plan.errores} ${plan.errores === 1 ? 'fila se omitió' : 'filas se omitieron'} por errores.` : '';
    return {
      ok: true,
      message: `Listado cargado: ${row.creados} ${row.creados === 1 ? 'producto nuevo' : 'productos nuevos'} y ${row.actualizados} ${
        row.actualizados === 1 ? 'actualizado' : 'actualizados'
      }.${omitidas}`,
      entity: { type: 'bulk_load', id: row.ajustes[0]?.adjustment_id ?? row.productos_creados[0]?.product_id ?? 0 },
      data: { total: row.total, creados: row.creados, actualizados: row.actualizados, omitidas: plan.errores },
      undo: {
        kind: 'undo_bulk_load',
        payload: {
          branch_id: branchId,
          productos_creados: row.productos_creados,
          ajustes: row.ajustes,
          precios: row.precios,
        },
      },
    };
  },
};

export const CARGA_MASIVA_TOOLS = [cargarProductosMasivo];
