'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Mail, Bell } from 'lucide-react';
import type { PMSSettings } from '@/lib/services/pmsSettingsService';

interface NotificationSettingsProps {
  settings: PMSSettings;
  onChange: (key: keyof PMSSettings, value: any) => void;
}

export function NotificationSettings({ settings, onChange }: NotificationSettingsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bell className="h-5 w-5 text-purple-600" />
          Notificaciones
        </CardTitle>
        <CardDescription>
          Configuración de emails y alertas automáticas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enviar email de confirmación</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Notificar al huésped cuando se confirma su reserva
            </p>
          </div>
          <Switch
            checked={settings.sendConfirmationEmail}
            onCheckedChange={(checked) => onChange('sendConfirmationEmail', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enviar email recordatorio</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Recordar al huésped antes de su llegada
            </p>
          </div>
          <Switch
            checked={settings.sendReminderEmail}
            onCheckedChange={(checked) => onChange('sendReminderEmail', checked)}
          />
        </div>

        {settings.sendReminderEmail && (
          <div className="space-y-2 pl-4 border-l-2 border-purple-200 dark:border-purple-800">
            <Label htmlFor="reminderDays">Días antes del check-in</Label>
            <Input
              id="reminderDays"
              type="number"
              min="1"
              max="7"
              value={settings.reminderDaysBefore}
              onChange={(e) => onChange('reminderDaysBefore', parseInt(e.target.value) || 1)}
              className="w-32"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="maintenanceEmail">
            <Mail className="h-4 w-4 inline mr-1" />
            Email para alertas de mantenimiento
          </Label>
          <Input
            id="maintenanceEmail"
            type="email"
            value={settings.maintenanceAlertEmail}
            onChange={(e) => onChange('maintenanceAlertEmail', e.target.value)}
            placeholder="mantenimiento@hotel.com"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Recibir notificaciones de órdenes de mantenimiento urgentes
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
