/**
 * Formulario simple para crear/editar triggers
 */

'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
// import { Checkbox } from '@/components/ui/checkbox'; // Comentado para evitar conflictos con extensiones
import { Check } from 'lucide-react';
import { toast } from 'sonner';

// Componente selector de plantillas
import { TemplateSelector } from './TemplateSelector';

// Types
import type { NotificationChannel } from '@/types/eventTrigger';

interface SimpleTriggerFormProps {
  onClose: () => void;
  onSubmit: (data: any) => void;
}

const EVENTS = [
  { code: 'invoice.created', label: 'Factura Creada' },
  { code: 'invoice.paid', label: 'Factura Pagada' },
  { code: 'inventory.low_stock', label: 'Stock Bajo' },
  { code: 'user.created', label: 'Usuario Creado' },
  { code: 'reservation.created', label: 'Reserva Creada' }
];

const CHANNELS = [
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'webhook', label: 'Webhook' },
  { id: 'push', label: 'Push' },
  { id: 'sms', label: 'SMS' }
];

export const SimpleTriggerForm: React.FC<SimpleTriggerFormProps> = ({ onClose, onSubmit }) => {
  // Generar IDs únicos una sola vez para evitar re-renders
  const uniqueIds = useMemo(() => ({
    activeStatus: `go-admin-trigger-active-status-${Math.random().toString(36).substr(2, 9)}`,
    formId: `go-admin-trigger-form-${Math.random().toString(36).substr(2, 9)}`
  }), []);
  
  const [formData, setFormData] = useState({
    name: '',
    event_code: '',
    channels: [] as string[],
    template_id: '', // Agregado para seleccionar plantillas
    priority: 2,
    active: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }
    
    if (!formData.event_code) {
      toast.error('Selecciona un evento');
      return;
    }
    
    if (formData.channels.length === 0) {
      toast.error('Selecciona al menos un canal');
      return;
    }

    onSubmit(formData);
  };

  const handleChannelChange = (channelId: string, shouldAdd: boolean) => {
    // Validaciones simplificadas para botones toggle
    if (typeof channelId !== 'string' || !channelId.trim()) {
      console.warn('[SimpleTriggerForm] channelId inválido:', channelId);
      return;
    }
    
    if (typeof shouldAdd !== 'boolean') {
      console.warn('[SimpleTriggerForm] shouldAdd debe ser boolean:', shouldAdd);
      return;
    }
    
    console.log('[SimpleTriggerForm] Cambiando canal:', channelId, 'a:', shouldAdd);
    
    setFormData(prev => {
      if (!prev || !Array.isArray(prev.channels)) {
        console.warn('[SimpleTriggerForm] Estado de formData inválido');
        return prev;
      }
      
      const newChannels = shouldAdd
        ? [...prev.channels.filter(c => c !== channelId), channelId] // Evitar duplicados
        : prev.channels.filter(c => c !== channelId);
      
      console.log('[SimpleTriggerForm] Nuevos canales:', newChannels);
      
      return {
        ...prev,
        channels: newChannels
      };
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo Trigger</CardTitle>
        <CardDescription>
          Configura cuándo y cómo se ejecutarán las acciones automáticas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Trigger</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ej: Notificar factura creada"
              required
            />
          </div>

          {/* Evento */}
          <div className="space-y-2">
            <Label>Evento que lo disparará</Label>
            <Select
              value={formData.event_code}
              onValueChange={(value) => setFormData(prev => ({ ...prev, event_code: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un evento" />
              </SelectTrigger>
              <SelectContent>
                {EVENTS && Array.isArray(EVENTS) ? EVENTS.map((event) => (
                  <SelectItem key={event.code} value={event.code}>
                    {event.label} ({event.code})
                  </SelectItem>
                )) : (
                  <SelectItem value="" disabled>No hay eventos disponibles</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Canales - Botones Toggle Personalizados */}
          <div className="space-y-2">
            <Label>Canales de notificación</Label>
            <div className="grid grid-cols-2 gap-3">
              {CHANNELS && Array.isArray(CHANNELS) ? CHANNELS.map((channel, index) => {
                // Validación adicional del canal
                if (!channel || !channel.id || !channel.label) {
                  console.warn('[SimpleTriggerForm] Canal inválido:', channel);
                  return null;
                }
                
                const isSelected = formData.channels?.includes(channel.id) ?? false;
                
                return (
                <div key={`channel-wrapper-${channel.id}-${index}`} className="flex items-center space-x-2">
                  {/* Botón Toggle Personalizado - NO es un checkbox */}
                  <button
                    type="button"
                    className={`
                      w-4 h-4 border-2 rounded-sm flex items-center justify-center transition-all duration-200
                      ${isSelected 
                        ? 'bg-primary border-primary text-primary-foreground' 
                        : 'border-input hover:border-primary/50 bg-background'
                      }
                      focus:outline-none focus:ring-2 focus:ring-primary/20
                    `}
                    onClick={() => {
                      console.log('[SimpleTriggerForm] Toggle button clicked for:', channel.id);
                      handleChannelChange(channel.id, !isSelected);
                    }}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Desactivar' : 'Activar'} canal ${channel.label}`}
                  >
                    {isSelected && (
                      <Check className="w-3 h-3" strokeWidth={3} />
                    )}
                  </button>
                  <Label
                    className="text-sm font-normal cursor-pointer select-none"
                    onClick={() => {
                      console.log('[SimpleTriggerForm] Label clicked for:', channel.id);
                      handleChannelChange(channel.id, !isSelected);
                    }}
                  >
                    {channel.label}
                  </Label>
                </div>
                );
              }) : (
                <div className="text-muted-foreground">No hay canales disponibles</div>
              )}
            </div>
          </div>

          {/* Selector de Plantilla */}
          <div className="space-y-2">
            <Label>Plantilla de Notificación (Opcional)</Label>
            <TemplateSelector 
              value={formData.template_id}
              onChange={(templateId) => {
                console.log('[SimpleTriggerForm] Plantilla seleccionada:', templateId);
                setFormData(prev => ({
                  ...prev, 
                  template_id: templateId || ''
                }));
              }}
              channels={formData.channels as NotificationChannel[]}
            />
            <p className="text-sm text-muted-foreground">
              Las plantillas personalizan el contenido de las notificaciones.
              Sin plantilla, se enviará información básica del evento.
            </p>
          </div>

          {/* Prioridad */}
          <div className="space-y-2">
            <Label>Prioridad</Label>
            <Select
              value={formData.priority.toString()}
              onValueChange={(value) => {
                // Validación ultra segura para prioridad
                console.log('[SimpleTriggerForm] Cambiando prioridad a:', value);
                
                if (!value || typeof value !== 'string') {
                  console.warn('[SimpleTriggerForm] Valor de prioridad inválido:', value);
                  return;
                }
                
                const parsedValue = parseInt(value, 10);
                
                if (isNaN(parsedValue)) {
                  console.warn('[SimpleTriggerForm] parseInt falló para:', value);
                  return;
                }
                
                if (parsedValue < 1 || parsedValue > 4 || !Number.isInteger(parsedValue)) {
                  console.warn('[SimpleTriggerForm] Prioridad fuera de rango:', parsedValue);
                  return;
                }
                
                setFormData(prev => ({ ...prev, priority: parsedValue }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 - Baja</SelectItem>
                <SelectItem value="2">2 - Media</SelectItem>
                <SelectItem value="3">3 - Alta</SelectItem>
                <SelectItem value="4">4 - Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Estado activo - Toggle Personalizado */}
          <div className="flex items-center space-x-2">
            {/* Toggle Switch Personalizado - NO es un checkbox */}
            <button
              type="button"
              className={`
                relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 ease-in-out
                ${formData.active 
                  ? 'bg-primary' 
                  : 'bg-gray-200 dark:bg-gray-700'
                }
                focus:outline-none focus:ring-2 focus:ring-primary/20
              `}
              onClick={() => {
                console.log('[SimpleTriggerForm] Active toggle clicked, current:', formData.active);
                setFormData(prev => ({ ...prev, active: !prev.active }));
              }}
              aria-pressed={formData.active}
              aria-label={`${formData.active ? 'Desactivar' : 'Activar'} trigger`}
            >
              <span
                className={`
                  inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ease-in-out
                  ${formData.active ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
            <Label
              className="cursor-pointer select-none"
              onClick={() => {
                console.log('[SimpleTriggerForm] Active label clicked');
                setFormData(prev => ({ ...prev, active: !prev.active }));
              }}
            >
              Activar trigger inmediatamente
            </Label>
          </div>

          {/* Botones */}
          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              Crear Trigger
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
