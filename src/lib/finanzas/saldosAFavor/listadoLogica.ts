/**
 * Saldos a favor — lógica del listado, de la hoja de detalle y de las acciones,
 * sin React ni Supabase (route handler, pantalla y pruebas). Módulo hoja.
 *
 * El listado lo arma el servidor (`GET /api/saldos-a-favor/listado`): la RPC
 * `fn_list_customer_credits` resuelve permiso, sucursal y estado vivo (vencido);
 * aquí se filtra, ordena, pagina y se calculan los KPI con el día de la
 * organización (`diaDe`), nunca con el día UTC.
 */

export const ESTADOS_SALDO = ['disponible', 'vencido', 'usado', 'anulado'] as const;
export type EstadoSaldo = (typeof ESTADOS_SALDO)[number];

export const ORIGENES_SALDO = ['pago', 'nota_credito', 'devolucion', 'otro'] as const;
export type OrigenSaldo = (typeof ORIGENES_SALDO)[number];

/** Filtros de la URL que entiende el listado (además de `q`, orden y página). */
export const FILTROS_SALDOS = ['estado', 'origen', 'cliente', 'con_saldo', 'desde', 'hasta'] as const;
export const CAMPOS_ORDEN_SALDOS = ['fecha', 'cliente', 'valor', 'disponible', 'vence'] as const;
export type CampoOrdenSaldo = (typeof CAMPOS_ORDEN_SALDOS)[number];
export const TAMANOS_PAGINA_SALDOS = [10, 25, 50, 100] as const;

/** `credit_notes.status` vivo (de la RPC) → estado de la pantalla. */
export function estadoDeStatus(status: string | null | undefined): EstadoSaldo {
  switch (status) {
    case 'active':
      return 'disponible';
    case 'expired':
      return 'vencido';
    case 'cancelled':
      return 'anulado';
    default:
      return 'usado';
  }
}

/** Estado de la pantalla → clave de `StatusBadge` (tabla única `kit/estadoTono`). */
export const BADGE_ESTADO_SALDO: Readonly<Record<EstadoSaldo, string>> = {
  disponible: 'disponible',
  vencido: 'vencido',
  usado: 'usado',
  anulado: 'anulado',
};

export function esOrigenSaldo(v: unknown): v is OrigenSaldo {
  return typeof v === 'string' && (ORIGENES_SALDO as readonly string[]).includes(v);
}

export function esEstadoSaldo(v: unknown): v is EstadoSaldo {
  return typeof v === 'string' && (ESTADOS_SALDO as readonly string[]).includes(v);
}

/** Fila del listado, ya con el documento de origen y el documento del cliente. */
export interface FilaListadoSaldo {
  id: string;
  clienteId: string;
  cliente: string | null;
  clienteDoc: string | null;
  origen: OrigenSaldo;
  /** Número del documento que lo creó (RC-000031, NC-0005); null si no tiene. */
  origenNumero: string | null;
  /** Id del documento de origen (pago, nota crédito o devolución) para enlazarlo. */
  origenId: string | null;
  /** `credit_notes.created_at` (timestamptz). */
  fecha: string;
  valor: number;
  usado: number;
  disponible: number;
  /** `credit_notes.expiry_date` (timestamptz) o null. */
  vence: string | null;
  estado: EstadoSaldo;
  anulable: boolean;
  sucursalId: number | null;
  notas: string | null;
}

export interface FiltrosSaldos {
  q?: string | null;
  estado?: EstadoSaldo | null;
  origen?: OrigenSaldo | null;
  cliente?: string | null;
  conSaldo?: boolean;
  /** Días `YYYY-MM-DD` de la organización, sobre la fecha de creación. */
  desde?: string | null;
  hasta?: string | null;
}

export interface ConsultaListadoSaldos {
  filtros: FiltrosSaldos;
  orden: { campo: CampoOrdenSaldo; direccion: 'asc' | 'desc' };
  pagina: number;
  tamano: number;
  sucursal: number | null;
  /** Periodo de los KPI «Aplicado» y «Devuelto» (días de la organización). */
  kpiDesde: string | null;
  kpiHasta: string | null;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Error de lectura de la consulta: la ruta responde `datos_invalidos`. */
export class ConsultaSaldosInvalida extends Error {}

/**
 * Lee la consulta del listado. Valores inválidos de enumeraciones se ignoran
 * (un enlace viejo no rompe la página); un id o un día mal formado es error.
 */
export function leerConsultaSaldos(sp: URLSearchParams): ConsultaListadoSaldos {
  const dia = (k: string) => {
    const v = sp.get(k);
    if (!v) return null;
    if (!DIA.test(v)) throw new ConsultaSaldosInvalida(k);
    return v;
  };
  const cliente = sp.get('cliente');
  if (cliente && !UUID.test(cliente)) throw new ConsultaSaldosInvalida('cliente');
  const sucursalCruda = sp.get('sucursal');
  if (sucursalCruda && !/^\d+$/.test(sucursalCruda)) throw new ConsultaSaldosInvalida('sucursal');

  const estado = sp.get('estado');
  const origen = sp.get('origen');
  const [campoCrudo, dirCruda] = (sp.get('orden') ?? '').split('.');
  const campo = (CAMPOS_ORDEN_SALDOS as readonly string[]).includes(campoCrudo) ? (campoCrudo as CampoOrdenSaldo) : 'fecha';
  const direccion = dirCruda === 'asc' ? 'asc' : dirCruda === 'desc' ? 'desc' : campo === 'cliente' ? 'asc' : 'desc';
  const pagina = Math.max(1, Number.parseInt(sp.get('pagina') ?? '1', 10) || 1);
  const tamano = Math.min(200, Math.max(1, Number.parseInt(sp.get('tamano') ?? '25', 10) || 25));
  const q = (sp.get('q') ?? '').trim().slice(0, 120);

  return {
    filtros: {
      q: q || null,
      estado: esEstadoSaldo(estado) ? estado : null,
      origen: esOrigenSaldo(origen) ? origen : null,
      cliente: cliente || null,
      conSaldo: sp.get('con_saldo') === '1',
      desde: dia('desde'),
      hasta: dia('hasta'),
    },
    orden: { campo, direccion },
    pagina,
    tamano,
    sucursal: sucursalCruda ? Number(sucursalCruda) : null,
    kpiDesde: dia('kpi_desde'),
    kpiHasta: dia('kpi_hasta'),
  };
}

/** Texto sin tildes y en minúsculas, para buscar «Gomez» y encontrar «Gómez». */
export function normalizarTexto(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Filtra las filas. `diaDe` convierte un instante en el día de la organización
 * (`toPlainDate(new Date(iso), tz)`): el periodo nunca se compara en UTC.
 */
export function filtrarSaldos(
  filas: readonly FilaListadoSaldo[],
  f: FiltrosSaldos,
  diaDe: (iso: string) => string,
): FilaListadoSaldo[] {
  const q = normalizarTexto(f.q);
  return filas.filter((s) => {
    if (f.estado && s.estado !== f.estado) return false;
    if (f.origen && s.origen !== f.origen) return false;
    if (f.cliente && s.clienteId !== f.cliente) return false;
    if (f.conSaldo && !(s.disponible > 0 && s.estado === 'disponible')) return false;
    if (f.desde || f.hasta) {
      const d = diaDe(s.fecha);
      if (f.desde && d < f.desde) return false;
      if (f.hasta && d > f.hasta) return false;
    }
    if (q) {
      const texto = normalizarTexto([s.cliente, s.clienteDoc, s.origenNumero, s.notas].filter(Boolean).join(' '));
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

export function ordenarSaldos(
  filas: readonly FilaListadoSaldo[],
  campo: CampoOrdenSaldo,
  direccion: 'asc' | 'desc',
): FilaListadoSaldo[] {
  const signo = direccion === 'asc' ? 1 : -1;
  const valor = (s: FilaListadoSaldo): string | number => {
    switch (campo) {
      case 'cliente':
        return normalizarTexto(s.cliente);
      case 'valor':
        return s.valor;
      case 'disponible':
        return s.disponible;
      case 'vence':
        // Sin vencimiento va al final en ascendente.
        return s.vence ?? '9999';
      default:
        return s.fecha;
    }
  };
  return filas
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const va = valor(a.s);
      const vb = valor(b.s);
      if (va < vb) return -1 * signo;
      if (va > vb) return 1 * signo;
      // Desempate estable: el más reciente primero.
      return b.s.fecha.localeCompare(a.s.fecha) || a.i - b.i;
    })
    .map(({ s }) => s);
}

export function paginarSaldos<T>(filas: readonly T[], pagina: number, tamano: number): T[] {
  const desde = (Math.max(1, pagina) - 1) * tamano;
  return filas.slice(desde, desde + tamano);
}

/** Aplicación de un saldo a una factura o devolución en dinero (para los KPI). */
export interface MovimientoKpi {
  creditoId: string;
  monto: number;
  /** timestamptz */
  fecha: string;
  /** Factura (aplicación) o método (devolución). */
  referencia?: string | null;
}

export interface KpisSaldos {
  disponible: number;
  clientesConSaldo: number;
  vencido: number;
  saldosVencidos: number;
  aplicado: number;
  facturasAplicadas: number;
  devuelto: number;
  devoluciones: number;
  devolucionesEfectivo: number;
}

/**
 * KPI sobre TODAS las filas visibles por sucursal (no sobre la página ni los
 * filtros): lo disponible y lo vencido, hoy; lo aplicado y lo devuelto, en el
 * periodo (días de la organización). Solo cuentan movimientos de saldos de la
 * lista (respeta la sucursal y el acceso).
 */
export function kpisSaldos(
  filas: readonly FilaListadoSaldo[],
  aplicaciones: readonly MovimientoKpi[],
  devoluciones: readonly MovimientoKpi[],
  periodo: { desde: string | null; hasta: string | null },
  diaDe: (iso: string) => string,
): KpisSaldos {
  const ids = new Set(filas.map((f) => f.id));
  const enPeriodo = (m: MovimientoKpi) => {
    if (!ids.has(m.creditoId)) return false;
    const d = diaDe(m.fecha);
    return (!periodo.desde || d >= periodo.desde) && (!periodo.hasta || d <= periodo.hasta);
  };
  const disponibles = filas.filter((f) => f.estado === 'disponible' && f.disponible > 0);
  const vencidos = filas.filter((f) => f.estado === 'vencido' && f.disponible > 0);
  const apl = aplicaciones.filter(enPeriodo);
  const dev = devoluciones.filter(enPeriodo);
  return {
    disponible: redondear(disponibles.reduce((a, f) => a + f.disponible, 0)),
    clientesConSaldo: new Set(disponibles.map((f) => f.clienteId)).size,
    vencido: redondear(vencidos.reduce((a, f) => a + f.disponible, 0)),
    saldosVencidos: vencidos.length,
    aplicado: redondear(apl.reduce((a, m) => a + Math.abs(m.monto), 0)),
    facturasAplicadas: new Set(apl.map((m) => m.referencia ?? m.creditoId)).size,
    devuelto: redondear(dev.reduce((a, m) => a + Math.abs(m.monto), 0)),
    devoluciones: dev.length,
    devolucionesEfectivo: dev.filter((m) => m.referencia === 'cash').length,
  };
}

function redondear(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface PermisosSaldo {
  crear: boolean;
  anular: boolean;
}

export type MotivoNoAnulable = 'sin_permiso' | 'usado' | 'no_es_anticipo' | 'anulado';

export interface AccionesSaldo {
  /** Aplicar a una factura (`finance.create`): disponible y con saldo. */
  aplicar: boolean;
  /** Devolver en dinero (`finance.void`): disponible o vencido con saldo. */
  devolver: boolean;
  /** Anular el anticipo (`finance.void`): solo anticipo sin usar. */
  anular: boolean;
  /** Por qué no se puede anular (para el diálogo bloqueado); null si se puede. */
  motivoNoAnulable: MotivoNoAnulable | null;
}

/**
 * Qué se puede hacer con un saldo. Reglas de las RPC (`fn_apply_customer_credit`,
 * `fn_saldo_favor_devolver`, `fn_saldo_favor_anular`) para no ofrecer lo que la
 * base rechazaría; la base vuelve a decidirlo.
 *
 * - Devolver un vencido: la RPC exige `status = 'active'` en la tabla; el
 *   vencido «vivo» sigue `active` en la tabla, así que se ofrece.
 */
export function accionesSaldo(
  s: Pick<FilaListadoSaldo, 'estado' | 'disponible' | 'anulable' | 'origen' | 'usado'>,
  p: PermisosSaldo,
): AccionesSaldo {
  const conSaldo = s.disponible > 0;
  const motivoNoAnulable: MotivoNoAnulable | null = !p.anular
    ? 'sin_permiso'
    : s.estado === 'anulado'
      ? 'anulado'
      : s.anulable
        ? null
        : s.origen !== 'pago'
          ? 'no_es_anticipo'
          : 'usado';
  return {
    aplicar: p.crear && s.estado === 'disponible' && conSaldo,
    devolver: p.anular && (s.estado === 'disponible' || s.estado === 'vencido') && conSaldo,
    anular: motivoNoAnulable === null,
    motivoNoAnulable,
  };
}

/** Monto que se propone al aplicar: lo que alcance entre el saldo y la factura. */
export function montoPropuesto(disponible: number, saldoFactura: number): number {
  return redondear(Math.max(0, Math.min(disponible, saldoFactura)));
}

export type ErrorMonto = 'vacio' | 'excede_disponible' | 'excede_factura' | null;

/** Validación del monto en pantalla (la base vuelve a validarlo). */
export function validarMonto(monto: number | null, disponible: number, tope?: number | null): ErrorMonto {
  if (monto === null || !(monto > 0)) return 'vacio';
  if (monto > disponible + 1e-9) return 'excede_disponible';
  if (tope != null && monto > tope + 1e-9) return 'excede_factura';
  return null;
}

// ── Detalle ────────────────────────────────────────────────────────────────

export type TipoMovimientoSaldo = 'origen' | 'aplicacion' | 'devolucion' | 'anulacion';

export interface MovimientoSaldo {
  tipo: TipoMovimientoSaldo;
  id: string;
  /** Número del documento (recibo, factura, nota). */
  numero: string | null;
  /** Id del documento enlazable (factura, nota crédito, pago). */
  documentoId: string | null;
  monto: number;
  /** timestamptz */
  fecha: string;
  /** Método de pago (origen pago o devolución). */
  metodo?: string | null;
  referencia?: string | null;
  motivo?: string | null;
}

/** Detalle de un saldo (`GET /api/saldos-a-favor/[id]`). */
export interface DetalleSaldo {
  saldo: FilaListadoSaldo;
  sucursal: string | null;
  movimientos: MovimientoSaldo[];
}

/**
 * Movimientos en orden: primero el origen, luego aplicaciones, devoluciones y
 * anulación por fecha (ascendente, como la hoja de Figma).
 */
export function ordenarMovimientos(movs: readonly MovimientoSaldo[]): MovimientoSaldo[] {
  const peso: Record<TipoMovimientoSaldo, number> = { origen: 0, aplicacion: 1, devolucion: 1, anulacion: 2 };
  return movs
    .map((m, i) => ({ m, i }))
    .sort((a, b) => peso[a.m.tipo] - peso[b.m.tipo] || a.m.fecha.localeCompare(b.m.fecha) || a.i - b.i)
    .map(({ m }) => m);
}
