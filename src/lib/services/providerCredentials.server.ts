/**
 * Lectura/escritura de credenciales de proveedores — SOLO SERVIDOR.
 *
 * Único lector de `provider_configs.credentials` (con service role). Nunca
 * importar desde componentes cliente. Si DB (F0 M6) mueve los secretos a
 * Vault (`fn_get_provider_secret` / `fn_set_provider_secret`), este es el
 * único archivo que cambia: `readCredentials` / `writeCredentials`.
 *
 * Orden de resolución (F0 §2.4): fila propia de la org (credenciales reales,
 * sin placeholders) → fallback env global → 'none'. La clave propia gana
 * siempre, aunque otro proveedor de la misma categoría tenga menor `priority`
 * (QA r1 medio 8): primera pasada buscando `source: 'org'`, segunda con el
 * fallback env por prioridad.
 */

import { getServiceClient, assertServerOnly } from '@/lib/supabase/server-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type ProviderCategory,
  SUPPORTED_PROVIDERS,
  CREDENTIAL_FIELDS,
  SETTING_FIELDS,
  hasRequiredCredentials,
  isPlaceholderCredential,
} from '@/lib/crm/providerCatalog';
import {
  type ProviderConfig,
  type ProviderConfigSafe,
  resolveEnvFallback,
  sanitizeCredentials,
  defaultSettings,
  hasPlatformCredentials,
  DEFAULT_PROVIDER,
} from './providerRegistry';

interface ProviderRow {
  id: string;
  category: ProviderCategory;
  provider: string;
  credentials: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  is_active: boolean;
  priority: number;
  updated_at?: string | null;
}

// Permite inyectar un cliente en tests; en runtime usa el singleton service-role.
let clientOverride: SupabaseClient | null = null;
export function __setProviderCredentialsClient(client: SupabaseClient | null): void {
  clientOverride = client;
}
function client(): SupabaseClient {
  assertServerOnly();
  return clientOverride ?? getServiceClient();
}

async function readRows(orgId: number, category?: ProviderCategory): Promise<ProviderRow[]> {
  let q = client()
    .from('provider_configs')
    .select('id, category, provider, credentials, settings, is_active, priority, updated_at')
    .eq('organization_id', orgId);
  if (category) q = q.eq('category', category);
  const { data, error } = await q.order('priority', { ascending: true });
  if (error) {
    console.error('[providerCredentials] Error leyendo provider_configs:', error.message);
    return [];
  }
  return (data ?? []) as ProviderRow[];
}

/**
 * Credenciales + settings efectivos para (org, categoría[, proveedor]).
 * - Primera pasada: fila activa de la org con credenciales reales → source 'org'
 *   (gana aunque tenga peor `priority` que un proveedor sembrado sin claves).
 * - Segunda pasada: fila activa sin credenciales propias (seed) → settings de la
 *   fila + credenciales del fallback env del mismo proveedor → source 'env'.
 * - Sin fila → fallback env por defecto de la categoría.
 */
export async function getProviderCredentials(
  orgId: number,
  category: ProviderCategory,
  provider?: string,
): Promise<ProviderConfig> {
  const rows = (await readRows(orgId, category)).filter((r) => r.is_active && (!provider || r.provider === provider));

  for (const row of rows) {
    const own = sanitizeCredentials(row.credentials);
    if (Object.keys(own).length > 0 && hasRequiredCredentials(row.provider, own)) {
      const settings = { ...defaultSettings(category, row.provider), ...(row.settings ?? {}) };
      return { provider: row.provider, credentials: own, settings, isActive: true, priority: row.priority, source: 'org' };
    }
  }

  for (const row of rows) {
    const envFb = resolveEnvFallback(category, row.provider);
    if (envFb.isActive) {
      const own = sanitizeCredentials(row.credentials);
      const settings = { ...defaultSettings(category, row.provider), ...(row.settings ?? {}) };
      return { ...envFb, credentials: { ...envFb.credentials, ...own }, settings, priority: row.priority };
    }
  }

  return resolveEnvFallback(category, provider);
}

/** Solo settings efectivos (sin credenciales); seguro para devolver al cliente. */
export async function getProviderSettings(
  orgId: number,
  category: ProviderCategory,
  provider?: string,
): Promise<{ provider: string; settings: Record<string, unknown>; source: 'org' | 'env' | 'none' }> {
  const cfg = await getProviderCredentials(orgId, category, provider);
  return { provider: cfg.provider, settings: cfg.settings, source: cfg.source ?? 'none' };
}

/**
 * Lista segura para la UI (sin valores de credenciales). Si la org no tiene
 * filas y `opts.seed` es true (solo administradores: un GET de un miembro no
 * debe escribir), intenta el seed `fn_seed_provider_configs` (DB F0 M9) y
 * relee; si el RPC no existe aún o no se siembra, devuelve las filas
 * virtuales derivadas del catálogo.
 */
export async function listProviderConfigsSafe(
  orgId: number,
  category?: ProviderCategory,
  opts: { seed?: boolean } = { seed: true },
): Promise<ProviderConfigSafe[]> {
  let rows = await readRows(orgId, category);
  if (rows.length === 0 && !category && opts.seed !== false) {
    const { error } = await client().rpc('fn_seed_provider_configs', { p_org: orgId });
    if (!error) rows = await readRows(orgId);
  }

  const items: ProviderConfigSafe[] = rows.map((r) => {
    const own = sanitizeCredentials(r.credentials);
    return {
      id: r.id,
      category: r.category,
      provider: r.provider,
      settings: { ...defaultSettings(r.category, r.provider), ...(r.settings ?? {}) },
      is_active: !!r.is_active,
      priority: r.priority ?? 999,
      configured: Object.keys(own).length > 0 && hasRequiredCredentials(r.provider, own),
      platform_available: hasPlatformCredentials(r.category, r.provider),
      credential_keys: Object.keys(own),
      updated_at: r.updated_at ?? null,
    };
  });

  // Filas virtuales para categorías sin fila (org sin seed o RPC ausente).
  const cats = (category ? [category] : (Object.keys(SUPPORTED_PROVIDERS) as ProviderCategory[]));
  for (const cat of cats) {
    if (items.some((i) => i.category === cat)) continue;
    const p = DEFAULT_PROVIDER[cat];
    items.push({
      category: cat,
      provider: p,
      settings: defaultSettings(cat, p),
      is_active: p !== 'none',
      priority: 10,
      configured: false,
      platform_available: hasPlatformCredentials(cat, p),
      credential_keys: [],
      updated_at: null,
    });
  }
  return items.sort((a, b) => a.category.localeCompare(b.category) || a.priority - b.priority);
}

export interface UpsertProviderInput {
  category: ProviderCategory;
  provider: string;
  settings?: Record<string, unknown>;
  /** Claves nuevas/actualizadas. `null` o '' borran la clave. */
  credentials?: Record<string, string | null>;
  is_active?: boolean;
  priority?: number;
}

export class ProviderValidationError extends Error {
  status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'ProviderValidationError';
  }
}

/** Tamaño máximo del JSON de `settings` (QA r1 medio 9). */
export const MAX_SETTINGS_BYTES = 4096;
const MAX_SETTING_TEXT = 500;

/**
 * Valida `settings` contra `SETTING_FIELDS[category:provider]` (QA r1 medio 9):
 * clave desconocida → 422; `select` → valor dentro de `options`; `number` →
 * finito y dentro de `[min, max]`; `boolean` → booleano; `text` → string de
 * ≤ 500 caracteres. `null` borra la clave (se acepta para cualquier campo).
 * Devuelve el objeto saneado. Antes un `conversation_model: 'gpt-99-inventado'`
 * se guardaba y fallaba después en el proveedor, no en el guardado.
 */
export function validateProviderSettings(
  category: ProviderCategory,
  provider: string,
  settings: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!settings) return {};
  if (JSON.stringify(settings).length > MAX_SETTINGS_BYTES) {
    throw new ProviderValidationError(`settings supera ${MAX_SETTINGS_BYTES} bytes`);
  }
  const fields = SETTING_FIELDS[`${category}:${provider}`] ?? [];
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    const field = byKey.get(key);
    if (!field) throw new ProviderValidationError(`Ajuste '${key}' no válido para '${category}:${provider}'`);
    if (value === null) {
      out[key] = null;
      continue;
    }
    switch (field.type) {
      case 'select':
        if (typeof value !== 'string' || !(field.options ?? []).includes(value)) {
          throw new ProviderValidationError(`Ajuste '${key}': valor '${String(value)}' fuera de las opciones`);
        }
        break;
      case 'number': {
        const n = typeof value === 'number' ? value : Number(value);
        if (typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '') || !Number.isFinite(n)) {
          throw new ProviderValidationError(`Ajuste '${key}': debe ser numérico`);
        }
        if ((field.min != null && n < field.min) || (field.max != null && n > field.max)) {
          throw new ProviderValidationError(`Ajuste '${key}': fuera de rango [${field.min ?? 'sin mínimo'}, ${field.max ?? 'sin máximo'}]`);
        }
        out[key] = n;
        continue;
      }
      case 'boolean':
        if (typeof value !== 'boolean') throw new ProviderValidationError(`Ajuste '${key}': debe ser booleano`);
        break;
      case 'text':
        if (typeof value !== 'string' || value.length > MAX_SETTING_TEXT) {
          throw new ProviderValidationError(`Ajuste '${key}': texto de máximo ${MAX_SETTING_TEXT} caracteres`);
        }
        break;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Upsert de (org, category, provider). Las credenciales se fusionan con las
 * existentes (solo se sobreescriben las claves enviadas). Valida proveedor,
 * claves y `settings` contra el catálogo. Devuelve el shape seguro.
 */
export async function upsertProviderConfig(orgId: number, input: UpsertProviderInput): Promise<ProviderConfigSafe> {
  const allowed = SUPPORTED_PROVIDERS[input.category];
  if (!allowed || !allowed.includes(input.provider)) {
    throw new ProviderValidationError(`Proveedor '${input.provider}' no soportado en '${input.category}'`);
  }
  const allowedKeys = new Set((CREDENTIAL_FIELDS[input.provider] ?? []).map((f) => f.key));
  for (const k of Object.keys(input.credentials ?? {})) {
    if (!allowedKeys.has(k)) throw new ProviderValidationError(`Credencial '${k}' no válida para '${input.provider}'`);
  }
  const validSettings = validateProviderSettings(input.category, input.provider, input.settings);

  const sb = client();
  const { data: existing } = await sb
    .from('provider_configs')
    .select('id, credentials, settings, is_active, priority')
    .eq('organization_id', orgId)
    .eq('category', input.category)
    .eq('provider', input.provider)
    .maybeSingle();

  const mergedCreds: Record<string, string> = { ...(sanitizeCredentials(existing?.credentials as Record<string, unknown>)) };
  for (const [k, v] of Object.entries(input.credentials ?? {})) {
    if (v === null || v === '' || isPlaceholderCredential(v)) delete mergedCreds[k];
    else mergedCreds[k] = v.trim();
  }
  const mergedSettings: Record<string, unknown> = { ...((existing?.settings as Record<string, unknown>) ?? {}) };
  for (const [k, v] of Object.entries(validSettings)) {
    if (v === null) delete mergedSettings[k];
    else mergedSettings[k] = v;
  }

  const payload = {
    organization_id: orgId,
    category: input.category,
    provider: input.provider,
    credentials: mergedCreds,
    settings: mergedSettings,
    is_active: input.is_active ?? existing?.is_active ?? true,
    priority: input.priority ?? existing?.priority ?? 10,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('provider_configs')
    .upsert(payload, { onConflict: 'organization_id,category,provider' })
    .select('id, category, provider, settings, is_active, priority, updated_at, credentials')
    .single();
  if (error || !data) throw new Error(`No se pudo guardar la configuración: ${error?.message ?? 'sin datos'}`);

  const own = sanitizeCredentials(data.credentials as Record<string, unknown>);
  return {
    id: data.id,
    category: data.category,
    provider: data.provider,
    settings: { ...defaultSettings(data.category, data.provider), ...((data.settings as Record<string, unknown>) ?? {}) },
    is_active: !!data.is_active,
    priority: data.priority,
    configured: Object.keys(own).length > 0 && hasRequiredCredentials(data.provider, own),
    platform_available: hasPlatformCredentials(data.category, data.provider),
    credential_keys: Object.keys(own),
    updated_at: data.updated_at,
  };
}
