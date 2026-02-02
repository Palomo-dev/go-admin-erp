'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MessageSquare } from 'lucide-react';
import type { ParkingConfig } from '@/lib/services/parkingConfigService';

interface MessagesSectionProps {
  messages: ParkingConfig['messages'];
  onChange: (messages: ParkingConfig['messages']) => void;
}

export function MessagesSection({ messages, onChange }: MessagesSectionProps) {
  const handleChange = (field: keyof ParkingConfig['messages'], value: string) => {
    onChange({
      ...messages,
      [field]: value,
    });
  };

  const messageFields = [
    {
      key: 'welcome_message' as const,
      label: 'Mensaje de bienvenida',
      description: 'Se muestra al cliente cuando ingresa. Variables: {max_hours}',
      rows: 2,
    },
    {
      key: 'exit_message' as const,
      label: 'Mensaje de salida',
      description: 'Se muestra al cliente cuando se retira',
      rows: 2,
    },
    {
      key: 'ticket_footer' as const,
      label: 'Pie del ticket de entrada',
      description: 'Texto que aparece en la parte inferior del ticket',
      rows: 2,
    },
    {
      key: 'receipt_footer' as const,
      label: 'Pie del recibo de pago',
      description: 'Texto que aparece en la parte inferior del recibo',
      rows: 2,
    },
    {
      key: 'lost_ticket_notice' as const,
      label: 'Aviso de ticket perdido',
      description: 'Mensaje sobre política de ticket perdido',
      rows: 2,
    },
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-white">
          <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Mensajes Personalizados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {messageFields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">{field.label}</Label>
            <Textarea
              value={messages[field.key]}
              onChange={(e) => handleChange(field.key, e.target.value)}
              rows={field.rows}
              className="dark:bg-gray-700 dark:border-gray-600 resize-none"
              placeholder={field.description}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">{field.description}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default MessagesSection;
