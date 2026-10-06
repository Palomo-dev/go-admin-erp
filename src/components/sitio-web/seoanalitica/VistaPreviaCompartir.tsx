'use client';

/**
 * «Vista previa» de SEO y redes (Figma B/08-01 columna derecha y B/08-03 arriba):
 * cómo se ve el sitio en Google, al pegar el enlace en WhatsApp y en Facebook,
 * con el host REAL (dominio principal verificado o subdominio, resuelto en el
 * servidor). Escritorio: las tres apiladas y las pestañas llevan a cada una.
 * Móvil: una a la vez.
 *
 * Los colores de las tarjetas son del cromo del ERP (tokens): no imitan los
 * de cada red, solo su estructura.
 */
import { useRef, useState } from 'react';
import { SegmentedControl, Tarjeta } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { useTextosSeoAnalitica } from './textos';
import { ICONO_CANAL, ICONO_SECCION_SEO } from './iconosSeoAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';

export type RedVistaPrevia = 'google' | 'whatsapp' | 'facebook';
const REDES: readonly RedVistaPrevia[] = ['google', 'whatsapp', 'facebook'];

export interface VistaPreviaCompartirProps {
  host: string | null;
  titulo: string;
  descripcion: string;
  imagen: string | null;
  /** `una`: solo la red elegida (móvil). `todas`: apiladas (escritorio). */
  modo?: 'una' | 'todas';
  /** Sin la tarjeta contenedora (el móvil la pinta suelta). */
  sinTarjeta?: boolean;
  className?: string;
}

/** Icono de 14 px del canal (el mismo de la pestaña y de «De dónde llegan»). */
function IconoRed({ red }: { red: RedVistaPrevia }) {
  const Icono = ICONO_CANAL[red];
  return <Icono aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'shrink-0')} strokeWidth={TRAZO_ICONO} />;
}

function Imagen({ src, alto }: { src: string | null; alto: string }) {
  return (
    <div className={cn('flex w-full items-center justify-center overflow-hidden bg-subtle', alto)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen del cliente, de cualquier origen
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <ICONO_SECCION_SEO.imagen aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.fila, 'text-fg-muted')} strokeWidth={TRAZO_ICONO} />
      )}
    </div>
  );
}

export function TarjetaGoogle({ host, titulo, descripcion }: Pick<VistaPreviaCompartirProps, 'host' | 'titulo' | 'descripcion'>) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-3" data-testid="vista-google">
      <p className="truncate text-xs text-fg-secondary">{host ?? '—'}</p>
      <p className="line-clamp-2 text-base font-medium leading-snug text-link">{titulo}</p>
      <p className="line-clamp-3 text-[13px] leading-[18px] text-fg-secondary">{descripcion}</p>
    </div>
  );
}

export function TarjetaWhatsapp({ host, titulo, descripcion, imagen }: Omit<VistaPreviaCompartirProps, 'modo' | 'sinTarjeta' | 'className'>) {
  return (
    <div className="rounded-lg border border-line-success bg-success-subtle p-2" data-testid="vista-whatsapp">
      <div className="overflow-hidden rounded-md bg-surface">
        <Imagen src={imagen} alto="aspect-[1200/630]" />
        <div className="flex flex-col gap-0.5 p-2">
          <p className="truncate text-[13px] font-medium text-fg">{titulo}</p>
          <p className="truncate text-xs text-fg-secondary">{descripcion}</p>
          <p className="truncate text-xs text-fg-muted">{host ?? '—'}</p>
        </div>
      </div>
      {host && <p className="truncate px-1 pt-1.5 text-xs text-link">https://{host}</p>}
    </div>
  );
}

export function TarjetaFacebook({ host, titulo, imagen }: Pick<VistaPreviaCompartirProps, 'host' | 'titulo' | 'imagen'>) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface" data-testid="vista-facebook">
      <Imagen src={imagen} alto="aspect-[1200/630]" />
      <div className="flex flex-col gap-0.5 border-t border-line bg-subtle p-2.5">
        <p className="truncate text-[11px] uppercase tracking-wide text-fg-secondary">{host ?? '—'}</p>
        <p className="line-clamp-2 text-[13px] font-semibold text-fg">{titulo}</p>
      </div>
    </div>
  );
}

export function VistaPreviaCompartir({ host, titulo, descripcion, imagen, modo = 'todas', sinTarjeta, className }: VistaPreviaCompartirProps) {
  const t = useTextosSeoAnalitica();
  const [red, setRed] = useState<RedVistaPrevia>(modo === 'una' ? 'whatsapp' : 'google');
  const refs = useRef<Partial<Record<RedVistaPrevia, HTMLDivElement | null>>>({});
  const tituloVisible = titulo.trim() || t('seo.vista.tituloVacio');
  const descripcionVisible = descripcion.trim() || t('seo.vista.descripcionVacia');

  const elegir = (r: RedVistaPrevia) => {
    setRed(r);
    if (modo === 'todas') refs.current[r]?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };

  const tarjeta = (r: RedVistaPrevia) =>
    r === 'google' ? (
      <TarjetaGoogle host={host} titulo={tituloVisible} descripcion={descripcionVisible} />
    ) : r === 'whatsapp' ? (
      <TarjetaWhatsapp host={host} titulo={tituloVisible} descripcion={descripcionVisible} imagen={imagen} />
    ) : (
      <TarjetaFacebook host={host} titulo={tituloVisible} imagen={imagen} />
    );

  const contenido = (
    <div className={cn('flex flex-col gap-3', sinTarjeta && className)}>
      <SegmentedControl<RedVistaPrevia>
        opciones={REDES.map((r) => ({ valor: r, etiqueta: t(`seo.vista.${r}`), icono: ICONO_CANAL[r] }))}
        valor={red}
        onValorChange={elegir}
        etiqueta={t('seo.vista.pestanas')}
        tamano="sm"
        anchoCompleto={modo === 'una'}
      />
      {modo === 'una' ? (
        tarjeta(red)
      ) : (
        REDES.map((r) => (
          <div key={r} ref={(el) => void (refs.current[r] = el)} className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-fg-secondary">
              <IconoRed red={r} />
              {t(`seo.vista.${r}`)}
            </p>
            {tarjeta(r)}
          </div>
        ))
      )}
    </div>
  );

  if (sinTarjeta) return contenido;
  return (
    <Tarjeta
      titulo={t('seo.vista.titulo')}
      icono={ICONO_SECCION_SEO.vista}
      descripcion={host ? t('seo.vista.descripcion', { host }) : t('seo.vista.descripcionSinHost')}
      className={className}
    >
      {contenido}
    </Tarjeta>
  );
}
