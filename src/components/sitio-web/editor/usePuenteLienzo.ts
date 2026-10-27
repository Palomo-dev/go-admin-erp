'use client';

/**
 * Puente con el sitio que pinta el lienzo (PreviewBridge de goadmin-websites): la MISMA lógica de
 * mensajes que tenía `EditorPreview`, movida a un hook para el lienzo nuevo.
 *
 * - `goadmin:preview` (secciones en edición, con `settings` → estilo por sección y visibilidad
 *   por dispositivo). En la portada carrusel el mensaje lleva el banner de la sección como
 *   diapositiva; el borrador guardado no cambia.
 * - `goadmin:settings` (encabezado, pie y tema en edición).
 *   Los dos mensajes esperan 150 ms y no se reenvían si no cambiaron. En V2, `goadmin:settings` lleva además `tema`
 *   (`temaParaLienzo`): fuentes, redondeo, botón y movimiento del estilo general, que el sitio
 *   aplica con el mismo código que al publicar.
 * - `goadmin:select` / `goadmin:scroll` para resaltar la sección elegida. En la Carta QR por pasos
 *   (`pasoLienzo.ts`), `goadmin:paso` en vez de `goadmin:scroll`: el sitio muestra el paso de esa sección.
 * - Escucha `goadmin:select` (clic en una sección o zona del lienzo), `goadmin:accion` y
 *   `goadmin:ready` (el puente del sitio acaba de montar: se le reenvía todo).
 *
 * Seguridad: los mensajes se envían SOLO al origen del sitio del lienzo (nunca `*`) y solo se
 * aceptan de ese origen o de los orígenes de desarrollo conocidos.
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import type { AvisoFaltanDatos } from '@/lib/services/website/fuentesDatosSecciones';
import { origenDe } from '@/components/sitio-web/ui/dispositivos';
import type { TemaLienzo } from '@/lib/website/v2/tokensEstilo';
import { contenidoPortadaVisible } from '@/lib/website/portadaSlider';
import { lienzoPorPasos, mensajesSeleccion } from './pasoLienzo';

export interface DetalleClic {
  enlace: boolean;
  href?: string;
  texto?: string;
  productoId?: number;
}

const ORIGENES_DESARROLLO = ['http://localhost:3002', 'http://localhost:3000', 'https://erp.goadmin.io', 'https://go-admin-erp.vercel.app'];
const ESPERA_MS = 150;

/**
 * ¿`origen` es el mismo sitio que `destino` con o sin `www.`? Los dominios propios redirigen
 * el apex a `www` (p. ej. tuhogarcolombia.store → www.tuhogarcolombia.store): el iframe queda
 * en otro origen y, sin esto, el editor descartaba su `goadmin:ready` y le enviaba los cambios
 * a un origen que ya no es el suyo (el navegador los tira en silencio: lienzo sin tiempo real).
 */
export function mismoSitioWww(origen: string, destino: string | null): boolean {
  if (!destino || !origen) return false;
  if (origen === destino) return true;
  try {
    const a = new URL(origen);
    const b = new URL(destino);
    if (a.protocol !== b.protocol || a.port !== b.port) return false;
    const sin = (h: string) => h.replace(/^www\./, '');
    return sin(a.hostname) === sin(b.hostname);
  } catch {
    return false;
  }
}

export interface OpcionesPuente {
  iframe: RefObject<HTMLIFrameElement | null>;
  url: string | null;
  secciones: readonly WebsitePageSection[];
  ajustes: { ajustes: Record<string, unknown>; menuEncabezado: unknown; tema?: TemaLienzo | null } | null;
  seleccion: string | null;
  avisoSeccion?: (s: WebsitePageSection) => AvisoFaltanDatos | null;
  onClic?: (id: string, detalle: DetalleClic) => void;
  onQuitar?: (id: string) => void;
  /** Cambios de la carta de una sede sin guardar (precio web, agotado, oculto): `goadmin:carta-sede`. */
  cartaSede?: { branchId: number; cambios: unknown[] } | null;
  /** Tipo y slug de la página: la Carta QR va por pasos (`goadmin:paso`). Ausente = como siempre. */
  pagina?: { tipo?: string | null; slug?: string | null } | null;
}

export function usePuenteLienzo({ iframe, url, secciones, ajustes, seleccion, avisoSeccion, onClic, onQuitar, cartaSede, pagina }: OpcionesPuente) {
  const destinoUrl = origenDe(url);
  // Origen real del iframe (tras redirecciones apex ↔ www), aprendido de sus mensajes.
  const origenReal = useRef<string | null>(null);
  useEffect(() => {
    origenReal.current = null;
  }, [destinoUrl]);
  const destino = destinoUrl;
  const ultimoSecciones = useRef('');
  const ultimoAjustes = useRef('');
  const seleccionRef = useRef(seleccion);
  seleccionRef.current = seleccion;
  const porPasos = lienzoPorPasos(secciones, pagina);
  const porPasosRef = useRef(porPasos);
  porPasosRef.current = porPasos;

  const enviar = useCallback(
    (mensaje: unknown) => {
      const w = iframe.current?.contentWindow;
      if (!w || !destino) return;
      try {
        w.postMessage(mensaje, origenReal.current ?? destino);
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
        content: contenidoPortadaVisible(s.section_type, s.section_variant, s.content),
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
    const mensaje = {
      type: 'goadmin:settings',
      ajustes: ajustes.ajustes,
      menuEncabezado: ajustes.menuEncabezado ?? null,
      ...(ajustes.tema ? { tema: ajustes.tema } : {}),
    };
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
    for (const m of mensajesSeleccion(seleccion, porPasosRef.current)) enviar(m);
  }, [seleccion, enviar]);

  /** Reenvía todo al lienzo (secciones, ajustes y selección con su scroll). */
  const reenviarTodo = useCallback(() => {
    ultimoSecciones.current = '';
    ultimoAjustes.current = '';
    enviarSecciones();
    enviarAjustes();
    for (const m of mensajesSeleccion(seleccionRef.current, porPasosRef.current)) enviar(m);
  }, [enviarSecciones, enviarAjustes, enviar]);
  const reenviarRef = useRef(reenviarTodo);
  reenviarRef.current = reenviarTodo;

  useEffect(() => {
    const alRecibir = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.origin && !mismoSitioWww(e.origin, destino) && !ORIGENES_DESARROLLO.includes(e.origin)) return;
      // Solo se escucha al iframe del lienzo, no a cualquier ventana del mismo origen.
      if (iframe.current?.contentWindow && e.source && e.source !== iframe.current.contentWindow) return;
      if (e.origin && mismoSitioWww(e.origin, destino)) origenReal.current = e.origin;
      const d = e.data as Record<string, unknown>;
      // El puente del sitio monta después de hidratar: puede estar listo después de `onLoad`.
      // Al avisar `goadmin:ready` se le manda el borrador y la selección.
      if (d.type === 'goadmin:ready') {
        reenviarRef.current();
        return;
      }
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
  }, [onClic, onQuitar, destino, iframe]);

  /** Tras recargar el iframe: reenviar todo y volver a resaltar (y mostrar) la selección. */
  const alCargar = useCallback(() => {
    setTimeout(() => reenviarRef.current(), 200);
  }, []);

  return { alCargar, destino };
}
