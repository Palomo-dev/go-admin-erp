'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, CircleDot } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { SesionCajaPos } from '@/lib/services/posDashboardService';

interface SesionesCajaProps {
  sesiones: SesionCajaPos[];
  isLoading?: boolean;
}

export function SesionesCaja({ sesiones, isLoading }: SesionesCajaProps) {
  return (
    <Card className="dark:bg-gray-800/50">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <Wallet className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          Sesiones de caja activas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : sesiones.length === 0 ? (
          <div className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            No hay sesiones de caja abiertas
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sesiones.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/30"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <CircleDot className="h-4 w-4 shrink-0 text-green-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                      {s.branchName}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Balance actual</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(s.currentBalance, 'COP')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Monto apertura</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      {formatCurrency(s.openingAmount, 'COP')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Apertura</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      {s.openedAt ? new Date(s.openedAt).toLocaleString('es') : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SesionesCaja;
