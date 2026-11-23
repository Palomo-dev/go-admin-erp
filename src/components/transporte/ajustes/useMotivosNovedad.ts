'use client';

/**
 * Motivos de novedad de la organización (Configuración › Transporte, decisión 11): una sola lista
 * para el diálogo de reporte, Viajes › Novedades y la app del conductor. Se lee de
 * `GET /api/transporte/ajustes`; mientras carga o si falla, los motivos del diseño.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { MOTIVOS_POR_DEFECTO, motivosActivos, normalizarAjustesTransporte, type MotivoNovedad } from '@/lib/transporte/ajustesTransporte';
import { nombreMotivo } from './nombreMotivo';

export interface MotivoVisible extends MotivoNovedad {
  etiqueta: string;
}

export function useMotivosNovedad(activo = true): MotivoVisible[] {
  const t = useTranslations('transporte');
  const [motivos, setMotivos] = useState<MotivoNovedad[]>(() => MOTIVOS_POR_DEFECTO.map((m) => ({ ...m })));

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    const org = Number(getOrganizationId()) || null;
    fetch('/api/transporte/ajustes', { credentials: 'same-origin', cache: 'no-store', headers: org ? { 'x-organization-id': String(org) } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!cancelado && c?.ajustes) setMotivos(motivosActivos(normalizarAjustesTransporte(c.ajustes)));
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [activo]);

  return motivos.map((m) => ({ ...m, etiqueta: nombreMotivo(t, m) }));
}
