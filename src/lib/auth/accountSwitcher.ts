'use client';

import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';

const ACCOUNTS_STORAGE_KEY = 'go_admin_saved_accounts';
const CURRENT_USER_STORAGE_KEY = 'go_admin_current_user_id';

/** Máximo de cuentas guardadas por navegador (mismo estándar que Google/Microsoft). */
export const MAX_SAVED_ACCOUNTS = 4;

/** Si una cuenta inactiva lleva más de esto sin usarse, su refresh_token puede haber
 * expirado en Supabase (expiry por defecto ~30 días); se marca para avisar antes de fallar. */
export const STALE_ACCOUNT_THRESHOLD_MS = 20 * 24 * 60 * 60 * 1000;

export interface SavedAccount {
  userId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  updatedAt: number;
}

function readRegistry(): Record<string, SavedAccount> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeRegistry(registry: Record<string, SavedAccount>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(registry));
  } catch {
    // localStorage no disponible; se ignora
  }
}

/** Cuentas guardadas en este navegador, más reciente primero. */
export function getSavedAccounts(): SavedAccount[] {
  return Object.values(readRegistry()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** true si la cuenta lleva mucho tiempo inactiva y su sesión guardada podría haber expirado. */
export function isAccountStale(account: SavedAccount): boolean {
  return Date.now() - account.updatedAt > STALE_ACCOUNT_THRESHOLD_MS;
}

/** Quita las cuentas más antiguas (por uso) que excedan MAX_SAVED_ACCOUNTS, preservando `keepUserId`. */
function enforceAccountLimit(registry: Record<string, SavedAccount>, keepUserId: string): void {
  const ids = Object.keys(registry);
  if (ids.length <= MAX_SAVED_ACCOUNTS) return;

  const removable = ids
    .filter((id) => id !== keepUserId)
    .sort((a, b) => registry[a].updatedAt - registry[b].updatedAt);

  const excess = ids.length - MAX_SAVED_ACCOUNTS;
  removable.slice(0, excess).forEach((id) => delete registry[id]);
}

export function getActiveAccountUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Guarda o actualiza la sesión activa en el registro de cuentas de este navegador. */
export async function upsertAccountFromSession(session: Session | null): Promise<void> {
  if (!session?.user?.id || typeof window === 'undefined') return;

  const registry = readRegistry();
  const existing = registry[session.user.id];

  registry[session.user.id] = {
    userId: session.user.id,
    email: session.user.email || existing?.email || '',
    name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || existing?.name,
    avatarUrl: session.user.user_metadata?.avatar_url || existing?.avatarUrl,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    updatedAt: Date.now(),
  };

  enforceAccountLimit(registry, session.user.id);
  writeRegistry(registry);
  try {
    window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, session.user.id);
  } catch {
    // silencioso
  }
}

/** Actualiza solo los datos de perfil (nombre/avatar) de una cuenta ya guardada. */
export function updateSavedAccountProfile(userId: string, profile: { name?: string; avatarUrl?: string }): void {
  const registry = readRegistry();
  const existing = registry[userId];
  if (!existing) return;
  registry[userId] = { ...existing, ...profile };
  writeRegistry(registry);
}

/** Elimina una cuenta guardada de este navegador (no cierra su sesión remota). */
export function removeSavedAccount(userId: string): void {
  const registry = readRegistry();
  delete registry[userId];
  writeRegistry(registry);
}

/** Limpia el registro completo de cuentas guardadas en este navegador. */
export function clearSavedAccounts(): void {
  writeRegistry({});
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
    } catch {
      // silencioso
    }
  }
}

/** Cambia la sesión activa de Supabase a una cuenta ya autenticada en este navegador. */
export async function switchToAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
  const account = readRegistry()[userId];
  if (!account) {
    return { ok: false, error: 'Esta cuenta ya no está disponible, inicia sesión de nuevo.' };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  });

  if (error || !data.session) {
    // El token guardado ya expiró o fue invalidado: se quita de la lista
    removeSavedAccount(userId);
    return { ok: false, error: 'La sesión de esta cuenta expiró, inicia sesión de nuevo.' };
  }

  await upsertAccountFromSession(data.session);
  return { ok: true };
}

// Mantiene actualizados los tokens de la cuenta activa cuando Supabase los rota
// (refresh, login, actualización de datos de usuario), para que el cambio de
// cuenta nunca use un refresh_token ya invalidado.
let listenerInitialized = false;
export function initAccountRegistrySync(): void {
  if (listenerInitialized || typeof window === 'undefined') return;
  listenerInitialized = true;

  supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session) {
      upsertAccountFromSession(session);
    }
  });
}
