'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Bell } from 'lucide-react';
import { GymSettings } from '@/lib/services/gymSettingsService';

interface NotificationsCardProps {
  settings: GymSettings['notifications'];
  onChange: (key: keyof GymSettings['notifications'], value: boolean | number) => void;
}

export function NotificationsCard({ settings, onChange }: NotificationsCardProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Notificaciones</CardTitle>
        </div>
        <CardDescription>
          Configura las notificaciones automáticas para los miembros
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Recordatorio de vencimiento</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enviar notificación cuando la membresía está por vencer
            </p>
          </div>
          <Switch
            checked={settings.sendExpirationReminder}
            onCheckedChange={(checked) => onChange('sendExpirationReminder', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Confirmación de check-in</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enviar confirmación después de cada check-in
            </p>
          </div>
          <Switch
            checked={settings.sendCheckinConfirmation}
            onCheckedChange={(checked) => onChange('sendCheckinConfirmation', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Recordatorio de clases</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enviar recordatorio antes de clases reservadas
            </p>
          </div>
          <Switch
            checked={settings.sendClassReminder}
            onCheckedChange={(checked) => onChange('sendClassReminder', checked)}
          />
        </div>

        <div className="pt-4 border-t dark:border-gray-700">
          <div className="space-y-2">
            <Label>Horas de anticipación para recordatorio</Label>
            <Input
              type="number"
              min={1}
              max={72}
              value={settings.reminderHoursBefore}
              onChange={(e) => onChange('reminderHoursBefore', parseInt(e.target.value) || 24)}
              className="w-32"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Cuántas horas antes enviar el recordatorio de clases
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
