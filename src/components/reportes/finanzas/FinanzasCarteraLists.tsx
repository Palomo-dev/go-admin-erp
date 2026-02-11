'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { CxCResumen, CxPResumen } from './finanzasReportService';

// ─── Top CxC ─────────────────────────────────────────────────────────────────

interface TopCxCProps {
  data: CxCResumen[];
  isLoading: boolean;
}

function getDaysColor(days: number): string {
  if (days <= 0) return 'text-green-600 dark:text-green-400';
  if (days <= 30) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

export function FinanzasTopCxC({ data, isLoading }: TopCxCProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20">
          <ArrowDownToLine className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Cuentas por Cobrar</h3>
      </div>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay cuentas por cobrar pendientes</div>
      ) : (
        <div className="space-y-3">
          {data.map((c, idx) => {
            const maxBal = data[0]?.total_balance || 1;
            const pct = (c.total_balance / maxBal) * 100;
            return (
              <div key={c.customer_id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[10px] flex items-center justify-center font-semibold">{idx + 1}</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate text-xs">{c.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-[10px] font-medium ${getDaysColor(c.max_days_overdue)}`}>
                      {c.max_days_overdue > 0 ? `${c.max_days_overdue}d vencido` : 'Vigente'}
                    </span>
                    <span className="font-medium text-xs text-gray-800 dark:text-gray-200">{formatCurrency(c.total_balance)}</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div className="bg-orange-500 dark:bg-orange-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Top CxP ─────────────────────────────────────────────────────────────────

interface TopCxPProps {
  data: CxPResumen[];
  isLoading: boolean;
}

export function FinanzasTopCxP({ data, isLoading }: TopCxPProps) {
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
          <ArrowUpFromLine className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Cuentas por Pagar</h3>
      </div>
      {data.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">No hay cuentas por pagar pendientes</div>
      ) : (
        <div className="space-y-3">
          {data.map((s, idx) => {
            const maxBal = data[0]?.total_balance || 1;
            const pct = (s.total_balance / maxBal) * 100;
            return (
              <div key={s.supplier_id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] flex items-center justify-center font-semibold">{idx + 1}</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate text-xs">{s.supplier_name}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-[10px] font-medium ${getDaysColor(s.max_days_overdue)}`}>
                      {s.max_days_overdue > 0 ? `${s.max_days_overdue}d vencido` : 'Vigente'}
                    </span>
                    <span className="font-medium text-xs text-gray-800 dark:text-gray-200">{formatCurrency(s.total_balance)}</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div className="bg-purple-500 dark:bg-purple-400 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
