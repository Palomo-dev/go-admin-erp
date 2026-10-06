'use client';

/**
 * Tarjeta del sitio del Resumen (Figma A/02a escritorio y A/02f móvil):
 * miniatura con el sitio real, estado de publicación, dirección real
 * («Dominio principal · también responde en tu-marca.goadmin.io»), «Copiar
 * enlace», «Código QR», «Ver sitio», plantilla, última publicación, cambios en
 * borrador, «Publicar cambios» y «Revisar cambios». En móvil: miniatura a lo
 * ancho, estado, host y «Ver sitio» + «Compartir».
 */
import { Copy, ExternalLink, History, QrCode, Send, Share2 } from 'lucide-react';
import { FilaDato, ListaDatos, clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { PublishStatusBadge } from '../ui/PublishStatusBadge';
import { SitePreview } from '../ui/SitePreview';
import type { EstadoPublicacion } from '../ui/estadoPublicacion';
import type { SitioDelResumen } from '@/lib/website/resumenSitio';
import { listaNatural, nombresAreas } from './formatoResumen';
import { useTextosResumen } from './textos';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';

export interface TarjetaSitioProps {
  sitio: SitioDelResumen;
  estado: EstadoPublicacion;
  /** «Noir Omakase · restaurante». */
  plantilla: string | null;
  /** «3 oct., 6:40 p. m. · Ana Gómez». */
  ultimaPublicacion: string | null;
  puedePublicar: boolean;
  publicando: boolean;
  onPublicar: () => void;
  onRevisar: () => void;
  onCopiar: () => void;
  onQr: () => void;
  onCompartir: () => void;
}

export function TarjetaSitio({
  sitio,
  estado,
  plantilla,
  ultimaPublicacion,
  puedePublicar,
  publicando,
  onPublicar,
  onRevisar,
  onCopiar,
  onQr,
  onCompartir,
}: TarjetaSitioProps) {
  const t = useTextosResumen();
  const cambios = sitio.cambiosSinPublicar;
  const areas = listaNatural(
    nombresAreas(cambios.areas, (tipo) => t(`resumen.areas.${tipo}`)),
    (lista, ultimo) => t('resumen.areas.y', { lista, ultimo }),
  );
  const motivoPublicar = !puedePublicar ? t('resumen.sinPermisoPublicar') : cambios.cantidad === 0 ? t('resumen.revisar.vacio') : undefined;
  const botonSecundario = clasesBoton({ variante: 'secundario', tamano: 'sm' });

  return (
    <section aria-labelledby="tarjeta-sitio-host" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 lg:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="w-full shrink-0 overflow-hidden rounded-lg border border-line md:w-[188px]">
          <SitePreview
            url={sitio.url}
            anchoViewport={1440}
            altoViewport={900}
            titulo={sitio.host ? t('resumen.tarjeta.vistaPrevia', { host: sitio.host }) : undefined}
            textoVacio={t('resumen.tarjeta.sinDireccion')}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <PublishStatusBadge estado={estado} className="self-start" />
          <h2 id="tarjeta-sitio-host" className="truncate text-lg font-semibold leading-7 text-fg">
            {sitio.host ?? t('resumen.tarjeta.titulo')}
          </h2>
          <p className="hidden text-[13px] leading-[18px] text-fg-secondary md:block">
            {sitio.host
              ? [
                  sitio.hostEsPropio ? t('resumen.tarjeta.dominioPrincipal') : t('resumen.tarjeta.direccionGratis'),
                  sitio.subdominioHost ? t('resumen.tarjeta.tambienResponde', { host: sitio.subdominioHost }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t('resumen.tarjeta.sinDireccion')}
          </p>
          {sitio.url && (
            <>
              {/* Escritorio: copiar, QR y ver sitio. */}
              <div className="hidden flex-wrap items-center gap-2 md:flex">
                <button type="button" onClick={onCopiar} className={botonSecundario}>
                  <Copy aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {t('resumen.tarjeta.copiarEnlace')}
                </button>
                <button type="button" onClick={onQr} className={botonSecundario}>
                  <QrCode aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {t('resumen.tarjeta.codigoQr')}
                </button>
                <a href={sitio.url} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                  <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {t('resumen.tarjeta.verSitio')}
                </a>
              </div>
              {/* Móvil (A/02f): dos botones a medias. */}
              <div className="grid grid-cols-2 gap-2 md:hidden">
                <a href={sitio.url} target="_blank" rel="noopener noreferrer" className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-full')}>
                  <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {t('resumen.tarjeta.verSitio')}
                </a>
                <button type="button" onClick={onCompartir} className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-full')}>
                  <Share2 aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {t('resumen.tarjeta.compartir')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="hidden flex-col gap-4 md:flex">
        <ListaDatos>
          <FilaDato etiqueta={t('resumen.tarjeta.plantilla')} valor={plantilla ?? '—'} />
          <FilaDato etiqueta={t('resumen.tarjeta.ultimaPublicacion')} valor={ultimaPublicacion ?? t('resumen.tarjeta.nunca')} />
          <FilaDato
            etiqueta={t('resumen.tarjeta.cambiosBorrador')}
            valor={cambios.cantidad > 0 ? `${cambios.cantidad} · ${areas}` : t('resumen.tarjeta.sinCambios')}
          />
        </ListaDatos>
        {sitio.v2Id && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onPublicar}
              disabled={!puedePublicar || cambios.cantidad === 0 || publicando}
              title={motivoPublicar}
              aria-busy={publicando || undefined}
              className={clasesBoton({ variante: 'primario', tamano: 'md' })}
            >
              <Send aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('resumen.tarjeta.publicarCambios')}
            </button>
            <button type="button" onClick={onRevisar} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
              <History aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('resumen.tarjeta.revisarCambios')}
            </button>
            {motivoPublicar && cambios.cantidad > 0 && <span className="text-xs text-fg-secondary">{motivoPublicar}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
