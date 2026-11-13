'use client';

/**
 * Laboratorio de la IA del chat (Figma 91-chat-34): pregunta de prueba,
 * respuesta con sus cifras, ajustes de la prueba (no cambian la configuración
 * real) y fragmentos que usó. La lógica es la de siempre (`aiLabService`):
 * busca fragmentos y arma una respuesta simulada que no llama al modelo ni
 * gasta créditos. «Convertir en fragmento» guarda la respuesta como
 * conocimiento con `knowledgeService`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, FilePlus2, Play } from 'lucide-react';
import { AvisoTonal, EmptyState, FormField, PageHeader, Tarjeta, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import AILabService, { type Channel, type LabSettings, type LabTestResult, type RetrievedFragment } from '@/lib/services/aiLabService';
import KnowledgeService, { type CreateFragmentData, type KnowledgeSource } from '@/lib/services/knowledgeService';
import { IANavTabs } from '@/components/chat/ia/IANavTabs';
import { FragmentDialog } from '@/components/chat/conocimiento';
import { useMiembroActual } from '@/components/chat/conocimiento/useMiembroActual';

const AJUSTES_BASE: LabSettings = {
  model: '',
  temperature: 0.7,
  maxTokens: 500,
  maxFragments: 5,
  systemRules: '',
  tone: 'professional',
  language: 'es',
  simulatedChannel: 'whatsapp',
};
const CREATIVIDAD = [0.3, 0.7, 1] as const;
const LARGOS = [200, 500, 1000] as const;
const EJEMPLOS = ['estadoPedido', 'horarios', 'mediosPago'] as const;

export default function AILaboratorioPage() {
  const t = useTranslations('chatModulo.ia');
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const memberId = useMiembroActual(organizationId);

  const [cargando, setCargando] = useState(true);
  const [probando, setProbando] = useState(false);
  const [pregunta, setPregunta] = useState('');
  const [fragmentos, setFragmentos] = useState<RetrievedFragment[]>([]);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [canales, setCanales] = useState<Channel[]>([]);
  const [ajustes, setAjustes] = useState<LabSettings>(AJUSTES_BASE);
  const [resultado, setResultado] = useState<LabTestResult | null>(null);
  const [fuentes, setFuentes] = useState<KnowledgeSource[]>([]);
  const [convertir, setConvertir] = useState(false);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    try {
      const s = new AILabService(organizationId);
      const [frs, cs, conf] = await Promise.all([s.getFragments({ isActive: true, limit: 50 }), s.getChannels(), s.getAISettings()]);
      const lista: RetrievedFragment[] = frs.map((f, i) => ({ id: f.id, title: f.title, content: f.content, similarity: 1 - i * 0.05, tags: f.tags || [], priority: f.priority || 5 }));
      setFragmentos(lista);
      setElegidos(lista.slice(0, 5).map((f) => f.id));
      setCanales(cs);
      if (conf) setAjustes(conf);
    } catch (e) {
      console.error('Error cargando el laboratorio:', e);
      toast({ title: t('laboratorio.toasts.errorCarga'), variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }, [organizationId, toast, t]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const probar = async () => {
    const q = pregunta.trim();
    if (!organizationId || !q) return;
    setProbando(true);
    try {
      const s = new AILabService(organizationId);
      const encontrados = await s.searchFragmentsByText(q, ajustes.maxFragments);
      if (encontrados.length > 0) {
        setFragmentos((prev) => [...encontrados, ...prev.filter((f) => !encontrados.some((e) => e.id === f.id))]);
        setElegidos(encontrados.map((f) => f.id));
      }
      const usados = encontrados.length > 0 ? encontrados : fragmentos.filter((f) => elegidos.includes(f.id));
      const r = await s.runLocalTest(q, ajustes, usados);
      setResultado(r);
      await s.logLabTest(r, memberId ?? undefined);
    } catch (e) {
      console.error('Error en la prueba:', e);
      toast({ title: t('laboratorio.toasts.errorPrueba'), variant: 'destructive' });
    } finally {
      setProbando(false);
    }
  };

  const abrirConvertir = async () => {
    if (!organizationId) return;
    try {
      setFuentes(await new KnowledgeService(organizationId).getSources());
    } catch {
      setFuentes([]);
    }
    setConvertir(true);
  };

  const guardarFragmento = async (datos: CreateFragmentData) => {
    if (!organizationId || !memberId) {
      toast({ title: t('laboratorio.toasts.sinMiembro'), variant: 'destructive' });
      throw new Error('sin miembro');
    }
    try {
      await new KnowledgeService(organizationId).createFragment(datos, memberId);
      toast({ title: t('laboratorio.toasts.fragmentoCreado') });
    } catch (e) {
      toast({ title: t('laboratorio.toasts.errorFragmento'), variant: 'destructive' });
      throw e;
    }
  };

  const canalesPrueba = [
    { valor: 'whatsapp', etiqueta: 'WhatsApp' },
    { valor: 'webchat', etiqueta: t('laboratorio.canalWeb') },
    { valor: 'instagram', etiqueta: 'Instagram' },
    { valor: 'facebook', etiqueta: 'Messenger' },
    ...canales.filter((c) => !['whatsapp', 'webchat', 'instagram', 'facebook'].includes(c.id)).map((c) => ({ valor: c.id, etiqueta: c.name })),
  ];
  const creatividad = CREATIVIDAD.reduce((a, b) => (Math.abs(b - ajustes.temperature) < Math.abs(a - ajustes.temperature) ? b : a), CREATIVIDAD[0]);
  const largo = LARGOS.reduce((a, b) => (Math.abs(b - ajustes.maxTokens) < Math.abs(a - ajustes.maxTokens) ? b : a), LARGOS[0]);
  const m = resultado?.metrics;
  // Memorizado: el diálogo reinicia el formulario cuando cambia este objeto.
  const prellenado = useMemo(() => (resultado ? { title: resultado.query, content: resultado.response } : undefined), [resultado]);

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('laboratorio.subtitulo')}
        icono={Bot}
        cargando={cargando}
        badge={
          <Badge tono="informacion" tamano="sm">
            {t('beta')}
          </Badge>
        }
        debajo={<IANavTabs className="w-full max-w-3xl" />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <Tarjeta titulo={t('laboratorio.pregunta')}>
            <div className="flex flex-col gap-3">
              <Textarea
                value={pregunta}
                rows={3}
                aria-label={t('laboratorio.pregunta')}
                placeholder={t('laboratorio.preguntaPlaceholder')}
                onChange={(e) => setPregunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) probar();
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-fg-muted">{t('laboratorio.ejemplos')}</span>
                {EJEMPLOS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setPregunta(t(`laboratorio.ejemplo.${e}`))}
                    className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {t(`laboratorio.ejemplo.${e}`)}
                  </button>
                ))}
              </div>
              <button type="button" onClick={probar} disabled={!pregunta.trim() || probando || !organizationId} className={clasesBoton({ className: 'self-end' })}>
                <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {probando ? t('laboratorio.probando') : t('laboratorio.probar')}
              </button>
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('laboratorio.respuesta')}>
            {probando ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-20" />
                <Skeleton className="h-6 w-2/3" />
              </div>
            ) : !resultado ? (
              <EmptyState compacto icono={Bot} titulo={t('laboratorio.sinRespuestaTitulo')} descripcion={t('laboratorio.sinRespuestaDescripcion')} />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="whitespace-pre-wrap rounded-xl border border-line-brand bg-brand-tint px-4 py-3 text-sm leading-6 text-fg">{resultado.response}</div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    [t('laboratorio.metricas.confianza'), m ? m.confidenceScore.toFixed(2) : '—'],
                    [t('laboratorio.metricas.tiempo'), m ? `${(m.processingTimeMs / 1000).toFixed(1)} s` : '—'],
                    [t('laboratorio.metricas.tokens'), m ? m.totalTokens.toLocaleString() : '—'],
                    [t('laboratorio.metricas.fragmentos'), m ? m.retrievedFragments : '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <dt className="text-xs text-fg-muted">{k}</dt>
                      <dd className="text-sm font-semibold tabular-nums text-fg">{v}</dd>
                    </div>
                  ))}
                </dl>
                <AvisoTonal tono="neutro" compacto titulo={t('laboratorio.simulada')} />
                <button type="button" onClick={abrirConvertir} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'self-start' })}>
                  <FilePlus2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('laboratorio.convertir')}
                </button>
              </div>
            )}
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <Tarjeta titulo={t('laboratorio.ajustes')} descripcion={t('laboratorio.ajustesDescripcion')}>
            <div className="flex flex-col gap-4">
              <FormField etiqueta={t('laboratorio.canal')}>
                {(campo) => (
                  <Select value={ajustes.simulatedChannel} onValueChange={(v) => setAjustes({ ...ajustes, simulatedChannel: v })}>
                    <SelectTrigger id={campo.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {canalesPrueba.map((c) => (
                        <SelectItem key={c.valor} value={c.valor}>
                          {c.etiqueta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('laboratorio.creatividad')}>
                {(campo) => (
                  <Select value={String(creatividad)} onValueChange={(v) => setAjustes({ ...ajustes, temperature: Number(v) })}>
                    <SelectTrigger id={campo.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CREATIVIDAD.map((c, i) => (
                        <SelectItem key={c} value={String(c)}>
                          {c.toLocaleString()} · {t(`laboratorio.creatividades.c${i}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('laboratorio.largo')}>
                {(campo) => (
                  <Select value={String(largo)} onValueChange={(v) => setAjustes({ ...ajustes, maxTokens: Number(v) })}>
                    <SelectTrigger id={campo.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LARGOS.map((l, i) => (
                        <SelectItem key={l} value={String(l)}>
                          {t(`laboratorio.largos.l${i}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('laboratorio.fragmentosUso')}>
            {cargando ? (
              <Skeleton className="h-24" />
            ) : fragmentos.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t('laboratorio.sinFragmentos')}</p>
            ) : (
              <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {fragmentos.slice(0, 20).map((f) => (
                  <li key={f.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                      <Checkbox
                        checked={elegidos.includes(f.id)}
                        onCheckedChange={(v) => setElegidos((e) => (v === true ? [...e, f.id] : e.filter((x) => x !== f.id)))}
                      />
                      <span className="min-w-0 flex-1 truncate">{f.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-fg-muted">{f.similarity.toFixed(2)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>

      <FragmentDialog
        open={convertir}
        onOpenChange={setConvertir}
        fragment={null}
        prellenado={prellenado}
        sources={fuentes}
        onSubmit={guardarFragmento}
      />
    </div>
  );
}
