'use client';

/**
 * Tabla de comisiones (datos tabulares reales): selección múltiple, estado con
 * icono + texto, enlace a la factura/oportunidad de origen y acciones por fila.
 * Las mutaciones viven en `useComisiones` (rutas de API); aquí solo se pintan.
 */

import Link from 'next/link';
import { CheckCircle2, Clock, ExternalLink, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { CommissionRow } from '@/lib/services/crm/commissionAdminService';
import { formatCurrency } from '@/utils/Utils';
import { ComisionesEmpty } from './ComisionesEmpty';
import { COMMISSION_ROW_ATTR, SELECT_ALL_ATTR } from './comisionesFocus';
import { SOURCE_LABELS, sourceHref, statusPresentation, type StatusTone } from './comisionesModel';

interface Props {
  rows: CommissionRow[];
  currency: string;
  canManage: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onPayOne: (row: CommissionRow) => void;
  onClawbackOne: (row: CommissionRow) => void;
  hasActiveFilters: boolean;
}

const TONE: Record<StatusTone, { icon: typeof Clock; className: string }> = {
  pending: { icon: Clock, className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
  paid: { icon: CheckCircle2, className: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200' },
  cancelled: { icon: XCircle, className: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200' },
};

const th = 'p-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300';

export function ComisionesList({ rows, currency, canManage, selected, onToggle, onToggleAll, onPayOne, onClawbackOne, hasActiveFilters }: Props) {
  const { formatDate } = useFormatDate();

  if (rows.length === 0) return <ComisionesEmpty filtered={hasActiveFilters} />;

  const allSelected = selected.size === rows.length;

  return (
    <Card className="border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">Comisiones del filtro actual</caption>
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {canManage && (
                  <th scope="col" className="w-10 p-3">
                    <Checkbox {...{ [SELECT_ALL_ATTR]: '' }} checked={allSelected} onCheckedChange={onToggleAll} aria-label={allSelected ? 'Quitar selección de todas' : 'Seleccionar todas'} />
                  </th>
                )}
                <th scope="col" className={th}>Comisionista</th>
                <th scope="col" className={th}>Origen</th>
                <th scope="col" className={`${th} text-right`}>Base</th>
                <th scope="col" className={`${th} text-right`}>Tasa</th>
                <th scope="col" className={`${th} text-right`}>Comisión</th>
                <th scope="col" className={th}>Estado</th>
                <th scope="col" className={th}>Devengada</th>
                {canManage && <th scope="col" className={`${th} text-right`}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const st = statusPresentation(c);
                const tone = TONE[st.tone];
                const href = sourceHref(c);
                const isSel = selected.has(c.id);
                return (
                  <tr key={c.id} {...{ [COMMISSION_ROW_ATTR]: c.id }} className={`border-b border-gray-100 dark:border-gray-700/60 ${isSel ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}>
                    {canManage && (
                      <td className="p-3">
                        <Checkbox checked={isSel} onCheckedChange={() => onToggle(c.id)} aria-label={`Seleccionar comisión de ${c.payee_name || 'sin nombre'} por ${formatCurrency(Number(c.commission_amount), c.currency || currency)}`} />
                      </td>
                    )}
                    <td className="p-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{c.payee_name || 'Sin nombre'}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{c.payee_type === 'employee' ? 'Miembro' : c.payee_type === 'supplier' ? 'Proveedor' : 'Tercero'}</p>
                    </td>
                    <td className="p-3 text-sm text-gray-800 dark:text-gray-200">
                      {href ? (
                        <Link href={href} className="inline-flex items-center gap-1 text-blue-700 hover:underline dark:text-blue-300">
                          {SOURCE_LABELS[c.source_type] ?? c.source_type}
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">(abrir origen)</span>
                        </Link>
                      ) : (
                        SOURCE_LABELS[c.source_type] ?? c.source_type
                      )}
                    </td>
                    <td className="p-3 text-right text-sm tabular-nums text-gray-800 dark:text-gray-200">{formatCurrency(Number(c.base_amount), c.currency || currency)}</td>
                    <td className="p-3 text-right text-sm tabular-nums text-gray-800 dark:text-gray-200">{Number(c.commission_rate)}%</td>
                    <td className="p-3 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{formatCurrency(Number(c.commission_amount), c.currency || currency)}</td>
                    <td className="p-3">
                      <Badge className={`${tone.className} gap-1`}>
                        <tone.icon className="h-3 w-3" aria-hidden="true" />
                        {st.label}
                      </Badge>
                      {c.status === 'cancelled' && c.notes && (
                        <p className="mt-1 max-w-[16rem] text-xs text-gray-700 dark:text-gray-300">Motivo: {c.notes}</p>
                      )}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{c.accrued_at ? formatDate(c.accrued_at) : '—'}</td>
                    {canManage && (
                      <td className="p-3 text-right">
                        {c.status === 'accrued' && (
                          <Button size="sm" variant="outline" onClick={() => onPayOne(c)} className="h-7 text-xs">
                            Pagar
                          </Button>
                        )}
                        {c.status === 'paid' && (
                          <Button size="sm" variant="ghost" onClick={() => onClawbackOne(c)} className="h-7 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30">
                            Clawback
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
