'use client';

/**
 * Detalle de una fuente de conocimiento (Figma 91-chat-31 y
 * 94-chat-recuperado-ia-03): emoji y nombre, cifras (la cuarta, «Usados esta
 * semana», son las respuestas de la IA de los últimos 7 días que usaron algún
 * fragmento de la fuente, de `ai_jobs.fragments_used`), buscador, filtro por
 * varias etiquetas, «Mostrando X de Y» y tabla de fragmentos. Reindexar,
 * Ajustes y Nuevo fragmento usan `knowledgeService` como antes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, RefreshCw, RotateCw, Settings } from 'lucide-react';
import { ConfirmDialog, EmptyState, KpiStrip, SearchInput, StatCard, clasesBoton } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import KnowledgeService, { type CreateFragmentData, type CreateSourceData, type KnowledgeFragment, type KnowledgeSource } from '@/lib/services/knowledgeService';
import { CabeceraDetalleChat } from '@/components/chat/CabeceraDetalleChat';
import { FragmentDetailDialog, SourceSettingsDialog } from '@/components/chat/conocimiento/fuentes/id';
import { TablaFragmentos } from '@/components/chat/conocimiento/TablaFragmentos';
import { useMiembroActual } from '@/components/chat/conocimiento/useMiembroActual';
import { etiquetasDeFragmentos, filtrarFragmentos, resumenFragmentos } from '@/components/chat/conocimiento/conocimientoLogica';

export default function SourceDetailPage() {
  const t = useTranslations('chatModulo.conocimiento');
  const tr = useTranslations('chatRecuperado.conocimiento');
  const router = useRouter();
  const params = useParams();
  const sourceId = params?.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const memberId = useMiembroActual(organizationId);
  const { getToday, toInstant } = useFormatDate();

  const [fuente, setFuente] = useState<KnowledgeSource | null>(null);
  const [fragmentos, setFragmentos] = useState<KnowledgeFragment[]>([]);
  const [usosSemana, setUsosSemana] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'noEncontrada' | 'error' | null>(null);
  const [reindexando, setReindexando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [editado, setEditado] = useState<KnowledgeFragment | null>(null);
  const [dialogoFragmento, setDialogoFragmento] = useState(false);
  const [dialogoAjustes, setDialogoAjustes] = useState(false);
  const [borrar, setBorrar] = useState<KnowledgeFragment | null>(null);
  const [borrando, setBorrando] = useState(false);

  const cargar = useCallback(async () => {
    if (!organizationId || !sourceId) return;
    setCargando(true);
    setError(null);
    try {
      const s = new KnowledgeService(organizationId);
      const [f, frs] = await Promise.all([s.getSourceWithStats(sourceId), s.getFragments({ sourceId })]);
      if (!f) {
        setFuente(null);
        setError('noEncontrada');
        return;
      }
      setFuente(f);
      setFragmentos(frs);
      // Últimos 7 días contando hoy, en la zona de la organización.
      s.countRecentUsage(frs.map((x) => x.id), toInstant(addPlainDays(getToday(), -6)))
        .then(setUsosSemana)
        .catch((e) => {
          console.error('Error contando los usos de la semana:', e);
          setUsosSemana(null);
        });
    } catch (e) {
      console.error('Error cargando la fuente:', e);
      setError('error');
    } finally {
      setCargando(false);
    }
  }, [organizationId, sourceId, getToday, toInstant]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const conMiembro = async (accion: (s: KnowledgeService, m: number) => Promise<unknown>, exito: string) => {
    if (!organizationId || !memberId) {
      toast({ title: t('toasts.sinMiembro'), variant: 'destructive' });
      throw new Error('sin miembro');
    }
    try {
      await accion(new KnowledgeService(organizationId), memberId);
      toast({ title: exito });
    } catch (e) {
      console.error('Error en la fuente de conocimiento:', e);
      toast({ title: t('toasts.error'), variant: 'destructive' });
      throw e;
    }
  };

  const reindexar = async () => {
    setReindexando(true);
    try {
      await conMiembro((s, m) => s.reindexFragments(sourceId, m), t('toasts.reindexando'));
      await cargar();
    } catch {
      /* ya avisó */
    } finally {
      setReindexando(false);
    }
  };

  const opcionesEtiqueta = useMemo(() => etiquetasDeFragmentos(fragmentos).map((e) => ({ valor: e, etiqueta: e })), [fragmentos]);
  const visibles = useMemo(() => filtrarFragmentos(fragmentos, busqueda, etiquetas), [fragmentos, busqueda, etiquetas]);
  const r = resumenFragmentos(fragmentos);

  if (!fuente) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
        {cargando ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-24" />
            <Skeleton className="h-80" />
          </div>
        ) : (
          <EmptyState
            variante={error === 'noEncontrada' ? 'forbidden' : 'error'}
            titulo={t(error === 'noEncontrada' ? 'fuente.noEncontrada' : 'error')}
            accion={{ etiqueta: t('fuente.volver'), href: '/app/chat/conocimiento' }}
            onReintentar={error === 'error' ? cargar : undefined}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <CabeceraDetalleChat
        titulo={fuente.name}
        icono={fuente.icon ? <span aria-hidden="true" className="text-2xl leading-none">{fuente.icon}</span> : undefined}
        volverA="/app/chat/conocimiento"
        migas={[t('migas.chat'), t('migas.conocimiento')]}
        subtitulo={[fuente.description, t('fuentes.fragmentos', { n: fragmentos.length })].filter(Boolean).join(' · ')}
        acciones={
          <>
            <button type="button" onClick={cargar} disabled={cargando} className={clasesBoton({ variante: 'fantasma' })}>
              <RotateCw aria-hidden="true" className={`size-4 ${cargando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              {tr('actualizar')}
            </button>
            <button type="button" onClick={reindexar} disabled={reindexando} className={clasesBoton({ variante: 'secundario' })}>
              <RefreshCw aria-hidden="true" className={`size-4 ${reindexando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              {t('fuente.reindexar')}
            </button>
            <button type="button" onClick={() => setDialogoAjustes(true)} className={clasesBoton({ variante: 'secundario' })}>
              <Settings aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('fuente.ajustes')}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditado(null);
                setDialogoFragmento(true);
              }}
              className={clasesBoton()}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevoFragmento')}
            </button>
          </>
        }
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard etiqueta={t('kpis.fragmentos')} valor={r.total} cargando={cargando} />
        <StatCard etiqueta={t('kpis.activos')} valor={r.activos} cargando={cargando} />
        <StatCard etiqueta={t('kpis.listos')} valor={r.listos} detalle={r.total ? `${r.pctListos} %` : undefined} tono="exito" cargando={cargando} />
        <StatCard etiqueta={tr('usadosSemana')} valor={usosSemana === null ? t('sinDato') : usosSemana.toLocaleString()} detalle={tr('usadosSemanaDetalle')} cargando={cargando} />
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('fuente.buscar')} className="w-full sm:max-w-sm" />
        {opcionesEtiqueta.length > 0 && (
          <>
            <span id="fuente-filtro-etiquetas" className="sr-only">
              {t('fuente.filtroEtiqueta')}
            </span>
            <MultiSelect
              opciones={opcionesEtiqueta}
              valores={etiquetas}
              onValoresChange={setEtiquetas}
              placeholder={t('fuente.todasEtiquetas')}
              etiquetaQuitar={(e) => tr('quitarEtiqueta', { etiqueta: e })}
              aria-labelledby="fuente-filtro-etiquetas"
              className="w-full sm:w-72"
            />
          </>
        )}
        {!cargando && fragmentos.length > 0 && (
          <p className="text-xs text-fg-muted sm:ml-auto" role="status">
            {tr('mostrando', { visibles: visibles.length, total: fragmentos.length })}
          </p>
        )}
      </div>

      <TablaFragmentos
        fragmentos={visibles}
        estado={cargando ? 'cargando' : visibles.length === 0 && (busqueda || etiquetas.length > 0) ? 'sinResultados' : 'listo'}
        termino={busqueda}
        onLimpiarFiltros={() => {
          setBusqueda('');
          setEtiquetas([]);
        }}
        onAbrir={(f) => router.push(`/app/chat/conocimiento/fragmentos/${f.id}`)}
        onEditar={(f) => {
          setEditado(f);
          setDialogoFragmento(true);
        }}
        onAlternar={(f) =>
          conMiembro((s, m) => s.toggleFragmentStatus(f.id, m), t(f.is_active ? 'toasts.fragmentoDesactivado' : 'toasts.fragmentoActivado'))
            .then(cargar)
            .catch(() => undefined)
        }
        onEliminar={setBorrar}
        vacio={{
          titulo: t('fragmentos.vacioFuente'),
          accion: {
            etiqueta: t('nuevoFragmento'),
            onClick: () => {
              setEditado(null);
              setDialogoFragmento(true);
            },
          },
        }}
      />

      <FragmentDetailDialog
        open={dialogoFragmento}
        onOpenChange={setDialogoFragmento}
        fragment={editado}
        sourceId={sourceId}
        onSubmit={async (datos: CreateFragmentData) => {
          await conMiembro(
            (s, m) => (editado ? s.updateFragment(editado.id, datos, m) : s.createFragment(datos, m)),
            t(editado ? 'toasts.fragmentoActualizado' : 'toasts.fragmentoCreado'),
          );
          await cargar();
        }}
      />
      <SourceSettingsDialog
        open={dialogoAjustes}
        onOpenChange={setDialogoAjustes}
        source={fuente}
        onSubmit={async ({ is_active, ...datos }: CreateSourceData & { is_active?: boolean }) => {
          await conMiembro(async (s, m) => {
            await s.updateSource(sourceId, datos, m);
            // Activar o desactivar va por su propio camino (deja su rastro en la auditoría).
            if (is_active !== undefined && fuente && is_active !== fuente.is_active) await s.toggleSourceStatus(sourceId, m);
          }, t('toasts.fuenteActualizada'));
          await cargar();
        }}
      />
      <ConfirmDialog
        abierto={!!borrar}
        onAbiertoChange={(a) => !a && !borrando && setBorrar(null)}
        tono="peligro"
        cargando={borrando}
        titulo={t('borrar.fragmentoTitulo')}
        descripcion={t('borrar.fragmentoDescripcion', { titulo: borrar?.title ?? '' })}
        textoConfirmar={t('borrar.confirmar')}
        onConfirmar={async () => {
          if (!borrar) return;
          setBorrando(true);
          try {
            await conMiembro((s, m) => s.deleteFragment(borrar.id, m), t('toasts.fragmentoEliminado'));
            setBorrar(null);
            await cargar();
          } catch {
            /* ya avisó */
          } finally {
            setBorrando(false);
          }
        }}
      />
    </div>
  );
}
