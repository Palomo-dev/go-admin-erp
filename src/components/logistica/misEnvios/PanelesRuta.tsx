'use client';

/**
 * Panel derecho del computador (Figma «21 Logística» a/c): «Ruta de hoy» (mapa Leaflet, paradas y
 * «Abrir la ruta en Google Maps»), «Mi vehículo hoy» y «Dinero de hoy». Las mismas piezas sirven
 * para el domiciliario y para el supervisor (cambian los títulos).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Check, ExternalLink } from 'lucide-react';
import { StatusBadge, clasesBoton } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  enlaceRutaGoogleMaps,
  estadoCuadreJornada,
  numeroParada,
  pinesRuta,
  resumenJornada,
  resumenRuta,
  type GruposMisEnvios,
} from '@/lib/logistica/misEnvios';
import type { CuadreJornada, EnvioApp } from '@/lib/services/logistica/misEnviosService';
import { cn } from '@/utils/Utils';
import { MapaRutaDinamico } from './MapaRutaDinamico';
import { CabeceraVehiculo, FilaDocumento } from './PiezasVehiculo';
import type { MiVehiculo } from './useMiVehiculo';

const CLASE_PANEL = 'flex flex-col gap-3 rounded-xl border border-line bg-surface p-4';

export function PanelRutaDeHoy({
  grupos,
  envios,
  zonaDe,
  origen,
  onElegir,
}: {
  grupos: GruposMisEnvios<EnvioApp>;
  envios: readonly EnvioApp[];
  zonaDe: (e: EnvioApp) => string;
  origen?: { lat: number; lng: number; nombre: string } | null;
  onElegir?: (id: string) => void;
}) {
  const t = useTranslations('logistica.misEnvios');
  const locale = useLocaleIntl();
  const resumen = resumenRuta(grupos, envios);
  const pines = pinesRuta(grupos);
  const enlace = enlaceRutaGoogleMaps(grupos.pendientes);
  const hora = (v: string, zona: string) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: zona }).format(new Date(v));
  const entregados = [...grupos.entregados].sort((a, b) => (a.delivered_at ?? '').localeCompare(b.delivered_at ?? ''));
  const lugar = (e: EnvioApp) => e.barrio || e.delivery_address || e.shipment_number;

  return (
    <section className={CLASE_PANEL} aria-label={t('escritorio.rutaDeHoy')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{t('escritorio.rutaDeHoy')}</h2>
        {resumen.estado !== 'vacia' && (
          <StatusBadge estado="parada" etiqueta={t('escritorio.paradaDe', { n: resumen.parada, total: resumen.totalParadas })} tono="informacion" apariencia="contorno" />
        )}
      </div>
      {pines.length > 0 && (
        <MapaRutaDinamico pines={pines} origen={origen} etiqueta={t('mapa.etiqueta')} onElegir={onElegir} className="h-44 w-full overflow-hidden rounded-lg border border-line" />
      )}
      <ol className="flex flex-col gap-2 text-sm">
        {entregados.map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-fg-muted">
            <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-text">
              <Check className="size-3" strokeWidth={2} />
            </span>
            <span className="truncate">
              {lugar(e)} · {e.delivered_at ? t('escritorio.entregadoMin', { hora: hora(e.delivered_at, zonaDe(e)) }) : t('estados.delivered')}
            </span>
          </li>
        ))}
        {grupos.pendientes.map((e, i) => (
          <li key={e.id} className={cn('flex items-center gap-2', i === 0 ? 'font-medium text-fg' : 'text-fg-secondary')}>
            <span
              aria-hidden="true"
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                i === 0 ? 'bg-brand-action text-fg-on-brand' : 'bg-subtle text-fg-secondary',
              )}
            >
              {numeroParada(i, resumen.entregados)}
            </span>
            <span className="truncate">
              {lugar(e)}
              {e.promesa ? ` · ${hora(e.promesa, zonaDe(e))}` : ''}
              {(e.failed_attempts ?? 0) > 0 ? ` (${t('tarjeta.intento', { n: (e.failed_attempts ?? 0) + 1 })})` : ''}
            </span>
          </li>
        ))}
      </ol>
      {enlace && (
        <a href={enlace} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
          <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('mapa.abrirGoogle')}
        </a>
      )}
      <p className="text-xs text-fg-muted">{t('escritorio.notaMapa')}</p>
    </section>
  );
}

export function PanelVehiculo({ v, titulo, enlace }: { v: MiVehiculo; titulo: string; enlace?: { href: string; texto: string } | null }) {
  const t = useTranslations('logistica.misEnvios.vehiculo');
  if (v.estado !== 'listo') return null;
  return (
    <section className={CLASE_PANEL} aria-label={titulo}>
      <h2 className="text-base font-semibold text-fg">{titulo}</h2>
      {v.vehiculo ? (
        <>
          <CabeceraVehiculo v={v} compacta />
          {v.enviosConPlaca > 0 && <p className="text-xs text-fg-secondary">{t('placaCongelada', { n: v.enviosConPlaca })}</p>}
        </>
      ) : (
        <p className="text-sm text-fg-secondary">{t('sinVehiculo.descripcion')}</p>
      )}
      {(v.documentosVehiculo.length > 0 || v.licencia) && (
        <ul className="flex flex-col gap-3">
          {[...v.documentosVehiculo, ...(v.licencia ? [v.licencia] : [])].map((d) => (
            <FilaDocumento key={d.clave} doc={d} />
          ))}
        </ul>
      )}
      {enlace && (
        <Link href={enlace.href} className="text-sm font-medium text-brand hover:underline">
          {enlace.texto}
        </Link>
      )}
    </section>
  );
}

export function PanelDinero({
  titulo,
  grupos,
  envios,
  hoy,
  zonaDe,
  ultimoCuadre,
  nota,
}: {
  titulo: string;
  grupos: GruposMisEnvios<EnvioApp>;
  envios: readonly EnvioApp[];
  hoy: string;
  zonaDe: (e: EnvioApp) => string;
  /** El último cuadre cerrado antes de hoy (null si no hay o no se pudo leer). */
  ultimoCuadre: CuadreJornada | null;
  nota: string;
}) {
  const t = useTranslations('logistica.misEnvios');
  const moneda = useMonedaOrganizacion();
  const resumen = resumenRuta(grupos, envios);
  const jornada = resumenJornada(envios, hoy, zonaDe);
  const otrosMedios = jornada.cobros.filter((c) => c.medio !== 'cash').reduce((s, c) => s + Math.round(c.total * 100), 0) / 100;
  const porCobrarEnvios = grupos.pendientes.filter((e) => Number(e.cod_amount) > 0 && (e.cod_status ?? 'pending') === 'pending').length;
  const estadoUltimo = ultimoCuadre ? estadoCuadreJornada(ultimoCuadre) : null;

  return (
    <section className={CLASE_PANEL} aria-label={titulo}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{titulo}</h2>
        {resumen.enMano > 0 && <StatusBadge estado="pendiente" etiqueta={t('escritorio.cuadrePendiente')} tono="advertencia" apariencia="contorno" />}
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-fg-secondary">{t('escritorio.dinero.enMano')}</dt>
          <dd className="text-base font-semibold text-fg">{moneda.formatear(resumen.enMano)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-fg-secondary">{t('escritorio.dinero.porCobrar', { n: porCobrarEnvios })}</dt>
          <dd className={cn('font-medium', resumen.aCobrar > 0 ? 'text-warning-text' : 'text-fg')}>{moneda.formatear(resumen.aCobrar)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-fg-secondary">{t('escritorio.dinero.otrosMedios')}</dt>
          <dd className="text-fg">{moneda.formatear(otrosMedios)}</dd>
        </div>
        {estadoUltimo && (estadoUltimo === 'cuadrado' || estadoUltimo === 'con_diferencia') && (
          <div className="flex justify-between gap-3">
            <dt className="text-fg-secondary">{t('escritorio.dinero.ultimoCuadre')}</dt>
            <dd className={estadoUltimo === 'cuadrado' ? 'text-success-text' : 'text-danger-text'}>{t(`escritorio.dinero.estado.${estadoUltimo}`)}</dd>
          </div>
        )}
      </dl>
      <p className="text-xs text-fg-muted">{nota}</p>
    </section>
  );
}
