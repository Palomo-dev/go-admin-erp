'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Clock } from 'lucide-react';
import type { ParkingConfig } from '@/lib/services/parkingConfigService';

type DayKey = keyof ParkingConfig['schedule'];

interface ScheduleSectionProps {
  schedule: ParkingConfig['schedule'];
  onChange: (schedule: ParkingConfig['schedule']) => void;
}

const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miércoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

export function ScheduleSection({ schedule, onChange }: ScheduleSectionProps) {
  const handleDayChange = (
    day: DayKey,
    field: 'open' | 'close' | 'enabled',
    value: string | boolean
  ) => {
    onChange({
      ...schedule,
      [day]: {
        ...schedule[day],
        [field]: value,
      },
    });
  };

  const days = Object.keys(DAY_LABELS) as DayKey[];

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-white">
          <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Horarios de Operación
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Header */}
          <div className="grid grid-cols-4 gap-4 text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
            <span>Día</span>
            <span className="text-center">Apertura</span>
            <span className="text-center">Cierre</span>
            <span className="text-center">Activo</span>
          </div>

          {/* Days */}
          {days.map((day) => (
            <div
              key={day}
              className={`grid grid-cols-4 gap-4 items-center p-2 rounded-lg ${
                schedule[day].enabled
                  ? 'bg-gray-50 dark:bg-gray-700/50'
                  : 'bg-gray-100 dark:bg-gray-800 opacity-60'
              }`}
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {DAY_LABELS[day]}
              </span>
              <Input
                type="time"
                value={schedule[day].open}
                onChange={(e) => handleDayChange(day, 'open', e.target.value)}
                disabled={!schedule[day].enabled}
                className="h-8 text-center text-sm dark:bg-gray-700 dark:border-gray-600"
              />
              <Input
                type="time"
                value={schedule[day].close}
                onChange={(e) => handleDayChange(day, 'close', e.target.value)}
                disabled={!schedule[day].enabled}
                className="h-8 text-center text-sm dark:bg-gray-700 dark:border-gray-600"
              />
              <div className="flex justify-center">
                <Switch
                  checked={schedule[day].enabled}
                  onCheckedChange={(checked) => handleDayChange(day, 'enabled', checked)}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default ScheduleSection;
