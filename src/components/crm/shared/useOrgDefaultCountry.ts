'use client';

/**
 * Indicativo por defecto de la organización para completar teléfonos
 * NACIONALES en el navegador (FASE-16 · ronda 5 · T-3).
 *
 * `QuickActionsBar` y `MobileCallDialog` llamaban a `normalizePhone(phone)`
 * sin indicativo, así que todo número de 10 dígitos se completaba con `57`
 * aunque la organización hubiera configurado otro país. El valor sale de
 * `GET /api/crm/whatsapp/settings` (`settings.default_country_code`, el mismo
 * que usa el servidor en `getOrgSettings`).
 *
 * Caché por organización a nivel de módulo: la barra se monta en CADA tarjeta
 * del Kanban y sin caché serían N peticiones por tablero. Un fallo de la API
 * (p. ej. la organización no tiene el módulo) devuelve `null` —el llamador
 * cae al último recurso— y no se cachea, para reintentar en el siguiente
 * montaje.
 */
import { useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { waApi } from '@/components/crm/whatsapp/api';

const cache = new Map<number, string | null>();
const inflight = new Map<number, Promise<string | null>>();

/** Solo dígitos; `''`/ausente → `null`. Puro, testeable. */
export function orgDefaultCountryFromSettings(payload: { settings?: { default_country_code?: string | null } | null } | null | undefined): string | null {
  const raw = payload?.settings?.default_country_code;
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

export async function loadOrgDefaultCountry(orgId: number): Promise<string | null> {
  if (!orgId) return null;
  if (cache.has(orgId)) return cache.get(orgId) ?? null;
  const pending = inflight.get(orgId);
  if (pending) return pending;
  const p = waApi
    .settings()
    .then((r) => {
      const v = orgDefaultCountryFromSettings(r);
      cache.set(orgId, v);
      return v;
    })
    .catch(() => null)
    .finally(() => inflight.delete(orgId));
  inflight.set(orgId, p);
  return p;
}

/** Para tests. */
export function resetOrgDefaultCountryCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * `undefined` mientras carga; después el indicativo (`'52'`) o `null` si la
 * organización no lo tiene configurado.
 */
export function useOrgDefaultCountry(): string | null | undefined {
  const [value, setValue] = useState<string | null | undefined>(() => {
    const orgId = getOrganizationId();
    return cache.has(orgId) ? (cache.get(orgId) ?? null) : undefined;
  });
  useEffect(() => {
    let cancelled = false;
    void loadOrgDefaultCountry(getOrganizationId()).then((v) => { if (!cancelled) setValue(v); });
    return () => { cancelled = true; };
  }, []);
  return value;
}
