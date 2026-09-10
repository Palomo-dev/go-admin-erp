'use client';

import Link from 'next/link';
import { Building2, Calendar, Edit, ExternalLink, Trophy, XCircle } from 'lucide-react';
import { SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/Utils';
import { translateOpportunityStatus } from '@/utils/crmTranslations';
import { QuickActionsBar, type QuickActionKind } from '@/components/crm/shared/QuickActionsBar';
import { TemperatureDot } from '../TemperatureDot';
import { ScoreBadge } from '../ScoreBadge';
import { StageSelect, type StageChangeResult, type StageOption } from './StageSelect';
import type { CustomerDetails } from '@/components/crm/oportunidades/types';
import type { OpportunityFull } from '../hooks/useOpportunityData';

/**
 * DrawerHeader — cabecera sticky: nombre, cliente, monto, StageSelect (gate),
 * temperatura/score, responsable, QuickActionsBar y Ganada/Perdida/Editar.
 */
export interface DrawerHeaderProps {
  opportunity: OpportunityFull;
  customer: CustomerDetails | null;
  stages: StageOption[];
  onStageResult: (r: StageChangeResult, targetStageId: string) => void;
  onWon: () => void;
  onLost: () => void;
  onEdit: () => void;
  onActionCompleted: (kind: QuickActionKind) => void;
}

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  won: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  lost: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
};

const formatDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : null);

export function DrawerHeader({ opportunity, customer, stages, onStageResult, onWon, onLost, onEdit, onActionCompleted }: DrawerHeaderProps) {
  const isClosed = opportunity.status === 'won' || opportunity.status === 'lost';
  const amount = formatCurrency(Number(opportunity.amount ?? 0), opportunity.currency || 'COP');
  const custName = customer?.full_name ?? opportunity.customer?.full_name ?? 'Cliente no especificado';
  const barCustomer = customer
    ? { id: customer.id, full_name: customer.full_name, email: customer.email, phone: customer.phone }
    : opportunity.customer
      ? { id: opportunity.customer.id, full_name: opportunity.customer.full_name, email: opportunity.customer.email, phone: opportunity.customer.phone }
      : null;

  return (
    <div className="p-4 sm:p-5 pb-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 space-y-3">
      <div className="flex items-start justify-between gap-3 pr-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <SheetTitle className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{opportunity.name}</SheetTitle>
            <TemperatureDot temperature={opportunity.temperature} size="md" />
            <Link href={`/app/crm/oportunidades/${opportunity.id}`} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 shrink-0" title="Abrir detalle" aria-label="Abrir detalle completo">
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          <SheetDescription className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 min-w-0">
              <Building2 className="h-3 w-3 shrink-0" />
              {opportunity.customer_id ? <Link href={`/app/crm/clientes/${opportunity.customer_id}`} className="hover:underline truncate">{custName}</Link> : <span className="truncate">{custName}</span>}
            </span>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{amount}</span>
            {opportunity.expected_close_date && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />cierra {formatDate(opportunity.expected_close_date)}</span>
              </>
            )}
          </SheetDescription>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {opportunity.status && <Badge className={`text-[11px] ${STATUS_CLASS[opportunity.status] ?? ''}`}>{translateOpportunityStatus(opportunity.status)}</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {stages.length > 0 && (
          <StageSelect opportunityId={opportunity.id} value={opportunity.stage_id} stages={stages} disabled={false} onResult={onStageResult} />
        )}
        <ScoreBadge score={opportunity.score_total} temperature={opportunity.temperature} />
        {opportunity.icp_band && <Badge variant="outline" className="text-[11px]">ICP {opportunity.icp_band}</Badge>}
        <div className="ml-auto flex items-center gap-1.5">
          {!isClosed && (
            <>
              <Button type="button" size="sm" onClick={onWon} className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"><Trophy className="h-3.5 w-3.5 mr-1" />Ganada</Button>
              <Button type="button" size="sm" variant="outline" onClick={onLost} className="h-7 px-2 text-xs border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"><XCircle className="h-3.5 w-3.5 mr-1" />Perdida</Button>
            </>
          )}
          <Button type="button" size="sm" variant="outline" onClick={onEdit} className="h-7 px-2 text-xs"><Edit className="h-3.5 w-3.5 mr-1" />Editar</Button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <QuickActionsBar variant="drawer" opportunityId={opportunity.id} customerId={opportunity.customer_id ?? undefined} customer={barCustomer} opportunityName={opportunity.name} onActionCompleted={onActionCompleted} />
      </div>
    </div>
  );
}
