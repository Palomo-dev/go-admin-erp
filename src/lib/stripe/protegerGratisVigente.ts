/**
 * Prueba gratis concedida a mano (`subscriptions.metadata.gratis_365_*`): que un webhook de Stripe
 * no la tumbe. PURO: sin base, sin red y sin reloj propio (`ahora` lo pasa quien llama).
 *
 * Por qué: varias tiendas tienen una prueba de 365 días marcada en `metadata` con un `trial_end`
 * local futuro, y algunas tienen además suscripción en Stripe. Cuando la prueba de Stripe vence,
 * el webhook copiaba `status = past_due` y un `trial_end` / `current_period_end` más cortos, y el
 * middleware congelaba la cuenta (pasó en tres tiendas). Aquí se decide qué del evento se aplica.
 *
 * Protegida = la metadata tiene alguna clave que empieza por `gratis_365_` Y el `trial_end` local
 * es futuro. Entonces:
 *  - un estado degradante (`past_due`, `unpaid`, `canceled`, `incomplete`, `incomplete_expired`) o
 *    `action === 'deleted'` NO se aplica: queda el estado local (o `trialing` si el local también
 *    estuviera degradado), y quien llama no cancela ni desactiva módulos;
 *  - un estado no degradante (`active`, `trialing`) sí se aplica;
 *  - `trial_end` y `current_period_end` nunca se acortan: gana la fecha más lejana;
 *  - lo omitido queda en `metadata.webhook_ignorados` (sin borrar la marca) y en un aviso.
 * Sin marca, o con el `trial_end` local vencido: no se toca nada (comportamiento de siempre).
 */

export const PREFIJO_MARCA_GRATIS = 'gratis_365_';

export const ESTADOS_DEGRADANTES: readonly string[] = ['past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired'];

/** Tope de eventos guardados en `webhook_ignorados` (los más recientes): la metadata no crece sin fin. */
export const MAX_EVENTOS_IGNORADOS = 50;

export type AccionWebhook = 'created' | 'updated' | 'deleted';

export interface SuscripcionLocal {
  status: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CambioDeStripe {
  action: AccionWebhook;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
}

export interface EventoIgnorado {
  en: string;
  action: AccionWebhook;
  stripe_status: string;
  stripe_trial_end: string | null;
  stripe_current_period_end: string | null;
}

export type DecisionGratis =
  /** Sin protección: el webhook sigue como siempre. */
  | { protegida: false }
  | {
      protegida: true;
      /** El evento traía algo que no se aplicó (estado degradante, borrado o una fecha más corta). */
      ignorado: boolean;
      /** Borrado o cancelación de Stripe: no cancelar la fila ni desactivar módulos. */
      bloqueaCancelacion: boolean;
      status: string;
      trial_end: string | null;
      current_period_end: string | null;
      /** Metadata a escribir: la local más el evento ignorado (la marca intacta). Igual a la local si no se ignoró nada. */
      metadata: Record<string, unknown>;
      evento: EventoIgnorado | null;
    };

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** Primera clave `gratis_365_*` de la metadata, o null. */
export function marcaGratis(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return Object.keys(metadata).find((k) => k.startsWith(PREFIJO_MARCA_GRATIS)) ?? null;
}

export function estaProtegida(local: SuscripcionLocal | null | undefined, ahora: Date): boolean {
  if (!local || marcaGratis(local.metadata) === null) return false;
  const fin = ms(local.trial_end);
  return fin !== null && fin > ahora.getTime();
}

/** La fecha más lejana de las dos (la que exista si solo hay una). */
function masLejana(localIso: string | null, stripeIso: string | null): string | null {
  const l = ms(localIso);
  const s = ms(stripeIso);
  if (l === null) return stripeIso;
  if (s === null) return localIso;
  return s >= l ? stripeIso : localIso;
}

export function protegerGratisVigente(entrada: { local: SuscripcionLocal | null | undefined; stripe: CambioDeStripe; ahora: Date }): DecisionGratis {
  const { local, stripe, ahora } = entrada;
  if (!local || !estaProtegida(local, ahora)) return { protegida: false };

  const borrado = stripe.action === 'deleted';
  const degradante = borrado || ESTADOS_DEGRADANTES.includes(stripe.status);
  const estadoLocal = local.status && !ESTADOS_DEGRADANTES.includes(local.status) ? local.status : 'trialing';
  const status = degradante ? estadoLocal : stripe.status;

  const trialEnd = masLejana(local.trial_end, stripe.trial_end);
  const periodoFin = masLejana(local.current_period_end, stripe.current_period_end);
  const acortaTrial = trialEnd !== stripe.trial_end;
  const acortaPeriodo = periodoFin !== stripe.current_period_end;
  const ignorado = degradante || acortaTrial || acortaPeriodo;

  const metadataLocal = { ...(local.metadata ?? {}) };
  if (!ignorado) {
    return { protegida: true, ignorado: false, bloqueaCancelacion: false, status, trial_end: trialEnd, current_period_end: periodoFin, metadata: metadataLocal, evento: null };
  }

  const evento: EventoIgnorado = {
    en: ahora.toISOString(),
    action: stripe.action,
    stripe_status: stripe.status,
    stripe_trial_end: stripe.trial_end,
    stripe_current_period_end: stripe.current_period_end,
  };
  const previos = Array.isArray(metadataLocal.webhook_ignorados) ? (metadataLocal.webhook_ignorados as unknown[]) : [];
  const metadata = { ...metadataLocal, webhook_ignorados: [...previos, evento].slice(-MAX_EVENTOS_IGNORADOS) };
  return {
    protegida: true,
    ignorado: true,
    bloqueaCancelacion: degradante && (borrado || stripe.status === 'canceled'),
    status,
    trial_end: trialEnd,
    current_period_end: periodoFin,
    metadata,
    evento,
  };
}

/** Línea para `console.warn` cuando se ignoró algo (sin datos personales: org, ids, estados y fechas). */
export function avisoEventoIgnorado(organizationId: number, subscriptionId: string, d: Extract<DecisionGratis, { protegida: true }>): string {
  const e = d.evento;
  return (
    `⚠️ Prueba gratis vigente: webhook de Stripe ignorado en parte · org ${organizationId} · sub ${subscriptionId} · ` +
    `action=${e?.action} · stripe_status=${e?.stripe_status} (se deja ${d.status}) · ` +
    `stripe_trial_end=${e?.stripe_trial_end ?? 'null'} (se deja ${d.trial_end ?? 'null'}) · ` +
    `stripe_current_period_end=${e?.stripe_current_period_end ?? 'null'} (se deja ${d.current_period_end ?? 'null'})`
  );
}
