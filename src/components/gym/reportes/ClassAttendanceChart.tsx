'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { getClassTypeLabel } from '@/lib/services/gymService';

interface ClassAttendanceChartProps {
  data: { class_type: string; total: number; attended: number; rate: number }[];
}

export function ClassAttendanceChart({ data }: ClassAttendanceChartProps) {
  const stats = useMemo(() => {
    const totalReservations = data.reduce((sum, d) => sum + d.total, 0);
    const totalAttended = data.reduce((sum, d) => sum + d.attended, 0);
    const avgRate = totalReservations > 0 ? (totalAttended / totalReservations) * 100 : 0;
    return { totalReservations, totalAttended, avgRate };
  }, [data]);

  if (data.length === 0) {
    return (
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600" />
            Asistencia por Tipo de Clase
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            No hay datos de clases disponibles
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-600" />
              Asistencia por Tipo de Clase
            </CardTitle>
            <CardDescription>
              {stats.totalAttended.toLocaleString()} de {stats.totalReservations.toLocaleString()} reservaciones
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-purple-600">{stats.avgRate.toFixed(0)}%</p>
            <p className="text-xs text-gray-500">Promedio</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.map((item) => (
            <div key={item.class_type} className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {getClassTypeLabel(item.class_type)}
                </span>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {item.attended}/{item.total} ({item.rate.toFixed(0)}%)
                </div>
              </div>
              <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    item.rate >= 80
                      ? 'bg-green-500 dark:bg-green-400'
                      : item.rate >= 50
                      ? 'bg-yellow-500 dark:bg-yellow-400'
                      : 'bg-red-500 dark:bg-red-400'
                  }`}
                  style={{ width: `${item.rate}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4 mt-6 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500 dark:bg-green-400" />
            <span className="text-gray-600 dark:text-gray-400">{'>'}80%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-yellow-500 dark:bg-yellow-400" />
            <span className="text-gray-600 dark:text-gray-400">50-80%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500 dark:bg-red-400" />
            <span className="text-gray-600 dark:text-gray-400">{'<'}50%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
