'use client';

/**
 * Conocimiento del Chat (Figma 91-chat-30): lo que la IA puede usar para
 * responder. Cifras, pestañas Fuentes (tarjetas) · Todos los fragmentos
 * (tabla). Toda escritura pasa por `knowledgeService`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, BookOpen, Plus, Settings, Upload } from 'lucide-react';
import { ConfirmDialog, EmptyState, KpiStrip, PageHeader, SearchInput, StatCard, TabBar, clasesBoton, idPanel } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import KnowledgeService, {
  type CreateFragmentData,
  type CreateSourceData,
  type KnowledgeFragment,
  type KnowledgeSource,
  type KnowledgeStats,
} from '@/lib/services/knowledgeService';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';
import { FragmentDialog, SourceDialog } from '@/components/chat/conocimiento';
import { TarjetaFuente } from '@/components/chat/conocimiento/TarjetaFuente';
import { TablaFragmentos } from '@/components/chat/conocimiento/TablaFragmentos';
import { useMiembroActual } from '@/components/chat/conocimiento/useMiembroActual';

type Pestana = 'fuentes' | 'fragmentos';

export default function ConocimientoPage() {
  const t = useTranslations('chatModulo.conocimiento');
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const memberId = useMiembroActual(organizationId);

  const [pestana, setPestana] = useState<Pestana>('fuentes');
  const [fuentes, setFuentes] = useState<KnowledgeSource[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [fragmentos, setFragmentos] = useState<KnowledgeFragment[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const [fuenteEditada, setFuenteEditada] = useState<KnowledgeSource | null>(null);
  const [dialogoFuente, setDialogoFuente] = useState(false);
  const [fragmentoEditado, setFragmentoEditado] = useState<KnowledgeFragment | null>(null);
  const [dialogoFragmento, setDialogoFragmento] = useState(false);
  const [borrar, setBorrar] = useState<{ tipo: 'fuente'; fuente: KnowledgeSource } | { tipo: 'fragmento'; fragmento: KnowledgeFragment } | null>(null);
  const [borrando, setBorrando] = useState(false);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    setFallo(false);
    try {
      const s = new KnowledgeService(organizationId);
      const [f, st] = await Promise.all([s.getSources(), s.getStats()]);
      setFuentes(f);
      setStats(st);
    } catch (e) {
      console.error('Error cargando conocimiento:', e);
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, [organizationId]);

  const cargarFragmentos = useCallback(async () => {
    if (!organizationId) return;
    setFragmentos(null);
    try {
      setFragmentos(await new KnowledgeService(organizationId).getFragments({ search: busqueda || undefined }));
    } catch (e) {
      console.error('Error cargando fragmentos:', e);
      setFragmentos([]);
    }
  }, [organizationId, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (pestana === 'fragmentos') cargarFragmentos();
  }, [pestana, cargarFragmentos]);

  const conMiembro = async (accion: (s: KnowledgeService, m: number) => Promise<unknown>, exito: string, error: string) => {
    if (!organizationId || !memberId) {
      toast({ title: t('toasts.sinMiembro'), variant: 'destructive' });
      throw new Error('sin miembro');
    }
    try {
      await accion(new KnowledgeService(organizationId), memberId);
      toast({ title: exito });
    } catch (e) {
      console.error(error, e);
      toast({ title: t('toasts.error'), variant: 'destructive' });
      throw e;
    }
  };

  const guardarFuente = async (datos: CreateSourceData) => {
    await conMiembro(
      (s, m) => (fuenteEditada ? s.updateSource(fuenteEditada.id, datos, m) : s.createSource(datos, m)),
      t(fuenteEditada ? 'toasts.fuenteActualizada' : 'toasts.fuenteCreada'),
      'Error guardando fuente:',
    );
    await cargar();
  };

  const alternarFuente = (f: KnowledgeSource) =>
    conMiembro((s, m) => s.toggleSourceStatus(f.id, m), t(f.is_active ? 'toasts.fuenteDesactivada' : 'toasts.fuenteActivada', { nombre: f.name }), 'Error cambiando fuente:')
      .then(cargar)
      .catch(() => undefined);

  const guardarFragmento = async (datos: CreateFragmentData) => {
    await conMiembro(
      (s, m) => (fragmentoEditado ? s.updateFragment(fragmentoEditado.id, datos, m) : s.createFragment(datos, m)),
      t(fragmentoEditado ? 'toasts.fragmentoActualizado' : 'toasts.fragmentoCreado'),
      'Error guardando fragmento:',
    );
    await Promise.all([cargar(), pestana === 'fragmentos' ? cargarFragmentos() : Promise.resolve()]);
  };

  const alternarFragmento = (f: KnowledgeFragment) =>
    conMiembro((s, m) => s.toggleFragmentStatus(f.id, m), t(f.is_active ? 'toasts.fragmentoDesactivado' : 'toasts.fragmentoActivado'), 'Error cambiando fragmento:')
      .then(cargarFragmentos)
      .catch(() => undefined);

  const confirmarBorrado = async () => {
    if (!borrar) return;
    setBorrando(true);
    try {
      if (borrar.tipo === 'fuente') {
        await conMiembro((s, m) => s.deleteSource(borrar.fuente.id, m), t('toasts.fuenteEliminada'), 'Error eliminando fuente:');
      } else {
        await conMiembro((s, m) => s.deleteFragment(borrar.fragmento.id, m), t('toasts.fragmentoEliminado'), 'Error eliminando fragmento:');
        await cargarFragmentos();
      }
      setBorrar(null);
      await cargar();
    } catch {
      /* ya avisó */
    } finally {
      setBorrando(false);
    }
  };

  const total = stats?.totalFragments ?? 0;
  const listos = Math.min(stats?.indexedFragments ?? 0, total);
  const pendientes = Math.max(0, total - listos);
  const pct = total ? Math.round((listos / total) * 100) : 0;
  const sinDato = t('sinDato');

  const pestanas = useMemo(
    () => [
      { valor: 'fuentes' as const, etiqueta: t('pestanas.fuentes'), contador: stats?.totalSources },
      { valor: 'fragmentos' as const, etiqueta: t('pestanas.fragmentos'), contador: stats?.totalFragments },
    ],
    [t, stats],
  );

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={BookOpen}
        cargando={cargando}
        acciones={
          <>
            <a href={rutaSeccion('chat.ia')} className={clasesBoton({ variante: 'fantasma' })}>
              <Settings aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('configurarIa')}
            </a>
            <button type="button" onClick={() => router.push('/app/chat/conocimiento/importar')} className={clasesBoton({ variante: 'secundario' })}>
              <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('importar')}
            </button>
            <button
              type="button"
              onClick={() => {
                setFuenteEditada(null);
                setDialogoFuente(true);
              }}
              className={clasesBoton()}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevaFuente')}
            </button>
          </>
        }
        movil={{ accionesEnFila: true }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard etiqueta={t('kpis.fuentes')} valor={stats?.totalSources ?? sinDato} detalle={stats ? t('kpis.activas', { n: stats.activeSources }) : undefined} cargando={cargando} />
        <StatCard etiqueta={t('kpis.fragmentos')} valor={stats?.totalFragments ?? sinDato} cargando={cargando} />
        <StatCard etiqueta={t('kpis.listos')} valor={stats ? listos : sinDato} detalle={stats && total ? `${pct} %` : undefined} tono="exito" cargando={cargando} />
        <StatCard
          etiqueta={t('kpis.pendientes')}
          valor={stats ? pendientes : sinDato}
          detalle={pendientes > 0 ? t('kpis.pendientesDetalle') : undefined}
          tono={pendientes > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={pendientes > 0 ? AlertTriangle : undefined}
          cargando={cargando}
        />
      </KpiStrip>

      <TabBar<Pestana> id="conocimiento" etiqueta={t('pestanas.etiqueta')} valor={pestana} onValorChange={setPestana} pestanas={pestanas} className="max-w-3xl" />

      <div role="tabpanel" id={idPanel('conocimiento', pestana)} className="flex flex-col gap-4">
        {pestana === 'fuentes' ? (
          fallo ? (
            <EmptyState variante="error" titulo={t('error')} onReintentar={cargar} />
          ) : cargando && fuentes.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : fuentes.length === 0 ? (
            <EmptyState
              titulo={t('fuentes.vacioTitulo')}
              descripcion={t('fuentes.vacioDescripcion')}
              icono={BookOpen}
              accion={{ etiqueta: t('nuevaFuente'), onClick: () => setDialogoFuente(true) }}
              accionSecundaria={{ etiqueta: t('importar'), href: '/app/chat/conocimiento/importar' }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {fuentes.map((f) => (
                <TarjetaFuente
                  key={f.id}
                  fuente={f}
                  onAbrir={() => router.push(`/app/chat/conocimiento/fuentes/${f.id}`)}
                  onEditar={() => {
                    setFuenteEditada(f);
                    setDialogoFuente(true);
                  }}
                  onAlternar={() => alternarFuente(f)}
                  onEliminar={() => setBorrar({ tipo: 'fuente', fuente: f })}
                />
              ))}
            </div>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscarFragmentos')} className="w-full sm:max-w-sm" />
              <button
                type="button"
                onClick={() => {
                  setFragmentoEditado(null);
                  setDialogoFragmento(true);
                }}
                className={clasesBoton({ variante: 'secundario', className: 'ml-auto' })}
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('nuevoFragmento')}
              </button>
            </div>
            <TablaFragmentos
              conFuente
              fragmentos={fragmentos ?? []}
              estado={fragmentos === null ? 'cargando' : fragmentos.length === 0 && busqueda ? 'sinResultados' : 'listo'}
              termino={busqueda}
              onLimpiarFiltros={() => setBusqueda('')}
              onAbrir={(f) => router.push(`/app/chat/conocimiento/fragmentos/${f.id}`)}
              onEditar={(f) => {
                setFragmentoEditado(f);
                setDialogoFragmento(true);
              }}
              onAlternar={alternarFragmento}
              onEliminar={(f) => setBorrar({ tipo: 'fragmento', fragmento: f })}
              vacio={{ titulo: t('fragmentos.vacioTitulo'), descripcion: t('fragmentos.vacioDescripcion') }}
            />
          </>
        )}
      </div>

      <SourceDialog open={dialogoFuente} onOpenChange={setDialogoFuente} source={fuenteEditada} onSubmit={guardarFuente} />
      <FragmentDialog
        open={dialogoFragmento}
        onOpenChange={setDialogoFragmento}
        fragment={fragmentoEditado}
        sources={fuentes}
        onSubmit={guardarFragmento}
      />
      <ConfirmDialog
        abierto={!!borrar}
        onAbiertoChange={(a) => !a && !borrando && setBorrar(null)}
        tono="peligro"
        cargando={borrando}
        titulo={t(borrar?.tipo === 'fuente' ? 'borrar.fuenteTitulo' : 'borrar.fragmentoTitulo')}
        descripcion={
          borrar?.tipo === 'fuente'
            ? t('borrar.fuenteDescripcion', { nombre: borrar.fuente.name, n: borrar.fuente.fragment_count ?? 0 })
            : t('borrar.fragmentoDescripcion', { titulo: borrar?.tipo === 'fragmento' ? borrar.fragmento.title : '' })
        }
        textoConfirmar={t('borrar.confirmar')}
        onConfirmar={confirmarBorrado}
      />
    </div>
  );
}
