'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import type { PassVsOccasional } from '@/lib/services/parkingReportService';

interface PassVsOccasionalChartProps {
  data: PassVsOccasional;
  isLoading?: boolean;
}

export function PassVsOccasionalChart({ data, isLoading }: PassVsOccasionalChartProps) {
  const totalClients = data.subscribers + data.occasional;
  const totalRevenue = data.subscriber_revenue + data.occasional_revenue;

  const subscriberPercent =
    totalClients > 0 ? Math.round((data.subscribers / totalClients) * 100) : 0;
  const occasionalPercent = totalClients > 0 ? 100 - subscriberPercent : 0;

  const subscriberRevenuePercent =
    totalRevenue > 0 ? Math.round((data.subscriber_revenue / totalRevenue) * 100) : 0;
  const occasionalRevenuePercent = totalRevenue > 0 ? 100 - subscriberRevenuePercent : 0;

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
          <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          Abonados vs Ocasionales
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="animate-pulse text-gray-400">Cargando...</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Comparación de clientes */}
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Distribución de Clientes
              </p>
              <div className="h-6 rounded-lg overflow-hidden flex">
                <div
                  className="bg-purple-500 transition-all duration-300"
                  style={{ width: `${subscriberPercent}%` }}
                />
                <div
                  className="bg-blue-500 transition-all duration-300"
                  style={{ width: `${occasionalPercent}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-purple-500" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Abonados: <strong>{data.subscribers}</strong> ({subscriberPercent}%)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Ocasionales: <strong>{data.occasional}</strong> ({occasionalPercent}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Comparación de ingresos */}
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Distribución de Ingresos
              </p>
              <div className="h-6 rounded-lg overflow-hidden flex">
                <div
                  className="bg-purple-400 transition-all duration-300"
                  style={{ width: `${subscriberRevenuePercent}%` }}
                />
                <div
                  className="bg-blue-400 transition-all duration-300"
                  style={{ width: `${occasionalRevenuePercent}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-300">Abonados: </span>
                  <strong className="text-purple-600 dark:text-purple-400">
                    {formatCurrency(data.subscriber_revenue)}
                  </strong>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-300">Ocasionales: </span>
                  <strong className="text-blue-600 dark:text-blue-400">
                    {formatCurrency(data.occasional_revenue)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Totales */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Total Clientes</span>
                <strong className="text-gray-900 dark:text-white">{totalClients}</strong>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500 dark:text-gray-400">Total Ingresos</span>
                <strong className="text-green-600 dark:text-green-400">
                  {formatCurrency(totalRevenue)}
                </strong>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PassVsOccasionalChart;
