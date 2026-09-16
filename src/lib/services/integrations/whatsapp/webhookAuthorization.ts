/**
 * Autorización POR CAMBIO del webhook de WhatsApp Cloud (F0-SEC r2, cierra el
 * alto 4 del qa-reviewer r1 / fallo 3 del tester r1; F0-SEC r3 cierra H1 y H2
 * del tester r2).
 *
 * El problema: la firma `X-Hub-Signature-256` cubre el cuerpo ENTERO y Meta la
 * calcula con el app_secret de UNA app. La ruta verificaba con el secreto del
 * primer `phone_number_id` que el propio payload (sin verificar) declaraba y,
 * si cuadraba, procesaba todas las `entry[*]`. Una organización A con
 * app_secret propio podía firmar un payload con `entry[1]` de la organización B
 * e insertar mensajes en las conversaciones de B.
 *
 * Decisión (documentada aquí porque es la que pide la regla dura 5 aplicada a
 * webhooks): **una firma autoriza exactamente un secreto, y todos los cambios
 * del payload tienen que pertenecer a ese secreto; si no, se rechaza TODO con
 * 403 `mixed_channels`.** No se verifica «por cambio» porque hay una sola
 * firma; lo que se hace por cambio es resolver a qué secreto pertenece cada
 * uno y exigir que coincidan. Un payload legítimo de Meta nunca mezcla apps:
 * cada app tiene su propio webhook y su propio secreto.
 *
 * Por qué POR CAMBIO y no por entrada (tester r2, H1/H2): `processWebhookPayload`
 * procesa `entry[*].changes[*]` uno a uno. Si la unidad de autorización es la
 * entrada, basta con que UNA `change` resuelva a A para que la entrada entera
 * —incluidos los cambios que no resolvieron a nada— llegue al procesamiento.
 * Ahí, `findChannelByPhoneNumberId(123)` (número) construye el mismo filtro
 * PostgREST que `'123'` y encuentra el canal de B; y una
 * `message_template_status_update` con el `meta_template_id` de B se aplicaba
 * en todas las organizaciones. Ahora la unidad es la `change`: cada una se
 * resuelve, se normaliza y se conserva o se descarta por sí misma.
 *
 * Normalización de identificadores (H1): todo `phone_number_id` y todo
 * `entry.id` pasa por `normalizeMetaId`: string no vacío → recortado; entero
 * seguro no negativo → su representación decimal (exactamente lo que PostgREST
 * interpolaría en `eq.<valor>`); cualquier otro tipo → inválido. El
 * procesamiento usa la MISMA función, así que plan y procesamiento nunca
 * discrepan sobre qué canal es. Las entradas que devuelve el plan ya llevan los
 * identificadores normalizados a string.
 *
 * Ámbitos de secreto:
 *  - `channel`: `channel_credentials.credentials.app_secret` del canal (la
 *    organización trajo su propia app de Meta). Cada canal resuelve a su secreto.
 *  - `global`: `META_APP_SECRET` (app de la plataforma, Embedded Signup). Los
 *    canales sin app_secret propio (o con uno de relleno) resuelven aquí.
 *
 * Reglas:
 *  1. Cada `change` se resuelve a un conjunto de ámbitos: por su
 *     `value.metadata.phone_number_id` si lo trae y, si no lo trae (estado y
 *     calidad de plantillas), por el WABA `entry.id` →
 *     `credentials.business_account_id`. Un `phone_number_id` presente pero de
 *     tipo inválido no resuelve a nada (y no se consulta).
 *  2. La unión de ámbitos de todos los cambios tiene que tener tamaño <= 1.
 *     Dos secretos distintos, o un secreto de canal más el global → 403.
 *  3. Con ámbito `channel`, los cambios que no resuelven a ningún canal se
 *     DESCARTAN antes de procesar (con aviso), uno a uno: la organización
 *     dueña del secreto no puede colar cambios de números o WABAs que no son
 *     suyos ni siquiera dentro de una entrada que también trae los suyos. Una
 *     entrada que se queda sin cambios se descarta entera.
 *  4. Con ámbito `global` (o sin ningún cambio resoluble), se verifica con
 *     `META_APP_SECRET` y se procesan todas las entradas: las firmó la app de
 *     la plataforma, y el procesamiento ya ignora los números desconocidos y
 *     los WABAs sin canal (`applyTemplateStatusUpdate` exige organización).
 *  5. Más de `MAX_LOOKUPS` identificadores distintos en un solo payload → 403
 *     `too_many_channels` (Meta agrupa de pocos en pocos; miles de ids es abuso
 *     contra la base, no un webhook).
 *
 * Módulo puro: la resolución contra la base se inyecta (`WebhookChannelResolver`)
 * para poder probar los casos multi-organización sin Supabase.
 */

import { isRealSecret } from '@/lib/security/secrets';
import type { WhatsAppWebhookChange, WhatsAppWebhookEntry, WhatsAppWebhookPayload } from './whatsappCloudTypes';

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

export type DroppedChangeReason =
  | 'malformed_change'
  | 'invalid_phone_number_id'
  | 'unknown_phone_number'
  | 'missing_waba'
  | 'unknown_waba';

export interface DroppedChange {
  entryIndex: number;
  changeIndex: number;
  reason: DroppedChangeReason;
}

export type WebhookAuthPlan =
  | { kind: 'reject'; status: 403; code: 'mixed_channels' | 'signature_secret_missing' | 'too_many_channels'; detail: string }
  | {
      kind: 'verify';
      scope: 'channel' | 'global';
      secret: string;
      /**
       * Entradas que se procesan si la firma valida (ya filtradas por la regla 3
       * y con `id` y `phone_number_id` normalizados a string).
       */
      entries: WhatsAppWebhookEntry[];
      /** Entradas descartadas enteras por la regla 3 (índices en el payload original). */
      droppedEntryIndexes: number[];
      /** Cambios descartados uno a uno por la regla 3 (índices en el payload original). */
      droppedChanges: DroppedChange[];
      /** Organizaciones a las que pertenecen los cambios conservados (para el registro). */
      organizationIds: number[];
    };

export const MAX_LOOKUPS = 25;

/**
 * Identificador de Meta (`phone_number_id`, `entry.id` = WABA) normalizado a
 * string, o `null` si no es utilizable. Es la ÚNICA conversión válida en el
 * webhook: la usan el plan y el procesamiento, para que un `123` numérico se
 * trate exactamente igual que `'123'` en los dos sitios (H1).
 */
export function normalizeMetaId(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return String(raw);
  return null;
}

/** Clave de ámbito: un secreto de canal distinto por cada app propia; 'global' para la plataforma. */
function scopeOf(channel: ResolvedChannel): string {
  return isRealSecret(channel.appSecret) ? `channel:${channel.appSecret}` : 'global';
}

type ChangeShape = {
  present: false;
  reason: 'malformed_change';
} | {
  present: true;
  /** `phone_number_id` normalizado; `null` si no viene (cambio de WABA) o `'invalid'` si viene con tipo inválido. */
  phoneNumberId: string | null;
  phoneInvalid: boolean;
};

function describeChange(change: unknown): ChangeShape {
  if (!change || typeof change !== 'object') return { present: false, reason: 'malformed_change' };
  const value = (change as { value?: unknown }).value;
  const metadata = value && typeof value === 'object' ? (value as { metadata?: unknown }).metadata : undefined;
  const raw = metadata && typeof metadata === 'object' ? (metadata as { phone_number_id?: unknown }).phone_number_id : undefined;
  if (raw === undefined || raw === null) return { present: true, phoneNumberId: null, phoneInvalid: false };
  const id = normalizeMetaId(raw);
  return { present: true, phoneNumberId: id, phoneInvalid: id === null };
}

/** Copia del cambio con `phone_number_id` ya normalizado (string). El original no se toca. */
function normalizeChange(change: WhatsAppWebhookChange, phoneNumberId: string | null): WhatsAppWebhookChange {
  if (phoneNumberId === null) return change;
  const value = change.value ?? ({} as WhatsAppWebhookChange['value']);
  return { ...change, value: { ...value, metadata: { ...(value.metadata ?? {}), phone_number_id: phoneNumberId } } as WhatsAppWebhookChange['value'] };
}

interface ChangeResolution {
  entryIndex: number;
  changeIndex: number;
  change: WhatsAppWebhookChange;
  scopes: Set<string>;
  organizationIds: Set<number>;
  reason: DroppedChangeReason | null;
}

function changesOf(entry: unknown): unknown[] {
  const changes = (entry as { changes?: unknown })?.changes;
  return Array.isArray(changes) ? changes : [];
}

export async function planWebhookAuthorization(
  payload: WhatsAppWebhookPayload,
  resolver: WebhookChannelResolver,
  globalSecret: string | null
): Promise<WebhookAuthPlan> {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  // Presupuesto de consultas: ids distintos (ya normalizados) en todo el payload.
  const distinctPhoneIds = new Set<string>();
  const distinctWabaIds = new Set<string>();
  for (const entry of entries) {
    const wabaId = normalizeMetaId((entry as { id?: unknown })?.id);
    for (const change of changesOf(entry)) {
      const shape = describeChange(change);
      if (!shape.present) continue;
      if (shape.phoneNumberId !== null) distinctPhoneIds.add(shape.phoneNumberId);
      else if (!shape.phoneInvalid && wabaId) distinctWabaIds.add(wabaId);
    }
  }
  if (distinctPhoneIds.size + distinctWabaIds.size > MAX_LOOKUPS) {
    return { kind: 'reject', status: 403, code: 'too_many_channels', detail: `${distinctPhoneIds.size + distinctWabaIds.size} identificadores distintos (máximo ${MAX_LOOKUPS})` };
  }

  // Resolver una vez por id (memoizado) y anotar cada CAMBIO.
  const phoneCache = new Map<string, ResolvedChannel | null>();
  const wabaCache = new Map<string, ResolvedChannel[]>();
  const resolutions: ChangeResolution[] = [];
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex];
    const wabaId = normalizeMetaId((entry as { id?: unknown })?.id);
    const changes = changesOf(entry);
    for (let changeIndex = 0; changeIndex < changes.length; changeIndex++) {
      const change = changes[changeIndex];
      const scopes = new Set<string>();
      const organizationIds = new Set<number>();
      let reason: DroppedChangeReason | null = null;
      const shape = describeChange(change);

      if (!shape.present) {
        reason = shape.reason;
      } else if (shape.phoneInvalid) {
        // Presente pero de tipo inutilizable: no se consulta (H1) y no resuelve a nada.
        reason = 'invalid_phone_number_id';
      } else if (shape.phoneNumberId !== null) {
        const id = shape.phoneNumberId;
        if (!phoneCache.has(id)) phoneCache.set(id, await resolver.byPhoneNumberId(id));
        const ch = phoneCache.get(id);
        if (ch) {
          scopes.add(scopeOf(ch));
          organizationIds.add(ch.organizationId);
        } else reason = 'unknown_phone_number';
      } else if (!wabaId) {
        reason = 'missing_waba';
      } else {
        if (!wabaCache.has(wabaId)) wabaCache.set(wabaId, await resolver.byBusinessAccountId(wabaId));
        const channels = wabaCache.get(wabaId) ?? [];
        for (const ch of channels) {
          scopes.add(scopeOf(ch));
          organizationIds.add(ch.organizationId);
        }
        if (channels.length === 0) reason = 'unknown_waba';
      }

      resolutions.push({
        entryIndex,
        changeIndex,
        change: shape.present ? normalizeChange(change as WhatsAppWebhookChange, shape.phoneNumberId) : (change as WhatsAppWebhookChange),
        scopes,
        organizationIds,
        reason,
      });
    }
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
      detail: `cambios de ${union.size} secretos distintos (organizaciones ${orgs.join(', ') || 'desconocidas'}); Meta nunca mezcla apps en un payload`,
    };
  }

  /** Entradas reconstruidas con los cambios indicados (id normalizado). */
  const rebuild = (keep: (r: ChangeResolution) => boolean): { entries: WhatsAppWebhookEntry[]; droppedEntryIndexes: number[] } => {
    const out: WhatsAppWebhookEntry[] = [];
    const droppedEntryIndexes: number[] = [];
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
      const entry = entries[entryIndex];
      const kept = resolutions.filter((r) => r.entryIndex === entryIndex && keep(r)).map((r) => r.change);
      if (kept.length === 0) {
        droppedEntryIndexes.push(entryIndex);
        continue;
      }
      out.push({ ...(entry as object), id: normalizeMetaId((entry as { id?: unknown })?.id) ?? '', changes: kept } as WhatsAppWebhookEntry);
    }
    return { entries: out, droppedEntryIndexes };
  };

  const only = union.size === 1 ? Array.from(union)[0] : 'global';
  if (only === 'global') {
    if (!isRealSecret(globalSecret)) {
      return { kind: 'reject', status: 403, code: 'signature_secret_missing', detail: 'sin app_secret de canal ni META_APP_SECRET real' };
    }
    // Regla 4: bajo la plataforma se conserva todo lo que sea un cambio con forma
    // de cambio (el procesamiento ignora lo que no resuelve). Las entradas
    // vacías o malformadas no aportan nada y no se cuentan como descartes.
    const rebuilt = rebuild((r) => r.reason !== 'malformed_change');
    return {
      kind: 'verify',
      scope: 'global',
      secret: globalSecret,
      entries: rebuilt.entries,
      droppedEntryIndexes: [],
      droppedChanges: [],
      organizationIds: Array.from(new Set(resolutions.flatMap((r) => Array.from(r.organizationIds)))),
    };
  }

  // Regla 3: con secreto de canal, solo pasan los CAMBIOS que resolvieron a ESE secreto.
  const secret = only.slice('channel:'.length);
  const kept = resolutions.filter((r) => r.scopes.size > 0);
  const droppedChanges: DroppedChange[] = resolutions
    .filter((r) => r.scopes.size === 0)
    .map((r) => ({ entryIndex: r.entryIndex, changeIndex: r.changeIndex, reason: r.reason ?? 'unknown_phone_number' }));
  const rebuilt = rebuild((r) => r.scopes.size > 0);
  return {
    kind: 'verify',
    scope: 'channel',
    secret,
    entries: rebuilt.entries,
    droppedEntryIndexes: rebuilt.droppedEntryIndexes,
    droppedChanges,
    organizationIds: Array.from(new Set(kept.flatMap((r) => Array.from(r.organizationIds)))),
  };
}
