'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Clock } from 'lucide-react';

interface PeakHoursChartProps {
  data: { hour: number; checkins: number }[];
}

export function PeakHoursChart({ data }: PeakHoursChartProps) {
  const maxCheckins = Math.max(...data.map((d) => d.checkins), 1);
  const totalCheckins = data.reduce((sum, d) => sum + d.checkins, 0);
  
  const peakHour = useMemo(() => {
    const peak = data.reduce((max, d) => d.checkins > max.checkins ? d : max, data[0] || { hour: 0, checkins: 0 });
    return peak;
  }, [data]);

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Horas Pico
            </CardTitle>
            <CardDescription>
              {totalCheckins.toLocaleString()} check-ins en el período
            </CardDescription>
          </div>
          {peakHour && peakHour.checkins > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-blue-600">{peakHour.hour}:00</p>
              <p className="text-xs text-gray-500">Hora pico</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between h-40 gap-1">
          {data.map((item) => {
            const height = maxCheckins > 0 ? (item.checkins / maxCheckins) * 100 : 0;
            const isHighTraffic = height > 60;
            const isMediumTraffic = height > 30 && height <= 60;

            return (
              <div key={item.hour} className="flex flex-col items-center flex-1 min-w-0">
                <div className="relative w-full h-32 flex items-end justify-center">
                  <div
                    className={`w-full max-w-[20px] rounded-t transition-all ${
                      isHighTraffic
                        ? 'bg-red-500 dark:bg-red-400'
                        : isMediumTraffic
                        ? 'bg-yellow-500 dark:bg-yellow-400'
                        : 'bg-blue-500 dark:bg-blue-400'
                    }`}
                    style={{ height: `${height}%`, minHeight: item.checkins > 0 ? '4px' : '0' }}
                    title={`${item.checkins} check-ins`}
                  />
                </div>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                  {item.hour.toString().padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500 dark:bg-red-400" />
            <span className="text-gray-600 dark:text-gray-400">Alto</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-yellow-500 dark:bg-yellow-400" />
            <span className="text-gray-600 dark:text-gray-400">Medio</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-500 dark:bg-blue-400" />
            <span className="text-gray-600 dark:text-gray-400">Bajo</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
