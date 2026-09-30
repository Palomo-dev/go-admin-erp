'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Kanban, Plus, Settings } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { SearchInput } from '@/components/kit/SearchInput';
import { TabBar } from '@/components/kit/TabBar';
import { Dialogo } from '@/components/kit/Dialogo';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { claveError, emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { useCatalogosCrm, invalidarCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';
import { parametrosResumenLeads } from '@/components/crm/leads/pantalla/leadsPantallaLogica';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { KpisOportunidades } from '@/components/crm/oportunidad/KpisOportunidades';
import { FiltrosOportunidades, ChipsFiltrosOportunidades } from '@/components/crm/oportunidad/FiltrosOportunidades';
import { OportunidadDrawer } from '@/components/crm/oportunidad/OportunidadDrawer';
import { NuevaOportunidadDialogo } from '@/components/crm/oportunidad/NuevaOportunidadDialogo';
import { useAccionesOportunidad } from '@/components/crm/oportunidad/useAccionesOportunidad';
import { filtrosVacios, hayFiltros, parametrosFiltros, parametrosPeriodo, type FiltrosOportunidades as Filtros } from '@/components/crm/oportunidad/filtrosLogica';
import { estadoPantalla, permisosPantalla } from '@/components/crm/oportunidad/oportunidadLogica';
import ForecastView from '../ForecastView';
import ClientsView from '../ClientsView';
import AutomationsView from '../AutomationsView';
import { KanbanTablero } from './KanbanTablero';
import { PipelineMovil } from './PipelineMovil';
import { TablaPipeline } from './TablaPipeline';
import { SelectorPipeline } from './SelectorPipeline';
import { NuevoPipelineAsistente } from './NuevoPipelineAsistente';
import { EtapasPipeline } from './EtapasPipeline';
import { EstadoTablero, SinEmbudoVentas } from './EstadosPipeline';
import { elegirPipeline, usePipelines } from './usePipelines';
import { useTableroPipeline } from './useTableroPipeline';

/**
 * Pipeline (CRM ola 3B, plan §4.2 y §4.3; Figma 768:454428 y sus 16 estados
 * de escritorio y móvil): selector de embudo, «Etapas», «Nueva oportunidad»,
 * vistas Kanban · Tabla · Pronóstico · Clientes · Automatización, búsqueda,
 * filtros con chips, 4 KPI en moneda base, kanban con arrastre (optimista y
 * con reversión) y drawer. Estados: cargando, vacío, sin resultados, error,
 * sin permiso y sin embudo de ventas. Todo por `/api/crm/**`.
 */
type Vista = 'kanban' | 'tabla' | 'pronostico' | 'clientes' | 'automatizacion';

export function PipelinePantalla() {
  const t = useTranslations('crm.oportunidad.pipeline');
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const { getToday, timezone } = useFormatDate();
  const hoy = getToday();
  const moneda = useMonedaOrganizacion();
  const cat = useCatalogosCrm();
  const permisos = permisosPantalla(cat.permisos);
  const pls = usePipelines();
  const [elegido, setElegido] = useState<string | null>(null);
  const pipelineId = elegirPipeline(pls.lista ?? [], elegido);
  const [vista, setVista] = useState<Vista>('kanban');
  const [filtros, setFiltros] = useState<Filtros>(filtrosVacios);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [nueva, setNueva] = useState<{ etapaId: string | null } | null>(null);
  const [asistente, setAsistente] = useState<null | 'sales' | undefined>(null);
  const [etapasAbierto, setEtapasAbierto] = useState(false);
  const [editarEtapa, setEditarEtapa] = useState<string | null>(null);
  const [borrarPipeline, setBorrarPipeline] = useState(false);
  const [sinColocar, setSinColocar] = useState(0);
  const query = parametrosFiltros(filtros, hoy, cat.usuarioId).toString();
  const periodo = parametrosPeriodo(hoy, timezone).toString();
  const tablero = useTableroPipeline({ pipelineId: pls.sinVentas && !elegido ? null : pipelineId, query, periodo });
  const etapas = useMemo(() => tablero.cabecera?.etapas ?? [], [tablero.cabecera]);
  const etapasFlujo = useMemo(() => etapas.map((e) => ({ ...e, pipeline_id: pipelineId ?? undefined })), [etapas, pipelineId]);
  const acciones = useAccionesOportunidad({ etapas: etapasFlujo, permisos, usuarioId: cat.usuarioId, onVer: setDrawer, onCambio: (id) => id && tablero.olvidar(id), onRevertir: tablero.revertir });

  useEffect(() => {
    if (!pls.sinVentas) return;
    void pedirCrm<{ sin_colocar?: number }>(`/api/crm/leads/resumen?${parametrosResumenLeads(hoy, timezone)}`).then(({ data }) => setSinColocar(data?.sin_colocar ?? 0), () => setSinColocar(0));
  }, [pls.sinVentas, hoy, timezone]);

  const resumen = tablero.cabecera?.resumen ?? null;
  const total = resumen ? resumen.conteos.total : null;
  const estado = cat.cargando || pls.lista === null ? 'cargando' : !permisos.ver ? 'sinPermiso' : estadoPantalla({ cargando: tablero.cargando, error: tablero.error ?? pls.error, total, hayFiltros: hayFiltros(filtros) });
  const actual = pls.lista?.find((p) => p.id === pipelineId) ?? null;
  const mostrarSinEmbudo = estado !== 'sinPermiso' && estado !== 'cargando' && pls.sinVentas && !elegido;

  const porDefecto = async () => {
    if (!pipelineId) return;
    try {
      await pedirCrm(`/api/crm/pipelines/${pipelineId}`, { method: 'PATCH', cuerpo: { is_default: true } });
      invalidarCatalogosCrm();
      emitirCambioCrm({ entidad: 'opportunity', accion: 'pipeline' });
      toast({ title: t('porDefectoHecho', { nombre: actual?.name ?? '' }) });
    } catch (e) {
      toast({ title: t('errorPipeline'), description: claveError(e), variant: 'destructive' });
    }
  };
  const eliminarPipeline = async () => {
    if (!pipelineId) return;
    try {
      await pedirCrm(`/api/crm/pipelines/${pipelineId}`, { method: 'DELETE' });
      setBorrarPipeline(false);
      setElegido(null);
      invalidarCatalogosCrm();
      emitirCambioCrm({ entidad: 'opportunity', accion: 'pipeline' });
    } catch (e) {
      toast({ title: t('errorPipeline'), description: claveError(e) === 'conflicto' ? t('pipelineConOportunidades') : claveError(e), variant: 'destructive' });
    }
  };

  const botonNueva = permisos.crear && !mostrarSinEmbudo && (
    <button type="button" onClick={() => setNueva({ etapaId: null })} className={clasesBoton()}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('nueva')}
    </button>
  );
  const subtitulo = mostrarSinEmbudo ? t('subtituloSinEmbudo') : estado === 'sinPermiso' ? t('subtituloSinPermiso') : t('subtitulo', { embudo: actual?.name ?? '—', n: resumen?.conteos.open ?? 0 });

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={Kanban}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('titulo'), href: '/app/crm/pipeline' }, ...(actual ? [{ etiqueta: actual.name }] : [])]}
        cargando={tablero.cargando}
        acciones={
          estado !== 'sinPermiso' && (
            <>
              {pls.lista && pls.lista.length > 0 && (
                <SelectorPipeline
                  pipelines={pls.lista}
                  actualId={mostrarSinEmbudo ? null : pipelineId}
                  onElegir={setElegido}
                  oportunidadesActual={total}
                  puedeGestionar={permisos.gestionarPipelines}
                  puedeGestionarEtapas={permisos.gestionarEtapas}
                  onNuevo={() => setAsistente(undefined)}
                  onPorDefecto={() => void porDefecto()}
                  onEditarEtapas={() => setEtapasAbierto(true)}
                  onEliminar={() => setBorrarPipeline(true)}
                />
              )}
              {permisos.gestionarEtapas && !mostrarSinEmbudo && pipelineId && (
                <button type="button" onClick={() => setEtapasAbierto(true)} className={clasesBoton({ variante: 'secundario' })}>
                  <Settings aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('etapas')}
                </button>
              )}
              {botonNueva}
            </>
          )
        }
        movil={{ titulo: t('titulo'), subtitulo: actual?.name, accion: permisos.crear && !mostrarSinEmbudo ? <button type="button" aria-label={t('nueva')} onClick={() => setNueva({ etapaId: null })} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover"><Plus aria-hidden="true" className="size-5" /></button> : undefined }}
      />

      {mostrarSinEmbudo ? (
        <SinEmbudoVentas sinColocar={sinColocar} puedeCrear={permisos.gestionarPipelines} onCrear={() => setAsistente('sales')} />
      ) : estado === 'sinPermiso' ? (
        <EstadoTablero estado="sinPermiso" puedeCrear={false} onCrear={() => undefined} onLimpiar={() => undefined} onReintentar={() => undefined} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {escritorio && (
              <TabBar id="pipeline-vista" etiqueta={t('vistas.aria')} valor={vista} onValorChange={setVista} pestanas={(['kanban', 'tabla', 'pronostico', 'clientes', 'automatizacion'] as const).map((v) => ({ valor: v, etiqueta: t(`vistas.${v}`) }))} />
            )}
            <span className="flex-1" />
            {(vista === 'kanban' || vista === 'tabla') && (
              <>
                <SearchInput value={filtros.q} onChange={(q) => setFiltros({ ...filtros, q })} placeholder={t('buscar')} etiqueta={t('buscar')} cargando={tablero.cargando} className="min-w-0 flex-1 sm:w-72 sm:flex-none" />
                <FiltrosOportunidades filtros={filtros} onFiltros={setFiltros} usuarios={cat.usuarios} />
              </>
            )}
          </div>
          {(vista === 'kanban' || vista === 'tabla') && <ChipsFiltrosOportunidades filtros={filtros} onFiltros={setFiltros} usuarios={cat.usuarios} />}
          {(vista === 'kanban' || vista === 'tabla') && (estado === 'error' || estado === 'vacio' || estado === 'sinResultados') ? (
            <EstadoTablero estado={estado} puedeCrear={permisos.crear} onCrear={() => setNueva({ etapaId: null })} onLimpiar={() => setFiltros(filtrosVacios())} onReintentar={() => { tablero.recargar(); pls.recargar(); }} />
          ) : vista === 'kanban' ? (
            <>
              {escritorio && <KpisOportunidades resumen={resumen} hoy={hoy} cargando={estado === 'cargando'} />}
              {escritorio ? (
                <KanbanTablero etapas={etapas} tablero={tablero.tablero} resumen={resumen} hoy={hoy} moneda={moneda} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} acciones={acciones} mover={tablero.mover} onAbrir={setDrawer} onCrear={(e) => setNueva({ etapaId: e })} onConfigurarEtapa={(id) => { setEditarEtapa(id); setEtapasAbierto(true); }} onCargarMas={tablero.cargarMas} onReintentarColumna={tablero.reintentarColumna} />
              ) : (
                <PipelineMovil etapas={etapas} tablero={tablero.tablero} resumen={resumen} hoy={hoy} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} acciones={acciones} onAbrir={setDrawer} onCargarMas={tablero.cargarMas} />
              )}
            </>
          ) : vista === 'tabla' ? (
            <TablaPipeline pipelineId={pipelineId} query={query} etapas={etapasFlujo} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} acciones={acciones} onAbrir={setDrawer} />
          ) : pipelineId && vista === 'pronostico' ? (
            <ForecastView pipelineId={pipelineId} />
          ) : pipelineId && vista === 'clientes' ? (
            <ClientsView pipelineId={pipelineId} />
          ) : pipelineId ? (
            <AutomationsView pipelineId={pipelineId} />
          ) : null}
        </>
      )}

      <OportunidadDrawer id={drawer} onCerrar={() => setDrawer(null)} etapas={etapasFlujo} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} acciones={acciones} />
      <NuevaOportunidadDialogo abierto={!!nueva} onAbiertoChange={(a) => !a && setNueva(null)} pipelineId={pipelineId} etapaId={nueva?.etapaId ?? null} pipelines={cat.pipelines} etapas={cat.etapas} usuarios={cat.usuarios} usuarioId={cat.usuarioId} onCreada={setDrawer} onPaginaCompleta={() => router.push(`/app/crm/oportunidades/nuevo?pipeline=${pipelineId ?? ''}&etapa=${nueva?.etapaId ?? ''}`)} />
      <NuevoPipelineAsistente abierto={asistente !== null} onAbiertoChange={(a) => !a && setAsistente(null)} existentes={pls.lista ?? []} plantillaInicial={asistente ?? undefined} onCreado={(id) => { setElegido(id); pls.recargar(); }} />
      {pipelineId && <EtapasPipeline pipelineId={pipelineId} etapas={etapas} abierto={etapasAbierto} onAbiertoChange={setEtapasAbierto} editarId={editarEtapa} onEditarId={setEditarEtapa} cantidadPorEtapa={(id) => resumen?.por_etapa[id]?.cantidad ?? 0} />}
      <Dialogo abierto={borrarPipeline} onAbiertoChange={setBorrarPipeline} titulo={t('eliminarTitulo', { nombre: actual?.name ?? '' })} descripcion={t('eliminarDescripcion')} primario={{ etiqueta: t('eliminar'), onClick: () => void eliminarPipeline(), destructiva: true }} textoCancelar={t('cancelar')} ancho={440} />
      {acciones.dialogos}
    </div>
  );
}
