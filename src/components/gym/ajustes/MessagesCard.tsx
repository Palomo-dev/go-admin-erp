'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';
import { GymSettings } from '@/lib/services/gymSettingsService';

interface MessagesCardProps {
  settings: GymSettings['messages'];
  onChange: (key: keyof GymSettings['messages'], value: string) => void;
}

export function MessagesCard({ settings, onChange }: MessagesCardProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Mensajes Personalizados</CardTitle>
        </div>
        <CardDescription>
          Configura los mensajes que se muestran a los miembros
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Mensaje de bienvenida</Label>
          <Textarea
            value={settings.welcomeMessage}
            onChange={(e) => onChange('welcomeMessage', e.target.value)}
            placeholder="Mensaje al hacer check-in exitoso"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Mensaje de membresía expirada</Label>
          <Textarea
            value={settings.expiredMessage}
            onChange={(e) => onChange('expiredMessage', e.target.value)}
            placeholder="Mensaje cuando la membresía ha expirado"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Mensaje de acceso bloqueado</Label>
          <Textarea
            value={settings.blockedMessage}
            onChange={(e) => onChange('blockedMessage', e.target.value)}
            placeholder="Mensaje cuando el acceso está bloqueado"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Recordatorio de renovación</Label>
          <Textarea
            value={settings.renewalReminder}
            onChange={(e) => onChange('renewalReminder', e.target.value)}
            placeholder="Mensaje de recordatorio de renovación"
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  );
}
