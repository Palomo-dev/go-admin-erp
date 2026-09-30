/**
 * «Actividad reciente» del inicio (Figma 445:137185, `447:73055`): filtros
 * Todo · Ventas · Facturas · Clientes · Inventario, lista con importes y
 * paginación compacta («1–4 de 15 movimientos» + «Ir a»).
 *
 * Regla pura: qué pide la ruta (`GET /api/inicio/actividad`), cómo se valida y
 * cómo se lee lo que devuelve `fn_inicio_actividad` (migración
 * `20260930230200_inicio_actividad`), que decide en la base qué tipos ve cada
 * persona (módulo activo + permiso de lectura) y cuenta por tipo.
 *
 * «Reservas» no está entre los filtros del diseño: el chip solo aparece si la
 * organización tiene el hotel activo y la persona puede verlas (antes la
 * actividad del inicio las mostraba; no se pierden en silencio).
 */

export const TIPOS_ACTIVIDAD = ['venta', 'factura', 'cliente', 'stock', 'reserva'] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];
export type FiltroActividad = 'todo' | TipoActividad;

/** Filas por página del diseño («1–4 de 15 movimientos»). */
export const TAMANO_ACTIVIDAD = 4;
export const TAMANO_MAXIMO_ACTIVIDAD = 20;

export interface PedidoActividad {
  tipo: TipoActividad | null;
  pagina: number;
  tamano: number;
}

/**
 * `?tipo=&pagina=&tamano=` validados (el periodo y la sucursal los valida
 * `pedidoPanel`). `null` = pedido inválido (400).
 */
export function leerPedidoActividad(params: URLSearchParams): PedidoActividad | null {
  const tipoCrudo = params.get('tipo');
  const tipo = tipoCrudo === null || tipoCrudo === '' || tipoCrudo === 'todo' ? null : tipoCrudo;
  if (tipo !== null && !(TIPOS_ACTIVIDAD as readonly string[]).includes(tipo)) return null;
  const pagina = Number(params.get('pagina') ?? '1');
  const tamano = Number(params.get('tamano') ?? String(TAMANO_ACTIVIDAD));
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 10_000) return null;
  if (!Number.isInteger(tamano) || tamano < 1 || tamano > TAMANO_MAXIMO_ACTIVIDAD) return null;
  return { tipo: tipo as TipoActividad | null, pagina, tamano };
}

export function queryActividad(p: { filtro: FiltroActividad; pagina: number; tamano?: number }): string {
  const qs = new URLSearchParams();
  if (p.filtro !== 'todo') qs.set('tipo', p.filtro);
  qs.set('pagina', String(p.pagina));
  if (p.tamano && p.tamano !== TAMANO_ACTIVIDAD) qs.set('tamano', String(p.tamano));
  return qs.toString();
}

// ─── Lectura de la respuesta ────────────────────────────────────────────────

export interface FilaActividad {
  tipo: TipoActividad;
  id: string;
  /** Instante (timestamptz) del movimiento. */
  fecha: string;
  monto: number | null;
  moneda: string | null;
  estado: string | null;
  /** venta: pos · web · mesa. */
  canal: string | null;
  numero: string | null;
  autor: string | null;
  sucursal: string | null;
  /** cliente */
  nombre: string | null;
  /** stock */
  producto: string | null;
  cantidad: number | null;
  direccion: 'in' | 'out' | null;
}

export interface Actividad {
  /** Tipos que la persona puede ver en esta organización (orden fijo). */
  tipos: TipoActividad[];
  conteos: Partial<Record<TipoActividad, number>>;
  /** Total del filtro pedido (para la paginación). */
  total: number;
  filas: FilaActividad[];
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const numeroONull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const esTipo = (v: unknown): v is TipoActividad => typeof v === 'string' && (TIPOS_ACTIVIDAD as readonly string[]).includes(v);

/** Respuesta de `fn_inicio_actividad` → modelo tolerante (una fila rara se descarta). */
export function leerActividad(crudo: unknown): Actividad {
  const r = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>;
  const tipos = Array.isArray(r.tipos) ? TIPOS_ACTIVIDAD.filter((t) => (r.tipos as unknown[]).includes(t)) : [];
  const conteos: Partial<Record<TipoActividad, number>> = {};
  if (r.conteos && typeof r.conteos === 'object') {
    for (const [k, v] of Object.entries(r.conteos as Record<string, unknown>)) {
      const n = numeroONull(v);
      if (esTipo(k) && n !== null && n >= 0) conteos[k] = Math.trunc(n);
    }
  }
  const filas: FilaActividad[] = [];
  for (const x of Array.isArray(r.filas) ? r.filas : []) {
    if (!x || typeof x !== 'object') continue;
    const f = x as Record<string, unknown>;
    if (!esTipo(f.tipo) || typeof f.id !== 'string' || typeof f.fecha !== 'string') continue;
    filas.push({
      tipo: f.tipo,
      id: f.id,
      fecha: f.fecha,
      monto: numeroONull(f.monto),
      moneda: texto(f.moneda),
      estado: texto(f.estado),
      canal: texto(f.canal),
      numero: texto(f.numero),
      autor: texto(f.autor),
      sucursal: texto(f.sucursal),
      nombre: texto(f.nombre),
      producto: texto(f.producto),
      cantidad: numeroONull(f.cantidad),
      direccion: f.direccion === 'in' || f.direccion === 'out' ? f.direccion : null,
    });
  }
  return { tipos, conteos, total: Math.max(0, Math.trunc(numeroONull(r.total) ?? 0)), filas };
}

/**
 * Chips de filtro: «Todo» y los tipos que la persona ve. «Reservas» solo si
 * hay alguna en el periodo (no está en el diseño; es para quien tiene hotel).
 */
export function filtrosVisibles(a: Pick<Actividad, 'tipos' | 'conteos'>): FiltroActividad[] {
  return ['todo', ...a.tipos.filter((t) => t !== 'reserva' || (a.conteos.reserva ?? 0) > 0)];
}

// ─── Presentación ───────────────────────────────────────────────────────────

/** Texto a traducir bajo `home.actividad` y sus variables ICU. */
export interface TextoActividad {
  clave: string;
  params?: Record<string, string | number>;
}

const ESTADOS: Record<TipoActividad, readonly string[]> = {
  venta: ['paid', 'pending', 'void'],
  factura: ['paid', 'issued', 'partial', 'void'],
  cliente: [],
  stock: [],
  reserva: ['confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'tentative'],
};

/** Clave del estado conocido o `otro` (nunca un código crudo en pantalla). */
function estado(tipo: TipoActividad, e: string | null): string {
  return e && ESTADOS[tipo].includes(e) ? e : 'otro';
}

/**
 * Título de la fila («Venta pagada», «Factura FV-2026-0912 emitida»,
 * «Cliente nuevo: …», «Entrada de stock · …», «Reserva confirmada»).
 */
export function tituloActividad(f: FilaActividad): TextoActividad {
  switch (f.tipo) {
    case 'venta':
      return { clave: `titulos.venta.${estado('venta', f.estado)}` };
    case 'factura':
      return { clave: `titulos.factura.${estado('factura', f.estado)}`, params: { numero: f.numero ?? '' } };
    case 'cliente':
      return f.nombre ? { clave: 'titulos.cliente', params: { nombre: f.nombre } } : { clave: 'titulos.clienteSinNombre' };
    case 'stock':
      return {
        clave: f.direccion === 'out' ? 'titulos.salidaStock' : 'titulos.entradaStock',
        params: { producto: f.producto ?? '' },
      };
    case 'reserva':
      return { clave: `titulos.reserva.${estado('reserva', f.estado)}` };
  }
}

/**
 * Lo que va tras «hace N min ·»: quién (venta), dónde (factura, reserva),
 * «CRM» (cliente) o «+24 unidades» (stock), como en el diseño.
 */
export function contextoActividad(f: FilaActividad): TextoActividad | null {
  switch (f.tipo) {
    case 'venta':
      return f.autor ? { clave: 'contexto.texto', params: { texto: f.autor } } : f.sucursal ? { clave: 'contexto.texto', params: { texto: f.sucursal } } : null;
    case 'factura':
    case 'reserva':
      return f.sucursal ? { clave: 'contexto.texto', params: { texto: f.sucursal } } : null;
    case 'cliente':
      return { clave: 'contexto.crm' };
    case 'stock':
      return f.cantidad === null
        ? null
        : { clave: f.direccion === 'out' ? 'contexto.salida' : 'contexto.entrada', params: { n: Math.abs(f.cantidad) } };
  }
}

/**
 * «hace 3 min», «hace 2 h» o, desde el día anterior, la fecha. Devuelve la
 * clave y sus variables; la fecha la formatea la pantalla con la zona de la
 * organización (`useFormatDate`).
 */
export function haceCuanto(fecha: string, ahora: Date): { clave: 'ahora' | 'minutos' | 'horas' | 'fecha'; n?: number } {
  const t = Date.parse(fecha);
  if (Number.isNaN(t)) return { clave: 'fecha' };
  const min = Math.floor((ahora.getTime() - t) / 60_000);
  if (min < 1) return { clave: 'ahora' };
  if (min < 60) return { clave: 'minutos', n: min };
  if (min < 24 * 60) return { clave: 'horas', n: Math.floor(min / 60) };
  return { clave: 'fecha' };
}
