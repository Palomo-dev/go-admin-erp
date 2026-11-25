/**
 * Tarifa de un procesador de pago y la ESTIMACIÓN de comisión, IVA de la comisión, retenciones y
 * neto de cada cobro (Figma «05 POS y ventas» 3300-421113, pestaña «Cobros»; aprobado el
 * 2026-11-25). Puro: lo prueba `__tests__/tarifaProcesador.test.ts`.
 *
 * La tarifa la configura cada organización (`payment_processor_settings.fee_schedule`, migración
 * 20261126030000): aquí NO hay tarifas cableadas para nadie. `PLANES_BOLD` son solo los valores
 * que el diálogo ofrece para empezar (tabla oficial bold.co/tarifas, pagos EN LÍNEA, antes de IVA y
 * retenciones); la organización los guarda o los cambia.
 *
 * Todo es «Estimado» hasta registrar el abono real (decisión 5): el abono trae comisión, IVA y
 * retenciones verdaderos y es lo único que va a contabilidad.
 *
 * Bases (las de las pasarelas en Colombia):
 * - Comisión = % del tramo × bruto + valor fijo por transacción (+ % internacional si aplica).
 * - IVA de la comisión = % IVA × comisión.
 * - ReteFuente, ReteICA y ReteIVA = el % que la organización ve en la app del procesador, sobre el
 *   bruto (es el valor efectivo que el procesador descuenta). Sin configurar quedan en 0 y la
 *   pantalla avisa «Configura tus retenciones».
 */
import type { Submetodo } from '@/lib/pos/pedidosWeb/pagosDelPedido';

export type PlanTarifa = 'abonoInmediato' | 'diaSiguiente' | 'personalizado';
export const PLANES_TARIFA: readonly PlanTarifa[] = ['abonoInmediato', 'diaSiguiente', 'personalizado'];

export interface TramoTarifa {
  /** Porcentaje sobre el bruto (3,59 = 3,59 %). */
  porcentaje: number;
  /** Valor fijo por transacción, en la moneda de la organización. */
  fijo: number;
}

export interface TarifaProcesador {
  version: 1;
  plan: PlanTarifa;
  /** Lo que aplica a todo medio que no tenga su propio tramo. */
  base: TramoTarifa;
  /** Tarjetas Visa y Mastercard (y tarjeta sin marca conocida). */
  tarjeta: TramoTarifa | null;
  /** Otras tarjetas (American Express, Diners…). */
  tarjetaOtras: TramoTarifa | null;
  /** PSE, Botón Bancolombia y billeteras (Nequi, Daviplata). */
  pseBilleteras: TramoTarifa | null;
  /** PSE sin retenciones (plan «día siguiente» de Bold). */
  pseSinRetenciones: boolean;
  /** Porcentaje adicional para tarjeta internacional. */
  internacionalPct: number;
  /** IVA sobre la comisión (19 % en Colombia). */
  ivaComisionPct: number;
  reteFuentePct: number;
  reteIcaPct: number;
  reteIvaPct: number;
  /** La organización ya revisó sus retenciones (si no, se muestra el aviso). */
  retencionesConfiguradas: boolean;
}

const tramo = (porcentaje: number, fijo: number): TramoTarifa => ({ porcentaje, fijo });

const SIN_RETENCIONES = { reteFuentePct: 0, reteIcaPct: 0, reteIvaPct: 0, retencionesConfiguradas: false } as const;

/**
 * Planes de Bold para pagos en línea (bold.co/tarifas, consultado el 2026-11-25), antes de IVA y
 * retenciones. Punto de partida del diálogo: no se aplican solos a ninguna organización.
 */
export const PLANES_BOLD: Record<Exclude<PlanTarifa, 'personalizado'>, TarifaProcesador> = {
  // «Abono inmediato u otro banco»: 3,59 % + $ 900 en todas las tarjetas y PSE/billeteras.
  abonoInmediato: {
    version: 1,
    plan: 'abonoInmediato',
    base: tramo(3.59, 900),
    tarjeta: null,
    tarjetaOtras: null,
    pseBilleteras: null,
    pseSinRetenciones: false,
    internacionalPct: 1,
    ivaComisionPct: 19,
    ...SIN_RETENCIONES,
  },
  // «Día siguiente a Cuenta Bold»: Visa/MC 2,99 %, otras tarjetas 3,29 %, PSE y billeteras 2,89 %,
  // todas + $ 900; PSE sin retenciones.
  diaSiguiente: {
    version: 1,
    plan: 'diaSiguiente',
    base: tramo(2.99, 900),
    tarjeta: tramo(2.99, 900),
    tarjetaOtras: tramo(3.29, 900),
    pseBilleteras: tramo(2.89, 900),
    pseSinRetenciones: true,
    internacionalPct: 1,
    ivaComisionPct: 19,
    ...SIN_RETENCIONES,
  },
};

const num = (v: unknown, defecto: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : defecto;
};

function leerTramo(v: unknown): TramoTarifa | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const porcentaje = num(o.porcentaje, NaN);
  const fijo = num(o.fijo, NaN);
  return Number.isFinite(porcentaje) && Number.isFinite(fijo) ? tramo(porcentaje, fijo) : null;
}

/** Tarifa guardada (`fee_schedule`) → tarifa válida, o `null` si no hay o está incompleta. */
export function leerTarifa(v: unknown): TarifaProcesador | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const base = leerTramo(o.base);
  if (!base) return null;
  const plan = PLANES_TARIFA.includes(o.plan as PlanTarifa) ? (o.plan as PlanTarifa) : 'personalizado';
  return {
    version: 1,
    plan,
    base,
    tarjeta: leerTramo(o.tarjeta),
    tarjetaOtras: leerTramo(o.tarjetaOtras),
    pseBilleteras: leerTramo(o.pseBilleteras),
    pseSinRetenciones: o.pseSinRetenciones === true,
    internacionalPct: num(o.internacionalPct, 0),
    ivaComisionPct: num(o.ivaComisionPct, 0),
    reteFuentePct: num(o.reteFuentePct, 0),
    reteIcaPct: num(o.reteIcaPct, 0),
    reteIvaPct: num(o.reteIvaPct, 0),
    retencionesConfiguradas: o.retencionesConfiguradas === true,
  };
}

export type ErrorTarifa = 'porcentaje' | 'fijo';

/** Errores de la tarifa antes de guardarla (la base vuelve a validar). */
export function erroresTarifa(t: TarifaProcesador): ErrorTarifa[] {
  const errores = new Set<ErrorTarifa>();
  const pct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
  for (const x of [t.base, t.tarjeta, t.tarjetaOtras, t.pseBilleteras]) {
    if (!x) continue;
    if (!pct(x.porcentaje)) errores.add('porcentaje');
    if (!Number.isFinite(x.fijo) || x.fijo < 0) errores.add('fijo');
  }
  for (const n of [t.internacionalPct, t.ivaComisionPct, t.reteFuentePct, t.reteIcaPct, t.reteIvaPct]) if (!pct(n)) errores.add('porcentaje');
  return [...errores];
}

const BILLETERAS: ReadonlySet<Submetodo> = new Set(['pse', 'nequi', 'daviplata', 'botonBancolombia', 'transfer', 'corresponsalBancolombia']);
const VISA_MC = /^(visa|mastercard)$/i;

export interface OpcionesCobro {
  submetodo?: Submetodo | null;
  /** «Visa», «Mastercard», «American Express»… (si se conoce). */
  marcaTarjeta?: string | null;
  internacional?: boolean;
}

/** Tramo que aplica a un cobro según su medio dentro de la pasarela. */
export function tramoDelCobro(t: TarifaProcesador, o: OpcionesCobro = {}): TramoTarifa {
  if (o.submetodo === 'card') {
    if (o.marcaTarjeta && !VISA_MC.test(o.marcaTarjeta) && t.tarjetaOtras) return t.tarjetaOtras;
    return t.tarjeta ?? t.base;
  }
  if (o.submetodo && BILLETERAS.has(o.submetodo)) return t.pseBilleteras ?? t.base;
  return t.base;
}

export interface Estimacion {
  bruto: number;
  comision: number;
  ivaComision: number;
  reteFuente: number;
  reteIca: number;
  reteIva: number;
  retenciones: number;
  neto: number;
  /** Siempre: es estimado hasta el abono real. */
  estimado: true;
  /** Sin tarifa configurada no hay estimación de descuentos (todo en 0). */
  sinTarifa: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function estimarCobro(bruto: number, t: TarifaProcesador | null, o: OpcionesCobro = {}): Estimacion {
  const b = r2(Math.max(0, Number(bruto) || 0));
  if (!t || b === 0) {
    return { bruto: b, comision: 0, ivaComision: 0, reteFuente: 0, reteIca: 0, reteIva: 0, retenciones: 0, neto: b, estimado: true, sinTarifa: !t };
  }
  const x = tramoDelCobro(t, o);
  const pct = x.porcentaje + (o.internacional ? t.internacionalPct : 0);
  const comision = r2((b * pct) / 100 + x.fijo);
  const ivaComision = r2((comision * t.ivaComisionPct) / 100);
  const exenta = t.pseSinRetenciones && o.submetodo === 'pse';
  const reteFuente = exenta ? 0 : r2((b * t.reteFuentePct) / 100);
  const reteIca = exenta ? 0 : r2((b * t.reteIcaPct) / 100);
  const reteIva = exenta ? 0 : r2((b * t.reteIvaPct) / 100);
  const retenciones = r2(reteFuente + reteIca + reteIva);
  return { bruto: b, comision, ivaComision, reteFuente, reteIca, reteIva, retenciones, neto: r2(b - comision - ivaComision - retenciones), estimado: true, sinTarifa: false };
}

/** Suma de varias estimaciones (fila «Total» y StatCards). */
export function sumarEstimaciones(es: readonly Estimacion[]): Omit<Estimacion, 'estimado' | 'sinTarifa'> {
  const t = { bruto: 0, comision: 0, ivaComision: 0, reteFuente: 0, reteIca: 0, reteIva: 0, retenciones: 0, neto: 0 };
  for (const e of es) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = r2(t[k] + e[k]);
  return t;
}
