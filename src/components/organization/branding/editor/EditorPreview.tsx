'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Globe, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import type { DevicePreview } from './EditorHeader';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import type { AvisoFaltanDatos } from '@/lib/services/website/fuentesDatosSecciones';

/** Detalle del clic en el lienzo. En un enlace de una zona global llegan su `href` y su texto. */
export interface DetalleClicLienzo {
  enlace: boolean;
  href?: string;
  texto?: string;
  /** Plato tocado dentro de la carta (`menu_full`): su `product_id`. */
  productoId?: number;
}

/** Ajustes en edición que el lienzo aplica sin guardar (`goadmin:settings`). */
export interface AjustesVivosLienzo {
  /** Columnas de `website_settings` del encabezado, el pie y el tema, con su valor en edición. */
  ajustes: Record<string, unknown>;
  /** Menú del encabezado en edición (árbol de ítems), o `null` si no se está editando. */
  menuEncabezado?: ItemMenuVivo[] | null;
}

export interface ItemMenuVivo {
  id: string;
  texto: string;
  /** Ruta relativa al sitio («productos», «categorias/zapatos») o URL completa. */
  ruta: string;
  hijos: ItemMenuVivo[];
}

interface EditorPreviewProps {
  previewUrl: string | null;
  devicePreview: DevicePreview;
  refreshKey?: number;
  /** Secciones actuales del editor (para preview vivo por postMessage). */
  liveSections?: WebsitePageSection[];
  /**
   * ID de sección activa (para scroll automático en el iframe). También puede
   * ser una zona global (`header` / `footer`): el sitio la resalta.
   */
  activeSectionId?: string | null;
  /**
   * Callback cuando el usuario clickea una sección dentro del iframe. En las
   * zonas globales llega `enlace: true` si el clic cayó en un enlace.
   */
  onSelectSectionFromCanvas?: (sectionId: string, detalle: DetalleClicLienzo) => void;
  /**
   * Aviso «Faltan datos» por sección. El sitio, en modo preview, pinta en su lugar el
   * estado vacío del lienzo (Figma «SeccionVaciaLienzo» 1886:919306); fuera del editor nada cambia.
   */
  avisoSeccion?: (section: WebsitePageSection) => AvisoFaltanDatos | null;
  /** «Quitar sección» pulsado en el estado vacío del lienzo. */
  onAccionSeccion?: (sectionId: string, accion: 'quitar') => void;
  /** Encabezado, pie y tema en edición: el lienzo los aplica sin guardar. */
  ajustesVivos?: AjustesVivosLienzo | null;
  /**
   * Cambios de la carta de una sede sin guardar (precio web, agotado, oculto): el lienzo los
   * pinta encima de lo guardado (`goadmin:carta-sede`).
   */
  cartaSede?: { branchId: number; cambios: unknown[] } | null;
}

const DEVICE_WIDTHS: Record<DevicePreview, string> = {
  desktop: '100%',
  laptop: '1024px',
  tablet: '768px',
  mobile: '375px',
};

/**
 * Orígenes de desarrollo permitidos para recibir postMessage. En producción el
 * sitio vive en el dominio de la organización (`{subdominio}.goadmin.io` o un
 * dominio propio): se acepta además el origen del `previewUrl` del lienzo.
 */
const ALLOWED_SITE_ORIGINS = [
  'http://localhost:3002',
  'http://localhost:3000',
  'https://erp.goadmin.io',
  'https://go-admin-erp.vercel.app',
];

/** Origen del sitio que pinta el lienzo (`null` si la URL no es válida). */
function origenLienzo(previewUrl: string | null): string | null {
  if (!previewUrl) return null;
  try {
    return new URL(previewUrl).origin;
  } catch {
    return null;
  }
}

export default function EditorPreview({
  previewUrl,
  devicePreview,
  refreshKey,
  liveSections,
  activeSectionId,
  onSelectSectionFromCanvas,
  avisoSeccion,
  onAccionSeccion,
  ajustesVivos,
  cartaSede,
}: EditorPreviewProps) {
  const t = useTranslations('branding.editor.preview');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentSections = useRef<string>('');
  // Selección vigente, para volver a resaltarla cuando el iframe recarga.
  const seleccionActual = useRef<string | null>(activeSectionId ?? null);
  useEffect(() => {
    seleccionActual.current = activeSectionId ?? null;
  }, [activeSectionId]);

  const width = DEVICE_WIDTHS[devicePreview];

  // ---- F12.1: Preview vivo por postMessage ----
  // Envía las secciones actuales al iframe con debounce 150ms.
  // Solo se activa si hay liveSections y el iframe ya cargó.
  const sendPreviewMessage = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow || !liveSections) return;

    // El enlace del aviso va absoluto: el lienzo vive en otro origen.
    const origenEditor = typeof window !== 'undefined' ? window.location.origin : '';
    const payload = {
      type: 'goadmin:preview',
      sections: liveSections.map((s) => {
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
      }),
    };

    // Evitar envíos redundantes (mismo payload)
    const serialized = JSON.stringify(payload.sections);
    if (serialized === lastSentSections.current) return;
    lastSentSections.current = serialized;

    try {
      // Intentar enviar al origen del previewUrl; fallback a '*'
      const targetOrigin = previewUrl ? new URL(previewUrl).origin : '*';
      iframe.contentWindow.postMessage(payload, targetOrigin);
    } catch {
      // Si falla la construcción de URL, enviar con '*' (el sitio valida origen)
      try {
        iframe.contentWindow.postMessage(payload, '*');
      } catch { /* noop */ }
    }
  }, [liveSections, previewUrl, avisoSeccion]);

  // Debounce 150ms sobre cambios de secciones
  useEffect(() => {
    if (!liveSections) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      sendPreviewMessage();
    }, 150);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [liveSections, sendPreviewMessage]);

  // ---- Encabezado, pie y tema en vivo (`goadmin:settings`), con el mismo debounce ----
  const ultimoAjustes = useRef<string>('');
  const temporizadorAjustes = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enviarAjustes = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow || !ajustesVivos) return;
    const payload = {
      type: 'goadmin:settings',
      ajustes: ajustesVivos.ajustes,
      menuEncabezado: ajustesVivos.menuEncabezado ?? null,
    };
    const serializado = JSON.stringify(payload);
    if (serializado === ultimoAjustes.current) return;
    ultimoAjustes.current = serializado;
    const destino = origenLienzo(previewUrl);
    if (!destino) return; // sin origen conocido no se envía nada con '*'
    try {
      iframe.contentWindow.postMessage(payload, destino);
    } catch { /* noop */ }
  }, [ajustesVivos, previewUrl]);

  useEffect(() => {
    if (!ajustesVivos) return;
    if (temporizadorAjustes.current) clearTimeout(temporizadorAjustes.current);
    temporizadorAjustes.current = setTimeout(enviarAjustes, 150);
    return () => {
      if (temporizadorAjustes.current) clearTimeout(temporizadorAjustes.current);
    };
  }, [ajustesVivos, enviarAjustes]);

  // ---- Carta de la sede sin guardar (`goadmin:carta-sede`) ----
  useEffect(() => {
    const iframe = iframeRef.current;
    const destino = origenLienzo(previewUrl);
    if (!iframe?.contentWindow || !destino || cartaSede === undefined) return;
    const t = setTimeout(() => {
      try {
        iframe.contentWindow?.postMessage(
          { type: 'goadmin:carta-sede', branchId: cartaSede?.branchId ?? null, cambios: cartaSede?.cambios ?? [] },
          destino,
        );
      } catch { /* noop */ }
    }, 150);
    return () => clearTimeout(t);
  }, [cartaSede, previewUrl]);

  // Scroll a la sección activa y aviso de la selección (el sitio resalta la
  // zona global seleccionada; con `null` quita el resaltado).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    try {
      const targetOrigin = previewUrl ? new URL(previewUrl).origin : '*';
      iframe.contentWindow.postMessage(
        { type: 'goadmin:select', sectionId: activeSectionId ?? null },
        targetOrigin,
      );
      if (activeSectionId) {
        iframe.contentWindow.postMessage(
          { type: 'goadmin:scroll', sectionId: activeSectionId },
          targetOrigin,
        );
      }
    } catch { /* noop */ }
  }, [activeSectionId, previewUrl]);

  // Escuchar mensajes del iframe (clic en sección → seleccionar)
  useEffect(() => {
    if (!onSelectSectionFromCanvas) return;
    const handler = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      // Validar origen si es posible: el del sitio del lienzo o uno de desarrollo
      if (e.origin && e.origin !== origenLienzo(previewUrl) && !ALLOWED_SITE_ORIGINS.includes(e.origin)) return;
      if (e.data.type === 'goadmin:select' && typeof e.data.sectionId === 'string') {
        const enlace = e.data.enlace === true;
        onSelectSectionFromCanvas(e.data.sectionId, {
          enlace,
          ...(enlace && typeof e.data.href === 'string' ? { href: e.data.href.slice(0, 512) } : {}),
          ...(enlace && typeof e.data.texto === 'string' ? { texto: e.data.texto.slice(0, 120) } : {}),
          ...(Number.isInteger(e.data.productoId) && e.data.productoId > 0 ? { productoId: e.data.productoId as number } : {}),
        });
      }
      // Estado vacío del lienzo: «Quitar sección». «Ir a …» es un enlace normal del sitio.
      if (e.data.type === 'goadmin:accion' && typeof e.data.sectionId === 'string' && e.data.accion === 'quitar') {
        onAccionSeccion?.(e.data.sectionId, 'quitar');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSelectSectionFromCanvas, onAccionSeccion, previewUrl]);

  // Construir URL con ?preview=1 para activar el PreviewBridge del sitio
  const previewUrlWithFlag = previewUrl
    ? (() => {
        try {
          const url = new URL(previewUrl);
          url.searchParams.set('preview', '1');
          return url.toString();
        } catch {
          return previewUrl;
        }
      })()
    : null;

  if (!previewUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center space-y-3 max-w-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
            <Globe className="h-8 w-8 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            {t('noPreviewTitle')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('noPreviewDesc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-gray-200 dark:bg-gray-800 overflow-hidden">
      {/* URL Bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-800 rounded-md text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
          <Globe className="h-3 w-3" />
          <span className="min-w-0 break-words">{previewUrl}</span>
        </div>
      </div>

      {/* Preview Container */}
      <div className="flex-1 flex items-start justify-center p-4 overflow-auto">
        <div
          className={cn(
            'bg-white shadow-2xl rounded-lg overflow-hidden transition-all duration-300 relative dark:bg-gray-800',
            devicePreview !== 'desktop' && 'border border-gray-300 dark:border-gray-600'
          )}
          style={{
            width,
            maxWidth: '100%',
            height: devicePreview === 'desktop' ? '100%' : '85vh',
          }}
        >
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col gap-3 p-4 bg-white z-10 dark:bg-gray-800">
              <Skeleton className="h-8 w-3/4 rounded" />
              <Skeleton className="h-64 w-full rounded-lg" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
              </div>
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          )}

          {/* Error State */}
          {hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10 dark:bg-gray-900">
              <div className="text-center space-y-2">
                <AlertCircle className="h-8 w-8 text-orange-500 mx-auto dark:text-orange-400" />
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {t('loadError')}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t('loadErrorHint')}
                </p>
              </div>
            </div>
          )}

          <iframe
            ref={iframeRef}
            key={refreshKey}
            src={previewUrlWithFlag ?? undefined}
            className="w-full h-full border-0"
            onLoad={() => {
              setIsLoading(false);
              setHasError(false);
              // Reenviar secciones tras recarga del iframe
              lastSentSections.current = '';
              ultimoAjustes.current = '';
              setTimeout(() => {
                sendPreviewMessage();
                enviarAjustes();
                const seleccion = seleccionActual.current;
                if (seleccion && iframeRef.current?.contentWindow) {
                  try {
                    const targetOrigin = previewUrl ? new URL(previewUrl).origin : '*';
                    iframeRef.current.contentWindow.postMessage({ type: 'goadmin:select', sectionId: seleccion }, targetOrigin);
                  } catch { /* noop */ }
                }
              }, 200);
            }}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            title={t('iframeTitle')}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </div>
  );
}
