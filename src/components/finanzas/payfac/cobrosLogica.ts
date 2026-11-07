/**
 * Lógica de presentación de «Cobros y dispersiones» (Finanzas ronda 2, A7–A10).
 * Sin React: lectura de la API, KPIs, filtros, CSV y reglas de la cuenta de abono.
 *
 * Las formas de los datos son las que devuelve `payoutService` tal cual
 * (`organization_payouts`, `payout_items`, `organization_payout_accounts`).
 * Antes la pantalla esperaba otros nombres (`total_gross`, `reference`,
 * `gross`…) y leía la respuesta como arreglo, aunque la API responde
 * `{ success, data }`: los KPIs salían en 0 y la tabla fallaba con datos.
 */
import { motivoNoQuitarCuentaAbono, ESTADOS_DISPERSION_PENDIENTE } from '@/lib/services/integrations/payfac/cuentaAbonoReglas';

// ─── Lectura de la API ───────────────────────────────────────────────────────

/** Error de una ruta de la API con su código (`code`) y estado HTTP. */
export class ErrorApiCobros extends Error {
  constructor(
    message: string,
    readonly estado: number,
    readonly codigo?: string,
  ) {
    super(message);
    this.name = 'ErrorApiCobros';
  }
}

/**
 * Datos de una respuesta `{ success, data }`. Acepta también un arreglo suelto
 * (forma antigua). Cualquier otra forma, o `ok === false`, lanza `ErrorApiCobros`.
 */
export function datosDeRespuesta<T>(json: unknown, ok = true, estado = 200): T {
  const cuerpo = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  if (!ok) {
    const mensaje = typeof cuerpo.error === 'string' ? cuerpo.error : `HTTP ${estado}`;
    throw new ErrorApiCobros(mensaje, estado, typeof cuerpo.code === 'string' ? cuerpo.code : undefined);
  }
  if (Array.isArray(json)) return json as T;
  if ('data' in cuerpo) return cuerpo.data as T;
  throw new ErrorApiCobros('Respuesta sin datos', estado);
}

/** `fetch` + `datosDeRespuesta`, con el cuerpo JSON aunque la respuesta sea un error. */
export async function pedirApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);
  return datosDeRespuesta<T>(json, res.ok, res.status);
}

// ─── Dispersiones ────────────────────────────────────────────────────────────

export type EstadoDispersion = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type MedioDispersion = 'breb' | 'ach' | 'manual' | 'mono_turbo';

export interface Dispersion {
  id: string;
  organization_id: number;
  payout_reference: string;
  provider_code: string;
  total_amount: number | string;
  commission_amount: number | string;
  net_amount: number | string;
  currency: string;
  status: EstadoDispersion;
  payout_method: MedioDispersion | string;
  period_start: string;
  period_end: string;
  scheduled_at: string | null;
  processed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  items?: ItemDispersion[];
}

export interface ItemDispersion {
  id: string;
  payment_id: string;
  payment_qr_session_id: string | null;
  gross_amount: number | string;
  commission_amount: number | string;
  net_amount: number | string;
  reference: string | null;
}

/** Lo que devuelve `/payouts/summary` (`payoutService.getOrganizationSummary`). */
export interface ResumenDispersiones {
  totalCollected: number;
  totalCommission: number;
  totalDispersed: number;
  pendingDispersal: number;
  lastPayoutAt?: string;
}

export const ESTADOS_DISPERSION: readonly EstadoDispersion[] = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
export const MEDIOS_DISPERSION: readonly MedioDispersion[] = ['breb', 'ach', 'manual', 'mono_turbo'];

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : v ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
};

export interface KpisDispersiones {
  recaudado: number;
  comision: number;
  /** Comisión sobre lo recaudado, en %; `null` sin recaudo. */
  porcentajeComision: number | null;
  dispersado: number;
  pendiente: number;
  /** Próxima dispersión programada (la más cercana de las pendientes), si la hay. */
  proxima: string | null;
}

/**
 * KPIs de la pestaña. Las cifras salen del resumen del servidor (todas las
 * dispersiones de la organización); la próxima fecha, de la lista.
 */
export function kpisDispersiones(resumen: ResumenDispersiones | null, dispersiones: readonly Dispersion[]): KpisDispersiones {
  const recaudado = num(resumen?.totalCollected);
  const comision = num(resumen?.totalCommission);
  const pendientes = dispersiones
    .filter((d) => (ESTADOS_DISPERSION_PENDIENTE as readonly string[]).includes(d.status))
    .map((d) => d.scheduled_at)
    .filter((f): f is string => Boolean(f))
    .sort();
  return {
    recaudado,
    comision,
    porcentajeComision: recaudado > 0 ? Math.round((comision / recaudado) * 1000) / 10 : null,
    dispersado: num(resumen?.totalDispersed),
    pendiente: num(resumen?.pendingDispersal),
    proxima: pendientes[0] ?? null,
  };
}

export interface FiltroDispersiones {
  estado: EstadoDispersion | null;
  texto: string;
}

export function filtrarDispersiones(lista: readonly Dispersion[], filtro: FiltroDispersiones): Dispersion[] {
  const texto = filtro.texto.trim().toLowerCase();
  return lista.filter((d) => {
    if (filtro.estado && d.status !== filtro.estado) return false;
    if (texto && !(d.payout_reference ?? '').toLowerCase().includes(texto)) return false;
    return true;
  });
}

/** Importes de una dispersión como números. */
export function importesDispersion(d: Pick<Dispersion, 'total_amount' | 'commission_amount' | 'net_amount'>) {
  return { bruto: num(d.total_amount), comision: num(d.commission_amount), neto: num(d.net_amount) };
}

export function importesItem(i: Pick<ItemDispersion, 'gross_amount' | 'commission_amount' | 'net_amount'>) {
  return { bruto: num(i.gross_amount), comision: num(i.commission_amount), neto: num(i.net_amount) };
}

/** ¿Medio conocido? Para traducirlo; si no, se muestra el código. */
export function esMedioConocido(medio: string): medio is MedioDispersion {
  return (MEDIOS_DISPERSION as readonly string[]).includes(medio);
}

export function esEstadoConocido(estado: string): estado is EstadoDispersion {
  return (ESTADOS_DISPERSION as readonly string[]).includes(estado);
}

/**
 * Filas del CSV de «Exportar». Los importes van como número (sin símbolo) para
 * que la hoja de cálculo los sume; las fechas, ya formateadas por la pantalla.
 */
export function filasCsvDispersiones(
  lista: readonly Dispersion[],
  encabezados: readonly string[],
  formatear: { fecha: (iso: string | null) => string; medio: (m: string) => string; estado: (e: string) => string },
): (string | number)[][] {
  return [
    [...encabezados],
    ...lista.map((d) => {
      const { bruto, comision, neto } = importesDispersion(d);
      return [
        d.payout_reference,
        formatear.fecha(d.period_start),
        formatear.fecha(d.period_end),
        bruto,
        comision,
        neto,
        d.currency,
        formatear.medio(d.payout_method),
        formatear.estado(d.status),
        formatear.fecha(d.created_at),
      ];
    }),
  ];
}

// ─── Cuenta de abono ─────────────────────────────────────────────────────────

export interface CuentaAbono {
  id: string;
  bank_name: string;
  account_type: string;
  /** Enmascarado por la API (`******4321`). */
  account_number: string;
  account_holder_name: string;
  account_holder_id_type: string;
  account_holder_id: string;
  breb_key_value?: string | null;
  is_verified: boolean;
  is_active?: boolean;
  bank_account_id?: number | null;
  bank_account?: { id: number; name: string; bank_name: string; account_number: string; account_type: string } | null;
}

/** «******4321» → «··4321». */
export function ultimosDigitos(valor: string | null | undefined): string {
  const limpio = (valor ?? '').replace(/[^0-9A-Za-z]/g, '');
  return limpio ? `··${limpio.slice(-4)}` : '';
}

/**
 * ¿Se puede quitar esta cuenta? Misma regla que el servidor
 * (`motivoNoQuitarCuentaAbono`): la pantalla deshabilita la acción con su motivo
 * y el servidor la rechaza igual (409) si alguien la llama directo.
 */
export function motivoNoQuitarCuenta(cuenta: CuentaAbono, cuentas: readonly CuentaAbono[], dispersionesPendientes: number) {
  return motivoNoQuitarCuentaAbono({
    verificada: cuenta.is_verified,
    otrasVerificadas: cuentas.filter((c) => c.id !== cuenta.id && c.is_verified && c.is_active !== false).length,
    dispersionesPendientes,
  });
}

// ─── Formulario «Nueva cuenta de abono» ──────────────────────────────────────

export type TipoCuentaBanco = 'savings' | 'checking';
export type TipoDocumentoTitular = 'CC' | 'CE' | 'NIT' | 'PEP';

export interface FormularioCuentaAbono {
  bankAccountId: number | null;
  bankName: string;
  accountType: TipoCuentaBanco;
  accountNumber: string;
  accountHolderName: string;
  accountHolderIdType: TipoDocumentoTitular;
  accountHolderId: string;
  brebKeyValue: string;
}

export type CampoObligatorioCuenta = 'bankName' | 'accountNumber' | 'accountHolderName' | 'accountHolderId';

export function camposFaltantesCuenta(f: FormularioCuentaAbono): CampoObligatorioCuenta[] {
  const obligatorios: CampoObligatorioCuenta[] = ['bankName', 'accountNumber', 'accountHolderName', 'accountHolderId'];
  return obligatorios.filter((c) => !f[c].trim());
}

/**
 * Cuerpo del POST en camelCase, como lo lee la ruta. Antes la pantalla mandaba
 * snake_case (`bank_name`…) y la ruta respondía 400: no se podía crear ninguna.
 */
export function cuerpoNuevaCuenta(f: FormularioCuentaAbono) {
  return {
    bankName: f.bankName.trim(),
    accountType: f.accountType,
    accountNumber: f.accountNumber.trim(),
    accountHolderName: f.accountHolderName.trim(),
    accountHolderIdType: f.accountHolderIdType,
    accountHolderId: f.accountHolderId.trim(),
    brebKeyValue: f.brebKeyValue.trim() || undefined,
    bankAccountId: f.bankAccountId ?? undefined,
  };
}
