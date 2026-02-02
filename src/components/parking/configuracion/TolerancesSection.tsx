'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Timer } from 'lucide-react';
import type { ParkingConfig } from '@/lib/services/parkingConfigService';

interface TolerancesSectionProps {
  tolerances: ParkingConfig['tolerances'];
  onChange: (tolerances: ParkingConfig['tolerances']) => void;
}

export function TolerancesSection({ tolerances, onChange }: TolerancesSectionProps) {
  const handleChange = (field: keyof ParkingConfig['tolerances'], value: number | boolean) => {
    onChange({
      ...tolerances,
      [field]: value,
    });
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-white">
          <Timer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Tolerancias y Tiempos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Período de gracia al entrar (min)
            </Label>
            <Input
              type="number"
              min={0}
              max={60}
              value={tolerances.grace_period_minutes}
              onChange={(e) => handleChange('grace_period_minutes', parseInt(e.target.value) || 0)}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Tiempo sin cobro al inicio de la estadía
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Tiempo para salir después de pagar (min)
            </Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={tolerances.exit_grace_minutes}
              onChange={(e) => handleChange('exit_grace_minutes', parseInt(e.target.value) || 0)}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Tiempo extra para salir sin cobro adicional
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Máximo tiempo de estancia (horas)
            </Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={tolerances.max_stay_hours}
              onChange={(e) => handleChange('max_stay_hours', parseInt(e.target.value) || 24)}
              className="dark:bg-gray-700 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Tiempo máximo permitido antes de alertar
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">
                Permitir estancia nocturna
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Vehículos pueden quedarse durante la noche
              </p>
            </div>
            <Switch
              checked={tolerances.overnight_allowed}
              onCheckedChange={(checked) => handleChange('overnight_allowed', checked)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default TolerancesSection;
