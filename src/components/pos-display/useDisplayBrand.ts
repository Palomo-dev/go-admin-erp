'use client';

/**
 * Marca de la organización para la pantalla del cliente (PLAN §4.1.5: marca
 * del comercio, no de GO Admin).
 *
 * Fuente: `useOrganization()` da id, nombre y logo desde localStorage al
 * instante (sin parpadeo); `organizations.primary_color` no vive en ese
 * hook, así que nombre, logo y color se leen una vez por
 * `organizationService.getOrganizationBrand` (sesión del usuario, RLS) y la
 * zona horaria por `getOrganizationTimezone`. Si la caja que habla
 * (`hello.organizationId`) es de otra organización que la activa en este
 * navegador, se pinta la de la caja: la pantalla refleja a quien le habla,
 * no a quien inició sesión aquí. Y si esa otra organización no se puede leer
 * (RLS), NO se reutiliza el nombre local: se pinta vacío (inicial «•» y color
 * neutro) antes que enseñar el comercio equivocado (logic.ts ·
 * resolveBrandIdentity).
 *
 * Pantalla REMOTA (Fase 3, parte B): la tableta no tiene sesión ni
 * organización local, así que nada de lo anterior puede leerse. La marca
 * llega en el bootstrap (`/api/pos/display/bootstrap`, resuelta en el
 * servidor desde la terminal) y se construye con `brandFromBootstrap`, una
 * función pura: en remoto NO se monta este hook.
 *
 * Por qué no un parámetro `override` (ronda 2 · 5): las reglas de los hooks
 * obligan a llamar igual a `useOrganization()` aunque el resultado se vaya a
 * descartar, y en un dispositivo sin `userData` ni organización en
 * localStorage —exactamente la tableta emparejada— ese hook se reprograma
 * cada 1,5 s esperando una sesión que nunca llega: en un equipo de quiosco,
 * un re-render para siempre. La única forma de no pagarlo es no montarlo,
 * así que quien decide es el componente (CustomerDisplay · LocalBrandShell)
 * y este hook es solo el camino LOCAL.
 */

import { useEffect, useState } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { organizationService } from '@/lib/services/organizationService';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';
import { ensureAaOnWhite, FALLBACK_BRAND_COLOR, resolveBrandIdentity } from './logic';

export interface DisplayBrand {
  organizationId: number | null;
  name: string;
  logoUrl: string | null;
  /** Color de marca ya corregido para cumplir AA sobre blanco. */
  primaryColor: string;
  /** Color de marca tal cual lo guardó la organización (fondos, acentos suaves). */
  rawPrimaryColor: string | null;
  timezone: string;
}

/** Marca de la pantalla remota a partir del bootstrap (misma corrección AA que la marca local). */
export function brandFromBootstrap(brand: {
  organizationId: number;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  timezone: string;
}): DisplayBrand {
  return {
    organizationId: brand.organizationId,
    name: brand.name,
    logoUrl: brand.logoUrl,
    primaryColor: ensureAaOnWhite(brand.primaryColor),
    rawPrimaryColor: brand.primaryColor,
    timezone: brand.timezone,
  };
}

/** Marca vacía: pantalla de emparejamiento, bootstrap en curso… todavía no se sabe de qué comercio es. */
export const NEUTRAL_DISPLAY_BRAND: DisplayBrand = {
  organizationId: null,
  name: '',
  logoUrl: null,
  primaryColor: FALLBACK_BRAND_COLOR,
  rawPrimaryColor: null,
  timezone: DEFAULT_TIMEZONE,
};

/**
 * Marca de una pantalla LOCAL (misma máquina que la caja): sesión, RLS y
 * organización de localStorage. No se monta en la pantalla remota.
 */
export function useLocalDisplayBrand(organizationIdFromCashier: number | null): DisplayBrand {
  const { organization } = useOrganization();
  const localOrgId = organization?.id && organization.id > 0 ? organization.id : null;
  const organizationId = organizationIdFromCashier ?? localOrgId;

  const [brand, setBrand] = useState<DisplayBrand>(() => {
    // Respaldo local instantáneo solo si la caja es la organización local (o aún no habló nadie).
    const initial = resolveBrandIdentity({
      row: null,
      organizationId: organizationId ?? 0,
      localOrgId,
      local: { name: organization?.name ?? null, logoUrl: organization?.logo_url ?? null },
    });
    return {
      organizationId,
      name: initial.name,
      logoUrl: initial.logoUrl,
      primaryColor: FALLBACK_BRAND_COLOR,
      rawPrimaryColor: null,
      timezone: DEFAULT_TIMEZONE,
    };
  });

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    (async () => {
      const [row, timezone] = await Promise.all([
        organizationService.getOrganizationBrand(organizationId).catch(() => null),
        getOrganizationTimezone(organizationId).catch(() => DEFAULT_TIMEZONE),
      ]);
      if (cancelled) return;
      const identity = resolveBrandIdentity({
        row,
        organizationId,
        localOrgId,
        local: { name: organization?.name ?? null, logoUrl: organization?.logo_url ?? null },
      });
      if (identity.unknown) {
        console.warn('[pos-display] la caja es de otra organización y su marca no se pudo leer; se pinta sin marca', {
          organizationId,
        });
      }
      setBrand({
        organizationId,
        name: identity.name,
        logoUrl: identity.logoUrl,
        primaryColor: ensureAaOnWhite(row?.primary_color),
        rawPrimaryColor: row?.primary_color ?? null,
        timezone,
      });
    })();

    return () => {
      cancelled = true;
    };
    // organization.name / logo_url son solo respaldo local; no deben re-disparar la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, localOrgId]);

  return brand;
}
