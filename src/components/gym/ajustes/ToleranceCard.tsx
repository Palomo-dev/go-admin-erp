'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Clock } from 'lucide-react';
import { GymSettings } from '@/lib/services/gymSettingsService';

interface ToleranceCardProps {
  settings: GymSettings['tolerance'];
  onChange: (key: keyof GymSettings['tolerance'], value: number) => void;
}

export function ToleranceCard({ settings, onChange }: ToleranceCardProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Tolerancias</CardTitle>
        </div>
        <CardDescription>
          Configura los tiempos de tolerancia para accesos y vencimientos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Check-in anticipado (minutos)</Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={settings.earlyCheckinMinutes}
              onChange={(e) => onChange('earlyCheckinMinutes', parseInt(e.target.value) || 0)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Minutos antes de la hora de apertura para permitir check-in
            </p>
          </div>

          <div className="space-y-2">
            <Label>Check-in tardío (minutos)</Label>
            <Input
              type="number"
              min={0}
              max={120}
              value={settings.lateCheckinMinutes}
              onChange={(e) => onChange('lateCheckinMinutes', parseInt(e.target.value) || 0)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Minutos después de la hora de cierre para permitir check-in
            </p>
          </div>

          <div className="space-y-2">
            <Label>Período de gracia (días)</Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={settings.gracePeroidDays}
              onChange={(e) => onChange('gracePeroidDays', parseInt(e.target.value) || 0)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Días de gracia después del vencimiento de membresía
            </p>
          </div>

          <div className="space-y-2">
            <Label>Aviso de vencimiento (días)</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={settings.expirationWarningDays}
              onChange={(e) => onChange('expirationWarningDays', parseInt(e.target.value) || 7)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Días antes del vencimiento para mostrar alertas
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
