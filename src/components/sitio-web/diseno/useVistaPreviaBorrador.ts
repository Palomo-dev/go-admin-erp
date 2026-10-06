'use client';

/**
 * Dirección de la vista previa del BORRADOR (Figma A/07f): el sitio público
 * pinta el borrador con el token firmado que da la API V2
 * (`POST /api/website/v2/sites/[siteId]/vista-previa`, 24 h). Sin token (falta
 * el secreto o falla la API) se muestra el sitio publicado y se avisa. La
 * forma `https://<host>/vista-previa/<token>` es la del sitio público.
 */
import { useCallback, useEffect, useState } from 'react';
import { clienteSitiosV2 } from '@/lib/website/v2/clienteSitiosV2';

export function urlVistaPreviaBorrador(host: string, token: string): string {
  return `https://${host}/vista-previa/${encodeURIComponent(token)}`;
}

export interface VistaPreviaBorrador {
  /** Borrador con token, o el sitio publicado si no hubo token; `null` sin dirección. */
  url: string | null;
  /** `true` si `url` es el sitio publicado (no se pudo abrir el borrador). */
  esPublicado: boolean;
  cargando: boolean;
  /** Pide un token nuevo (p. ej. para abrirla en otra pestaña). */
  pedir: () => Promise<string | null>;
}

export function useVistaPreviaBorrador(sitioId: string | null, host: string | null, paginaId: string | null): VistaPreviaBorrador {
  const [url, setUrl] = useState<string | null>(null);
  const [esPublicado, setEsPublicado] = useState(false);
  const [cargando, setCargando] = useState(false);

  const pedir = useCallback(async (): Promise<string | null> => {
    if (!sitioId || !host) return null;
    const { token } = await clienteSitiosV2.vistaPrevia(sitioId, paginaId);
    return urlVistaPreviaBorrador(host, token);
  }, [sitioId, host, paginaId]);

  useEffect(() => {
    if (!host) {
      setUrl(null);
      return;
    }
    if (!sitioId) {
      setUrl(`https://${host}`);
      setEsPublicado(true);
      return;
    }
    let vigente = true;
    setCargando(true);
    pedir()
      .then((u) => {
        if (!vigente) return;
        setUrl(u);
        setEsPublicado(false);
      })
      .catch(() => {
        if (!vigente) return;
        setUrl(`https://${host}`);
        setEsPublicado(true);
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [sitioId, host, pedir]);

  return { url, esPublicado, cargando, pedir };
}
