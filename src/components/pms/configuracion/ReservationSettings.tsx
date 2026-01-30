'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CalendarCheck, Percent } from 'lucide-react';
import type { PMSSettings } from '@/lib/services/pmsSettingsService';

interface ReservationSettingsProps {
  settings: PMSSettings;
  onChange: (key: keyof PMSSettings, value: any) => void;
}

export function ReservationSettings({ settings, onChange }: ReservationSettingsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarCheck className="h-5 w-5 text-green-600" />
          Reservas
        </CardTitle>
        <CardDescription>
          Políticas de reservas, depósitos y cancelaciones
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Confirmar reservas automáticamente</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Las reservas se confirman al crearlas sin revisión manual
            </p>
          </div>
          <Switch
            checked={settings.autoConfirmReservations}
            onCheckedChange={(checked) => onChange('autoConfirmReservations', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Requerir depósito</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Solicitar pago anticipado para confirmar reservas
            </p>
          </div>
          <Switch
            checked={settings.requireDeposit}
            onCheckedChange={(checked) => onChange('requireDeposit', checked)}
          />
        </div>

        {settings.requireDeposit && (
          <div className="space-y-2 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
            <Label htmlFor="depositPercentage">
              <Percent className="h-4 w-4 inline mr-1" />
              Porcentaje de depósito
            </Label>
            <Input
              id="depositPercentage"
              type="number"
              min="0"
              max="100"
              value={settings.depositPercentage}
              onChange={(e) => onChange('depositPercentage', parseInt(e.target.value) || 0)}
              className="w-32"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="cancellationDays">Días para cancelación gratuita</Label>
          <Input
            id="cancellationDays"
            type="number"
            min="0"
            value={settings.cancellationPolicyDays}
            onChange={(e) => onChange('cancellationPolicyDays', parseInt(e.target.value) || 0)}
            className="w-32"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Días antes del check-in para cancelar sin penalización
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Permitir overbooking</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Aceptar más reservas que la capacidad disponible
            </p>
          </div>
          <Switch
            checked={settings.overbookingAllowed}
            onCheckedChange={(checked) => onChange('overbookingAllowed', checked)}
          />
        </div>

        {settings.overbookingAllowed && (
          <div className="space-y-2 pl-4 border-l-2 border-orange-200 dark:border-orange-800">
            <Label htmlFor="overbookingPercentage">
              <Percent className="h-4 w-4 inline mr-1" />
              Porcentaje de overbooking
            </Label>
            <Input
              id="overbookingPercentage"
              type="number"
              min="0"
              max="50"
              value={settings.overbookingPercentage}
              onChange={(e) => onChange('overbookingPercentage', parseInt(e.target.value) || 0)}
              className="w-32"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
