'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
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
        <div className="flex flex-wrap items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <CardTitle className="text-lg">Mensajes Personalizados</CardTitle>
        </div>
        <CardDescription>
          Configura los mensajes que se muestran a los miembros
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Mensaje de bienvenida</Label>
          <RichTextEditor
            value={settings.welcomeMessage}
            onChange={(html) => onChange('welcomeMessage', html)}
            placeholder="Mensaje al hacer check-in exitoso"
            minHeight={60}
          />
        </div>

        <div className="space-y-2">
          <Label>Mensaje de membresía expirada</Label>
          <RichTextEditor
            value={settings.expiredMessage}
            onChange={(html) => onChange('expiredMessage', html)}
            placeholder="Mensaje cuando la membresía ha expirado"
            minHeight={60}
          />
        </div>

        <div className="space-y-2">
          <Label>Mensaje de acceso bloqueado</Label>
          <RichTextEditor
            value={settings.blockedMessage}
            onChange={(html) => onChange('blockedMessage', html)}
            placeholder="Mensaje cuando el acceso está bloqueado"
            minHeight={60}
          />
        </div>

        <div className="space-y-2">
          <Label>Recordatorio de renovación</Label>
          <RichTextEditor
            value={settings.renewalReminder}
            onChange={(html) => onChange('renewalReminder', html)}
            placeholder="Mensaje de recordatorio de renovación"
            minHeight={60}
          />
        </div>
      </CardContent>
    </Card>
  );
}
