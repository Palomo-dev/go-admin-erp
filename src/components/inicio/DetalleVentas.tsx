'use client';

/**
 * Detalle de «Ventas del periodo» (Figma 448:196680 diálogo en escritorio,
 * 448:205745 hoja inferior en móvil — `PanelAdaptable`).
 *
 * Anotación del diseño (§B.2): antes abrir un KPI volvía a lanzar las 41
 * consultas del dashboard y dejaba un intervalo de 30 s corriendo en paralelo
 * al de la página. Aquí se usa la MISMA lectura de la tarjeta (periodo y
 * sucursal ya aplicados) y se refresca una vez al abrirse, sin intervalo.
 *
 * Reubica lo que mostraban el detalle viejo (`KpiDetailDialog`) y la tarjeta
 * anterior: total y variación frente al periodo anterior, desglose por canal
 * (una sucursal) o por sucursal («Todas»), transacciones, ticket medio,
 * devoluciones, la gráfica actual/anterior, «Exportar CSV» y «Ver ventas».
 */
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Download, TrendingUp } from 'lucide-react';
import { PanelAdaptable, StatusBadge, clasesBoton } from '@/components/kit';
import { formatDateInTz, plainDateToInstant } from '@/lib/utils/dateDisplay';
import { desgloseVentas } from '@/lib/dashboard/ventasInicio';
import { csvVentasPeriodo } from '@/lib/dashboard/serieInicio';
import type { FechasPeriodo, PeriodoInicio } from '@/lib/dashboard/periodo';
import { GraficoVentas } from './GraficoVentas';
import { formatoEntero, formatoVariacion } from './useLecturaInicio';
import { CLAVE_PERIODO, claveComparacion, clavesLeyenda } from './textosPeriodo';
import { CANALES_CONOCIDOS, vistaVentas, type DatosVentas } from './vistaVentas';

export interface DetalleVentasProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  datos: DatosVentas;
  periodo: PeriodoInicio;
  fechas: FechasPeriodo | null;
  alcance?: string;
  zona: string;
  /** Se llama una vez cada vez que se abre (recarga silenciosa). */
  onAbrir?: () => void;
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[13px] leading-[18px] text-fg-secondary">{etiqueta}</dt>
      <dd className="text-base font-semibold leading-[22px] text-fg tabular-nums">{valor}</dd>
    </div>
  );
}

export function DetalleVentas({ abierto, onAbiertoChange, datos, periodo, fechas, alcance, zona, onAbrir }: DetalleVentasProps) {
  const t = useTranslations('home.ventasPeriodo');
  const tHome = useTranslations('home');
  const locale = useLocale();
  const v = vistaVentas(datos, locale, zona);
  const leyenda = clavesLeyenda(periodo);
  const comparacion = claveComparacion(periodo);

  // «Se actualiza al abrirse; no vuelve a consultar cada 30 s».
  const abrirRef = useRef(onAbrir);
  abrirRef.current = onAbrir;
  useEffect(() => {
    if (abierto) abrirRef.current?.();
  }, [abierto]);

  const dia = (d: string) => formatDateInTz(plainDateToInstant(d, zona), zona, { locale, day: 'numeric', month: 'short' });
  const nombrePeriodo =
    periodo === 'personalizado' && fechas ? `${dia(fechas.fechaInicio)} — ${dia(fechas.fechaFin)}` : tHome(`periods.${CLAVE_PERIODO[periodo]}`);
  const descripcion = [nombrePeriodo, alcance, v.moneda].filter(Boolean).join(' · ');

  const desglose = v.moneda ? desgloseVentas(datos.actual?.por_canal, datos.actual?.por_sucursal, datos.unaSucursal) : null;
  const nombreDesglose = (clave: string, tipo: 'canal' | 'sucursal') => {
    if (clave === 'otros') return t('otros');
    if (tipo === 'canal') return CANALES_CONOCIDOS.includes(clave) ? t(`canales.${clave}`) : t('otroCanal');
    return datos.sucursales?.[clave] ?? t('sucursalSinNombre', { id: clave });
  };

  const exportar = () => {
    const csv = csvVentasPeriodo(v.puntos, {
      punto: t(v.granularidad === 'hora' ? 'csv.hora' : 'csv.dia'),
      actual: t(`leyenda.${leyenda.actual}`),
      anterior: t(`leyenda.${leyenda.anterior}`),
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pie = (
    <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center">
      <p className="flex-1 text-[13px] leading-[18px] text-fg-secondary">{t('seActualizaAlAbrir')}</p>
      <div className="flex gap-2 max-sm:flex-col">
        {v.puntos.length > 0 && v.moneda && (
          <button type="button" onClick={exportar} className={clasesBoton({ variante: 'secundario', className: 'max-sm:hidden' })}>
            <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('exportarCsv')}
          </button>
        )}
        {datos.hrefVentas && (
          <Link href={datos.hrefVentas} className={clasesBoton({ variante: 'primario', anchoCompleto: true, className: 'sm:w-auto' })}>
            {t('verVentas')}
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={descripcion}
      icono={TrendingUp}
      ancho={672}
      pie={pie}
    >
      <div className="flex flex-col gap-4" data-detalle="ventas">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[28px] font-semibold leading-9 tracking-[-0.4px] text-fg tabular-nums">
            {v.moneda ? v.importe(v.neto) : t('variasMonedas')}
          </p>
          {v.delta !== null && (
            <StatusBadge estado="variacion" etiqueta={formatoVariacion(v.delta, locale)} tono={v.delta >= 0 ? 'exito' : 'peligro'} apariencia="suave" />
          )}
          {v.moneda && (
            <p className="text-sm text-fg-secondary">
              {v.netoAnterior > 0
                ? t('frenteConValor', { frente: t(`frente.${comparacion.clave}`, comparacion.params), valor: v.importe(v.netoAnterior) })
                : t('sinBase')}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {desglose?.filas.map((f) => <Cifra key={f.clave} etiqueta={nombreDesglose(f.clave, desglose.tipo)} valor={v.importe(f.total)} />)}
          <Cifra etiqueta={t('transacciones')} valor={formatoEntero(Number(datos.actual?.ventas_cobradas) || 0, locale)} />
          {v.moneda && <Cifra etiqueta={t('ticketMedio')} valor={v.importe(Number(datos.actual?.ticket_promedio) || 0)} />}
          {v.moneda && Number(datos.actual?.reintegros) > 0 && (
            <Cifra etiqueta={t('devoluciones')} valor={`−${v.importe(Number(datos.actual?.reintegros))}`} />
          )}
        </dl>

        {v.hayGrafica ? (
          <>
            <GraficoVentas
              puntos={v.puntos}
              etiqueta={v.etiqueta}
              importe={v.importe}
              leyendaActual={t(`leyenda.${leyenda.actual}`)}
              leyendaAnterior={t(`leyenda.${leyenda.anterior}`)}
              titulo={t('grafica')}
              className="h-56 w-full"
            />
            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[13px] leading-[18px] text-fg-secondary">
              <span>— {t(`leyenda.${leyenda.actual}`)}</span>
              <span>- - {t(`leyenda.${leyenda.anterior}`)}</span>
              <span className="flex-1" />
              <span className="tabular-nums">{v.rango}</span>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-fg-secondary">{v.moneda ? t('sinGrafica') : t('sinGraficaMonedas')}</p>
        )}
      </div>
    </PanelAdaptable>
  );
}
