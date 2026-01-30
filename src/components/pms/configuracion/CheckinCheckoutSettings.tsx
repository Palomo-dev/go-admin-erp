'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LogIn, LogOut, DollarSign } from 'lucide-react';
import type { PMSSettings } from '@/lib/services/pmsSettingsService';

interface CheckinCheckoutSettingsProps {
  settings: PMSSettings;
  onChange: (key: keyof PMSSettings, value: any) => void;
}

export function CheckinCheckoutSettings({ settings, onChange }: CheckinCheckoutSettingsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LogIn className="h-5 w-5 text-blue-600" />
          Check-in / Check-out
        </CardTitle>
        <CardDescription>
          Políticas de entrada anticipada y salida tardía
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              Permitir early check-in
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Huéspedes pueden llegar antes de la hora estándar
            </p>
          </div>
          <Switch
            checked={settings.allowEarlyCheckin}
            onCheckedChange={(checked) => onChange('allowEarlyCheckin', checked)}
          />
        </div>

        {settings.allowEarlyCheckin && (
          <div className="space-y-2 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
            <Label htmlFor="earlyCheckinFee">
              <DollarSign className="h-4 w-4 inline mr-1" />
              Cargo por early check-in
            </Label>
            <Input
              id="earlyCheckinFee"
              type="number"
              min="0"
              value={settings.earlyCheckinFee}
              onChange={(e) => onChange('earlyCheckinFee', parseFloat(e.target.value) || 0)}
              className="w-32"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Costo adicional (0 = gratis según disponibilidad)
            </p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Permitir late check-out
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Huéspedes pueden salir después de la hora estándar
            </p>
          </div>
          <Switch
            checked={settings.allowLateCheckout}
            onCheckedChange={(checked) => onChange('allowLateCheckout', checked)}
          />
        </div>

        {settings.allowLateCheckout && (
          <div className="space-y-2 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
            <Label htmlFor="lateCheckoutFee">
              <DollarSign className="h-4 w-4 inline mr-1" />
              Cargo por late check-out
            </Label>
            <Input
              id="lateCheckoutFee"
              type="number"
              min="0"
              value={settings.lateCheckoutFee}
              onChange={(e) => onChange('lateCheckoutFee', parseFloat(e.target.value) || 0)}
              className="w-32"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Costo adicional (0 = gratis según disponibilidad)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
