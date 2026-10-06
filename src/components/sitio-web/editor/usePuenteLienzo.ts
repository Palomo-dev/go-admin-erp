'use client';

/**
 * Puente con el sitio que pinta el lienzo (PreviewBridge de goadmin-websites): la MISMA lógica de
 * mensajes que tenía `EditorPreview`, movida a un hook para el lienzo nuevo.
 *
 * - `goadmin:preview` (secciones en edición, con `settings` → estilo por sección y visibilidad
 *   por dispositivo) y `goadmin:settings` (encabezado, pie y tema en edición), con espera de
 *   150 ms y sin reenviar lo mismo.
 * - `goadmin:select` / `goadmin:scroll` para resaltar la sección elegida.
 * - Escucha `goadmin:select` (clic en una sección o zona del lienzo) y `goadmin:accion`.
 *
 * Seguridad: los mensajes se envían SOLO al origen del sitio del lienzo (nunca `*`) y solo se
 * aceptan de ese origen o de los orígenes de desarrollo conocidos.
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import type { AvisoFaltanDatos } from '@/lib/services/website/fuentesDatosSecciones';
import { origenDe } from '@/components/sitio-web/ui/dispositivos';

export interface DetalleClic {
  enlace: boolean;
  href?: string;
  texto?: string;
  productoId?: number;
}

const ORIGENES_DESARROLLO = ['http://localhost:3002', 'http://localhost:3000', 'https://erp.goadmin.io', 'https://go-admin-erp.vercel.app'];
const ESPERA_MS = 150;

export interface OpcionesPuente {
  iframe: RefObject<HTMLIFrameElement | null>;
  url: string | null;
  secciones: readonly WebsitePageSection[];
  ajustes: { ajustes: Record<string, unknown>; menuEncabezado: unknown } | null;
  seleccion: string | null;
  avisoSeccion?: (s: WebsitePageSection) => AvisoFaltanDatos | null;
  onClic?: (id: string, detalle: DetalleClic) => void;
  onQuitar?: (id: string) => void;
  /** Cambios de la carta de una sede sin guardar (precio web, agotado, oculto): `goadmin:carta-sede`. */
  cartaSede?: { branchId: number; cambios: unknown[] } | null;
}

export function usePuenteLienzo({ iframe, url, secciones, ajustes, seleccion, avisoSeccion, onClic, onQuitar, cartaSede }: OpcionesPuente) {
  const destino = origenDe(url);
  const ultimoSecciones = useRef('');
  const ultimoAjustes = useRef('');
  const seleccionRef = useRef(seleccion);
  seleccionRef.current = seleccion;

  const enviar = useCallback(
    (mensaje: unknown) => {
      const w = iframe.current?.contentWindow;
      if (!w || !destino) return;
      try {
        w.postMessage(mensaje, destino);
      } catch {
        /* el lienzo puede no estar listo */
      }
    },
    [iframe, destino],
  );

  const enviarSecciones = useCallback(() => {
    const origenEditor = typeof window !== 'undefined' ? window.location.origin : '';
    const lista = secciones.map((s) => {
      const aviso = avisoSeccion?.(s) ?? null;
      return {
        id: s.id,
        section_type: s.section_type,
        section_variant: s.section_variant,
        content: s.content,
        settings: s.settings,
        is_visible: s.is_visible,
        ...(aviso
          ? {
              aviso: {
                titulo: aviso.titulo.split(' necesita ')[0],
                descripcion: aviso.detalleLienzo,
                accion: { texto: aviso.accion.texto, href: `${origenEditor}${aviso.accion.href}` },
              },
            }
          : {}),
      };
    });
    const serie = JSON.stringify(lista);
    if (serie === ultimoSecciones.current) return;
    ultimoSecciones.current = serie;
    enviar({ type: 'goadmin:preview', sections: lista });
  }, [secciones, avisoSeccion, enviar]);

  const enviarAjustes = useCallback(() => {
    if (!ajustes) return;
    const mensaje = { type: 'goadmin:settings', ajustes: ajustes.ajustes, menuEncabezado: ajustes.menuEncabezado ?? null };
    const serie = JSON.stringify(mensaje);
    if (serie === ultimoAjustes.current) return;
    ultimoAjustes.current = serie;
    enviar(mensaje);
  }, [ajustes, enviar]);

  useEffect(() => {
    const t = setTimeout(enviarSecciones, ESPERA_MS);
    return () => clearTimeout(t);
  }, [enviarSecciones]);

  useEffect(() => {
    const t = setTimeout(enviarAjustes, ESPERA_MS);
    return () => clearTimeout(t);
  }, [enviarAjustes]);

  useEffect(() => {
    if (cartaSede === undefined) return;
    const t = setTimeout(
      () => enviar({ type: 'goadmin:carta-sede', branchId: cartaSede?.branchId ?? null, cambios: cartaSede?.cambios ?? [] }),
      ESPERA_MS,
    );
    return () => clearTimeout(t);
  }, [cartaSede, enviar]);

  useEffect(() => {
    enviar({ type: 'goadmin:select', sectionId: seleccion ?? null });
    if (seleccion) enviar({ type: 'goadmin:scroll', sectionId: seleccion });
  }, [seleccion, enviar]);

  useEffect(() => {
    if (!onClic && !onQuitar) return;
    const alRecibir = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.origin && e.origin !== destino && !ORIGENES_DESARROLLO.includes(e.origin)) return;
      const d = e.data as Record<string, unknown>;
      if (d.type === 'goadmin:select' && typeof d.sectionId === 'string') {
        const enlace = d.enlace === true;
        onClic?.(d.sectionId, {
          enlace,
          ...(enlace && typeof d.href === 'string' ? { href: d.href.slice(0, 512) } : {}),
          ...(enlace && typeof d.texto === 'string' ? { texto: d.texto.slice(0, 120) } : {}),
          ...(Number.isInteger(d.productoId) && (d.productoId as number) > 0 ? { productoId: d.productoId as number } : {}),
        });
      }
      if (d.type === 'goadmin:accion' && typeof d.sectionId === 'string' && d.accion === 'quitar') onQuitar?.(d.sectionId);
    };
    window.addEventListener('message', alRecibir);
    return () => window.removeEventListener('message', alRecibir);
  }, [onClic, onQuitar, destino]);

  /** Tras recargar el iframe: reenviar todo y volver a resaltar la selección. */
  const alCargar = useCallback(() => {
    ultimoSecciones.current = '';
    ultimoAjustes.current = '';
    setTimeout(() => {
      enviarSecciones();
      enviarAjustes();
      if (seleccionRef.current) enviar({ type: 'goadmin:select', sectionId: seleccionRef.current });
    }, 200);
  }, [enviarSecciones, enviarAjustes, enviar]);

  return { alCargar, destino };
}
