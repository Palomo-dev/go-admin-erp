'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Banknote, DollarSign, Eye, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  AccionRapida,
  DataTable,
  DateRangeButton,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  Pagination,
  SearchInput,
  SegmentedControl,
  StatCard,
  esFechaPlana,
  inicioDeMes,
  useListadoServidor,
  type ColumnaTabla,
  type RangoFechas,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEtiquetaRango } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateCore';
import { cn } from '@/utils/Utils';
import { CajasService } from '../CajasService';
import type { CampoOrdenHistorial, CashHistoryFilters, CashSession, ResultadoCierre } from '../types';
import {
  dinero,
  dineroConSigno,
  esResultadoCierre,
  historialACsv,
  resultadoDiferencia,
  resumenDiferencias,
  type ResumenDiferencias,
} from '../historialCajas';
import { Oculto, SucursalCaja } from './comunes';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';

const CAMPOS_ORDEN: readonly CampoOrdenHistorial[] = ['opened_at', 'closed_at', 'difference'];

const VALORES_RESULTADO: readonly ('todas' | ResultadoCierre)[] = ['todas', 'faltante', 'sobrante', 'cuadrada'];

const TONO_RESULTADO: Record<ResultadoCierre, string> = {
  faltante: 'text-danger-text',
  sobrante: 'text-success-text',
  cuadrada: 'text-fg',
};

export interface HistorialTabProps {
  showExpected: boolean;
  /** Cambia cuando hay que volver a consultar (realtime, cierre, apertura). */
  recarga: number;
  pestanas: ReactNode;
}

export function HistorialTab({ showExpected, recarga, pestanas }: HistorialTabProps) {
  // Moneda base de la organización (fuente única: monedaOrganizacion.ts).
  const moneda = useMonedaOrganizacion();
  const router = useRouter();
  const { formatDateTime, getToday, toInstant } = useFormatDate();
  const t = useTranslations('cajas.listado.historial');
  const tListado = useTranslations('cajas.listado');
  const etiquetaRango = useEtiquetaRango();
  const motivoCierreCiego = tListado('motivoCierreCiego');
  const opcionesResultado = VALORES_RESULTADO.map((valor) => ({ valor, etiqueta: t(`filtroResultado.${valor}`) }));
  const hoy = getToday();

  const l = useListadoServidor({
    filtros: ['resultado', 'desde', 'hasta'],
    camposOrden: CAMPOS_ORDEN,
    ordenPorDefecto: { campo: 'opened_at', direccion: 'desc' },
    tamanoPorDefecto: 10,
    prefijo: 'h_',
  });

  // Rango por defecto: el mes en curso hasta hoy, en la zona de la organización.
  const rango: RangoFechas = useMemo(() => {
    const desde = esFechaPlana(l.filtros.desde) ? l.filtros.desde : inicioDeMes(hoy);
    const hasta = esFechaPlana(l.filtros.hasta) ? l.filtros.hasta : hoy;
    return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
  }, [l.filtros.desde, l.filtros.hasta, hoy]);

  const resultado = esResultadoCierre(l.filtros.resultado) ? l.filtros.resultado : undefined;
  const ordenUrl = l.orden;

  // Días de la organización → instantes: `desde` a las 00:00 y `hasta` exclusivo
  // (00:00 del día siguiente), con la zona de la organización (toInstant).
  const filtros: CashHistoryFilters = useMemo(
    () => ({
      status: 'closed',
      desde: toInstant(rango.desde),
      hasta: toInstant(addPlainDays(rango.hasta, 1)),
      busqueda: l.busqueda || undefined,
      resultado,
      orden:
        ordenUrl && (CAMPOS_ORDEN as readonly string[]).includes(ordenUrl.campo)
          ? { campo: ordenUrl.campo as CampoOrdenHistorial, direccion: ordenUrl.direccion }
          : undefined,
    }),
    [rango.desde, rango.hasta, toInstant, l.busqueda, resultado, ordenUrl],
  );

  const [filas, setFilas] = useState<CashSession[]>([]);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState<ResumenDiferencias | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  // `silenciosa`: recarga por realtime o por abrir/cerrar una caja; la tabla
  // conserva sus filas en lugar de volver al esqueleto.
  const cargar = useCallback(async (silenciosa = false) => {
    if (!silenciosa) setCargando(true);
    setError(null);
    try {
      const [pagina, diferencias] = await Promise.all([
        CajasService.getSessionHistoryPaginated(l.pagina, l.tamano, filtros),
        CajasService.getSessionHistoryDifferences(filtros),
      ]);
      setFilas(pagina.data);
      setTotal(pagina.total);
      setResumen(resumenDiferencias(diferencias));
    } catch (e) {
      console.error('Error cargando el historial de cajas:', e);
      setError(e instanceof Error ? e.message : tListado('errorDesconocido'));
    } finally {
      setCargando(false);
    }
  }, [filtros, l.pagina, l.tamano, tListado]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const recargaInicial = useRef(recarga);
  useEffect(() => {
    if (recarga === recargaInicial.current) return;
    recargaInicial.current = recarga;
    void cargar(true);
    // Solo el contador dispara esta recarga; los filtros ya la hacen arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarga]);

  const exportar = async () => {
    setExportando(true);
    try {
      const sesiones = await CajasService.getSessionHistoryForExport(filtros);
      if (sesiones.length === 0) {
        toast.info(t('exportarVacio'));
        return;
      }
      const csv = historialACsv(
        sesiones.map((s) => ({
          caja: s.id,
          apertura: formatDateTime(s.opened_at),
          cierre: formatDateTime(s.closed_at),
          cerro: s.closed_by_name ?? '',
          cajero: s.opened_by_name ?? '',
          sucursal: s.branch_name ?? '',
          inicial: Number(s.initial_amount),
          final: s.final_amount === null || s.final_amount === undefined ? null : Number(s.final_amount),
          diferencia: s.difference === null || s.difference === undefined ? null : Number(s.difference),
        })),
        !showExpected,
        {
          cabecera: [
            tListado('columnas.caja'),
            t('columnas.apertura'),
            t('columnas.cierre'),
            t('columnas.cerro'),
            tListado('columnas.cajero'),
            tListado('columnas.sucursal'),
            tListado('columnas.inicial'),
            t('columnas.final'),
            t('columnas.diferencia'),
            t('columnas.resultado'),
          ],
          oculto: tListado('oculto'),
          resultados: { faltante: t('resultados.faltante'), sobrante: t('resultados.sobrante'), cuadrada: t('resultados.cuadrada') },
        },
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `cajas-historial-${rango.desde}-a-${rango.hasta}.csv`;
      enlace.click();
      URL.revokeObjectURL(url);
      toast.success(t('exportadas', { count: sesiones.length }));
    } catch (e) {
      toast.error(t('exportarError'), { description: e instanceof Error ? e.message : undefined });
    } finally {
      setExportando(false);
    }
  };

  const irADetalle = (s: CashSession) => router.push(`/app/pos/cajas/${s.uuid}`);
  const setRango = (r: RangoFechas) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } });

  const celdaDiferencia = (s: CashSession) => {
    if (!showExpected) return <Oculto />;
    const r = resultadoDiferencia(s.difference);
    if (!r) return <span className="text-fg-muted">—</span>;
    return (
      <div className="flex flex-col items-end">
        <span className={cn('font-medium', TONO_RESULTADO[r])}>{r === 'cuadrada' ? dinero(0, moneda) : dineroConSigno(s.difference, moneda)}</span>
        <span className="text-xs text-fg-secondary">{t(`resultados.${r}`)}</span>
      </div>
    );
  };

  const columnas: ColumnaTabla<CashSession>[] = [
    { id: 'caja', encabezado: tListado('columnas.caja'), variante: 'mono', ancho: 80, celda: (s) => <span className="text-fg-secondary">#{s.id}</span> },
    {
      id: 'apertura',
      encabezado: t('columnas.apertura'),
      ordenable: true,
      campoOrden: 'opened_at',
      celda: (s) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(s.opened_at)}</span>,
    },
    {
      id: 'cierre',
      encabezado: t('columnas.cierre'),
      ordenable: true,
      campoOrden: 'closed_at',
      celda: (s) => (
        <div className="flex flex-col whitespace-nowrap">
          <span className="tabular-nums">{s.closed_at ? formatDateTime(s.closed_at) : '—'}</span>
          {s.closed_by_name && <span className="text-xs text-fg-secondary">{t('cerroNombre', { nombre: s.closed_by_name })}</span>}
        </div>
      ),
    },
    { id: 'cajero', encabezado: tListado('columnas.cajero'), celda: (s) => <span className="font-medium">{s.opened_by_name || '—'}</span> },
    { id: 'sucursal', encabezado: tListado('columnas.sucursal'), ocultarDebajo: 'xl', celda: (s) => <SucursalCaja sesion={s} /> },
    { id: 'inicial', encabezado: tListado('columnas.inicial'), variante: 'importe', celda: (s) => dinero(s.initial_amount, moneda) },
    {
      id: 'final',
      encabezado: t('columnas.final'),
      variante: 'importe',
      celda: (s) => (showExpected ? (s.final_amount === null || s.final_amount === undefined ? '—' : dinero(s.final_amount, moneda)) : <Oculto />),
    },
    {
      id: 'diferencia',
      encabezado: t('columnas.diferencia'),
      variante: 'importe',
      ordenable: true,
      campoOrden: 'difference',
      celda: celdaDiferencia,
    },
  ];

  const estado = cargando ? 'cargando' : error ? 'error' : filas.length === 0 && l.hayCriterios ? 'sinResultados' : 'listo';
  const r = resumen;
  const oculto = !showExpected;

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip etiqueta={t('kpiEtiqueta')}>
        <StatCard
          etiqueta={t('kpiSesionesCerradas')}
          icono={DollarSign}
          cargando={cargando && !r}
          valor={r?.sesiones ?? 0}
          detalle={etiquetaRango(rango)}
        />
        <StatCard
          etiqueta={t('kpiFaltantes')}
          icono={DollarSign}
          cargando={cargando && !r}
          valor={oculto ? <Oculto /> : dineroConSigno(r?.faltantes ?? 0, moneda)}
          detalle={oculto ? tListado('cierreCiegoMinuscula') : r?.cajasConFaltante ? tListado('cajasConFaltante', { count: r.cajasConFaltante }) : t('ningunaCaja')}
          tono={!oculto && r?.cajasConFaltante ? 'peligro' : 'neutro'}
          tendencia={!oculto && r?.cajasConFaltante ? 'baja' : undefined}
          onClick={oculto ? undefined : () => l.setFiltro('resultado', 'faltante')}
        />
        <StatCard
          etiqueta={t('kpiSobrantes')}
          icono={DollarSign}
          cargando={cargando && !r}
          valor={oculto ? <Oculto /> : dineroConSigno(r?.sobrantes ?? 0, moneda)}
          detalle={oculto ? tListado('cierreCiegoMinuscula') : r?.cajasConSobrante ? tListado('cajasConSobrante', { count: r.cajasConSobrante }) : t('ningunaCaja')}
          tono={!oculto && r?.cajasConSobrante ? 'exito' : 'neutro'}
          tendencia={!oculto && r?.cajasConSobrante ? 'sube' : undefined}
          onClick={oculto ? undefined : () => l.setFiltro('resultado', 'sobrante')}
        />
        <StatCard
          etiqueta={t('kpiDiferenciaNeta')}
          icono={DollarSign}
          cargando={cargando && !r}
          valor={oculto ? <Oculto /> : dineroConSigno(r?.neta ?? 0, moneda)}
          detalle={oculto ? tListado('cierreCiegoMinuscula') : r?.sesiones ? t('cuadraron', { count: r.cuadradas, monto: dinero(0, moneda) }) : t('sinCierres')}
        />
      </KpiStrip>

      <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <ListToolbar
            busqueda={
              <SearchInput
                value={l.busqueda}
                onChange={l.setBusqueda}
                placeholder={t('buscarPlaceholder')}
                etiqueta={t('buscarEtiqueta')}
                cargando={cargando}
              />
            }
            filtros={
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
                <DateRangeButton valor={rango} onValorChange={setRango} hoy={hoy} etiqueta={t('aperturaEntre')} />
                <FilterPanel
                  conteo={resultado ? 1 : 0}
                  onLimpiar={() => l.setFiltro('resultado', null)}
                  textoVerResultados={t('verSesiones', { count: total })}
                >
                  <FormField etiqueta={t('resultadoCierre')}>
                    {(c) => (
                      <SegmentedControl
                        aria-labelledby={c.idEtiqueta}
                        anchoCompleto
                        tamano="sm"
                        valor={resultado ?? 'todas'}
                        onValorChange={(v) => l.setFiltro('resultado', v === 'todas' ? null : v)}
                        opciones={opcionesResultado}
                      />
                    )}
                  </FormField>
                </FilterPanel>
                <Button variant="outline" className="h-10 gap-2" onClick={exportar} disabled={exportando || cargando}>
                  <FileDown aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {exportando ? t('exportando') : t('exportar')}
                </Button>
              </div>
            }
            chips={
              <FilterChips
                chips={resultado ? [{ clave: 'resultado', etiqueta: t('chipResultado', { valor: t(`filtroResultadoMinuscula.${resultado}`) }) }] : []}
                onQuitar={(c) => l.setFiltro(c, null)}
                onLimpiarTodo={l.limpiarTodo}
              />
            }
          />
        </div>
        <div className="shrink-0">{pestanas}</div>
      </div>

      <DataTable
        etiqueta={t('tablaEtiqueta')}
        columnas={columnas}
        filas={filas}
        obtenerId={(s) => String(s.id)}
        estado={estado}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        onFilaClick={showExpected ? irADetalle : undefined}
        etiquetaFila={(s) =>
          s.opened_by_name ? tListado('etiquetaFila', { id: s.id, nombre: s.opened_by_name }) : tListado('etiquetaFilaSinNombre', { id: s.id })
        }
        filasEsqueleto={Math.min(l.tamano, 10)}
        accionesRapidas={(s) => (
          <AccionRapida
            soloIcono
            etiqueta={tListado('verDetalle')}
            icono={Eye}
            onClick={() => irADetalle(s)}
            deshabilitada={!showExpected}
            motivo={showExpected ? undefined : motivoCierreCiego}
          />
        )}
        tarjetaMovil={(s) => {
          const res = resultadoDiferencia(s.difference);
          return (
            <ListCard
              icono={Banknote}
              titulo={`#${s.id} · ${s.opened_by_name || tListado('cajero')}`}
              subtitulo={`${formatDateTime(s.opened_at)} → ${s.closed_at ? formatDateTime(s.closed_at) : '—'}`}
              meta={s.closed_by_name ? t('cerroNombre', { nombre: s.closed_by_name }) : undefined}
              valor={showExpected ? (res === 'cuadrada' ? dinero(0, moneda) : dineroConSigno(s.difference, moneda)) : undefined}
              estado={
                !showExpected ? (
                  <Oculto />
                ) : res ? (
                  <Badge tono={res === 'faltante' ? 'peligro' : res === 'sobrante' ? 'exito' : 'neutro'} tamano="sm">
                    {t(`resultados.${res}`)}
                  </Badge>
                ) : undefined
              }
              onClick={showExpected ? () => irADetalle(s) : undefined}
              acciones={[
                {
                  id: 'ver',
                  etiqueta: tListado('verDetalle'),
                  icono: Eye,
                  onSelect: () => irADetalle(s),
                  deshabilitada: !showExpected,
                  motivo: showExpected ? undefined : motivoCierreCiego,
                },
              ]}
            />
          );
        }}
        vacio={{
          titulo: t('vacioTitulo'),
          descripcion: t('vacioDescripcion', { rango: etiquetaRango(rango) }),
        }}
        sinResultados={{
          titulo: t('sinResultadosTitulo'),
          descripcion: resultado
            ? t('sinResultadosDescripcionFiltro', { rango: etiquetaRango(rango), filtro: t(`filtroResultadoMinuscula.${resultado}`) })
            : t('sinResultadosDescripcion', { rango: etiquetaRango(rango) }),
        }}
        onLimpiarFiltros={l.limpiarTodo}
        termino={l.busqueda || undefined}
        error={{ titulo: t('errorTitulo'), descripcion: error ?? undefined }}
        onReintentar={() => void cargar()}
        pie={
          <Pagination
            pagina={l.pagina}
            tamano={l.tamano}
            total={total}
            onPaginaChange={l.setPagina}
            onTamanoChange={l.setTamano}
            sustantivo={{ singular: t('sustantivoSingular'), plural: t('sustantivoPlural') }}
            cargando={cargando}
          />
        }
      />
    </div>
  );
}
