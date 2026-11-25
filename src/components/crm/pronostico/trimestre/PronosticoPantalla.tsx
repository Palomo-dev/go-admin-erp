'use client';

/**
 * /app/crm/pronostico — Pronóstico del trimestre (Figma CRM 1431:19 «por
 * vendedor», 1434:648 «oportunidades por categoría», 1434:1185 «ajuste con
 * motivo», 1434:842149 «sin cuotas», 1434:842588 «cargando» y 1434:843089
 * «Móvil — mi pronóstico»).
 *
 * Todo lo calcula el servidor (`GET /api/crm/forecast` → RPC
 * `crm_forecast_snapshot`): quién ve a quién (`crm.forecast.view_all`),
 * quién ajusta (`crm.forecast.adjust`) y quién cambia categorías. Sin
 * `view_all` la pantalla es «Mi pronóstico». El vendedor abierto vive en
 * `?vendedor=` y la vista en `?vista=`: «atrás» y la miga «Pronóstico» vuelven
 * al equipo. Los análisis de ingresos (antes el tablero Revenue OS de
 * /app/crm/pronostico/analisis) son reportes del módulo Reportes: «⋯ › Ver en
 * Reportes» abre «Ingresos comerciales por mes» y, desde ahí, los demás del
 * grupo «Clientes y CRM».
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, Download, History, RefreshCw, Target, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/kit/PageHeader';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { EmptyState } from '@/components/kit/EmptyState';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { clasesBoton } from '@/components/kit/botonClases';
import { useOpcionUrl, useParametrosUrl } from '@/components/kit/useParametroUrl';
import { rutaReporte } from '@/components/reportes/rutasReportes';
import { usePaginasModulo } from '@/lib/navigation/NavegacionVisible';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { formatMoneda } from '@/lib/utils/moneda';
import { filasACsv } from '@/lib/utils/csv';
import { pctDe, type FilaPronostico } from '@/lib/services/crm/forecastLogica';
import { probabilityToFraction } from '@/lib/services/crm/revenueOs/forecastScenarios';
import { CifrasTrimestre, CoberturaCuota } from './CifrasTrimestre';
import { TablaVendedoresPronostico, vendedoresVisibles } from './TablaVendedoresPronostico';
import { TablaMesesPronostico } from './TablaMesesPronostico';
import { OportunidadesPronostico } from './OportunidadesPronostico';
import { DialogoAjustePronostico } from './DialogoAjustePronostico';
import { HistorialAjustes } from './HistorialAjustes';
import { PronosticoMovil } from './PronosticoMovil';
import { cuerpoPronostico, filasCsvMeses, filasCsvOportunidades, filasCsvVendedores, minutosDesde, nombreVendedor, opcionesTrimestre, partesTrimestre } from './trimestreLogica';
import { usePronosticoTrimestre } from './usePronosticoTrimestre';

const VISTAS = ['vendedor', 'mes'] as const;
const ANCHO_FILTRO = 'w-full sm:w-80';

function descargar(nombre: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Primera carga, antes de conocer la moneda: filas de esqueleto (Figma 1434:842588). */
function EsqueletoTabla({ etiqueta }: { etiqueta: string }) {
  return (
    <div aria-busy="true" aria-label={etiqueta} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PronosticoPantalla() {
  const t = useTranslations('crm.pronosticoTrimestre');
  const tc = useTranslations('crm.pronosticoTrimestre.categorias');
  const router = useRouter();
  // «Ver en Reportes» solo para quien ve el módulo Reportes (como en Ventas).
  const paginasReportes = usePaginasModulo('reports');
  const verReportes = paginasReportes !== null && paginasReportes.length > 0;
  const { leer, fijar } = useParametrosUrl();
  const [vista, setVista] = useOpcionUrl('vista', VISTAS, 'vendedor');
  const vendedorUrl = leer('vendedor');
  const [periodo, setPeriodo] = useState<string | null>(null);
  const [equipo, setEquipo] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [revision, setRevision] = useState(0);
  const [ajustar, setAjustar] = useState<FilaPronostico | null>(null);
  const [historial, setHistorial] = useState(false);
  const [miId, setMiId] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const esEscritorio = useEsEscritorio();
  // En el celular la pantalla es «Mi pronóstico» (Figma 1434:843089), también para el supervisor.
  const usuario = !esEscritorio && miId ? miId : vendedorUrl;
  const { estado, datos, vigente, cargadoEn } = usePronosticoTrimestre({ period: periodo, team_id: equipo, user_id: usuario, page: pagina }, revision);
  const recargar = () => setRevision((n) => n + 1);

  useEffect(() => {
    if (datos?.canViewAll && datos.currentUserId) setMiId(datos.currentUserId);
  }, [datos]);
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const verVendedor = (id: string | null) => {
    setPagina(1);
    fijar({ vendedor: id });
  };
  const nombreDe = (id: string | null) => (id ? nombreVendedor(datos?.sellers.find((u) => u.id === id)) : null) ?? t(id ? 'vendedores.sinNombre' : 'vendedores.sinAsignar');

  const listos = vigente && datos ? datos : null;
  const enDetalle = usuario !== null || (datos ? !datos.canViewAll : false);
  const idDetalle = usuario ?? (datos && !datos.canViewAll ? datos.currentUserId : null);
  const periodoActual = datos?.period ?? periodo;
  const trimestre = periodoActual ? t('trimestre', partesTrimestre(periodoActual)) : '';
  const nombreEquipo = datos?.teams.find((e) => e.id === equipo)?.name ?? t('todosLosEquipos');

  const titulo = !enDetalle ? t('titulo') : idDetalle && idDetalle === datos?.currentUserId ? t('vistas.mio') : t('tituloDe', { nombre: nombreDe(idDetalle) });
  let subtitulo = trimestre;
  if (listos && !enDetalle) {
    subtitulo = t('subtitulo.equipo', { trimestre, equipo: nombreEquipo, min: cargadoEn ? minutosDesde(cargadoEn, ahora) : 0 });
  } else if (listos) {
    const cuota = listos.summary.quota.total;
    const compromiso = formatMoneda(listos.summary.commit.total, listos.moneda);
    subtitulo = cuota > 0
      ? t('subtitulo.vendedor', { trimestre, cuota: formatMoneda(cuota, listos.moneda), compromiso, pct: pctDe(listos.summary.commit.total, cuota) ?? 0 })
      : t('subtitulo.vendedorSinCuota', { trimestre, compromiso });
  }

  const cuerpo = listos
    ? cuerpoPronostico({ enDetalle, vista, cuota: listos.summary.quota.total, abiertas: listos.opportunityCount, ganadas: listos.summary.won.cantidad })
    : enDetalle && vista === 'vendedor' ? 'oportunidades' : vista === 'mes' ? 'meses' : 'vendedores';

  const cabecera = (tabla: string, claves: string[]) => claves.map((c) => t(`csv.${tabla}.${c}`));
  const exportar = () => {
    if (!listos) return;
    if (cuerpo === 'oportunidades') {
      const csv = filasACsv(cabecera('oportunidades', ['oportunidad', 'etapa', 'cierre', 'monto', 'moneda', 'probabilidad', 'categoria']), filasCsvOportunidades(listos.opportunities, (c) => tc(c), (p) => Math.round(probabilityToFraction(p) * 100)));
      descargar(`pronostico-${listos.period}-oportunidades.csv`, csv);
    } else if (cuerpo === 'meses') {
      descargar(`pronostico-${listos.period}-meses.csv`, filasACsv(cabecera('meses', ['mes', 'ganado', 'compromiso', 'mejorCaso', 'ponderado', 'abiertas']), filasCsvMeses(listos.months)));
    } else {
      descargar(`pronostico-${listos.period}.csv`, filasACsv(cabecera('vendedores', ['vendedor', 'cuota', 'ganado', 'compromiso', 'ajuste', 'mejorCaso', 'ponderado', 'cobertura']), filasCsvVendedores(vendedoresVisibles(listos.rows), nombreDe)));
    }
  };

  const fallo = estado === 'error' || estado === 'sinPermiso';
  const moneda = datos?.moneda ?? null;
  const acciones = !fallo && (
    <>
      <button type="button" onClick={() => setHistorial(true)} disabled={!datos} className={clasesBoton({ variante: 'secundario' })}>
        <History aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.historial')}
      </button>
      <button type="button" onClick={exportar} disabled={!listos || cuerpo === 'sinCuotas' || cuerpo === 'sinOportunidades'} className={clasesBoton({ variante: 'secundario' })}>
        <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.exportar')}
      </button>
      <RowActionsMenu
        orientacion="horizontal"
        tamano="md"
        titulo={t('titulo')}
        acciones={[
          { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: recargar },
          { id: 'cuotas', etiqueta: t('acciones.definirCuotas'), icono: Target, onSelect: () => router.push('/app/organizacion/miembros'), oculta: !datos?.canViewAll },
          { id: 'verEnReportes', etiqueta: t('acciones.verEnReportes'), icono: BarChart3, onSelect: () => router.push(rutaReporte('clientes', 'crm-ingresos-mensual')), oculta: !verReportes },
        ]}
      />
    </>
  );

  const migas = enDetalle && datos?.canViewAll
    ? [{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo'), href: '/app/crm/pronostico' }, { etiqueta: nombreDe(idDetalle) }]
    : [{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo') }];

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={titulo}
        subtitulo={subtitulo}
        icono={TrendingUp}
        migas={migas}
        cargando={estado === 'cargando'}
        acciones={acciones}
        volverA="/app/crm"
        movil={{ titulo: t('vistas.mio'), subtitulo: '' }}
      />

      {fallo && !vigente ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante={estado === 'sinPermiso' ? 'forbidden' : 'error'} titulo={t(estado === 'sinPermiso' ? 'sinPermiso' : 'error')} onReintentar={estado === 'error' ? recargar : undefined} />
        </div>
      ) : (
        <>
          <div className="lg:hidden">
            <PronosticoMovil datos={listos && (!listos.canViewAll || usuario === listos.currentUserId) ? listos : null} pagina={pagina} onPagina={setPagina} onCambio={recargar} />
          </div>

          <div className="hidden flex-col gap-4 lg:flex">
            <div className="flex flex-wrap items-center gap-2">
              <SelectCrm
                className={ANCHO_FILTRO}
                aria-label={t('periodo')}
                valor={periodoActual ?? ''}
                disabled={!periodoActual}
                onValorChange={(v) => { setPeriodo(v); setPagina(1); }}
                opciones={periodoActual ? opcionesTrimestre(periodoActual).map((p) => ({ valor: p, etiqueta: t('trimestre', partesTrimestre(p)) })) : []}
              />
              {datos?.canViewAll && datos.teams.length > 0 && (
                <SelectCrm
                  className={ANCHO_FILTRO}
                  aria-label={t('equipo')}
                  valor={equipo ?? ''}
                  opcionVacia={t('equipoOpcion', { nombre: t('todosLosEquipos') })}
                  onValorChange={(v) => { setEquipo(v || null); setPagina(1); }}
                  opciones={datos.teams.map((e) => ({ valor: e.id, etiqueta: t('equipoOpcion', { nombre: e.name }) }))}
                />
              )}
              <SegmentedControl etiqueta={t('vista')} valor={vista} onValorChange={(v) => { setVista(v); setPagina(1); }} opciones={[{ valor: 'vendedor', etiqueta: t('vistas.vendedor') }, { valor: 'mes', etiqueta: t('vistas.mes') }]} />
            </div>

            {cuerpo === 'sinCuotas' ? (
              <div className="rounded-xl border border-line bg-surface">
                <EmptyState icono={TrendingUp} titulo={t('sinCuotas.titulo')} descripcion={t('sinCuotas.descripcion')} accion={datos?.canViewAll ? { etiqueta: t('sinCuotas.accion'), href: '/app/organizacion/miembros' } : undefined} />
              </div>
            ) : (
              <>
                <CifrasTrimestre resumen={listos?.summary ?? null} moneda={listos?.moneda ?? null} enDetalle={enDetalle} />
                {listos && !enDetalle && <CoberturaCuota resumen={listos.summary} moneda={listos.moneda} />}
                {cuerpo === 'sinOportunidades' ? (
                  <div className="rounded-xl border border-line bg-surface">
                    <EmptyState icono={TrendingUp} titulo={t('sinOportunidades.titulo')} descripcion={t('sinOportunidades.descripcion')} accion={{ etiqueta: t('sinOportunidades.accion'), href: '/app/crm/pipeline' }} />
                  </div>
                ) : !moneda ? (
                  <EsqueletoTabla etiqueta={t('cargando')} />
                ) : cuerpo === 'meses' ? (
                  <TablaMesesPronostico meses={listos?.months ?? []} moneda={moneda} hayAjustes={(listos?.adjustments.length ?? 0) > 0} estado={listos ? 'listo' : 'cargando'} />
                ) : cuerpo === 'oportunidades' ? (
                  <OportunidadesPronostico filas={listos?.opportunities ?? []} total={listos?.opportunityCount ?? 0} pagina={pagina} onPagina={setPagina} moneda={moneda} estado={listos ? 'listo' : 'cargando'} onCambio={recargar} />
                ) : (
                  <TablaVendedoresPronostico filas={listos?.rows ?? []} nombre={nombreDe} moneda={moneda} puedeAjustar={!!listos?.canAdjust} onVer={verVendedor} onAjustar={setAjustar} estado={listos ? 'listo' : 'cargando'} />
                )}
              </>
            )}
          </div>
        </>
      )}

      {datos && periodoActual && (
        <>
          <DialogoAjustePronostico fila={ajustar} nombre={nombreDe(ajustar?.userId ?? null)} periodo={periodoActual} moneda={datos.moneda} onCerrar={() => setAjustar(null)} onGuardado={() => { setAjustar(null); recargar(); }} />
          <HistorialAjustes abierto={historial} onAbiertoChange={setHistorial} ajustes={datos.adjustments} nombre={nombreDe} moneda={datos.moneda} periodo={trimestre} />
        </>
      )}
    </div>
  );
}
