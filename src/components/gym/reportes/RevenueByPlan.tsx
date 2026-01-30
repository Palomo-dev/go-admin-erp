'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/utils/Utils';

interface RevenueByPlanProps {
  data: { plan_name: string; revenue: number; count: number }[];
  currency?: string;
}

export function RevenueByPlan({ data, currency = 'COP' }: RevenueByPlanProps) {
  const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
  const totalCount = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg">Ingresos por Plan</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            No hay datos disponibles
          </p>
        ) : (
          <div className="space-y-3">
            {data.map((item) => {
              const percentage = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
              return (
                <div key={item.plan_name} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{item.plan_name}</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(item.revenue, currency)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right">
                      {item.count} miembros
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-900 dark:text-white">Total</span>
                <div className="text-right">
                  <p className="font-bold text-gray-900 dark:text-white">
                    {formatCurrency(totalRevenue, currency)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {totalCount} miembros activos
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
