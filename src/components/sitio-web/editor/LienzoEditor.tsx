'use client';

/**
 * Lienzo del editor (Figma A/05a, figma-estilo/02): el sitio real dentro de un marco de
 * navegador con la dirección pública, al ancho elegido (1440 · 1024 · 768 · 390) y escalado para caber
 * sin desbordar. Encima, la etiqueta azul de la selección («Carta destacada · clic para editar»;
 * con tipografía propia, «… · tipografía propia · vista previa en vivo»). Los cambios llegan al
 * sitio por `usePuenteLienzo` sin guardar.
 *
 * Estados: cargando (esqueleto con la forma de la página), error de carga y sin dirección.
 */
import { useEffect, useRef, useState } from 'react';
import { Globe, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { EmptyState, Skeleton, clasesBoton } from '@/components/kit';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import type { AvisoFaltanDatos } from '@/lib/services/website/fuentesDatosSecciones';
import { DevicePreviewFrame } from '@/components/sitio-web/ui/DevicePreviewFrame';
import {
  VIEWPORT_DISPOSITIVO,
  esMarcoDeAparato,
  escalaVista,
  type DispositivoVista,
} from '@/components/sitio-web/ui/dispositivos';
import { usePuenteLienzo, type DetalleClic, type OpcionesPuente } from './usePuenteLienzo';
import { useTextosEditor } from './textos';

export interface LienzoEditorProps {
  url: string | null;
  host: string | null;
  dispositivo: DispositivoVista;
  recarga: number;
  secciones: readonly WebsitePageSection[];
  ajustes: OpcionesPuente['ajustes'];
  seleccion: string | null;
  /** Texto de la etiqueta azul sobre la selección; `null` sin selección. */
  etiquetaSeleccion: string | null;
  avisoSeccion?: (s: WebsitePageSection) => AvisoFaltanDatos | null;
  onClic?: (id: string, detalle: DetalleClic) => void;
  onQuitar?: (id: string) => void;
  cartaSede?: { branchId: number; cambios: unknown[] } | null;
  /** Viendo una versión del historial: banda superior con «Volver al borrador» y «Restaurar». */
  version?: { titulo: string; onVolver: () => void; onRestaurar?: () => void } | null;
  className?: string;
}

/** Borde y relleno del marco de aparato (p-2 + borde de 1 px a cada lado). */
const MARCO_APARATO = 18;
/** Alto visible del lienzo en computador y portátil (el sitio se desplaza dentro). */
const ALTO_LIENZO_ESCRITORIO = 760;

/**
 * Medidas del lienzo para un dispositivo en `anchoDisponible` px. Computador y portátil se
 * escalan para caber; tableta y celular se pintan en su marco a tamaño real si caben y, si no,
 * se reducen igual. El celular también: a 1024 px quedan unos 336 px de lienzo para un marco
 * de 408 (y 256 con el panel Estilo abierto), así que 390 no siempre cabe.
 * Puro: lo prueban los tests.
 */
export function medidasLienzo(
  dispositivo: DispositivoVista,
  anchoDisponible: number,
): { escala: number; anchoMarco: number; alto: number } {
  const { ancho, alto } = VIEWPORT_DISPOSITIVO[dispositivo];
  if (esMarcoDeAparato(dispositivo)) {
    const escala = escalaVista(anchoDisponible - MARCO_APARATO, ancho);
    return { escala, anchoMarco: Math.round(ancho * escala) + MARCO_APARATO, alto };
  }
  const escala = escalaVista(anchoDisponible, ancho);
  return { escala, anchoMarco: Math.round(ancho * escala), alto: ALTO_LIENZO_ESCRITORIO };
}

export function LienzoEditor(p: LienzoEditorProps) {
  const t = useTextosEditor();
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const contenedor = useRef<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const { alCargar } = usePuenteLienzo({
    iframe,
    url: p.url,
    secciones: p.secciones,
    ajustes: p.ajustes,
    seleccion: p.seleccion,
    avisoSeccion: p.avisoSeccion,
    onClic: p.onClic,
    onQuitar: p.onQuitar,
    cartaSede: p.cartaSede,
  });

  useEffect(() => {
    const el = contenedor.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((e) => setAncho(e[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setCargando(true);
    setFallo(false);
  }, [p.recarga, p.url]);

  const viewport = VIEWPORT_DISPOSITIVO[p.dispositivo];
  const { escala, anchoMarco, alto } = medidasLienzo(p.dispositivo, ancho);

  const src = (() => {
    if (!p.url) return null;
    try {
      const u = new URL(p.url);
      u.searchParams.set('preview', '1');
      return u.toString();
    } catch {
      return p.url;
    }
  })();

  if (!src) {
    return (
      <div className={cn('flex min-h-0 flex-1 items-center justify-center bg-canvas p-6', p.className)}>
        <EmptyState icono={Globe} titulo={t('lienzo.sinDireccionTitulo')} descripcion={t('lienzo.sinDireccionDescripcion')} />
      </div>
    );
  }

  return (
    <section aria-label={t('lienzo.etiqueta')} className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-canvas', p.className)}>
      {p.version && (
        <div className="flex items-center gap-3 border-b border-line-info bg-info-subtle px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-info-text">{p.version.titulo}</p>
          {p.version.onRestaurar && (
            <button type="button" onClick={p.version.onRestaurar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('historial.restaurar')}
            </button>
          )}
          <button type="button" onClick={p.version.onVolver} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('historial.volverBorrador')}
          </button>
        </div>
      )}
      <div ref={contenedor} className="flex min-h-0 flex-1 justify-center overflow-auto p-6">
        <div className="relative" style={{ width: anchoMarco || '100%' }}>
          {p.etiquetaSeleccion && (
            <span
              aria-hidden="true"
              className="absolute -top-3 left-3 z-20 max-w-[90%] truncate rounded-md bg-brand px-2 py-0.5 text-xs font-medium text-fg-on-brand"
            >
              {p.etiquetaSeleccion}
            </span>
          )}
          <DevicePreviewFrame
            dispositivo={p.dispositivo}
            host={p.host}
            className={esMarcoDeAparato(p.dispositivo) ? 'max-w-none' : undefined}
          >
            <div className="relative overflow-hidden" style={{ height: alto * escala }}>
              {cargando && !fallo && (
                <div aria-busy="true" className="absolute inset-0 z-10 flex flex-col gap-3 bg-surface p-4">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-64 w-full rounded-lg" />
                  <div className="grid grid-cols-2 gap-3">
                    <Skeleton className="h-32 rounded-lg" />
                    <Skeleton className="h-32 rounded-lg" />
                  </div>
                </div>
              )}
              {fallo && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface p-6">
                  <EmptyState variante="error" icono={TriangleAlert} titulo={t('lienzo.errorTitulo')} descripcion={t('lienzo.errorDescripcion')} />
                </div>
              )}
              <iframe
                ref={iframe}
                key={p.recarga}
                src={src}
                title={t('lienzo.iframe')}
                sandbox="allow-scripts allow-same-origin allow-popups"
                onLoad={() => {
                  setCargando(false);
                  setFallo(false);
                  alCargar();
                }}
                onError={() => {
                  setCargando(false);
                  setFallo(true);
                }}
                className="origin-top-left border-0 bg-surface"
                style={{ width: viewport.ancho, height: alto, transform: escala !== 1 ? `scale(${escala})` : undefined }}
              />
            </div>
          </DevicePreviewFrame>
        </div>
      </div>
    </section>
  );
}
