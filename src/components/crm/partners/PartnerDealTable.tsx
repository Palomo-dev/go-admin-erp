'use client';

/**
 * Tabla de deals de un partner (datos tabulares reales, brief §3) con
 * `<th scope="col">`, estado con icono + texto, y los botones de transición
 * que la máquina permite, solo si la sesión puede gestionar.
 */

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { nextCommissionStatuses, type CommissionStatus } from '@/lib/services/crm/partnerCommission';
import type { PartnerDealView } from '@/lib/services/crm/partnerService';
import { formatMoney } from '@/lib/services/crm/partnerModel';
import { cn } from '@/utils/Utils';
import { COMMISSION_META, CommissionStatusBadge, dealTypeLabel } from './partnerMeta';

interface Props {
  deals: PartnerDealView[];
  canManage: boolean;
  busyId: string | null;
  onTransition: (deal: PartnerDealView, to: CommissionStatus) => void;
}

export function dealActionId(dealId: string, status: string): string {
  return `deal-${dealId}-${status}`;
}

export function PartnerDealTable({ deals, canManage, busyId, onTransition }: Props) {
  const { formatDate, formatDateTime } = useFormatDate();
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Oportunidad</TableHead>
            <TableHead scope="col">Tipo</TableHead>
            <TableHead scope="col" className="text-right">Comisión</TableHead>
            <TableHead scope="col">Estado</TableHead>
            {canManage && <TableHead scope="col">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                <span className="block font-medium text-gray-900 dark:text-gray-100">{d.opportunity?.name ?? 'Oportunidad no disponible'}</span>
                <span className="block text-xs text-gray-600 dark:text-gray-400">
                  {d.opportunity?.amount != null ? formatMoney(d.opportunity.amount, d.opportunity.currency) : 'Sin monto'} · {formatDate(d.created_at)}
                </span>
              </TableCell>
              <TableCell className="text-gray-800 dark:text-gray-200">{dealTypeLabel(d.deal_type)}</TableCell>
              <TableCell className="text-right font-medium text-gray-900 dark:text-gray-100">{formatMoney(d.commission_amount, d.opportunity?.currency ?? null)}</TableCell>
              <TableCell>
                <CommissionStatusBadge status={d.commission_status} />
                {d.commission_paid_at && <span className="block text-xs text-gray-600 dark:text-gray-400">{formatDateTime(d.commission_paid_at)}</span>}
              </TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {nextCommissionStatuses(d.commission_status).map((to) => (
                      <Button key={to} id={dealActionId(d.id, to)} type="button" size="sm" variant={to === 'rejected' ? 'ghost' : 'outline'} disabled={busyId === d.id}
                        className={cn('h-7 text-xs', to === 'rejected' && 'text-red-700 dark:text-red-300')} onClick={() => onTransition(d, to)}>
                        {COMMISSION_META[to].action}
                      </Button>
                    ))}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
