/**
 * Formulario para configurar canales de notificación
 */

'use client';

import React, { forwardRef } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/utils/Utils';

// Types
import type { NotificationChannel } from '@/types/eventTrigger';

interface ChannelConfigFormProps {
  value?: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  name?: string;
  disabled?: boolean;
}

export const ChannelConfigForm = forwardRef<HTMLDivElement, ChannelConfigFormProps>(
  ({ value = [], onChange, onBlur, name, disabled }, ref) => {
    
    // Configuración de canales disponibles
    const channels: Array<{
      id: NotificationChannel;
      label: string;
      description: string;
      icon: string;
      color: string;
      comingSoon?: boolean;
    }> = [
      {
        id: 'email',
        label: 'Email',
        description: 'Envío de correos electrónicos',
        icon: '📧',
        color: 'border-blue-200 bg-blue-50',
      },
      {
        id: 'whatsapp',
        label: 'WhatsApp',
        description: 'Mensajes por WhatsApp Business',
        icon: '📱',
        color: 'border-green-200 bg-green-50',
        comingSoon: true, // Hasta que se implemente
      },
      {
        id: 'webhook',
        label: 'Webhook',
        description: 'Llamadas HTTP a APIs externas',
        icon: '🔗',
        color: 'border-purple-200 bg-purple-50',
      },
      {
        id: 'push',
        label: 'Push',
        description: 'Notificaciones push del navegador',
        icon: '🔔',
        color: 'border-orange-200 bg-orange-50',
        comingSoon: true,
      },
      {
        id: 'sms',
        label: 'SMS',
        description: 'Mensajes de texto SMS',
        icon: '💬',
        color: 'border-yellow-200 bg-yellow-50',
        comingSoon: true,
      }
    ];

    // Manejar cambio de selección
    const handleChannelChange = (channelId: string, checked: boolean) => {
      if (disabled) return;
      
      let newChannels: string[];
      
      if (checked) {
        // Agregar canal si no está presente
        newChannels = value.includes(channelId) 
          ? value 
          : [...value, channelId];
      } else {
        // Remover canal
        newChannels = value.filter(c => c !== channelId);
      }
      
      onChange(newChannels);
      onBlur?.();
    };

    // Verificar si un canal está seleccionado
    const isChannelSelected = (channelId: string) => {
      return value.includes(channelId);
    };

    return (
      <div ref={ref} className="space-y-3">
        {channels.map((channel) => {
          const isSelected = isChannelSelected(channel.id);
          const isDisabled = disabled || channel.comingSoon;
          
          return (
            <Card
              key={channel.id}
              className={cn(
                "transition-all duration-200 cursor-pointer hover:shadow-sm",
                isSelected && !isDisabled 
                  ? `${channel.color} border-2` 
                  : "border border-gray-200 bg-white hover:bg-gray-50",
                isDisabled && "opacity-60 cursor-not-allowed"
              )}
              onClick={() => !isDisabled && handleChannelChange(channel.id, !isSelected)}
            >
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  {/* Checkbox */}
                  <Checkbox
                    id={`channel-${channel.id}`}
                    checked={isSelected}
                    onCheckedChange={(checked) => 
                      !isDisabled && handleChannelChange(channel.id, !!checked)
                    }
                    disabled={isDisabled}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />

                  {/* Icono y info del canal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{channel.icon}</span>
                      <Label 
                        htmlFor={`channel-${channel.id}`}
                        className={cn(
                          "font-medium cursor-pointer",
                          isDisabled && "cursor-not-allowed"
                        )}
                      >
                        {channel.label}
                      </Label>
                      
                      {/* Badge de estado */}
                      {channel.comingSoon && (
                        <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600">
                          Próximamente
                        </Badge>
                      )}
                      
                      {isSelected && !isDisabled && (
                        <Badge variant="outline" className="text-xs bg-primary/10 text-primary">
                          Seleccionado
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mt-1">
                      {channel.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Resumen de selección */}
        {value.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-800">
                Canales seleccionados:
              </span>
              <div className="flex flex-wrap gap-1">
                {value.map((channelId) => {
                  const channel = channels.find(c => c.id === channelId);
                  if (!channel) return null;
                  
                  return (
                    <Badge 
                      key={channelId} 
                      variant="outline" 
                      className="text-xs bg-blue-100 text-blue-800 border-blue-300"
                    >
                      {channel.icon} {channel.label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Mensaje si no hay selección */}
        {value.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground border border-dashed border-gray-300 rounded-lg">
            Selecciona al menos un canal para enviar las notificaciones
          </div>
        )}
      </div>
    );
  }
);

ChannelConfigForm.displayName = 'ChannelConfigForm';

export default ChannelConfigForm;
