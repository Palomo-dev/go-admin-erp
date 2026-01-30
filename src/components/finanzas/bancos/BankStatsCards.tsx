'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Landmark, CreditCard, DollarSign, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { BankAccountStats } from './BancosService';

interface BankStatsCardsProps {
  stats: BankAccountStats | null;
  isLoading?: boolean;
}

export function BankStatsCards({ stats, isLoading }: BankStatsCardsProps) {
  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div 
            key={i} 
            className="h-28 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Total Cuentas
          </CardTitle>
          <Landmark className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.total_accounts}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {stats.active_accounts} activas
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Cuentas Activas
          </CardTitle>
          <CreditCard className="h-4 w-4 text-green-600 dark:text-green-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.active_accounts}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            de {stats.total_accounts} cuentas
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Saldo Total
          </CardTitle>
          <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${
            stats.total_balance >= 0 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-red-600 dark:text-red-400'
          }`}>
            {formatCurrency(stats.total_balance)}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            En todas las cuentas activas
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Conciliaciones Pendientes
          </CardTitle>
          <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.pending_reconciliations}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Por completar
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
