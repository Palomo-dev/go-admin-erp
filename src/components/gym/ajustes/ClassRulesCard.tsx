'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Calendar } from 'lucide-react';
import { GymSettings } from '@/lib/services/gymSettingsService';

interface ClassRulesCardProps {
  settings: GymSettings['classRules'];
  onChange: (key: keyof GymSettings['classRules'], value: boolean | number) => void;
}

export function ClassRulesCard({ settings, onChange }: ClassRulesCardProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Reglas de Clases</CardTitle>
        </div>
        <CardDescription>
          Configura las políticas para reservaciones de clases grupales
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Máximo reservaciones por semana</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={settings.maxReservationsPerWeek}
              onChange={(e) => onChange('maxReservationsPerWeek', parseInt(e.target.value) || 5)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Límite de clases que un miembro puede reservar por semana
            </p>
          </div>

          <div className="space-y-2">
            <Label>Límite de cancelación (horas)</Label>
            <Input
              type="number"
              min={0}
              max={48}
              value={settings.cancellationHoursLimit}
              onChange={(e) => onChange('cancellationHoursLimit', parseInt(e.target.value) || 2)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Horas antes de la clase para permitir cancelación sin penalización
            </p>
          </div>

          <div className="space-y-2">
            <Label>Penalización por no asistir (días)</Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={settings.noShowPenaltyDays}
              onChange={(e) => onChange('noShowPenaltyDays', parseInt(e.target.value) || 7)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Días de bloqueo de reservaciones por no asistir
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t dark:border-gray-700">
          <div className="space-y-0.5">
            <Label>Habilitar lista de espera</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Permite a los miembros unirse a lista de espera cuando la clase está llena
            </p>
          </div>
          <Switch
            checked={settings.waitlistEnabled}
            onCheckedChange={(checked) => onChange('waitlistEnabled', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Auto-confirmar reservaciones</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Las reservaciones se confirman automáticamente sin aprobación
            </p>
          </div>
          <Switch
            checked={settings.autoConfirmReservations}
            onCheckedChange={(checked) => onChange('autoConfirmReservations', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
