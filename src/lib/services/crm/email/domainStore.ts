/**
 * Almacén temporal de datos de dominio sin columna propia (FASE-07 §13):
 *   - extras (region, tracking, receiving, provider_status, api_key_id)
 *     → provider_configs.settings.email_domains[<domain_id>]
 *   - API key `sending_access` por dominio
 *     → provider_configs.credentials.RESEND_API_KEY_<domain_id>
 *   - política de fallback / firma global
 *     → provider_configs.settings.email_fallback_policy
 * Fila (org, category='email', provider='resend'). SOLO service role
 * (`credentials` no es legible por `authenticated`, ver DB-0-r1 §3).
 *
 * Cuando DB añada `email_domains.region/tracking_subdomain/receiving_enabled/
 * api_key_secret_id` (+ vault), este archivo es el único que cambia.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import type { EmailDomainExtras } from './types';

// ─── Cifrado en reposo de las API keys de Resend ─────────────────────────────
//
// Tester r1 #9: los tokens `re_…` por dominio se guardaban en claro en
// `provider_configs.credentials` (jsonb). No hay Vault de Supabase disponible
// para este proyecto ni helper de cifrado en la zona compartida
// (`src/lib/security/**` es de solo lectura para F7), así que se cifran aquí con
// AES-256-GCM. La clave sale de `EMAIL_CREDENTIALS_SECRET` y, si no está, se
// deriva del secreto de bajas o de la service-role key — de modo que el
// contenido de la tabla deja de ser un token utilizable por sí solo.
//
// Alcance real de la mitigación: protege ante una lectura de la tabla (dump,
// backup, un fallo futuro de RLS). NO protege contra alguien que ya tenga el
// entorno del servidor. Cuando DB añada `email_domains.api_key_secret_id` +
// Vault, este bloque es lo único que hay que sustituir (ver §13 del doc).

// Ronda 3 (tester r2, fallo nuevo #4): la ronda 2 cifraba SIEMPRE con el primer
// secreto disponible y no dejaba rastro de cuál era, así que añadir
// `EMAIL_CREDENTIALS_SECRET` después — justo lo que recomienda `.env.example` —
// invalidaba en silencio todo lo guardado. Ahora:
//   · el valor cifrado lleva el identificador de la clave (`kid`) que lo cifró;
//   · al descifrar se prueban TODAS las claves disponibles (la nueva y los
//     fallbacks), así que añadir el secreto ya no rompe nada mientras el
//     fallback siga en el entorno;
//   · lo que se pueda leer con una clave que no es la principal se vuelve a
//     cifrar con la principal en la primera lectura (migración progresiva);
//   · lo que NO se pueda descifrar se reporta explícitamente (`unreadable`) y la
//     UI deja de decir que hay credencial configurada.

const ENC_V1 = 'encv1:';
const ENC_V2 = 'encv2:';

/** Todas las fuentes de clave disponibles, en orden de preferencia y sin repetir. */
function credentialKeySources(): string[] {
  const raws = [
    process.env.EMAIL_CREDENTIALS_SECRET?.trim(),
    process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  ].filter((r): r is string => !!r);
  return Array.from(new Set(raws));
}

function deriveKey(raw: string): Buffer {
  return createHash('sha256').update(`email-credentials:${raw}`).digest();
}

/** Identificador público de la clave (no revela la clave: es un hash del hash). */
function keyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

function credentialKeys(): Array<{ kid: string; key: Buffer }> {
  const keys = credentialKeySources().map((raw) => {
    const key = deriveKey(raw);
    return { kid: keyId(key), key };
  });
  if (keys.length === 0) throw new Error('EMAIL_CREDENTIALS_SECRET no configurado (ni fallback disponible)');
  return keys;
}

/** `encv2:<kid>.<iv_b64>.<tag_b64>.<ciphertext_b64>` (v1 = sin `kid`, se sigue leyendo). */
export function encryptSecret(plain: string): string {
  const { kid, key } = credentialKeys()[0];
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${ENC_V2}${kid}.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

function tryDecrypt(key: Buffer, ivB64: string, tagB64: string, ctB64: string): string | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export type CredentialFormat = 'plaintext' | 'encv1' | 'encv2';

export interface DecryptResult {
  /** Texto en claro, o `null` si no hay ninguna clave que lo descifre. */
  plain: string | null;
  format: CredentialFormat;
  /** true si conviene reescribirlo con la clave principal (migración). */
  needsRewrite: boolean;
}

export function decryptSecretDetailed(stored: string): DecryptResult {
  if (!stored.startsWith(ENC_V1) && !stored.startsWith(ENC_V2)) {
    // Fila antigua en claro: se lee y se marca para re-cifrar.
    return { plain: stored, format: 'plaintext', needsRewrite: true };
  }
  const v2 = stored.startsWith(ENC_V2);
  const parts = stored.slice((v2 ? ENC_V2 : ENC_V1).length).split('.');
  const kid = v2 ? parts.shift() ?? '' : '';
  const [ivB64, tagB64, ctB64] = parts;
  const format: CredentialFormat = v2 ? 'encv2' : 'encv1';
  if (!ivB64 || !tagB64 || !ctB64) return { plain: null, format, needsRewrite: false };

  const keys = credentialKeys();
  // Primero la clave que dice el `kid`; si no está (o es v1), se prueban todas:
  // así, añadir EMAIL_CREDENTIALS_SECRET no invalida lo cifrado con el fallback.
  const ordered = kid ? [...keys.filter((k) => k.kid === kid), ...keys.filter((k) => k.kid !== kid)] : keys;
  for (const k of ordered) {
    const plain = tryDecrypt(k.key, ivB64, tagB64, ctB64);
    if (plain !== null) return { plain, format, needsRewrite: k.kid !== keys[0].kid || format === 'encv1' };
  }
  console.error('[emailDomainStore] API key de Resend ILEGIBLE: ninguna clave de cifrado disponible la descifra.', {
    format,
    kid: kid || '(v1)',
    claves_disponibles: keys.map((k) => k.kid),
    accion: 'regenerar la API key del dominio desde Configuración › CRM › Email, o restaurar el secreto anterior',
  });
  return { plain: null, format, needsRewrite: false };
}

/** Descifra; si el valor no tiene prefijo lo devuelve tal cual (filas antiguas en claro). */
export function decryptSecret(stored: string): string | null {
  return decryptSecretDetailed(stored).plain;
}

export type EmailFallbackPolicy = 'global_with_notice' | 'global_silent' | 'block';

export interface EmailOrgSettings {
  email_fallback_policy: EmailFallbackPolicy;
  email_tracking_transactional: boolean;
  email_domains: Record<string, Partial<EmailDomainExtras>>;
}

interface Row {
  id: string;
  credentials: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
}

let override: SupabaseClient | null = null;
/** Inyección para tests. */
export function __setDomainStoreClient(c: SupabaseClient | null): void {
  override = c;
}
function sb(): SupabaseClient {
  return override ?? getServiceClient();
}

async function readRow(orgId: number): Promise<Row | null> {
  const { data } = await sb()
    .from('provider_configs')
    .select('id, credentials, settings')
    .eq('organization_id', orgId)
    .eq('category', 'email')
    .eq('provider', 'resend')
    .maybeSingle();
  return (data as Row | null) ?? null;
}

async function writeRow(orgId: number, patch: { credentials?: Record<string, unknown>; settings?: Record<string, unknown> }): Promise<void> {
  const row = await readRow(orgId);
  const payload = {
    organization_id: orgId,
    category: 'email',
    provider: 'resend',
    credentials: { ...(row?.credentials ?? {}), ...(patch.credentials ?? {}) },
    settings: { ...(row?.settings ?? {}), ...(patch.settings ?? {}) },
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb().from('provider_configs').upsert(payload, { onConflict: 'organization_id,category,provider' });
  if (error) throw new Error(`provider_configs(email) upsert: ${error.message}`);
}

export async function getEmailOrgSettings(orgId: number): Promise<EmailOrgSettings> {
  const row = await readRow(orgId);
  const s = (row?.settings ?? {}) as Record<string, unknown>;
  const policy = s.email_fallback_policy;
  return {
    email_fallback_policy: policy === 'global_silent' || policy === 'block' ? policy : 'global_with_notice',
    email_tracking_transactional: s.email_tracking_transactional === true,
    email_domains: ((s.email_domains as Record<string, Partial<EmailDomainExtras>>) ?? {}),
  };
}

export async function setEmailOrgSettings(orgId: number, patch: Partial<Pick<EmailOrgSettings, 'email_fallback_policy' | 'email_tracking_transactional'>>): Promise<void> {
  await writeRow(orgId, { settings: { ...patch } });
}

export async function getDomainExtras(orgId: number, domainId: string): Promise<Partial<EmailDomainExtras>> {
  const s = await getEmailOrgSettings(orgId);
  return s.email_domains[domainId] ?? {};
}

export async function setDomainExtras(orgId: number, domainId: string, extras: Partial<EmailDomainExtras>): Promise<void> {
  const s = await getEmailOrgSettings(orgId);
  await writeRow(orgId, { settings: { email_domains: { ...s.email_domains, [domainId]: { ...(s.email_domains[domainId] ?? {}), ...extras } } } });
}

export async function removeDomainExtras(orgId: number, domainId: string): Promise<void> {
  const row = await readRow(orgId);
  if (!row) return;
  const settings = { ...(row.settings ?? {}) } as Record<string, unknown>;
  const domains = { ...((settings.email_domains as Record<string, unknown>) ?? {}) };
  delete domains[domainId];
  settings.email_domains = domains;
  const credentials = { ...(row.credentials ?? {}) };
  delete credentials[keyName(domainId)];
  const { error } = await sb().from('provider_configs').update({ settings, credentials, updated_at: new Date().toISOString() }).eq('id', row.id);
  if (error) throw new Error(`provider_configs(email) update: ${error.message}`);
}

export function keyName(domainId: string): string {
  return `RESEND_API_KEY_${domainId}`;
}

export async function storeDomainApiKey(orgId: number, domainId: string, token: string): Promise<void> {
  await writeRow(orgId, { credentials: { [keyName(domainId)]: encryptSecret(token) } });
}

/**
 * Migración progresiva: lo que se pudo leer con una clave que no es la
 * principal (o estaba en claro / en formato v1) se reescribe con la principal.
 * Best-effort: si la escritura falla, la lectura sigue siendo válida.
 */
async function rewriteWithPrimaryKey(orgId: number, credentialName: string, plain: string): Promise<void> {
  try {
    await writeRow(orgId, { credentials: { [credentialName]: encryptSecret(plain) } });
    console.warn('[emailDomainStore] credencial re-cifrada con la clave principal', { orgId, credential: credentialName });
  } catch (err) {
    console.error('[emailDomainStore] no se pudo re-cifrar la credencial', err instanceof Error ? err.message : err);
  }
}

async function readCredential(orgId: number, credentialName: string): Promise<string | null> {
  const row = await readRow(orgId);
  const v = row?.credentials?.[credentialName];
  if (typeof v !== 'string' || !v) return null;
  const r = decryptSecretDetailed(v);
  if (!r.plain || !r.plain.startsWith('re_')) return null;
  if (r.needsRewrite) await rewriteWithPrimaryKey(orgId, credentialName, r.plain);
  return r.plain;
}

export async function getDomainApiKey(orgId: number, domainId: string): Promise<string | null> {
  return readCredential(orgId, keyName(domainId));
}

export type DomainKeyState = 'ok' | 'unreadable';

/**
 * Estado de la credencial guardada por dominio. `unreadable` = hay un valor
 * cifrado que ninguna clave disponible descifra (se cambió/rotó el secreto sin
 * migrar): la UI debe pedir regenerar la API key en vez de decir que hay una.
 */
export async function listDomainKeyStates(orgId: number): Promise<Map<string, DomainKeyState>> {
  const row = await readRow(orgId);
  const out = new Map<string, DomainKeyState>();
  for (const [k, v] of Object.entries(row?.credentials ?? {})) {
    if (!k.startsWith('RESEND_API_KEY_')) continue;
    const id = k.slice('RESEND_API_KEY_'.length);
    if (typeof v !== 'string' || !v) continue;
    const plain = decryptSecret(v);
    out.set(id, plain && plain.startsWith('re_') ? 'ok' : 'unreadable');
  }
  return out;
}

/** Ids de dominio con credencial LEGIBLE (los ilegibles van en `listDomainKeyStates`). */
export async function listDomainKeyIds(orgId: number): Promise<Set<string>> {
  const states = await listDomainKeyStates(orgId);
  return new Set(Array.from(states.entries()).filter(([, s]) => s === 'ok').map(([id]) => id));
}

/** Key BYOK de la org (RESEND_API_KEY propia en provider_configs), si existe. */
export async function getOrgResendKey(orgId: number): Promise<string | null> {
  return readCredential(orgId, 'RESEND_API_KEY');
}
