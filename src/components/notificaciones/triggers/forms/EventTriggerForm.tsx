/**
 * Formulario para crear/editar triggers de eventos
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Save, X, TestTube } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

// Componentes específicos
import { EventCatalogSelector } from './EventCatalogSelector';
import { TemplateSelector } from './TemplateSelector';
import { ChannelConfigForm } from './ChannelConfigForm';

// Services
import * as eventTriggerService from '@/lib/services/eventTriggerService';

// Types
import type { EventTrigger, CreateEventTriggerData, NotificationChannel } from '@/types/eventTrigger';

// Schema de validación
const eventTriggerSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100, 'Máximo 100 caracteres'),
  event_code: z.string().min(1, 'Evento requerido'),
  template_id: z.string().optional(),
  channels: z.array(z.string()).min(1, 'Al menos un canal requerido'),
  priority: z.number().min(1, 'Mínimo 1').max(10, 'Máximo 10'),
  silent_window_minutes: z.number().min(0, 'No puede ser negativo').max(1440, 'Máximo 24 horas'),
  active: z.boolean(),
  webhook_url: z.string().url('URL inválida').optional().or(z.literal('')),
  conditions: z.record(z.any()).optional()
});

type FormData = z.infer<typeof eventTriggerSchema>;

export interface EventTriggerFormProps {
  trigger?: EventTrigger | null;
  onSubmit: () => void;
  onCancel: () => void;
}

export function EventTriggerForm({ trigger, onSubmit, onCancel }: EventTriggerFormProps) {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(eventTriggerSchema),
    defaultValues: {
      name: trigger?.name || '',
      event_code: trigger?.event_code || '',
      template_id: trigger?.template_id || '',
      channels: trigger?.channels || [],
      priority: trigger?.priority || 1,
      silent_window_minutes: trigger?.silent_window_minutes || 0,
      active: trigger?.active !== false, // Default true
      webhook_url: trigger?.webhook_url || '',
      conditions: trigger?.conditions || {}
    }
  });

  // Watch channels para mostrar URL webhook condicionalmente
  const selectedChannels = form.watch('channels');
  const showWebhookUrl = selectedChannels?.includes('webhook');

  // Manejar envío del formulario
  const handleSubmit = async (data: FormData) => {
    try {
      setLoading(true);
      
      console.log('💾 Guardando trigger:', data);
      
      const triggerData: CreateEventTriggerData = {
        name: data.name,
        event_code: data.event_code,
        template_id: data.template_id || undefined,
        channels: data.channels as NotificationChannel[],
        priority: data.priority,
        silent_window_minutes: data.silent_window_minutes,
        active: data.active,
        webhook_url: showWebhookUrl ? data.webhook_url || undefined : undefined,
        conditions: data.conditions || {}
      };

      if (trigger) {
        // Actualizar
        await eventTriggerService.updateTrigger(trigger.id, triggerData);
        toast.success('Trigger actualizado exitosamente');
      } else {
        // Crear
        await eventTriggerService.createTrigger(triggerData);
        toast.success('Trigger creado exitosamente');
      }

      onSubmit();
    } catch (error: any) {
      console.error('❌ Error al guardar trigger:', error);
      toast.error(error.message || 'Error al guardar trigger');
    } finally {
      setLoading(false);
    }
  };

  // Probar configuración
  const handleTest = async () => {
    try {
      setTesting(true);
      
      if (!trigger) {
        toast.error('Guarda el trigger primero para probarlo');
        return;
      }

      const sampleData = {
        test: true,
        timestamp: new Date().toISOString(),
        trigger_name: trigger.name,
        event_code: trigger.event_code
      };

      const result = await eventTriggerService.testTrigger(trigger.id, sampleData);
      
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      console.error('❌ Error al probar trigger:', error);
      toast.error(error.message || 'Error al probar trigger');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Header con acciones */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {trigger ? 'Editar Trigger' : 'Nuevo Trigger'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Configura cuándo y cómo se ejecutarán las acciones automáticas
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {trigger && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={testing || loading}
              >
                <TestTube className="h-4 w-4 mr-2" />
                {testing ? 'Probando...' : 'Probar'}
              </Button>
            )}
            
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            
            <Button type="submit" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuración básica */}
          <Card>
            <CardHeader>
              <CardTitle>Configuración Básica</CardTitle>
              <CardDescription>
                Define el nombre y evento que activará este trigger
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Nombre */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Trigger</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ej: Enviar email cuando se crea factura" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Nombre descriptivo para identificar este trigger
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Selector de evento */}
              <FormField
                control={form.control}
                name="event_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Evento Disparador</FormLabel>
                    <FormControl>
                      <EventCatalogSelector {...field} />
                    </FormControl>
                    <FormDescription>
                      Evento del sistema que activará este trigger
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Estado activo */}
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Trigger Activo</FormLabel>
                      <FormDescription>
                        El trigger se ejecutará automáticamente cuando se cumpla la condición
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Configuración de canales */}
          <Card>
            <CardHeader>
              <CardTitle>Canales y Plantilla</CardTitle>
              <CardDescription>
                Define cómo y dónde se enviarán las notificaciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Canales */}
              <FormField
                control={form.control}
                name="channels"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Canales de Envío</FormLabel>
                    <FormControl>
                      <ChannelConfigForm {...field} />
                    </FormControl>
                    <FormDescription>
                      Selecciona uno o más canales para enviar las notificaciones
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Plantilla */}
              <FormField
                control={form.control}
                name="template_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plantilla (Opcional)</FormLabel>
                    <FormControl>
                      <TemplateSelector 
                        {...field}
                        channels={selectedChannels as NotificationChannel[]}
                      />
                    </FormControl>
                    <FormDescription>
                      Plantilla para formatear el contenido de la notificación
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* URL Webhook (condicional) */}
              {showWebhookUrl && (
                <FormField
                  control={form.control}
                  name="webhook_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL del Webhook</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="https://api.ejemplo.com/webhook" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        URL donde se enviará el webhook cuando se active el trigger
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          {/* Configuración avanzada */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Configuración Avanzada</CardTitle>
              <CardDescription>
                Opciones adicionales para el comportamiento del trigger
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Prioridad */}
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridad (1-10)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="1" 
                          max="10" 
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormDescription>
                        1 = máxima prioridad, 10 = mínima prioridad
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Ventana silenciosa */}
                <FormField
                  control={form.control}
                  name="silent_window_minutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ventana Silenciosa (minutos)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="0" 
                          max="1440"
                          placeholder="0"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Tiempo mínimo entre ejecuciones del mismo trigger (0 = sin límite)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </Form>
  );
}

export default EventTriggerForm;
