'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { opportunitiesService } from '../opportunitiesService';
import type { OpportunityFull } from '@/components/crm/pipeline/hooks/useOpportunityData';

/** Pestaña Analítica (extraída de OpportunityDetail): días abierta, tareas, distribución de actividades, estado en pipeline. */
const LABELS: Record<string, string> = { call: 'Llamada', email: 'Email', meeting: 'Reunión', note: 'Nota', task: 'Tarea', whatsapp: 'WhatsApp', visit: 'Visita', system: 'Sistema', ai_call: 'Llamada IA', sms: 'SMS' };

export function AnalyticsTab({ opportunity, displayAmount, active }: { opportunity: OpportunityFull; displayAmount: number; active: boolean }) {
  const [data, setData] = useState<{ tasks: Array<{ status: string }>; byType: Record<string, number> } | null>(null);

  useEffect(() => {
    if (!active || data) return;
    let cancelled = false;
    (async () => {
      const [t, a] = await Promise.allSettled([
        opportunitiesService.getOpportunityTasks(opportunity.id),
        supabase.from('activities').select('activity_type').eq('related_type', 'opportunity').eq('related_id', opportunity.id),
      ]);
      if (cancelled) return;
      const byType: Record<string, number> = {};
      if (a.status === 'fulfilled') for (const row of (a.value.data ?? []) as Array<{ activity_type: string }>) byType[row.activity_type] = (byType[row.activity_type] || 0) + 1;
      setData({ tasks: t.status === 'fulfilled' ? t.value : [], byType });
    })();
    return () => { cancelled = true; };
  }, [active, data, opportunity.id]);

  if (!active) return null;
  if (!data) return <Skeleton className="h-40 w-full" />;

  const tasksDone = data.tasks.filter((t) => t.status === 'done').length;
  const rate = data.tasks.length > 0 ? Math.round((tasksDone / data.tasks.length) * 100) : 0;
  const daysOpen = Math.ceil((Date.now() - new Date(opportunity.created_at).getTime()) / 86400000);
  const prob = Number(opportunity.stage?.probability || 0);
  const totalActs = Object.values(data.byType).reduce((s, n) => s + n, 0);
  const max = Math.max(1, ...Object.values(data.byType));

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat cls="bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-300" label="Días abierta" value={String(daysOpen)} labelCls="text-blue-600 dark:text-blue-400" />
          <Stat cls="bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800 text-green-700 dark:text-green-300" label="Tareas completadas" value={`${tasksDone}/${data.tasks.length}`} labelCls="text-green-600 dark:text-green-400" />
          <Stat cls="bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800 text-purple-700 dark:text-purple-300" label="Probabilidad" value={`${prob.toFixed(0)}%`} labelCls="text-purple-600 dark:text-purple-400" />
          <Stat cls="bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800 text-amber-700 dark:text-amber-300" label="Actividades" value={String(totalActs)} labelCls="text-amber-600 dark:text-amber-400" />
        </div>
        {data.tasks.length > 0 && (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex justify-between items-center mb-2"><p className="text-sm font-medium text-gray-700 dark:text-gray-300">Progreso de tareas</p><span className="text-sm font-bold text-gray-900 dark:text-white">{rate}%</span></div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5"><div className="bg-green-500 h-2.5 rounded-full transition-all" style={{ width: `${rate}%` }} /></div>
          </div>
        )}
        {totalActs > 0 && (
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Distribución de actividades</p>
            <div className="space-y-2">
              {Object.entries(data.byType).map(([type, count]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-20">{LABELS[type] || type}</span>
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(count / max) * 100}%` }} /></div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Estado en pipeline</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Etapa actual</span><span className="font-medium text-gray-900 dark:text-white">{opportunity.stage?.name || '-'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Valor estimado</span><span className="font-medium text-gray-900 dark:text-white">{formatCurrency(displayAmount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Valor ponderado</span><span className="font-medium text-blue-600 dark:text-blue-400">{formatCurrency(displayAmount * (prob > 1 ? prob / 100 : prob))}</span></div>
            {opportunity.expected_close_date && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Cierre estimado</span><span className="font-medium text-gray-900 dark:text-white">{format(new Date(opportunity.expected_close_date), 'dd/MM/yyyy', { locale: es })}</span></div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ cls, label, value, labelCls }: { cls: string; label: string; value: string; labelCls: string }) {
  return <div className={`p-3 rounded-lg border ${cls}`}><p className={`text-xs font-medium ${labelCls}`}>{label}</p><p className="text-2xl font-bold">{value}</p></div>;
}
