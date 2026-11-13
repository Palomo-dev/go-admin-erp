'use client';

/**
 * Editor de un fragmento de conocimiento (Figma 91-chat-32): contenido,
 * etiquetas, «Prueba rápida» (¿lo encuentra la búsqueda de la IA?), ajustes
 * (fuente, prioridad, activo) y estado para la IA. Guardar crea una versión
 * nueva (`updateFragmentWithVersion`); «Regenerar para la IA» reindexa.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { AvisoTonal, EmptyState, FilaDato, ListaDatos, FormField, Tarjeta, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import KnowledgeService, { type EmbeddingInfo, type KnowledgeFragment, type KnowledgeSource } from '@/lib/services/knowledgeService';
import AILabService from '@/lib/services/aiLabService';
import { CabeceraDetalleChat } from '@/components/chat/CabeceraDetalleChat';
import { useMiembroActual } from '@/components/chat/conocimiento/useMiembroActual';
import { MAX_CONTENIDO_FRAGMENTO, tramoPrioridad } from '@/components/chat/conocimiento/conocimientoLogica';

type Fragmento = KnowledgeFragment & { embedding_info: EmbeddingInfo | null };
type Prueba = { estado: 'probando' } | { estado: 'listo'; posicion: number | null; total: number } | null;

const SIN_FUENTE = '__ninguna__';

export default function FragmentDetailPage() {
  const t = useTranslations('chatModulo.conocimiento');
  const params = useParams();
  const fragmentId = params?.id as string;
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const memberId = useMiembroActual(organizationId);
  const { formatDateTime } = useFormatDate();

  const [fragmento, setFragmento] = useState<Fragmento | null>(null);
  const [fuentes, setFuentes] = useState<KnowledgeSource[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'noEncontrado' | 'error' | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
  const [prioridad, setPrioridad] = useState(5);
  const [fuenteId, setFuenteId] = useState<string>(SIN_FUENTE);
  const [pregunta, setPregunta] = useState('');
  const [prueba, setPrueba] = useState<Prueba>(null);

  const cargar = useCallback(async () => {
    if (!organizationId || !fragmentId) return;
    setCargando(true);
    setError(null);
    try {
      const s = new KnowledgeService(organizationId);
      const [f, fs] = await Promise.all([s.getFragmentWithEmbedding(fragmentId), s.getSources()]);
      setFuentes(fs);
      if (!f) {
        setFragmento(null);
        setError('noEncontrado');
        return;
      }
      setFragmento(f);
      setTitulo(f.title);
      setContenido(f.content);
      setEtiquetas(f.tags ?? []);
      setPrioridad(f.priority || 5);
      setFuenteId(f.source_id ?? SIN_FUENTE);
    } catch (e) {
      console.error('Error cargando el fragmento:', e);
      setError('error');
    } finally {
      setCargando(false);
    }
  }, [organizationId, fragmentId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambios = useMemo(
    () =>
      !!fragmento &&
      (titulo !== fragmento.title ||
        contenido !== fragmento.content ||
        JSON.stringify(etiquetas) !== JSON.stringify(fragmento.tags ?? []) ||
        prioridad !== (fragmento.priority || 5) ||
        fuenteId !== (fragmento.source_id ?? SIN_FUENTE)),
    [fragmento, titulo, contenido, etiquetas, prioridad, fuenteId],
  );

  const conMiembro = async (accion: (s: KnowledgeService, m: number) => Promise<unknown>, exito: string) => {
    if (!organizationId || !memberId) {
      toast({ title: t('toasts.sinMiembro'), variant: 'destructive' });
      throw new Error('sin miembro');
    }
    try {
      await accion(new KnowledgeService(organizationId), memberId);
      toast({ title: exito });
    } catch (e) {
      console.error('Error en el fragmento:', e);
      toast({ title: t('toasts.error'), variant: 'destructive' });
      throw e;
    }
  };

  const guardar = async () => {
    if (!titulo.trim() || !contenido.trim()) {
      toast({ title: t('editor.faltanDatos'), variant: 'destructive' });
      return;
    }
    setGuardando(true);
    try {
      await conMiembro(
        (s, m) =>
          s.updateFragmentWithVersion(
            fragmentId,
            { title: titulo.trim(), content: contenido.trim(), tags: etiquetas, priority: prioridad, ...(fuenteId !== SIN_FUENTE ? { source_id: fuenteId } : {}) },
            m,
          ),
        t('toasts.fragmentoActualizado'),
      );
      await cargar();
    } catch {
      /* ya avisó */
    } finally {
      setGuardando(false);
    }
  };

  const regenerar = async () => {
    setRegenerando(true);
    try {
      await conMiembro((s, m) => s.reindexSingleFragment(fragmentId, m), t('toasts.reindexando'));
      setTimeout(() => {
        cargar().finally(() => setRegenerando(false));
      }, 3000);
    } catch {
      setRegenerando(false);
    }
  };

  const alternar = () =>
    conMiembro((s, m) => s.toggleFragmentStatus(fragmentId, m), t(fragmento?.is_active ? 'toasts.fragmentoDesactivado' : 'toasts.fragmentoActivado'))
      .then(cargar)
      .catch(() => undefined);

  const agregarEtiqueta = () => {
    const e = nuevaEtiqueta.trim();
    if (e && !etiquetas.includes(e)) setEtiquetas([...etiquetas, e]);
    setNuevaEtiqueta('');
  };

  const probar = async () => {
    if (!organizationId || !pregunta.trim()) return;
    setPrueba({ estado: 'probando' });
    try {
      // La misma búsqueda del Laboratorio, sin generar respuesta: no gasta créditos.
      const encontrados = await new AILabService(organizationId).searchFragmentsByText(pregunta.trim(), 5);
      const i = encontrados.findIndex((f) => f.id === fragmentId);
      setPrueba({ estado: 'listo', posicion: i >= 0 ? i + 1 : null, total: encontrados.length });
    } catch (e) {
      console.error('Error en la prueba rápida:', e);
      setPrueba(null);
      toast({ title: t('toasts.error'), variant: 'destructive' });
    }
  };

  if (!fragmento) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
        {cargando ? (
          <div className="flex flex-col gap-4" aria-hidden="true">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-96" />
          </div>
        ) : (
          <EmptyState
            variante={error === 'noEncontrado' ? 'forbidden' : 'error'}
            titulo={t(error === 'noEncontrado' ? 'editor.noEncontrado' : 'error')}
            accion={{ etiqueta: t('fuente.volver'), href: '/app/chat/conocimiento' }}
            onReintentar={error === 'error' ? cargar : undefined}
          />
        )}
      </div>
    );
  }

  const fuente = fuentes.find((f) => f.id === fragmento.source_id);
  const volverA = fragmento.source_id ? `/app/chat/conocimiento/fuentes/${fragmento.source_id}` : '/app/chat/conocimiento';
  const largo = contenido.length;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <CabeceraDetalleChat
        titulo={titulo || fragmento.title}
        volverA={volverA}
        migas={[t('migas.chat'), t('migas.conocimiento'), ...(fuente ? [fuente.name] : [])]}
        acciones={
          <>
            {cambios && (
              <Badge tono="advertencia" tamano="sm">
                {t('editor.sinGuardar')}
              </Badge>
            )}
            <button type="button" onClick={regenerar} disabled={regenerando} className={clasesBoton({ variante: 'secundario' })}>
              <RefreshCw aria-hidden="true" className={`size-4 ${regenerando ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              {t('editor.regenerar')}
            </button>
            <button type="button" onClick={guardar} disabled={!cambios || guardando} className={clasesBoton()}>
              <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('editor.guardar')}
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <Tarjeta titulo={t('editor.contenidoTitulo')} descripcion={t('editor.contenidoDescripcion')}>
            <div className="flex flex-col gap-4">
              <FormField etiqueta={t('editor.titulo')} obligatorio>
                <Input value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} />
              </FormField>
              <FormField
                etiqueta={t('editor.contenido')}
                obligatorio
                ayuda={t('editor.caracteres', { n: largo.toLocaleString(), max: MAX_CONTENIDO_FRAGMENTO.toLocaleString() })}
                error={largo > MAX_CONTENIDO_FRAGMENTO ? t('editor.muyLargo') : null}
              >
                <Textarea value={contenido} rows={8} onChange={(e) => setContenido(e.target.value)} />
              </FormField>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium text-fg">{t('editor.etiquetas')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {etiquetas.map((e) => (
                    <span key={e} className="inline-flex items-center gap-1 rounded-full bg-brand-tint py-1 pl-3 pr-1 text-[13px] font-medium text-brand-deep">
                      {e}
                      <button
                        type="button"
                        aria-label={t('editor.quitarEtiqueta', { etiqueta: e })}
                        onClick={() => setEtiquetas(etiquetas.filter((x) => x !== e))}
                        className="flex size-5 items-center justify-center rounded-full hover:bg-brand-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <X aria-hidden="true" className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  <Input
                    value={nuevaEtiqueta}
                    placeholder={t('editor.nuevaEtiqueta')}
                    aria-label={t('editor.nuevaEtiqueta')}
                    maxLength={40}
                    onChange={(e) => setNuevaEtiqueta(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarEtiqueta())}
                    className="h-8 w-40"
                  />
                  <button type="button" onClick={agregarEtiqueta} disabled={!nuevaEtiqueta.trim()} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                    <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {t('editor.agregar')}
                  </button>
                </div>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('editor.pruebaTitulo')} descripcion={t('editor.pruebaDescripcion')}>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-1.5 pl-3 focus-within:ring-2 focus-within:ring-brand">
                <input
                  value={pregunta}
                  onChange={(e) => setPregunta(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && probar()}
                  placeholder={t('editor.preguntaPlaceholder')}
                  aria-label={t('editor.pruebaTitulo')}
                  className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
                />
                <button type="button" onClick={probar} disabled={!pregunta.trim() || prueba?.estado === 'probando'} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                  <Sparkles aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('editor.probar')}
                </button>
              </div>
              {prueba?.estado === 'listo' && (
                <AvisoTonal
                  tono={prueba.posicion ? 'exito' : 'advertencia'}
                  compacto
                  rol="status"
                  titulo={prueba.posicion ? t('editor.pruebaEncontrado', { posicion: prueba.posicion, total: prueba.total }) : t('editor.pruebaNoEncontrado')}
                />
              )}
              {cambios && <p className="text-xs text-fg-muted">{t('editor.pruebaGuardado')}</p>}
            </div>
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <Tarjeta titulo={t('editor.ajustes')}>
            <div className="flex flex-col gap-4">
              <FormField etiqueta={t('editor.fuente')}>
                {(campo) => (
                  <Select value={fuenteId} onValueChange={setFuenteId}>
                    <SelectTrigger id={campo.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fuenteId === SIN_FUENTE && <SelectItem value={SIN_FUENTE}>{t('editor.sinFuente')}</SelectItem>}
                      {fuentes.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('editor.prioridad')}>
                {(campo) => (
                  <Select value={String(prioridad)} onValueChange={(v) => setPrioridad(Number(v))}>
                    <SelectTrigger id={campo.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => 10 - i).map((p) => (
                        <SelectItem key={p} value={String(p)}>
                          {p} · {t(`editor.tramos.${tramoPrioridad(p)}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-fg">
                {t('editor.activo')}
                <Switch checked={fragmento.is_active} onCheckedChange={alternar} />
              </label>
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('editor.estadoIa')}>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tono={fragmento.has_embedding ? 'exito' : 'advertencia'} tamano="sm">
                  {t(fragmento.has_embedding ? 'estados.listo' : 'estados.pendiente')}
                </Badge>
                {fragmento.embedding_info && (
                  <span className="text-xs text-fg-muted">{t('editor.indexado', { fecha: formatDateTime(fragmento.embedding_info.updated_at ?? fragmento.embedding_info.created_at) })}</span>
                )}
              </div>
              <ListaDatos>
                <FilaDato etiqueta={t('editor.usado')} valor={(fragmento.usage_count ?? 0).toLocaleString()} />
                <FilaDato etiqueta={t('editor.votos')} valor={`${fragmento.positive_feedback ?? 0} / ${fragmento.negative_feedback ?? 0}`} />
                <FilaDato etiqueta={t('editor.version')} valor={`v${fragmento.version}`} />
                <FilaDato etiqueta={t('editor.actualizado')} valor={formatDateTime(fragmento.updated_at)} />
              </ListaDatos>
            </div>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
