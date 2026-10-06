'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { clasesBoton } from '@/components/kit';
import { escalaVista, origenDe, urlVistaEnVivo } from './dispositivos';
import { useTextosComun } from './textos';

/**
 * Vista del sitio con contenido real (Figma A/07f): el borrador V2 pintado por
 * el propio sitio público en un iframe (`url` con el token de vista previa que
 * da la API V2), escalado al ancho disponible. Los colores, fuentes y botones
 * del CLIENTE solo existen aquí dentro: nunca tiñen el cromo del ERP.
 *
 * - `ajustes` y `tema`: estilo en edición sin guardar; se envían como
 *   `{ type: 'goadmin:settings', ajustes, menuEncabezado, tema }` (el mismo
 *   mensaje que el lienzo del editor) al ORIGEN de `url`, nunca a `*`; cuando
 *   el sitio avisa `goadmin:ready`, se le reenvían. Para que el sitio los
 *   aplique, `enVivo` abre la dirección en vivo (`urlVistaEnVivo`).
 * - `interactivo=false` (por defecto): miniatura sin foco ni clics (Resumen,
 *   tarjetas). `true` en Diseño y el asistente.
 * - Estados: cargando (esqueleto), error con «Reintentar», vacía (sin url).
 */
export interface SitePreviewProps {
  /** URL de la vista previa (borrador con token) o del sitio publicado; `null` = vacía. */
  url: string | null;
  /** Ancho del viewport simulado (1440, 1024, 390). */
  anchoViewport?: number;
  /** Alto del viewport simulado; con `alto="contenedor"` ocupa el alto del padre. */
  altoViewport?: number | 'contenedor';
  /** Estilo en edición que el sitio aplica sin guardar. */
  ajustes?: unknown;
  menuEncabezado?: unknown;
  /** Estilo general V2 en edición (`temaParaLienzo`): fuentes, redondeo, botón y movimiento. */
  tema?: unknown;
  /**
   * Abre la dirección en vivo (`urlVistaEnVivo`: `?preview=1`, y el marco interior de la vista
   * previa del borrador) para que el sitio aplique `ajustes` y `tema`. Fijo por pantalla: si
   * dependiera de que llegue el estilo, el iframe se recargaría al llegar.
   */
  enVivo?: boolean;
  interactivo?: boolean;
  /** Título accesible del iframe. */
  titulo?: string;
  /** Texto del estado vacío. */
  textoVacio?: string;
  /** Cambia para forzar la recarga del iframe (tras guardar). */
  claveRecarga?: string | number;
  className?: string;
}

const ESPERA_ENVIO_MS = 150;

export function SitePreview({
  url,
  anchoViewport = 1440,
  altoViewport = 900,
  ajustes,
  menuEncabezado,
  tema,
  enVivo = false,
  interactivo = false,
  titulo,
  textoVacio,
  claveRecarga,
  className,
}: SitePreviewProps) {
  const tx = useTextosComun();
  const contenedor = useRef<HTMLDivElement | null>(null);
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const [anchoDisponible, setAnchoDisponible] = useState(0);
  const [altoDisponible, setAltoDisponible] = useState(0);
  const [cargando, setCargando] = useState(!!url);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const medir = () => {
      setAnchoDisponible(el.clientWidth);
      setAltoDisponible(el.clientHeight);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setCargando(!!url);
    setError(false);
  }, [url, claveRecarga, intento]);

  const src = enVivo ? urlVistaEnVivo(url) : url;
  const origen = origenDe(src);
  const enviarAjustes = useCallback(() => {
    const ventana = iframe.current?.contentWindow;
    if (!ventana || !origen || (ajustes === undefined && tema === undefined)) return;
    ventana.postMessage(
      { type: 'goadmin:settings', ajustes: ajustes ?? {}, menuEncabezado: menuEncabezado ?? null, ...(tema ? { tema } : {}) },
      origen,
    );
  }, [ajustes, menuEncabezado, tema, origen]);

  useEffect(() => {
    if (cargando) return;
    const temporizador = setTimeout(enviarAjustes, ESPERA_ENVIO_MS);
    return () => clearTimeout(temporizador);
  }, [cargando, enviarAjustes]);

  // El sitio escucha después de hidratar (puede ser después de `onLoad`): al avisar
  // `goadmin:ready` se le reenvía el estilo. Solo de este iframe y de su origen.
  const enviarRef = useRef(enviarAjustes);
  enviarRef.current = enviarAjustes;
  useEffect(() => {
    if (!origen) return;
    const alRecibir = (e: MessageEvent) => {
      if (e.origin !== origen || e.source !== iframe.current?.contentWindow) return;
      if ((e.data as { type?: unknown } | null)?.type === 'goadmin:ready') enviarRef.current();
    };
    window.addEventListener('message', alRecibir);
    return () => window.removeEventListener('message', alRecibir);
  }, [origen]);

  const escala = escalaVista(anchoDisponible, anchoViewport);
  const altoIframe = altoViewport === 'contenedor' ? (escala > 0 ? altoDisponible / escala : altoDisponible) : altoViewport;
  const etiqueta = titulo ?? tx('vistaPrevia.titulo');

  return (
    <div
      ref={contenedor}
      className={cn('relative w-full overflow-hidden bg-subtle', altoViewport === 'contenedor' && 'h-full', className)}
      style={altoViewport === 'contenedor' ? undefined : { height: anchoDisponible ? altoViewport * escala : undefined, aspectRatio: anchoDisponible ? undefined : `${anchoViewport} / ${altoViewport}` }}
    >
      {!url ? (
        <div className="flex h-full min-h-32 items-center justify-center p-4 text-center text-[13px] leading-[18px] text-fg-secondary">
          {textoVacio ?? tx('vistaPrevia.vacia')}
        </div>
      ) : error ? (
        <div role="alert" className="flex h-full min-h-32 flex-col items-center justify-center gap-3 p-4 text-center">
          <TriangleAlert aria-hidden="true" className="size-5 text-danger-text" strokeWidth={1.5} />
          <p className="text-[13px] leading-[18px] text-fg-secondary">{tx('vistaPrevia.error')}</p>
          <button type="button" onClick={() => setIntento((n) => n + 1)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {tx('vistaPrevia.reintentar')}
          </button>
        </div>
      ) : (
        <>
          <iframe
            key={`${src}|${claveRecarga ?? ''}|${intento}`}
            ref={iframe}
            src={src ?? undefined}
            title={etiqueta}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            tabIndex={interactivo ? 0 : -1}
            aria-hidden={interactivo ? undefined : true}
            onLoad={() => setCargando(false)}
            onError={() => setError(true)}
            className={cn('absolute left-0 top-0 origin-top-left border-0 bg-surface', !interactivo && 'pointer-events-none')}
            style={{ width: anchoViewport, height: altoIframe, transform: `scale(${escala})` }}
          />
          {cargando && (
            <div className="absolute inset-0 flex flex-col gap-3 bg-surface p-4" aria-busy="true">
              <span className="sr-only">{tx('vistaPrevia.cargando')}</span>
              <Skeleton className="h-6 w-1/3 rounded-md" />
              <Skeleton className="h-1/3 w-full rounded-lg" />
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
