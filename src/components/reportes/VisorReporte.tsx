'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Mail, Printer, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, RowActionsMenu, TabBar, clasesBoton, type AccionFila } from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { supabase } from '@/lib/supabase/config';
import { descargarDocumento, guardarArchivo, imprimirDocumento } from '@/lib/documents/cliente';
import { reportePermitido } from '@/lib/services/reportes/alcanceSucursal';
import { compararKpis, tablaComparada, type VariacionKpi } from '@/lib/services/reportes/comparativo';
import { reporteACsv, reporteAExcel } from '@/lib/services/reportes/exportarTabla';
import { escribirFiltrosReportes, filtrosEfectivos, parametrosDocumento, periodoComparado } from '@/lib/services/reportes/filtrosUrl';
import { registrarEventoReporte } from '@/lib/services/reportes/historialService';
import { listarGuardados, marcarFavorito, recordarUso } from '@/lib/services/reportes/lecturasReportes';
import { getReporteById } from '@/lib/services/reportes/reportesCatalogo';
import { ejecutarReporte } from '@/lib/services/reportes/reportesEngine';
import { congelarReporte } from '@/lib/services/reportes/cierres/snapshot';
import type { ReportData } from '@/lib/services/reportes/types';
import { useAccionesReportes } from './accionesReportes';
import { AvisoAlcance } from './AvisoAlcance';
import { BarraFiltros } from './BarraFiltros';
import { LecturaRapida } from './LecturaRapida';
import { TablaReporte } from './TablaReporte';
import { useEtiquetaPeriodo } from './SelectorPeriodo';
import { useFormatoReporte } from './useFormatoReporte';
import type { ContextoReportes } from './useContextoReportes';
import type { FiltrosReportes } from '@/lib/services/reportes/filtrosUrl';

export function VisorReporte({
  reporteId,
  ctx,
  filtros,
  hoy,
  onCambiar,
}: {
  reporteId: string;
  ctx: ContextoReportes;
  filtros: FiltrosReportes;
  hoy: string;
  onCambiar: (parcial: Partial<FiltrosReportes>) => void;
}) {
  const t = useTranslations('reportes');
  const acciones = useAccionesReportes();
  const { formatDateTime } = useFormatDate();
  const formato = useFormatoReporte();
  const etiqueta = useEtiquetaPeriodo();
  const def = getReporteById(reporteId);
  const enPlan = ctx.grupos.some((g) => g.reportes.some((r) => r.id === reporteId));
  const permitido = !!def && enPlan && reportePermitido(def, ctx.accesoTotal);
  const efectivos = def ? filtrosEfectivos(def, filtros, ctx.resolverSucursal(filtros)) : null;
  const comparado = efectivos?.comparar ? periodoComparado(efectivos.periodo, efectivos.comparar) : null;

  const [data, setData] = useState<ReportData | null>(null);
  const [previo, setPrevio] = useState<ReportData | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [favorito, setFavorito] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    if (!ctx.orgId || !def || !efectivos || !permitido) return;
    let vivo = true;
    setEstado('cargando');
    void (async () => {
      try {
        const actual = await ejecutarReporte(def.id, ctx.orgId!, efectivos.periodo, efectivos.sucursal);
        const anterior = comparado ? await ejecutarReporte(def.id, ctx.orgId!, comparado, efectivos.sucursal).catch(() => null) : null;
        if (!vivo) return;
        setData(actual);
        setPrevio(anterior);
        setEstado('listo');
      } catch {
        if (vivo) setEstado('error');
      }
    })();
    return () => {
      vivo = false;
    };
    // efectivos se reconstruye en cada render; la clave estable es el periodo y la sucursal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.orgId, def?.id, efectivos?.periodo.tipo, efectivos?.periodo.fechaInicio, efectivos?.periodo.fechaFin, efectivos?.periodo.horaInicio, efectivos?.periodo.horaFin, efectivos?.sucursal, efectivos?.comparar, permitido, recarga]);

  useEffect(() => {
    if (!ctx.orgId || !def || !efectivos || estado !== 'listo') return;
    const filtrosRecordados = escribirFiltrosReportes(efectivos, hoy);
    void recordarUso(ctx.orgId, def.id, filtrosRecordados);
    void supabase.auth.getUser().then(({ data: sesion }) => {
      const userId = sesion.user?.id;
      if (!userId) return;
      void registrarEventoReporte(supabase, {
        organizationId: ctx.orgId!,
        userId,
        reportId: def.id,
        modulo: def.modulo,
        accion: 'ver',
        filtros: filtrosRecordados,
        branchId: efectivos.sucursal,
      });
    });
    // Solo al terminar de cargar este resultado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, data?.generadoEn]);

  useEffect(() => {
    if (!ctx.orgId || !def) return;
    void listarGuardados(ctx.orgId).then((lista) => setFavorito(lista.some((f) => f.reportId === def.id && f.favorito))).catch(() => undefined);
  }, [ctx.orgId, def]);

  const vistaId = data?.vistas?.some((v) => v.id === filtros.vista) ? filtros.vista : null;
  const vista = vistaId ? data?.vistas?.find((v) => v.id === vistaId) : null;
  const columnas = useMemo(() => vista?.columnas ?? data?.columnas ?? [], [vista, data]);
  const filas = useMemo(() => vista?.filas ?? data?.filas ?? [], [vista, data]);
  const totales = vista?.totales ?? data?.totales;
  const referencia = useMemo(() => {
    if (!comparado || !previo || !data || vistaId) return null;
    return tablaComparada(
      { columnas, filas, totales },
      { columnas: previo.columnas, filas: previo.filas, totales: previo.totales },
      { anterior: etiqueta.periodo(comparado), variacion: t('visor.variacion') },
    );
  }, [comparado, previo, data, vistaId, columnas, filas, totales, etiqueta, t]);

  const variaciones: VariacionKpi[] | null = data && efectivos?.comparar ? compararKpis(data, previo) : null;

  if (!def) return <EmptyState variante="search" titulo={t('visor.bloqueado')} />;
  if (!ctx.cargando && !permitido) {
    if (!enPlan) {
      return (
        <EmptyState
          variante="forbidden"
          titulo={t('visor.bloqueado')}
          descripcion={t('visor.bloqueadoPlan')}
          accion={{ etiqueta: t('inicio.verPlanes'), href: '/app/organizacion/plan' }}
        />
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <AvisoAlcance ctx={ctx} reportId={def.id} />
        <EmptyState variante="forbidden" titulo={t('visor.bloqueado')} descripcion={t('visor.bloqueadoAlcance')} />
      </div>
    );
  }

  const exportar = async (tipo: 'pdf' | 'excel' | 'csv') => {
    if (!ctx.permisos.exportar) {
      toastError(t('visor.sinExportar'));
      return;
    }
    if (!data || !efectivos) return;
    if (tipo === 'pdf') {
      await descargarDocumento('reporte', def.id, parametrosDocumento(efectivos));
      return;
    }
    const congelado = congelarReporte({ ...data, lectura: data.lectura }, def, efectivos.periodo);
    const textos = { resumen: t('visor.lectura'), indicador: t('visor.lectura'), valor: t('visor.variacion'), truncado: (a: number, b: number) => `${a}/${b}` };
    const nombre = def.id;
    if (tipo === 'excel') {
      const bytes = reporteAExcel(congelado, { lineas: [etiqueta.completa(efectivos.periodo)], textos }, vistaId);
      guardarArchivo(new Blob([bytes]), `${nombre}.xlsx`);
    } else {
      guardarArchivo(new Blob([reporteACsv(congelado, { textos })], { type: 'text/csv;charset=utf-8' }), `${nombre}.csv`);
    }
    const { data: sesion } = await supabase.auth.getUser();
    if (sesion.user && ctx.orgId) {
      await registrarEventoReporte(supabase, { organizationId: ctx.orgId, userId: sesion.user.id, reportId: def.id, modulo: def.modulo, accion: 'exportar', filtros: escribirFiltrosReportes(efectivos, hoy), branchId: efectivos.sucursal });
    }
    toastSuccess(t('visor.exportado'));
  };

  const menu: AccionFila[] = [
    { id: 'pdf', etiqueta: t('visor.pdf'), icono: Download, onSelect: () => void exportar('pdf'), deshabilitada: !ctx.permisos.exportar, motivo: t('visor.sinExportar') },
    { id: 'excel', etiqueta: t('visor.excel'), icono: FileSpreadsheet, onSelect: () => void exportar('excel'), deshabilitada: !ctx.permisos.exportar, motivo: t('visor.sinExportar') },
    { id: 'csv', etiqueta: t('visor.csv'), icono: FileSpreadsheet, onSelect: () => void exportar('csv'), deshabilitada: !ctx.permisos.exportar, motivo: t('visor.sinExportar') },
    {
      id: 'fav',
      etiqueta: t(favorito ? 'visor.quitarFavorito' : 'visor.favorito'),
      icono: Star,
      onSelect: () => {
        if (!ctx.orgId) return;
        setFavorito(!favorito);
        void marcarFavorito(ctx.orgId, def.id, !favorito);
      },
    },
    { id: 'envio', etiqueta: t('programarEnvios'), icono: Mail, onSelect: () => acciones.abrirEnvio({ reportId: def.id }) },
    { id: 'copiar', etiqueta: t('visor.copiar'), icono: Download, onSelect: () => void navigator.clipboard.writeText(window.location.href).then(() => toastSuccess(t('visor.copiado'))) },
    { id: 'imprimir', etiqueta: t('visor.imprimir'), icono: Printer, onSelect: () => efectivos && imprimirDocumento('reporte', def.id, parametrosDocumento(efectivos)) },
  ];

  const pestanasVista = data?.vistas?.length
    ? [{ valor: 'principal', etiqueta: data.vistaPrincipal ?? t('pestanas.inicio') }, ...data.vistas.map((v) => ({ valor: v.id, etiqueta: v.titulo }))]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BarraFiltros filtros={filtros} onCambiar={onCambiar} hoy={hoy} ctx={ctx} def={def} />
        <div className="flex items-center gap-2">
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => acciones.abrirCierre({ plantilla: 'personalizada', reportes: [def.id] })}>
            {t('visor.agregar')}
          </button>
          <RowActionsMenu acciones={menu} etiquetaBoton={t('visor.exportar')} iconoBoton={Download} tamano="md" titulo={def.titulo} />
        </div>
      </div>
      {pestanasVista.length > 0 && (
        <TabBar id="vista" etiqueta={def.titulo} tamano="sm" valor={vistaId ?? 'principal'} onValorChange={(v) => onCambiar({ vista: v === 'principal' ? null : v })} pestanas={pestanasVista} />
      )}
      {estado === 'error' && <EmptyState variante="error" onReintentar={() => setRecarga((n) => n + 1)} />}
      {estado !== 'error' && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {estado === 'listo' && data && (
              <p className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.kpis.map((k, i) => {
                  const variacion = variaciones?.[i];
                  return (
                    <span key={k.titulo} className="rounded-xl border border-line bg-surface p-3">
                      <span className="block text-xs text-fg-secondary">{k.titulo}</span>
                      <span className="block text-lg font-semibold tabular-nums text-fg">{formato.valor(k.valor, k.formato)}</span>
                      {variacion?.porcentaje != null && (
                        <span className={variacion.porcentaje >= 0 ? 'text-xs text-success-text' : 'text-xs text-danger-text'}>
                          {variacion.porcentaje >= 0 ? '↑ ' : '↓ '}
                          {formato.porcentaje(Math.abs(variacion.porcentaje))}
                        </span>
                      )}
                    </span>
                  );
                })}
              </p>
            )}
            {referencia === null && efectivos?.comparar && estado === 'listo' && !vistaId && <p className="mb-2 text-xs text-fg-secondary">{t('visor.sinComparacion')}</p>}
            <TablaReporte
              columnas={referencia?.columnas ?? columnas}
              filas={estado === 'cargando' ? [] : (referencia?.filas ?? filas)}
              totales={estado === 'cargando' ? undefined : (referencia?.totales ?? totales)}
              etiqueta={def.titulo}
              estado={estado === 'cargando' ? 'cargando' : 'listo'}
            />
          </div>
          {data && efectivos && <LecturaRapida data={data} def={def} variaciones={variaciones} periodoComparado={comparado ? etiqueta.periodo(comparado) : null} />}
        </div>
      )}
      {data && <p className="text-xs text-fg-secondary">{t('visor.datosAl', { cuando: formatDateTime(data.generadoEn) })}</p>}
    </div>
  );
}

