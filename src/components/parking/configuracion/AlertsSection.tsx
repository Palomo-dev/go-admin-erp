'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Bell } from 'lucide-react';
import type { ParkingConfig } from '@/lib/services/parkingConfigService';

interface AlertsSectionProps {
  alerts: ParkingConfig['alerts'];
  onChange: (alerts: ParkingConfig['alerts']) => void;
}

export function AlertsSection({ alerts, onChange }: AlertsSectionProps) {
  const handleChange = (field: keyof ParkingConfig['alerts'], value: number | boolean) => {
    onChange({
      ...alerts,
      [field]: value,
    });
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-white">
          <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Alertas y Notificaciones
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerta de capacidad */}
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">
                Notificar cuando esté lleno
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Alerta cuando la ocupación supere el umbral
              </p>
            </div>
            <Switch
              checked={alerts.notify_when_full}
              onCheckedChange={(checked) => handleChange('notify_when_full', checked)}
            />
          </div>
          {alerts.notify_when_full && (
            <div className="flex items-center gap-3">
              <Label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Umbral de capacidad:
              </Label>
              <Input
                type="number"
                min={50}
                max={100}
                value={alerts.full_capacity_threshold}
                onChange={(e) =>
                  handleChange('full_capacity_threshold', parseInt(e.target.value) || 90)
                }
                className="w-20 h-8 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
          )}
        </div>

        {/* Alerta de estancia larga */}
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">
                Notificar estancias largas
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Alerta cuando un vehículo lleva mucho tiempo
              </p>
            </div>
            <Switch
              checked={alerts.notify_long_stay}
              onCheckedChange={(checked) => handleChange('notify_long_stay', checked)}
            />
          </div>
          {alerts.notify_long_stay && (
            <div className="flex items-center gap-3">
              <Label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Alertar después de:
              </Label>
              <Input
                type="number"
                min={1}
                max={48}
                value={alerts.long_stay_hours}
                onChange={(e) => handleChange('long_stay_hours', parseInt(e.target.value) || 8)}
                className="w-20 h-8 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-sm text-gray-500">horas</span>
            </div>
          )}
        </div>

        {/* Alerta de salida sin pagar */}
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div>
            <Label className="text-gray-700 dark:text-gray-300">
              Notificar salida sin pagar
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Alerta cuando se intenta salir sin realizar el pago
            </p>
          </div>
          <Switch
            checked={alerts.notify_unpaid_exit}
            onCheckedChange={(checked) => handleChange('notify_unpaid_exit', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default AlertsSection;
