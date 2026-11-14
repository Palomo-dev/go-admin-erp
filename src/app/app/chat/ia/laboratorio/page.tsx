'use client';

/**
 * Laboratorio de la IA del chat (Figma 91-chat-34): pregunta de prueba,
 * respuesta con sus cifras, ajustes de la prueba (no cambian la configuración
 * real) y fragmentos que usó. «Probar» genera la respuesta REAL de la IA en el
 * servidor (`aiLabService.runTest` → `POST /api/chat/ai/lab-test`, mismo prompt
 * y modelo que responden a los clientes) y descuenta créditos como una
 * respuesta a un cliente; si falla, no se cobra (Figma 93-chat-pendientes 04).
 * Sin créditos, «Probar» se deshabilita y se ofrece recargar (Figma 05).
 * «Convertir en fragmento» guarda la respuesta como conocimiento con
 * `knowledgeService`.
 *
 * Auditoría 2026-11-14 (Agente 3): vuelven los ajustes de la prueba (modelo,
 * creatividad y largo libres, máximo de fragmentos, reglas del sistema), el
 * panel completo de fragmentos y, en la respuesta, «Copiar», la pregunta, el
 * costo (créditos cobrados y costo del proveedor si hay tarifa) y el pie con
 * modelo, creatividad y fecha. Nada de esto cambia la configuración real.
 *
 * Diseño aprobado 94-chat-recuperado-ia-11/12 (2026-11-14): pregunta en una
 * línea, Tono e Idioma en los ajustes (viajan a la ruta de prueba) y 👍 Buena /
 * 👎 Mejorable junto a «Convertir en fragmento» (el voto queda en la auditoría).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Info, Play } from 'lucide-react';
import { AvisoTonal, EmptyState, PageHeader, Tarjeta, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { AjustesPrueba } from '@/components/chat/ia/laboratorio/AjustesPrueba';
import { FragmentosPrueba, type ResumenConocimiento } from '@/components/chat/ia/laboratorio/FragmentosPrueba';
import { RespuestaPrueba } from '@/components/chat/ia/laboratorio/RespuestaPrueba';
import { useOrganization } from '@/lib/hooks/useOrganization';
import AILabService, { type Channel, type CodigoFalloPrueba, type LabSettings, type LabTestResult, type RetrievedFragment } from '@/lib/services/aiLabService';
import { usePlanSesion } from '@/components/shell/sesion/usePlanSesion';
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
const EJEMPLOS = ['estadoPedido', 'horarios', 'mediosPago'] as const;
/** Donde se recargan los créditos de IA (Organización › Plan y facturación › «Comprar más»). */
const RUTA_RECARGAR_CREDITOS = '/app/organizacion/plan';

export default function AILaboratorioPage() {
  const t = useTranslations('chatModulo.ia');
  const tr = useTranslations('chatRecuperado.laboratorio');
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
  const [voto, setVoto] = useState<'buena' | 'mejorable' | null>(null);
  const [fuentes, setFuentes] = useState<KnowledgeSource[]>([]);
  const [convertir, setConvertir] = useState(false);
  const [resumen, setResumen] = useState<ResumenConocimiento | null>(null);
  // Lo de la configuración real, para nombrarlo y volver a ello (la prueba no lo cambia).
  const [modeloConfig, setModeloConfig] = useState('');
  const [reglasConfig, setReglasConfig] = useState('');
  const [fallo, setFallo] = useState<Exclude<CodigoFalloPrueba, 'sin_creditos'> | null>(null);
  // Saldo de créditos de IA: el de `GET /api/me/plan` (misma fuente que Plan y
  // facturación) y, tras cada prueba, el que devuelve el servidor al cobrar.
  const plan = usePlanSesion();
  const [saldoPrueba, setSaldoPrueba] = useState<number | null>(null);
  const saldoPlan = plan.datos ? plan.datos.uso.creditosIa.restantesPlan + plan.datos.uso.creditosIa.comprados : null;
  const saldo = saldoPrueba ?? saldoPlan;
  const sinCreditos = saldo !== null && saldo <= 0;

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    try {
      const s = new AILabService(organizationId);
      const [frs, cs, conf, stats] = await Promise.all([
        s.getFragments({ isActive: true, limit: 50 }),
        s.getChannels(),
        s.getAISettings(),
        s.getFragmentStats(),
      ]);
      const lista: RetrievedFragment[] = frs.map((f, i) => ({ id: f.id, title: f.title, content: f.content, similarity: 1 - i * 0.05, tags: f.tags || [], priority: f.priority || 5 }));
      setFragmentos(lista);
      setElegidos((previos) => {
        const vigentes = previos.filter((id) => lista.some((f) => f.id === id));
        return vigentes.length > 0 ? vigentes : lista.slice(0, 5).map((f) => f.id);
      });
      setCanales(cs);
      setResumen({ total: stats.total, active: stats.active, inactive: stats.inactive, avgPriority: stats.avgPriority });
      if (conf) {
        setModeloConfig(conf.model);
        setReglasConfig(conf.systemRules);
        // La prueba arranca con lo de la configuración; el modelo vacío = el configurado.
        setAjustes((a) => ({ ...a, ...conf, model: '', simulatedChannel: a.simulatedChannel }));
      }
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
    if (!organizationId || !q || sinCreditos) return;
    setProbando(true);
    setFallo(null);
    try {
      const s = new AILabService(organizationId);
      const encontrados = await s.searchFragmentsByText(q, ajustes.maxFragments);
      if (encontrados.length > 0) {
        setFragmentos((prev) => [...encontrados, ...prev.filter((f) => !encontrados.some((e) => e.id === f.id))]);
        setElegidos(encontrados.map((f) => f.id));
      }
      const usados = (encontrados.length > 0 ? encontrados : fragmentos.filter((f) => elegidos.includes(f.id))).slice(0, ajustes.maxFragments);
      const r = await s.runTest(q, ajustes, usados);
      if (r.ok) {
        setResultado(r.resultado);
        setVoto(null);
        if (r.saldoRestante !== null) setSaldoPrueba(r.saldoRestante);
        await s.logLabTest(r.resultado);
      } else if (r.codigo === 'sin_creditos') {
        setResultado(null);
        setSaldoPrueba(0);
      } else {
        setFallo(r.codigo);
      }
      // El saldo vuelve a salir de la fuente única en cuanto se refresca.
      void plan.recargar().then(() => setSaldoPrueba(null));
    } catch (e) {
      console.error('Error en la prueba:', e);
      toast({ title: t('laboratorio.toasts.errorPrueba'), variant: 'destructive' });
    } finally {
      setProbando(false);
    }
  };

  const votar = async (v: 'buena' | 'mejorable') => {
    if (!organizationId || !resultado || voto === v) return;
    const previo = voto;
    setVoto(v);
    try {
      await new AILabService(organizationId).logLabFeedback(resultado, v);
      toast({ title: tr('votoGuardado') });
    } catch (e) {
      console.error('Error guardando el voto del laboratorio:', e);
      setVoto(previo);
      toast({ title: tr('votoError'), variant: 'destructive' });
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
              <Input
                value={pregunta}
                aria-label={t('laboratorio.pregunta')}
                placeholder={t('laboratorio.preguntaPlaceholder')}
                onChange={(e) => setPregunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') probar();
                }}
                className="h-11"
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <p id="aviso-cobro-laboratorio" className="min-w-0 flex-1 text-[13px] text-fg-secondary">
                  {t('laboratorio.avisoCobro')}
                </p>
                <button
                  type="button"
                  onClick={probar}
                  disabled={!pregunta.trim() || probando || !organizationId || sinCreditos}
                  aria-describedby="aviso-cobro-laboratorio"
                  className={clasesBoton({ className: 'self-end sm:self-auto' })}
                >
                  <Play aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {probando ? t('laboratorio.probando') : t('laboratorio.probar')}
                </button>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('laboratorio.respuesta')}>
            {sinCreditos && !probando ? (
              <AvisoTonal
                tono="neutro"
                icono={Info}
                rol="status"
                titulo={t('laboratorio.sinCreditos.titulo')}
                descripcion={t('laboratorio.sinCreditos.descripcion')}
                accion={{ etiqueta: t('laboratorio.sinCreditos.recargar'), href: RUTA_RECARGAR_CREDITOS }}
              />
            ) : fallo && !probando ? (
              <AvisoTonal
                tono="peligro"
                rol="alert"
                titulo={t(`laboratorio.fallo.${fallo}.titulo`)}
                descripcion={t(`laboratorio.fallo.${fallo}.descripcion`)}
              />
            ) : probando ? (
              <div className="flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-20" />
                <Skeleton className="h-6 w-2/3" />
              </div>
            ) : !resultado ? (
              <EmptyState compacto icono={Bot} titulo={t('laboratorio.sinRespuestaTitulo')} descripcion={t('laboratorio.sinRespuestaDescripcion')} />
            ) : (
              <div className="flex flex-col gap-4">
                <RespuestaPrueba resultado={resultado} />
                <div className="flex flex-wrap items-center gap-2">
                  {(['buena', 'mejorable'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => void votar(v)}
                      aria-pressed={voto === v}
                      className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: voto === v ? 'bg-brand-tint text-brand-deep' : undefined })}
                    >
                      <span aria-hidden="true">{v === 'buena' ? '👍' : '👎'}</span>
                      {tr(v)}
                    </button>
                  ))}
                  <button type="button" onClick={abrirConvertir} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                    {t('laboratorio.convertir')}
                  </button>
                </div>
              </div>
            )}
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <AjustesPrueba ajustes={ajustes} onChange={setAjustes} canales={canalesPrueba} modeloConfig={modeloConfig} reglasConfig={reglasConfig} />
          <FragmentosPrueba fragmentos={fragmentos} elegidos={elegidos} onElegidos={setElegidos} cargando={cargando} resumen={resumen} onActualizar={() => void cargar()} />
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
