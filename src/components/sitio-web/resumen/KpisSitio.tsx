'use client';

/**
 * KPIs del sitio en los últimos 7 días (Figma A/02a, A/02b y A/02f): visitas
 * con su variación, pedidos web (con enlace a POS › Pedidos online), reservas
 * web (solo restaurantes, con enlace a POS › Reservas de mesas) y conversión.
 * Escritorio: `KpiStrip` de `StatCard`; móvil: `KpiCompacto` 2×2. Sin datos
 * (sitio sin publicar o sin acceso a ventas): «—» con el motivo.
 */
import { KpiCompacto, KpiStrip, StatCard, type CifraCompacta } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { ICONO_KPI_SITIO } from '../ui/iconosSitio';
import { variacionVisitas, type KpisSitio as Kpis } from '@/lib/website/resumenSitio';
import { formatoEntero, formatoPorcentaje, partesVariacion } from './formatoResumen';
import { useTextosResumen } from './textos';

export interface KpisSitioProps {
  kpis: Kpis;
  /** Primera vez (A/02b): tres tarjetas vacías, sin conversión. */
  primeraVez?: boolean;
  esRestaurante: boolean;
}

export function KpisSitio({ kpis, primeraVez, esRestaurante }: KpisSitioProps) {
  const t = useTextosResumen();
  const locale = useLocaleIntl();
  const vacio = t('resumen.kpis.sinDato');
  const motivo = kpis.disponible === 'sin_acceso' ? t('resumen.kpis.sinAcceso') : t('resumen.kpis.disponibleAlPublicar');
  const hay = kpis.disponible === 'si' && !primeraVez;
  const num = (n: number | null) => (hay && n !== null ? formatoEntero(n, locale) : vacio);

  const variacion = hay ? variacionVisitas(kpis.visitas, kpis.visitasAnterior) : null;
  const pv = variacion !== null ? partesVariacion(variacion, locale) : null;
  const conReservas = esRestaurante || primeraVez;

  const tarjetas = [
    <StatCard
      key="visitas"
      icono={ICONO_KPI_SITIO.visitas}
      etiqueta={t('resumen.kpis.visitas')}
      valor={num(kpis.visitas)}
      detalle={!hay ? motivo : pv ? t('resumen.kpis.variacion', pv) : undefined}
      tendencia={variacion === null ? undefined : variacion >= 0 ? 'sube' : 'baja'}
      tono={variacion === null ? 'neutro' : variacion >= 0 ? 'exito' : 'peligro'}
      href={hay && kpis.hrefAnalitica ? kpis.hrefAnalitica : undefined}
    />,
    <StatCard
      key="pedidos"
      icono={ICONO_KPI_SITIO.pedidos}
      etiqueta={t('resumen.kpis.pedidos')}
      valor={num(kpis.pedidos)}
      detalle={!hay ? motivo : kpis.hrefPedidos ? t('resumen.kpis.verPedidos') : undefined}
      href={hay && kpis.hrefPedidos ? kpis.hrefPedidos : undefined}
    />,
    ...(conReservas
      ? [
          <StatCard
            key="reservas"
            icono={ICONO_KPI_SITIO.reservas}
            etiqueta={t('resumen.kpis.reservas')}
            valor={num(kpis.reservas)}
            detalle={!hay ? motivo : kpis.hrefReservas ? t('resumen.kpis.verReservas') : undefined}
            href={hay && kpis.hrefReservas ? kpis.hrefReservas : undefined}
          />,
        ]
      : []),
    ...(primeraVez
      ? []
      : [
          <StatCard
            key="conversion"
            icono={ICONO_KPI_SITIO.conversion}
            etiqueta={t('resumen.kpis.conversion')}
            valor={hay && kpis.conversion !== null ? formatoPorcentaje(kpis.conversion, locale) : vacio}
            detalle={!hay ? motivo : esRestaurante ? t('resumen.kpis.conversionDetalle') : t('resumen.kpis.conversionDetallePedidos')}
          />,
        ]),
  ];

  const cifras: CifraCompacta[] = [
    { id: 'visitas', icono: ICONO_KPI_SITIO.visitas, etiqueta: t('resumen.kpis.visitasCorta'), valor: num(kpis.visitas), href: hay ? kpis.hrefAnalitica ?? undefined : undefined },
    { id: 'pedidos', icono: ICONO_KPI_SITIO.pedidos, etiqueta: t('resumen.kpis.pedidosCorta'), valor: num(kpis.pedidos), href: hay ? kpis.hrefPedidos ?? undefined : undefined },
    ...(conReservas ? [{ id: 'reservas', icono: ICONO_KPI_SITIO.reservas, etiqueta: t('resumen.kpis.reservasCorta'), valor: num(kpis.reservas), href: hay ? kpis.hrefReservas ?? undefined : undefined }] : []),
    ...(primeraVez
      ? []
      : [{ id: 'conversion', icono: ICONO_KPI_SITIO.conversion, etiqueta: t('resumen.kpis.conversion'), valor: hay && kpis.conversion !== null ? formatoPorcentaje(kpis.conversion, locale) : vacio }]),
  ];

  return (
    <>
      <div className="hidden lg:block">
        <KpiStrip columnas={tarjetas.length as 3 | 4} etiqueta={t('resumen.kpis.etiqueta')}>
          {tarjetas}
        </KpiStrip>
      </div>
      <div className="lg:hidden">
        <KpiCompacto cifras={cifras} etiqueta={t('resumen.kpis.etiqueta')} etiquetaNatural className="grid grid-cols-2 gap-y-2 border-0 bg-transparent [&>*]:min-w-0 [&>*]:border-l-0 [&>*]:px-0" />
      </div>
    </>
  );
}
