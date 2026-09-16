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

export function useDisplayBrand(organizationIdFromCashier: number | null): DisplayBrand {
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
