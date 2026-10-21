/**
 * Organización › Plan y facturación: estado de la suscripción visible y lo que
 * se ofrece en cada estado (Figma 08, sección 7: «Suscripción vencida» y
 * «Prueba vencida»). Antes una prueba vencida seguía saliendo «En prueba» y una
 * suscripción vencida solo existía como redirección a /app/cuenta-congelada.
 *
 * Funciones puras sobre la respuesta de `GET /api/me/plan`.
 */

/** El SaaS se cobra en dólares (`plans.price_usd_month` / `price_usd_year`), no en pesos. */
export const MONEDA_PLAN_SAAS = 'USD';

/**
 * Precio que se muestra del plan: el de dólares del periodo contratado.
 * `null` si el plan no tiene precio (a medida). Acepta el numérico de Postgres
 * como número o como texto.
 */
export function precioPlanSaas(
  plan: { price_usd_month?: number | string | null; price_usd_year?: number | string | null } | null | undefined,
  periodo: 'mensual' | 'anual',
): number | null {
  if (!plan) return null;
  const crudo = periodo === 'anual' ? plan.price_usd_year : plan.price_usd_month;
  if (crudo == null || crudo === '') return null;
  const n = typeof crudo === 'number' ? crudo : Number(crudo);
  return Number.isFinite(n) ? n : null;
}

export type EstadoPlan =
  | 'activa'
  | 'prueba'
  | 'pruebaVencida'
  | 'vencida'
  | 'cancelada'
  /** Activa (o en prueba) pero marcada para cancelarse al final del periodo. */
  | 'cancelaAlFinal'
  | 'sinPlan';

export interface PlanParaEstado {
  estado: 'prueba' | 'activo' | 'vencido' | 'cancelado' | 'sin_plan';
  pruebaVencida?: boolean;
  cancelaAlFinal?: boolean;
}

/**
 * Lo que ve Plan. `incomplete` también es vencida: si no, el menú esconde
 * cancelar y desactivar responde 409 sin salida.
 */
export function estadoVisibleDeSuscripcion(status: string | null): PlanParaEstado['estado'] {
  switch (status) {
    case 'trialing':
      return 'prueba';
    case 'active':
      return 'activo';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return 'vencido';
    case 'canceled':
      return 'cancelado';
    default:
      return 'sin_plan';
  }
}

export function estadoPlan(plan: PlanParaEstado | null | undefined): EstadoPlan {
  if (!plan) return 'sinPlan';
  switch (plan.estado) {
    case 'prueba':
      if (plan.pruebaVencida) return 'pruebaVencida';
      return plan.cancelaAlFinal ? 'cancelaAlFinal' : 'prueba';
    case 'activo':
      return plan.cancelaAlFinal ? 'cancelaAlFinal' : 'activa';
    case 'vencido':
      return 'vencida';
    case 'cancelado':
      return 'cancelada';
    default:
      return 'sinPlan';
  }
}

/** Tono del badge junto al título. */
export function tonoEstadoPlan(e: EstadoPlan): 'exito' | 'advertencia' | 'peligro' | 'neutro' | 'informacion' {
  switch (e) {
    case 'activa':
      return 'exito';
    case 'prueba':
      return 'informacion';
    case 'pruebaVencida':
    case 'cancelaAlFinal':
      return 'advertencia';
    case 'vencida':
      return 'peligro';
    default:
      return 'neutro';
  }
}

export interface AccionesPlan {
  /** Acción principal de la tarjeta del plan. */
  primaria: 'cambiarPlan' | 'elegirPlan' | 'pagar' | 'renovar';
  /** Se puede cancelar (menú «⋯» → ConfirmDialog). */
  cancelar: boolean;
  /** Se puede reanudar una cancelación programada. */
  reactivar: boolean;
  /** Se puede comprar cupo extra (usuarios, sucursales, créditos). */
  comprar: boolean;
}

export function accionesPlan(e: EstadoPlan, tieneStripe: boolean): AccionesPlan {
  switch (e) {
    case 'activa':
      return { primaria: 'cambiarPlan', cancelar: true, reactivar: false, comprar: true };
    case 'prueba':
      // P1-1: una prueba también se cancela (al terminar la prueba).
      return { primaria: 'elegirPlan', cancelar: true, reactivar: false, comprar: true };
    case 'cancelaAlFinal':
      return { primaria: 'cambiarPlan', cancelar: false, reactivar: tieneStripe, comprar: true };
    case 'pruebaVencida':
      return { primaria: 'elegirPlan', cancelar: false, reactivar: false, comprar: false };
    case 'vencida':
      return { primaria: 'pagar', cancelar: true, reactivar: false, comprar: false };
    case 'cancelada':
      return { primaria: 'renovar', cancelar: false, reactivar: false, comprar: false };
    default:
      return { primaria: 'elegirPlan', cancelar: false, reactivar: false, comprar: false };
  }
}

/** Avance de la prueba para la barra «Días de prueba» (0…1). */
export function avancePrueba(diasRestantes: number | null, diasTotales: number | null): number | null {
  if (diasRestantes == null || !diasTotales) return null;
  const usados = Math.max(0, diasTotales - diasRestantes);
  return Math.min(1, usados / diasTotales);
}

// ─── Compras (usuarios, sucursales, créditos de IA) ─────────────────────────

export type TipoCompra = 'usuarios' | 'sucursales' | 'creditos';

/**
 * Por qué el plan no deja comprar. `null` = sí deja. Mismo criterio para los
 * tres tipos: sin plan de pago vigente no hay a qué añadir el complemento, y
 * con tope ilimitado no tiene sentido comprar más.
 */
export function motivoNoPermite(
  tipo: TipoCompra,
  estado: EstadoPlan,
  maximo: number | null | undefined,
): 'sinPlan' | 'planVencido' | 'ilimitado' | null {
  if (estado === 'sinPlan' || estado === 'cancelada') return 'sinPlan';
  if (estado === 'vencida' || estado === 'pruebaVencida') return 'planVencido';
  if (tipo !== 'creditos' && maximo === null) return 'ilimitado';
  return null;
}

export type FaseCompra = 'elegir' | 'procesando' | 'error' | 'exito' | 'noPermite';

export interface DesgloseCompra {
  cantidad: number;
  /** Precio por unidad en la menor unidad de la moneda (centavos), si se conoce. */
  unitario: number | null;
  total: number | null;
}

export function desgloseCompra(cantidad: number, unitarioCentavos: number | null): DesgloseCompra {
  const c = Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 0;
  return { cantidad: c, unitario: unitarioCentavos, total: unitarioCentavos == null ? null : c * unitarioCentavos };
}

/** Cantidad válida para comprar: entero ≥ mínimo (y ≤ máximo si lo hay). */
export function cantidadValida(cantidad: number, minimo = 1, maximo: number | null = null): boolean {
  return Number.isInteger(cantidad) && cantidad >= minimo && (maximo === null || cantidad <= maximo);
}

/** Resultado del regreso de Stripe en la URL (`?addon=success`, `?ai_credits=canceled`). */
export function resultadoCompraEnUrl(params: URLSearchParams): { tipo: 'complemento' | 'creditos' | 'plan'; ok: boolean } | null {
  const addon = params.get('addon');
  if (addon === 'success' || addon === 'canceled') return { tipo: 'complemento', ok: addon === 'success' };
  const ia = params.get('ai_credits');
  if (ia === 'success' || ia === 'canceled') return { tipo: 'creditos', ok: ia === 'success' };
  const checkout = params.get('checkout');
  if (checkout === 'success' || checkout === 'canceled') return { tipo: 'plan', ok: checkout === 'success' };
  return null;
}
