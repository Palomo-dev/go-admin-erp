/**
 * Autorización POR ENTRADA del webhook de WhatsApp Cloud (F0-SEC r2, cierra el
 * alto 4 del qa-reviewer r1 / fallo 3 del tester r1).
 *
 * El problema: la firma `X-Hub-Signature-256` cubre el cuerpo ENTERO y Meta la
 * calcula con el app_secret de UNA app. La ruta verificaba con el secreto del
 * primer `phone_number_id` que el propio payload (sin verificar) declaraba y,
 * si cuadraba, procesaba todas las `entry[*]`. Una organización A con
 * app_secret propio podía firmar un payload con `entry[1]` de la organización B
 * e insertar mensajes en las conversaciones de B.
 *
 * Decisión (documentada aquí porque es la que pide la regla dura 5 aplicada a
 * webhooks): **una firma autoriza exactamente un secreto, y todas las entradas
 * del payload tienen que pertenecer a ese secreto; si no, se rechaza TODO con
 * 403 `mixed_channels`.** No se verifica «por entrada» porque hay una sola
 * firma; lo que se hace por entrada es resolver a qué secreto pertenece cada
 * una y exigir que coincidan. Un payload legítimo de Meta nunca mezcla apps:
 * cada app tiene su propio webhook y su propio secreto.
 *
 * Ámbitos de secreto:
 *  - `channel`: `channel_credentials.credentials.app_secret` del canal (la
 *    organización trajo su propia app de Meta). Cada canal resuelve a su secreto.
 *  - `global`: `META_APP_SECRET` (app de la plataforma, Embedded Signup). Los
 *    canales sin app_secret propio (o con uno de relleno) resuelven aquí.
 *
 * Reglas:
 *  1. Cada entrada se resuelve a un conjunto de ámbitos: por `phone_number_id`
 *     de sus `changes[*].value.metadata` y, para los cambios sin
 *     `phone_number_id` (estado/calidad de plantillas), por el WABA `entry.id`
 *     → `credentials.business_account_id`.
 *  2. La unión de ámbitos de todas las entradas tiene que tener tamaño <= 1.
 *     Dos secretos distintos, o un secreto de canal más el global → 403.
 *  3. Con ámbito `channel`, las entradas que no resuelven a ningún canal se
 *     DESCARTAN antes de procesar (con aviso): la organización dueña del
 *     secreto no puede colar entradas de números o WABAs que no son suyos
 *     (`applyTemplateStatusUpdate` busca por `meta_template_id` en todas las
 *     organizaciones, así que un WABA desconocido con la firma de A tocaría
 *     plantillas de B).
 *  4. Con ámbito `global` (o sin ninguna entrada resoluble), se verifica con
 *     `META_APP_SECRET` y se procesan todas las entradas: las firmó la app de
 *     la plataforma, y el procesamiento ya ignora los números desconocidos.
 *  5. Más de `MAX_LOOKUPS` identificadores distintos en un solo payload → 403
 *     `too_many_channels` (Meta agrupa de pocos en pocos; miles de ids es abuso
 *     contra la base, no un webhook).
 *
 * Módulo puro: la resolución contra la base se inyecta (`WebhookChannelResolver`)
 * para poder probar los casos multi-organización sin Supabase.
 */

import { isRealSecret } from '@/lib/security/secrets';
import type { WhatsAppWebhookEntry, WhatsAppWebhookPayload } from './whatsappCloudTypes';

export interface ResolvedChannel {
  channelId: string;
  organizationId: number;
  /** app_secret del canal, o null si no tiene uno propio. */
  appSecret: string | null;
}

export interface WebhookChannelResolver {
  byPhoneNumberId(phoneNumberId: string): Promise<ResolvedChannel | null>;
  byBusinessAccountId(wabaId: string): Promise<ResolvedChannel[]>;
}

export type WebhookAuthPlan =
  | { kind: 'reject'; status: 403; code: 'mixed_channels' | 'signature_secret_missing' | 'too_many_channels'; detail: string }
  | {
      kind: 'verify';
      scope: 'channel' | 'global';
      secret: string;
      /** Entradas que se procesan si la firma valida (ya filtradas por la regla 3). */
      entries: WhatsAppWebhookEntry[];
      /** Entradas descartadas por la regla 3 (índices en el payload original). */
      droppedEntryIndexes: number[];
      /** Organizaciones a las que pertenecen las entradas resueltas (para el registro). */
      organizationIds: number[];
    };

export const MAX_LOOKUPS = 25;

/** Clave de ámbito: un secreto de canal distinto por cada app propia; 'global' para la plataforma. */
function scopeOf(channel: ResolvedChannel): string {
  return isRealSecret(channel.appSecret) ? `channel:${channel.appSecret}` : 'global';
}

interface EntryResolution {
  index: number;
  entry: WhatsAppWebhookEntry;
  scopes: Set<string>;
  organizationIds: Set<number>;
}

/** Ids de número y si hay cambios que dependen del WABA (sin phone_number_id). */
function describeEntry(entry: WhatsAppWebhookEntry): { phoneNumberIds: string[]; needsWaba: boolean } {
  const ids = new Set<string>();
  let needsWaba = false;
  for (const change of entry?.changes ?? []) {
    const id = (change as { value?: { metadata?: { phone_number_id?: unknown } } })?.value?.metadata?.phone_number_id;
    if (typeof id === 'string' && id.trim() !== '') ids.add(id.trim());
    else needsWaba = true;
  }
  return { phoneNumberIds: Array.from(ids), needsWaba };
}

export async function planWebhookAuthorization(
  payload: WhatsAppWebhookPayload,
  resolver: WebhookChannelResolver,
  globalSecret: string | null
): Promise<WebhookAuthPlan> {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  // Presupuesto de consultas: ids distintos en todo el payload.
  const distinctPhoneIds = new Set<string>();
  const distinctWabaIds = new Set<string>();
  for (const entry of entries) {
    const { phoneNumberIds, needsWaba } = describeEntry(entry);
    phoneNumberIds.forEach((id) => distinctPhoneIds.add(id));
    if (needsWaba && typeof entry?.id === 'string' && entry.id.trim() !== '') distinctWabaIds.add(entry.id.trim());
  }
  if (distinctPhoneIds.size + distinctWabaIds.size > MAX_LOOKUPS) {
    return { kind: 'reject', status: 403, code: 'too_many_channels', detail: `${distinctPhoneIds.size + distinctWabaIds.size} identificadores distintos (máximo ${MAX_LOOKUPS})` };
  }

  // Resolver una vez por id (memoizado) y anotar cada entrada.
  const phoneCache = new Map<string, ResolvedChannel | null>();
  const wabaCache = new Map<string, ResolvedChannel[]>();
  const resolutions: EntryResolution[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const { phoneNumberIds, needsWaba } = describeEntry(entry);
    const scopes = new Set<string>();
    const organizationIds = new Set<number>();

    for (const id of phoneNumberIds) {
      if (!phoneCache.has(id)) phoneCache.set(id, await resolver.byPhoneNumberId(id));
      const ch = phoneCache.get(id);
      if (ch) {
        scopes.add(scopeOf(ch));
        organizationIds.add(ch.organizationId);
      }
    }
    const wabaId = needsWaba && typeof entry?.id === 'string' ? entry.id.trim() : '';
    if (wabaId) {
      if (!wabaCache.has(wabaId)) wabaCache.set(wabaId, await resolver.byBusinessAccountId(wabaId));
      for (const ch of wabaCache.get(wabaId) ?? []) {
        scopes.add(scopeOf(ch));
        organizationIds.add(ch.organizationId);
      }
    }
    resolutions.push({ index, entry, scopes, organizationIds });
  }

  // Regla 2: un solo ámbito en todo el payload.
  const union = new Set<string>();
  resolutions.forEach((r) => r.scopes.forEach((s) => union.add(s)));
  if (union.size > 1) {
    const orgs = Array.from(new Set(resolutions.flatMap((r) => Array.from(r.organizationIds)))).sort((a, b) => a - b);
    return {
      kind: 'reject',
      status: 403,
      code: 'mixed_channels',
      detail: `entradas de ${union.size} secretos distintos (organizaciones ${orgs.join(', ') || 'desconocidas'}); Meta nunca mezcla apps en un payload`,
    };
  }

  const only = union.size === 1 ? Array.from(union)[0] : 'global';
  if (only === 'global') {
    if (!isRealSecret(globalSecret)) {
      return { kind: 'reject', status: 403, code: 'signature_secret_missing', detail: 'sin app_secret de canal ni META_APP_SECRET real' };
    }
    return {
      kind: 'verify',
      scope: 'global',
      secret: globalSecret,
      entries,
      droppedEntryIndexes: [],
      organizationIds: Array.from(new Set(resolutions.flatMap((r) => Array.from(r.organizationIds)))),
    };
  }

  // Regla 3: con secreto de canal, solo pasan las entradas que resolvieron a ESE secreto.
  const secret = only.slice('channel:'.length);
  const kept = resolutions.filter((r) => r.scopes.size > 0);
  const dropped = resolutions.filter((r) => r.scopes.size === 0).map((r) => r.index);
  return {
    kind: 'verify',
    scope: 'channel',
    secret,
    entries: kept.map((r) => r.entry),
    droppedEntryIndexes: dropped,
    organizationIds: Array.from(new Set(kept.flatMap((r) => Array.from(r.organizationIds)))),
  };
}
