'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Download, ListChecks } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  EmptyState,
  KpiStrip,
  PageHeader,
  Pagination,
  SearchInput,
  StatCard,
  clasesBoton,
  type ColumnaTabla,
} from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import {
  SIN_DATO,
  accionDe,
  celdasCsv,
  errorDePendiente,
  kpisDe,
  responsableDe,
  type FilaPendiente,
  type ResumenPendientes,
} from '@/lib/finanzas/pendientesContables';
import { PendientesContablesService } from './PendientesContablesService';
import { DetallePendiente } from './DetallePendiente';
import { useEtiquetasPendiente } from './useEtiquetasPendiente';

const OPCIONES_TAMANO = [5, 25, 50, 100] as const;
const LOTE_EXPORTAR = 200;

type Estado = 'cargando' | 'listo' | 'error';

function mesDe(fecha: string, locale: string): string {
  const [anio, mes] = fecha.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(anio, mes - 1, 15)),
  );
}

/**
 * Bandeja de pendientes contables: lo que no entró al mayor y por qué. Tres
 * estados distintos: con pendientes, sin pendientes y error de consulta. Un
 * error nunca se muestra como cero: los KPI quedan en «—».
 *
 * Desde la ronda 3 es la primera pestaña de «Salud contable»
 * (`/contabilidad/salud`): `incrustada` quita su cabecera, que pone la página.
 */
export function PendientesContablesPage({ incrustada = false }: { incrustada?: boolean } = {}) {
  const t = useTranslations('pendientesContables');
  const locale = useLocale();
  const permisos = usePermisosFinanzas();
  const { formatear } = useMonedaOrganizacion();
  const { formatDateTime } = useFormatDate();
  const { documento, dato } = useEtiquetasPendiente();

  const [estado, setEstado] = useState<Estado>('cargando');
  const [resumen, setResumen] = useState<ResumenPendientes | null>(null);
  const [revisadoEn, setRevisadoEn] = useState<Date | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [seleccion, setSeleccion] = useState<FilaPendiente | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const consulta = useRef(0);

  const cargar = useCallback(async () => {
    const turno = ++consulta.current;
    setEstado('cargando');
    try {
      const datos = await PendientesContablesService.listar({
        busqueda,
        limite: tamano,
        desplazamiento: (pagina - 1) * tamano,
      });
      if (turno !== consulta.current) return;
      setResumen(datos);
      setRevisadoEn(new Date());
      setEstado('listo');
    } catch (error) {
      if (turno !== consulta.current) return;
      console.error('No se pudieron consultar los pendientes contables:', error);
      setResumen(null);
      setEstado('error');
    }
  }, [busqueda, pagina, tamano]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const reintentar = async (fila: FilaPendiente) => {
    setReintentando(true);
    try {
      const { estado: resultado, aviso } = await PendientesContablesService.reintentar(fila.id);
      if (resultado === 'resuelto' || resultado === 'ya_resuelto') {
        toastSuccess(t('reintento.resuelto'));
        setSeleccion(null);
      } else {
        toastError(t(`reintento.${resultado}`), aviso ?? undefined);
      }
      await cargar();
    } catch (error) {
      console.error('No se pudo reintentar el pendiente:', error);
      const sinPermiso = String((error as { message?: unknown } | null)?.message ?? '').includes('sin_permiso');
      toastError(t(sinPermiso ? 'reintento.sinPermiso' : 'reintento.error'));
    } finally {
      setReintentando(false);
    }
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const filas: FilaPendiente[] = [];
      for (;;) {
        const lote = await PendientesContablesService.listar({
          busqueda,
          limite: LOTE_EXPORTAR,
          desplazamiento: filas.length,
        });
        filas.push(...lote.filas);
        if (lote.filas.length === 0 || filas.length >= lote.totalFiltradas) break;
      }
      const encabezado = ['documento', 'error', 'dato', 'responsable', 'antiguedad', 'valor'].map((c) => t(`csv.${c}`));
      const lineas = filas.map((f) =>
        [
          documento(f),
          t(`errores.${errorDePendiente(f.motivo)}`),
          dato(f),
          t(`responsables.${responsableDe(f)}`),
          f.dias,
          f.importe,
        ]
          .map(celdasCsv)
          .join(','),
      );
      const contenido = `﻿${[encabezado.map(celdasCsv).join(','), ...lineas].join('\n')}`;
      const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = t('csv.archivo');
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudieron exportar los pendientes:', error);
      toastError(t('csv.errorExportar'));
    } finally {
      setExportando(false);
    }
  };

  const columnas = useMemo<ColumnaTabla<FilaPendiente>[]>(
    () => [
      { id: 'documento', encabezado: t('columnas.documento'), celda: (f) => <span className="font-medium text-fg">{documento(f)}</span> },
      { id: 'error', encabezado: t('columnas.error'), celda: (f) => t(`errores.${errorDePendiente(f.motivo)}`) },
      { id: 'dato', encabezado: t('columnas.dato'), ocultarDebajo: 'lg', celda: (f) => dato(f) },
      { id: 'responsable', encabezado: t('columnas.responsable'), ocultarDebajo: 'md', celda: (f) => t(`responsables.${responsableDe(f)}`) },
      {
        id: 'antiguedad',
        encabezado: t('columnas.antiguedad'),
        alinear: 'derecha',
        ancho: 110,
        celda: (f) => t('dias', { n: f.dias }),
      },
      {
        id: 'accion',
        encabezado: '',
        alinear: 'derecha',
        ancho: 170,
        celda: (f) => <EnlaceAccion fila={f} etiqueta={t(`acciones.${accionDe(f).accion}`)} onAbrir={setSeleccion} />,
      },
    ],
    [t, documento, dato],
  );

  const kpis = kpisDe(resumen);
  const hayError = estado === 'error';
  const sinPendientes = estado === 'listo' && resumen?.pendientes === 0;
  const cargandoKpis = estado === 'cargando' && resumen === null;
  const texto = (valor: number | null) => (valor === null ? SIN_DATO : valor);

  const botonExportar = !hayError && (
    <button
      type="button"
      className={clasesBoton({ variante: 'secundario' })}
      disabled={exportando || estado === 'cargando' || resumen?.pendientes === 0}
      onClick={() => void exportar()}
    >
      <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('exportar')}
    </button>
  );

  return (
    <div className={incrustada ? 'space-y-6' : 'space-y-6 p-4 sm:p-6 lg:p-8'}>
      {!incrustada && (
      <PageHeader
        titulo={t('titulo')}
        subtitulo={hayError || sinPendientes ? t('subtituloCorto') : t('subtitulo')}
        icono={ListChecks}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
          { etiqueta: t('titulo') },
        ]}
        movil={{
          subtitulo: kpis.pendientes === null ? t('subtituloCorto') : t('movilSinContabilizar', { n: kpis.pendientes }),
        }}
        acciones={botonExportar}
      />
      )}
      {incrustada && botonExportar && !sinPendientes && <div className="flex justify-end">{botonExportar}</div>}

      {hayError && (
        <AvisoTonal
          tono="peligro"
          rol="alert"
          titulo={t('error.titulo')}
          descripcion={t('error.descripcion')}
          accion={{ etiqueta: t('error.reintentar'), onClick: () => void cargar() }}
        />
      )}

      {sinPendientes ? (
        <EmptyState
          variante="empty"
          titulo={t('vacio.titulo')}
          descripcion={
            revisadoEn
              ? t('vacio.descripcion', { fecha: formatDateTime(revisadoEn) })
              : t('vacio.descripcionSinFecha')
          }
          accion={{ etiqueta: t('vacio.volver'), href: '/app/finanzas/contabilidad' }}
        />
      ) : (
        <>
          {!hayError && (
            <SearchInput
              value={busqueda}
              onChange={(valor) => {
                setPagina(1);
                setBusqueda(valor);
              }}
              placeholder={t('buscar')}
            />
          )}
          <KpiStrip etiqueta={t('kpis.resumen')}>
            <StatCard etiqueta={t('kpis.pendientes')} valor={texto(kpis.pendientes)} cargando={cargandoKpis} />
            <StatCard
              etiqueta={t('kpis.masAntiguo')}
              valor={kpis.masAntiguoDias === null ? SIN_DATO : t('dias', { n: kpis.masAntiguoDias })}
              cargando={cargandoKpis}
            />
            <StatCard
              etiqueta={t('kpis.bloqueanCierre')}
              valor={texto(kpis.bloqueanCierre)}
              detalle={resumen?.periodoInicio ? mesDe(resumen.periodoInicio, locale) : undefined}
              cargando={cargandoKpis}
            />
            <StatCard
              etiqueta={t('kpis.valor')}
              valor={kpis.valor === null ? SIN_DATO : formatear(kpis.valor)}
              cargando={cargandoKpis}
            />
          </KpiStrip>

          {!hayError && (
            <DataTable
              etiqueta={t('titulo')}
              columnas={columnas}
              filas={resumen?.filas ?? []}
              obtenerId={(f) => String(f.id)}
              estado={estado === 'cargando' ? 'cargando' : resumen?.filas.length ? 'listo' : 'sinResultados'}
              termino={busqueda}
              onLimpiarFiltros={() => setBusqueda('')}
              onFilaClick={setSeleccion}
              etiquetaFila={documento}
              tarjetaMovil={(f) => <TarjetaPendiente fila={f} onAbrir={setSeleccion} />}
              pie={
                <Pagination
                  pagina={pagina}
                  tamano={tamano}
                  total={resumen?.totalFiltradas ?? 0}
                  onPaginaChange={setPagina}
                  onTamanoChange={(n) => {
                    setPagina(1);
                    setTamano(n);
                  }}
                  opcionesTamano={OPCIONES_TAMANO}
                  sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
                  cargando={estado === 'cargando'}
                />
              }
            />
          )}
        </>
      )}

      <DetallePendiente
        fila={seleccion}
        onCerrar={() => setSeleccion(null)}
        formatear={formatear}
        puedeReintentar={permisos.crear}
        reintentando={reintentando}
        onReintentar={(fila) => void reintentar(fila)}
      />
    </div>
  );
}

function EnlaceAccion({
  fila,
  etiqueta,
  onAbrir,
}: {
  fila: FilaPendiente;
  etiqueta: string;
  onAbrir: (fila: FilaPendiente) => void;
}) {
  const { href } = accionDe(fila);
  // Sin destino se resuelve en el detalle.
  if (!href) {
    return (
      <button
        type="button"
        onClick={(evento) => {
          evento.stopPropagation();
          onAbrir(fila);
        }}
        className="text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {etiqueta}
      </button>
    );
  }
  return (
    <Link
      href={href}
      onClick={(evento) => evento.stopPropagation()}
      className="text-sm font-medium text-brand hover:underline"
    >
      {etiqueta}
    </Link>
  );
}

/**
 * Figma «Móvil / Pendientes contables — listo». `DataTable` no pasa `onFilaClick`
 * a la tarjeta: sin este botón, en celular el detalle no abriría.
 */
function TarjetaPendiente({ fila, onAbrir }: { fila: FilaPendiente; onAbrir: (fila: FilaPendiente) => void }) {
  const t = useTranslations('pendientesContables');
  const { documento, dato } = useEtiquetasPendiente();
  return (
    <div className="space-y-1 rounded-xl border border-line bg-surface p-4">
      <button
        type="button"
        onClick={() => onAbrir(fila)}
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="block font-medium text-fg">{documento(fila)}</span>
        <span className="block text-sm text-fg-secondary">{dato(fila)}</span>
      </button>
      <div className="flex items-center justify-between text-sm">
        <span className="text-fg-muted">{t('dias', { n: fila.dias })}</span>
        <EnlaceAccion fila={fila} etiqueta={t(`acciones.${accionDe(fila).accion}`)} onAbrir={onAbrir} />
      </div>
    </div>
  );
}
