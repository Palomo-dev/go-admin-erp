'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Kanban, Plus, Settings } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { SearchInput } from '@/components/kit/SearchInput';
import { idPanel, idPestana, TabBar } from '@/components/kit/TabBar';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { Dialogo } from '@/components/kit/Dialogo';
import { clasesBoton } from '@/components/kit/botonClases';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { useOpcionUrl, useParametrosUrl } from '@/components/kit/useParametroUrl';
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
import { SelectorPipelineMovil } from './SelectorPipelineMovil';
import { NuevoPipelineAsistente } from './NuevoPipelineAsistente';
import { EtapasPipeline } from './EtapasPipeline';
import { EstadoTablero, SinEmbudoVentas } from './EstadosPipeline';
import { abiertasDePipeline, elegirPipeline, usePipelines } from './usePipelines';
import { useTableroPipeline } from './useTableroPipeline';

/**
 * Pipeline (CRM ola 3B, plan §4.2 y §4.3; Figma 768:454428 y sus 16 estados
 * de escritorio y móvil): selector de embudo, «Etapas», «Nueva oportunidad»,
 * vistas Kanban · Tabla · Pronóstico · Clientes · Automatización, búsqueda,
 * filtros con chips, 4 KPI en moneda base, kanban con arrastre (optimista y
 * con reversión) y drawer. Estados: cargando, vacío, sin resultados, error,
 * sin permiso y sin embudo de ventas. Todo por `/api/crm/**`.
 *
 * Regla de pestañas (2026-10-06): las SECCIONES (Oportunidades · Pronóstico ·
 * Clientes · Automatización) son `TabBar` con `?pestana=`; dentro de
 * «Oportunidades», Kanban/Tabla es la VISTA de los mismos datos y va en un
 * `SegmentedControl` con `?vista=`. Un enlace viejo `?vista=pronostico` (o
 * clientes, automatización) sigue abriendo esa sección.
 *
 * El embudo va en `?pipeline=<id>`: sin él, o con uno que ya no existe, abre
 * el POR DEFECTO, si no el primero de ventas, si no el primero
 * (`elegirPipeline`). En móvil el título «<pipeline> ▾» de la cabecera abre
 * `SelectorPipelineMovil`; ahí no hay pestañas ni vistas (PATRONES §3).
 */
type Seccion = 'oportunidades' | 'pronostico' | 'clientes' | 'automatizacion';
const SECCIONES: readonly Seccion[] = ['oportunidades', 'pronostico', 'clientes', 'automatizacion'];
type Vista = 'kanban' | 'tabla';
const VISTAS: readonly Vista[] = ['kanban', 'tabla'];

/** Sección de la URL; `?vista=` de antes de la regla (pronostico…) cuenta como sección. */
export function seccionPipelineDeUrl(pestana: string | null, vista: string | null): Seccion {
  if (pestana && (SECCIONES as readonly string[]).includes(pestana)) return pestana as Seccion;
  if (vista && vista !== 'oportunidades' && (SECCIONES as readonly string[]).includes(vista)) return vista as Seccion;
  return 'oportunidades';
}

export function PipelinePantalla() {
  const t = useTranslations('crm.oportunidad.pipeline');
  const tSelector = useTranslations('crm.oportunidad.selector');
  const router = useRouter();
  const escritorio = useEsEscritorio();
  const { getToday, timezone } = useFormatDate();
  const hoy = getToday();
  const moneda = useMonedaOrganizacion();
  const cat = useCatalogosCrm();
  const permisos = permisosPantalla(cat.permisos);
  const pls = usePipelines(hoy);
  const url = useParametrosUrl();
  const pipelineUrl = url.leer('pipeline');
  // Un id de la URL que no está en la lista (borrado, de otra organización) no cuenta como elegido.
  const elegido = pipelineUrl && (pls.lista === null || pls.lista.some((p) => p.id === pipelineUrl)) ? pipelineUrl : null;
  const setElegido = (id: string | null) => url.fijar({ pipeline: id });
  const pipelineId = elegirPipeline(pls.lista ?? [], elegido);
  const [vistaUrl, setVista] = useOpcionUrl('vista', VISTAS, 'kanban');
  const seccionUrl = seccionPipelineDeUrl(url.leer('pestana'), url.leer('vista'));
  const setSeccion = (s: Seccion) => url.fijar({ pestana: s === 'oportunidades' ? null : s, vista: null });
  // En móvil no hay pestañas ni vistas (PATRONES §3): un enlace con `?pestana=` o `?vista=` no deja a nadie sin salida.
  const seccion: Seccion = escritorio ? seccionUrl : 'oportunidades';
  const vista: Vista = escritorio ? vistaUrl : 'kanban';
  const enOportunidades = seccion === 'oportunidades';
  const abiertasDe = (id: string) => abiertasDePipeline(pls.resumen, id, hoy);
  const [selectorMovil, setSelectorMovil] = useState(false);
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
  const acciones = useAccionesOportunidad({
    etapas: etapasFlujo,
    permisos,
    usuarioId: cat.usuarioId,
    onVer: setDrawer,
    onCambio: (id, destino) => {
      if (id && destino) tablero.mover(id, destino);
      if (id) tablero.olvidar(id);
    },
    onRevertir: tablero.revertir,
  });

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
      url.fijar({ pipeline: null }, 'replace');
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
    <div className="flex min-h-full w-full min-w-0 max-w-full flex-col gap-4 bg-canvas p-4 lg:p-6">
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
                  abiertas={abiertasDe}
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
        movil={{
          titulo: actual && !mostrarSinEmbudo ? actual.name : t('titulo'),
          subtitulo: actual && !mostrarSinEmbudo ? t('subtitulo', { embudo: t('titulo'), n: resumen?.conteos.open ?? 0 }) : undefined,
          // Antes el selector solo vivía en las acciones de escritorio: en móvil no se podía cambiar de embudo.
          onTitulo: estado !== 'sinPermiso' && pls.lista && pls.lista.length > 0 ? () => setSelectorMovil(true) : undefined,
          tituloAria: tSelector('aria', { nombre: actual?.name ?? '' }),
          accion: permisos.crear && !mostrarSinEmbudo ? <button type="button" aria-label={t('nueva')} onClick={() => setNueva({ etapaId: null })} className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover"><Plus aria-hidden="true" className="size-5" /></button> : undefined }}
      />

      {mostrarSinEmbudo ? (
        <SinEmbudoVentas sinColocar={sinColocar} puedeCrear={permisos.gestionarPipelines} onCrear={() => setAsistente('sales')} />
      ) : estado === 'sinPermiso' ? (
        <EstadoTablero estado="sinPermiso" puedeCrear={false} onCrear={() => undefined} onLimpiar={() => undefined} onReintentar={() => undefined} />
      ) : (
        <>
          {escritorio && (
            <TabBar id="pipeline-seccion" etiqueta={t('secciones.aria')} valor={seccion} onValorChange={setSeccion} pestanas={SECCIONES.map((v) => ({ valor: v, etiqueta: t(`secciones.${v}`) }))} />
          )}
          {enOportunidades && (
            <div className="flex flex-wrap items-center gap-2">
              {escritorio && <SegmentedControl etiqueta={t('vistas.aria')} valor={vista} onValorChange={setVista} opciones={VISTAS.map((v) => ({ valor: v, etiqueta: t(`vistas.${v}`) }))} />}
              {/* En móvil no hay vistas: sin el espaciador, el buscador ocupa el ancho (PATRONES §3). */}
              {escritorio && <span className="flex-1" />}
              <SearchInput value={filtros.q} onChange={(q) => setFiltros({ ...filtros, q })} placeholder={t('buscar')} etiqueta={t('buscar')} cargando={tablero.cargando} className="min-w-0 flex-1 sm:w-72 sm:flex-none" />
              <FiltrosOportunidades filtros={filtros} onFiltros={setFiltros} usuarios={cat.usuarios} />
            </div>
          )}
          <div role={escritorio ? 'tabpanel' : undefined} id={escritorio ? idPanel('pipeline-seccion', seccion) : undefined} aria-labelledby={escritorio ? idPestana('pipeline-seccion', seccion) : undefined} className="flex min-w-0 flex-col gap-4">
            {enOportunidades && <ChipsFiltrosOportunidades filtros={filtros} onFiltros={setFiltros} usuarios={cat.usuarios} />}
            {enOportunidades && (estado === 'error' || estado === 'vacio' || estado === 'sinResultados') ? (
              <EstadoTablero estado={estado} puedeCrear={permisos.crear} onCrear={() => setNueva({ etapaId: null })} onLimpiar={() => setFiltros(filtrosVacios())} onReintentar={() => { tablero.recargar(); pls.recargar(); }} />
            ) : enOportunidades && vista === 'kanban' ? (
              <>
                {escritorio && <KpisOportunidades resumen={resumen} hoy={hoy} cargando={estado === 'cargando'} />}
                {escritorio ? (
                  <KanbanTablero etapas={etapas} tablero={tablero.tablero} resumen={resumen} hoy={hoy} moneda={moneda} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} acciones={acciones} mover={tablero.mover} onAbrir={setDrawer} onCrear={(e) => setNueva({ etapaId: e })} onConfigurarEtapa={(id) => { setEditarEtapa(id); setEtapasAbierto(true); }} onCargarMas={tablero.cargarMas} onReintentarColumna={tablero.reintentarColumna} />
                ) : (
                  <PipelineMovil etapas={etapas} tablero={tablero.tablero} resumen={resumen} hoy={hoy} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} acciones={acciones} onAbrir={setDrawer} onCargarMas={tablero.cargarMas} />
                )}
              </>
            ) : enOportunidades ? (
              <TablaPipeline pipelineId={pipelineId} query={query} etapas={etapasFlujo} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} acciones={acciones} onAbrir={setDrawer} />
            ) : pipelineId && seccion === 'pronostico' ? (
              <ForecastView pipelineId={pipelineId} />
            ) : pipelineId && seccion === 'clientes' ? (
              <ClientsView pipelineId={pipelineId} />
            ) : pipelineId ? (
              <AutomationsView pipelineId={pipelineId} />
            ) : null}
          </div>
        </>
      )}

      <OportunidadDrawer id={drawer} onCerrar={() => setDrawer(null)} etapas={etapasFlujo} usuarios={cat.usuarios} usuarioId={cat.usuarioId} permisos={permisos} acciones={acciones} />
      <NuevaOportunidadDialogo abierto={!!nueva} onAbiertoChange={(a) => !a && setNueva(null)} pipelineId={pipelineId} etapaId={nueva?.etapaId ?? null} pipelines={cat.pipelines} etapas={cat.etapas} usuarios={cat.usuarios} usuarioId={cat.usuarioId} onCreada={setDrawer} onPaginaCompleta={() => router.push(`/app/crm/oportunidades/nuevo?pipeline=${pipelineId ?? ''}&etapa=${nueva?.etapaId ?? ''}`)} />
      <NuevoPipelineAsistente abierto={asistente !== null} onAbiertoChange={(a) => !a && setAsistente(null)} existentes={pls.lista ?? []} plantillaInicial={asistente ?? undefined} onCreado={(id) => { setElegido(id); pls.recargar(); }} />
      {pipelineId && <EtapasPipeline pipelineId={pipelineId} etapas={etapas} abierto={etapasAbierto} onAbiertoChange={setEtapasAbierto} editarId={editarEtapa} onEditarId={setEditarEtapa} cantidadPorEtapa={(id) => resumen?.por_etapa[id]?.cantidad ?? 0} />}
      {!escritorio && pls.lista && (
        <SelectorPipelineMovil
          abierto={selectorMovil}
          onAbiertoChange={setSelectorMovil}
          pipelines={pls.lista}
          abiertas={abiertasDe}
          actualId={mostrarSinEmbudo ? null : pipelineId}
          onElegir={setElegido}
          puedeGestionar={permisos.gestionarPipelines}
          puedeGestionarEtapas={permisos.gestionarEtapas}
          onNuevo={() => setAsistente(undefined)}
          onPorDefecto={() => void porDefecto()}
          onEditarEtapas={() => setEtapasAbierto(true)}
        />
      )}
      <Dialogo abierto={borrarPipeline} onAbiertoChange={setBorrarPipeline} titulo={t('eliminarTitulo', { nombre: actual?.name ?? '' })} descripcion={t('eliminarDescripcion')} primario={{ etiqueta: t('eliminar'), onClick: () => void eliminarPipeline(), destructiva: true }} textoCancelar={t('cancelar')} ancho={440} />
      {acciones.dialogos}
    </div>
  );
}
