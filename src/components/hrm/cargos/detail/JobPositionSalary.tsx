'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

interface JobPositionSalaryProps {
  minSalary: number | null;
  maxSalary: number | null;
}

export function JobPositionSalary({ minSalary, maxSalary }: JobPositionSalaryProps) {
  const hasRange = minSalary !== null || maxSalary !== null;
  const midPoint = minSalary !== null && maxSalary !== null
    ? (minSalary + maxSalary) / 2
    : null;

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-gray-900 dark:text-white">
          <DollarSign className="h-5 w-5 text-blue-600" />
          Rango Salarial
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasRange ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                  <TrendingDown className="h-4 w-4 text-green-500" />
                  Mínimo
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {minSalary !== null ? formatCurrency(minSalary) : '-'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Máximo
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {maxSalary !== null ? formatCurrency(maxSalary) : '-'}
                </p>
              </div>
            </div>
            {midPoint !== null && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Punto medio
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(midPoint)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            No se ha definido un rango salarial para este cargo
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default JobPositionSalary;
