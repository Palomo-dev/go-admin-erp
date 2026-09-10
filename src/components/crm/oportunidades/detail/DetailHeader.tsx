'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, CheckCircle, Copy, DollarSign, Edit, Target, Trash2, TrendingUp, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, formatCurrency } from '@/utils/Utils';
import { QuickActionsBar, type QuickActionKind } from '@/components/crm/shared/QuickActionsBar';
import { TemperatureDot } from '@/components/crm/pipeline/TemperatureDot';
import type { OpportunityFull } from '@/components/crm/pipeline/hooks/useOpportunityData';
import type { CustomerDetails, Stage } from '../types';

/** Header del detalle (conserva Ganar/Perder/Editar/Duplicar/Eliminar), embudo clicable y QuickActionsBar. */
export interface DetailHeaderProps {
  opportunity: OpportunityFull;
  customer: CustomerDetails | null;
  stages: Stage[];
  displayAmount: number;
  busy: boolean;
  onStageClick: (stageId: string) => void;
  onWon: () => void;
  onLost: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onActionCompleted?: (k: QuickActionKind) => void;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Abierta', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  won: { label: 'Ganada', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  lost: { label: 'Perdida', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

export function DetailHeader({ opportunity, customer, stages, displayAmount, busy, onStageClick, onWon, onLost, onDuplicate, onDelete, onActionCompleted }: DetailHeaderProps) {
  const router = useRouter();
  const st = STATUS[opportunity.status] ?? { label: opportunity.status, cls: '' };
  const barCustomer = customer ? { id: customer.id, full_name: customer.full_name, email: customer.email, phone: customer.phone } : opportunity.customer ?? null;

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-gray-600 dark:text-gray-400 shrink-0" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></Button>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{opportunity.name}</h1>
                <TemperatureDot temperature={opportunity.temperature} size="md" />
                <Badge className={st.cls}>{st.label}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{opportunity.pipeline?.name}</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{formatCurrency(displayAmount)}</span>
                {opportunity.expected_close_date && (
                  <><span className="text-gray-300 dark:text-gray-600">|</span><span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(new Date(opportunity.expected_close_date), 'dd MMM yyyy', { locale: es })}</span></>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {opportunity.status === 'open' && (
              <>
                <Button size="sm" onClick={onWon} disabled={busy} className="bg-green-600 hover:bg-green-700 text-white border-0"><CheckCircle className="h-4 w-4 mr-1.5" />Ganar</Button>
                <Button size="sm" variant="outline" onClick={onLost} disabled={busy} className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"><XCircle className="h-4 w-4 mr-1.5" />Perder</Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => router.push(`/app/crm/oportunidades/${opportunity.id}/editar`)} className="border-gray-200 dark:border-gray-700"><Edit className="h-4 w-4 mr-1.5" />Editar</Button>
            <Button size="sm" variant="outline" onClick={onDuplicate} disabled={busy} className="border-gray-200 dark:border-gray-700"><Copy className="h-4 w-4 mr-1.5" />Duplicar</Button>
            <Button size="sm" variant="outline" onClick={onDelete} disabled={busy} className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        <QuickActionsBar variant="detail" opportunityId={opportunity.id} customerId={opportunity.customer_id ?? undefined} customer={barCustomer} opportunityName={opportunity.name} onActionCompleted={onActionCompleted} />
      </div>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-500" />Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {stages.map((stage, idx) => {
              const active = stage.id === opportunity.stage_id;
              const disabled = busy || opportunity.status !== 'open';
              return (
                <div key={stage.id} className="flex items-center shrink-0">
                  <button type="button" onClick={() => onStageClick(stage.id)} disabled={disabled || active} aria-current={active ? 'step' : undefined}
                    className={cn('px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2', active ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600', disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer')}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    {stage.name}
                    {stage.probability != null && <span className={cn('text-[10px]', active ? 'text-blue-200' : 'text-gray-400')}>{Math.round(Number(stage.probability))}%</span>}
                  </button>
                  {idx < stages.length - 1 && <div className="w-2 h-px bg-gray-300 dark:bg-gray-600 mx-0.5" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
