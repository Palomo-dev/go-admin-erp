'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Car, CreditCard, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface RevenueStatsProps {
  revenueToday: number;
  revenueSessions: number;
  revenuePasses: number;
  completedToday: number;
}

export function RevenueStats({
  revenueToday,
  revenueSessions,
  revenuePasses,
  completedToday,
}: RevenueStatsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          Ingresos Hoy
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Total del día */}
          <div className="text-center p-4 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
            <p className="text-3xl font-bold text-green-700 dark:text-green-400">
              {formatCurrency(revenueToday)}
            </p>
            <p className="text-sm text-green-600 dark:text-green-500 mt-1">
              Total del día
            </p>
          </div>

          {/* Desglose */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Por sesiones</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(revenueSessions)}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Abonados activos</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {formatCurrency(revenuePasses)}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Sesiones completadas</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {completedToday}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
