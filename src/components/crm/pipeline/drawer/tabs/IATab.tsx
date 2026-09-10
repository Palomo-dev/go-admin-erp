'use client';

import { useState } from 'react';
import { Bot, Loader2, Sparkles, ListChecks, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { TaskDialog } from '@/components/crm/shared/TaskDialog';
import type { DrawerTabProps } from './types';

/**
 * Pestaña IA: próxima acción (POST /api/crm/ia/next-action) y resumen de
 * discovery (POST /api/crm/ia/discovery-summary), ambos bajo demanda con
 * "Generar". "Lanzar agente IA" llega con F6.
 */
interface NextAction { action: string; reasoning: string; priority: 'high' | 'medium' | 'low' }
interface Discovery { summary: string; key_points: string[]; next_steps: string[]; sentiment: string }

const PRIORITY_BADGE: Record<string, 'destructive' | 'warning' | 'secondary'> = { high: 'destructive', medium: 'warning', low: 'secondary' };
const PRIORITY_LABEL: Record<string, string> = { high: 'alta', medium: 'media', low: 'baja' };

export function IATab({ opportunity, active }: DrawerTabProps) {
  const [next, setNext] = useState<NextAction | null>(null);
  const [disc, setDisc] = useState<Discovery | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [loadingDisc, setLoadingDisc] = useState(false);
  const [taskFrom, setTaskFrom] = useState<string | null>(null);

  const call = async <T,>(path: string, setter: (v: T) => void, setLoading: (b: boolean) => void) => {
    setLoading(true);
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunityId: opportunity.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || `Error ${r.status}`);
      setter(j as T);
    } catch (e) {
      toast({ title: 'No se pudo generar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!active) return null;

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" />Próxima acción sugerida</h3>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => call<NextAction>('/api/crm/ia/next-action', setNext, setLoadingNext)} disabled={loadingNext}>
            {loadingNext && <Loader2 className="h-3 w-3 animate-spin mr-1" />}{next ? 'Regenerar' : 'Generar'}
          </Button>
        </div>
        {opportunity.next_action && !next && <p className="text-xs text-gray-500 dark:text-gray-400">Actual: {opportunity.next_action}</p>}
        {next ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Badge variant={PRIORITY_BADGE[next.priority] ?? 'secondary'} className="text-[11px] shrink-0 mt-0.5">prioridad {PRIORITY_LABEL[next.priority] ?? next.priority}</Badge>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{next.action}</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{next.reasoning}</p>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setTaskFrom(next.action)}><CheckSquare className="h-3.5 w-3.5 mr-1" />Crear tarea</Button>
          </div>
        ) : (
          !loadingNext && <p className="text-xs text-gray-500 dark:text-gray-400">Analiza actividades, notas, etapa y score para recomendar el siguiente paso.</p>
        )}
      </Card>

      <Card className="p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 inline-flex items-center gap-2"><ListChecks className="h-4 w-4 text-blue-500" />Resumen de discovery</h3>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => call<Discovery>('/api/crm/ia/discovery-summary', setDisc, setLoadingDisc)} disabled={loadingDisc}>
            {loadingDisc && <Loader2 className="h-3 w-3 animate-spin mr-1" />}{disc ? 'Regenerar' : 'Generar'}
          </Button>
        </div>
        {disc ? (
          <div className="space-y-2 text-xs">
            <p className="text-sm text-gray-800 dark:text-gray-200">{disc.summary}</p>
            {disc.key_points?.length > 0 && <div><p className="font-semibold text-gray-600 dark:text-gray-400">Puntos clave</p><ul className="list-disc list-inside">{disc.key_points.map((k, i) => <li key={i}>{k}</li>)}</ul></div>}
            {disc.next_steps?.length > 0 && <div><p className="font-semibold text-gray-600 dark:text-gray-400">Siguientes pasos</p><ul className="list-disc list-inside">{disc.next_steps.map((k, i) => <li key={i}>{k}</li>)}</ul></div>}
            {disc.sentiment && <Badge variant="outline" className="text-[11px]">sentimiento {disc.sentiment}</Badge>}
          </div>
        ) : (
          !loadingDisc && <p className="text-xs text-gray-500 dark:text-gray-400">Resume las llamadas y notas registradas en un discovery estructurado.</p>
        )}
      </Card>

      <Card className="p-4 bg-gray-50 dark:bg-gray-800/50 border-dashed border-gray-300 dark:border-gray-700">
        <p className="text-xs text-gray-600 dark:text-gray-400 inline-flex items-center gap-2"><Bot className="h-4 w-4 text-violet-500" />Agente de voz IA: se habilita en esta pestaña cuando F6 exponga los agentes configurados por etapa.</p>
      </Card>

      {taskFrom && (
        <TaskDialog open onOpenChange={(o) => !o && setTaskFrom(null)} mode="compact" relatedType="opportunity" relatedId={opportunity.id} defaultTitle={taskFrom} onCreated={() => setTaskFrom(null)} />
      )}
    </div>
  );
}
