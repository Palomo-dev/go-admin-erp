'use client';

/**
 * Formato de etiqueta de peso variable de la organización para el lector del
 * POS (PRODUCTOS-POR-PESO-BASCULA.md §2.7). Se lee de
 * `organization_barcode_settings` (RLS: miembros de la organización) y se
 * guarda en el navegador para que la etiqueta también se lea sin conexión
 * (§2.10). Sin respuesta ni caché: `null` (el lector se comporta como hoy).
 */

import { useEffect, useState } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { formatoEtiquetaValido, type FormatoEtiquetaPeso } from '@/lib/pos/etiquetaPeso';
import { obtenerFormatoEtiquetaActivo } from '@/lib/services/codigosBarrasService';

function claveCache(orgId: number): string {
  return `pos_formato_etiqueta_peso_${orgId}`;
}

function leerCache(orgId: number | undefined): FormatoEtiquetaPeso | null {
  if (!orgId) return null;
  try {
    const raw = localStorage.getItem(claveCache(orgId));
    if (!raw) return null;
    const v = JSON.parse(raw) as FormatoEtiquetaPeso | null;
    return v && v.activo && formatoEtiquetaValido(v) ? v : null;
  } catch {
    return null;
  }
}

function escribirCache(orgId: number, formato: FormatoEtiquetaPeso | null): void {
  try {
    if (formato) localStorage.setItem(claveCache(orgId), JSON.stringify(formato));
    else localStorage.removeItem(claveCache(orgId));
  } catch {
    /* sin almacenamiento local: solo en memoria */
  }
}

/** Avisa a los POS abiertos en este navegador que el formato cambió (tarjeta de configuración). */
export const EVENTO_FORMATO_ETIQUETA = 'goadmin:formato-etiqueta-peso';

export function recordarFormatoEtiqueta(orgId: number, formato: FormatoEtiquetaPeso | null): void {
  escribirCache(orgId, formato && formato.activo ? formato : null);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_FORMATO_ETIQUETA));
}

export function useFormatoEtiquetaPeso(): FormatoEtiquetaPeso | null {
  const { organization } = useOrganization();
  const orgId = organization?.id as number | undefined;
  const [formato, setFormato] = useState<FormatoEtiquetaPeso | null>(() => leerCache(orgId));

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    setFormato(leerCache(orgId));
    obtenerFormatoEtiquetaActivo(orgId)
      .then((f) => {
        if (cancelado) return;
        setFormato(f);
        escribirCache(orgId, f);
      })
      .catch(() => {
        /* sin conexión: queda la caché */
      });
    const alCambiar = () => setFormato(leerCache(orgId));
    window.addEventListener(EVENTO_FORMATO_ETIQUETA, alCambiar);
    return () => {
      cancelado = true;
      window.removeEventListener(EVENTO_FORMATO_ETIQUETA, alCambiar);
    };
  }, [orgId]);

  return formato;
}
