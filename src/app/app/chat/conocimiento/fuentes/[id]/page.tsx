'use client';

/**
 * Detalle de una fuente de conocimiento (Figma 91-chat-31): cifras, buscador,
 * filtro por etiqueta y tabla de fragmentos. Reindexar, Ajustes y Nuevo
 * fragmento usan `knowledgeService` como antes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, RefreshCw, Settings } from 'lucide-react';
import { ConfirmDialog, EmptyState, KpiStrip, SearchInput, StatCard, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import KnowledgeService, { type CreateFragmentData, type CreateSourceData, type KnowledgeFragment, type KnowledgeSource } from '@/lib/services/knowledgeService';
import { CabeceraDetalleChat } from '@/components/chat/CabeceraDetalleChat';
import { FragmentDetailDialog, SourceSettingsDialog } from '@/components/chat/conocimiento/fuentes/id';
import { TablaFragmentos } from '@/components/chat/conocimiento/TablaFragmentos';
import { useMiembroActual } from '@/components/chat/conocimiento/useMiembroActual';
import { filtrarFragmentos, resumenFragmentos } from '@/components/chat/conocimiento/conocimientoLogica';

const TODAS = '__todas__';

export default function SourceDetailPage() {
  const t = useTranslations('chatModulo.conocimiento');
  const router = useRouter();
  const params = useParams();
  const sourceId = params?.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const memberId = useMiembroActual(organizationId);

  const [fuente, setFuente] = useState<KnowledgeSource | null>(null);
  const [fragmentos, setFragmentos] = useState<KnowledgeFragment[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'noEncontrada' | 'error' | null>(null);
  const [reindexando, setReindexando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [etiqueta, setEtiqueta] = useState(TODAS);
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
    } catch (e) {
      console.error('Error cargando la fuente:', e);
      setError('error');
    } finally {
      setCargando(false);
    }
  }, [organizationId, sourceId]);

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

  const etiquetas = useMemo(() => Array.from(new Set(fragmentos.flatMap((f) => f.tags ?? []))).sort((a, b) => a.localeCompare(b)), [fragmentos]);
  const visibles = useMemo(() => filtrarFragmentos(fragmentos, busqueda, etiqueta === TODAS ? null : etiqueta), [fragmentos, busqueda, etiqueta]);
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
        volverA="/app/chat/conocimiento"
        migas={[t('migas.chat'), t('migas.conocimiento')]}
        badge={
          <Badge tono={fuente.is_active ? 'exito' : 'neutro'} tamano="sm">
            {t(fuente.is_active ? 'estados.activa' : 'estados.inactiva')}
          </Badge>
        }
        subtitulo={[fuente.description, t('fuentes.fragmentos', { n: fragmentos.length })].filter(Boolean).join(' · ')}
        acciones={
          <>
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
        <StatCard etiqueta={t('kpis.usos')} valor={r.usos.toLocaleString()} detalle={t('kpis.usosDetalle')} cargando={cargando} />
      </KpiStrip>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('fuente.buscar')} className="w-full sm:max-w-sm" />
        <Select value={etiqueta} onValueChange={setEtiqueta}>
          <SelectTrigger className="w-full sm:w-56" aria-label={t('fuente.filtroEtiqueta')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>{t('fuente.todasEtiquetas')}</SelectItem>
            {etiquetas.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TablaFragmentos
        fragmentos={visibles}
        estado={cargando ? 'cargando' : visibles.length === 0 && (busqueda || etiqueta !== TODAS) ? 'sinResultados' : 'listo'}
        termino={busqueda}
        onLimpiarFiltros={() => {
          setBusqueda('');
          setEtiqueta(TODAS);
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
        onSubmit={async (datos: CreateSourceData) => {
          await conMiembro((s, m) => s.updateSource(sourceId, datos, m), t('toasts.fuenteActualizada'));
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
