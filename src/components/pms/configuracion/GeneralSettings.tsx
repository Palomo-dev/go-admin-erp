'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, Globe, DollarSign } from 'lucide-react';
import type { PMSSettings } from '@/lib/services/pmsSettingsService';

interface GeneralSettingsProps {
  settings: PMSSettings;
  onChange: (key: keyof PMSSettings, value: any) => void;
  timezones: { value: string; label: string }[];
  currencies: { value: string; label: string }[];
}

export function GeneralSettings({ settings, onChange, timezones, currencies }: GeneralSettingsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-blue-600" />
          Configuración General
        </CardTitle>
        <CardDescription>
          Horarios, zona horaria y moneda predeterminada
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="checkinTime">Hora de Check-in</Label>
            <Input
              id="checkinTime"
              type="time"
              value={settings.checkinTime}
              onChange={(e) => onChange('checkinTime', e.target.value)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Hora estándar de entrada de huéspedes
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="checkoutTime">Hora de Check-out</Label>
            <Input
              id="checkoutTime"
              type="time"
              value={settings.checkoutTime}
              onChange={(e) => onChange('checkoutTime', e.target.value)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Hora límite de salida de huéspedes
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="timezone">
              <Globe className="h-4 w-4 inline mr-1" />
              Zona Horaria
            </Label>
            <Select
              value={settings.timezone}
              onValueChange={(value) => onChange('timezone', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency">
              <DollarSign className="h-4 w-4 inline mr-1" />
              Moneda Predeterminada
            </Label>
            <Select
              value={settings.defaultCurrency}
              onValueChange={(value) => onChange('defaultCurrency', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
