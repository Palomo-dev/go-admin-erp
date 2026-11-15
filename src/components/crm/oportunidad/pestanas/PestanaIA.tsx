'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Info, Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { clasesBoton } from '@/components/kit/botonClases';
import { TaskDialog } from '@/components/crm/shared/TaskDialog';
import { haceCuanto } from './pestanasLogica';

/**
 * Pestaña «IA» de la oportunidad (Figma 822:237089, móvil 824:171916):
 * «Próxima acción sugerida» (`POST /api/crm/ia/next-action`) con «Generada
 * hace N min», la acción actual, «Regenerar» y «+ Crear tarea»; «Resumen de
 * discovery» (`POST /api/crm/ia/discovery-summary`) bajo demanda; «Agente de
 * voz» como «Próximamente». Ambas rutas cobran créditos en el servidor
 * (solo si la respuesta llega).
 */
export interface PestanaIAProps {
  oportunidadId: string;
  accionActual?: string | null;
}

interface ProximaAccion { action: string; reasoning: string; priority: 'high' | 'medium' | 'low' }
interface Discovery { summary: string; key_points: string[]; next_steps: string[]; sentiment: string }

async function generar<T>(ruta: string, oportunidadId: string): Promise<T> {
  const r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunityId: oportunidadId }) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const TARJETA = 'flex flex-col gap-3 rounded-xl border border-line bg-surface p-4';

export function PestanaIA({ oportunidadId, accionActual }: PestanaIAProps) {
  const t = useTranslations('crm.oportunidad.pestanas.ia');
  const [proxima, setProxima] = useState<{ datos: ProximaAccion; en: number } | null>(null);
  const [disc, setDisc] = useState<Discovery | null>(null);
  const [cargando, setCargando] = useState<'proxima' | 'discovery' | null>(null);
  const [tarea, setTarea] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!proxima) return;
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [proxima]);

  const pedir = async (que: 'proxima' | 'discovery') => {
    setCargando(que);
    try {
      if (que === 'proxima') {
        const datos = await generar<ProximaAccion>('/api/crm/ia/next-action', oportunidadId);
        setProxima({ datos, en: Date.now() });
        setAhora(Date.now());
      } else setDisc(await generar<Discovery>('/api/crm/ia/discovery-summary', oportunidadId));
    } catch (e) {
      toast({ title: t('errorGenerar'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setCargando(null);
    }
  };
  const giro = (que: 'proxima' | 'discovery') => cargando === que && <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />;

  return (
    <section aria-label={t('aria')} className="flex flex-col gap-3">
      <div className={TARJETA}>
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-brand" />
          <h3 className="flex-1 text-[15px] font-semibold text-fg">{t('proximaTitulo')}</h3>
          {proxima && <span className="text-xs text-fg-secondary">{t('generada', { cuando: haceCuanto(proxima.en, ahora, t) })}</span>}
        </div>
        {proxima ? (
          <div className="flex flex-col gap-1 rounded-lg bg-brand-tint px-3 py-2.5">
            <p className="text-sm font-medium text-fg">{proxima.datos.action}</p>
            <p className="text-[13px] text-fg-secondary">{[proxima.datos.reasoning, t(`prioridad.${proxima.datos.priority}`)].filter(Boolean).join(' · ')}</p>
          </div>
        ) : (
          <p className="text-[13px] text-fg-secondary">{t('proximaVacio')}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{accionActual ? t('actual', { accion: accionActual }) : ''}</span>
          <button type="button" disabled={cargando !== null} onClick={() => void pedir('proxima')} className={clasesBoton({ variante: proxima ? 'secundario' : 'primario', tamano: 'sm' })}>
            {giro('proxima') || (proxima ? <RefreshCw aria-hidden="true" className="size-4" /> : <Sparkles aria-hidden="true" className="size-4" />)}
            {t(proxima ? 'regenerar' : 'generar')}
          </button>
          {proxima && (
            <button type="button" onClick={() => setTarea(proxima.datos.action)} className={clasesBoton({ tamano: 'sm' })}>
              <Plus aria-hidden="true" className="size-4" />
              {t('crearTarea')}
            </button>
          )}
        </div>
      </div>

      <div className={TARJETA}>
        <div className="flex items-center gap-2">
          <Info aria-hidden="true" className="size-4 text-fg" />
          <h3 className="flex-1 text-[15px] font-semibold text-fg">{t('discoveryTitulo')}</h3>
        </div>
        {disc ? (
          <div className="flex flex-col gap-2 text-[13px] text-fg">
            <p>{disc.summary}</p>
            {disc.key_points?.length > 0 && (
              <div><p className="font-medium text-fg-secondary">{t('puntosClave')}</p><ul className="list-inside list-disc">{disc.key_points.map((k, i) => <li key={i}>{k}</li>)}</ul></div>
            )}
            {disc.next_steps?.length > 0 && (
              <div><p className="font-medium text-fg-secondary">{t('siguientesPasos')}</p><ul className="list-inside list-disc">{disc.next_steps.map((k, i) => <li key={i}>{k}</li>)}</ul></div>
            )}
            {disc.sentiment && <Badge tono="neutro" apariencia="contorno" tamano="sm" className="self-start">{t('sentimiento', { valor: disc.sentiment })}</Badge>}
          </div>
        ) : (
          <p className="text-[13px] text-fg-secondary">{t('discoveryVacio')}</p>
        )}
        <div className="flex justify-end">
          <button type="button" disabled={cargando !== null} onClick={() => void pedir('discovery')} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            {giro('discovery') || <Sparkles aria-hidden="true" className="size-4" />}
            {t(disc ? 'regenerar' : 'generarResumen')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-subtle p-4">
        <div className="flex items-center gap-2">
          <Bot aria-hidden="true" className="size-4 text-fg-secondary" />
          <h3 className="flex-1 text-[15px] font-semibold text-fg-secondary">{t('agenteTitulo')}</h3>
          <Badge tono="neutro" tamano="sm">{t('proximamente')}</Badge>
        </div>
        <p className="text-[13px] text-fg-secondary">{t('agenteDetalle')}</p>
      </div>

      {tarea && <TaskDialog open onOpenChange={(a) => !a && setTarea(null)} mode="compact" relatedType="opportunity" relatedId={oportunidadId} defaultTitle={tarea} onCreated={() => setTarea(null)} />}
    </section>
  );
}
