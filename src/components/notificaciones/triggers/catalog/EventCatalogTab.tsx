/**
 * EventCatalogTab - VERSIÓN ULTRA SEGURA
 * Catálogo de eventos completamente reconstruido para evitar errores TypeError
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Zap, Users, ShoppingCart, Calendar, Settings } from 'lucide-react';
import { toast } from 'sonner';
// Función simple para obtener organización (temporal)
const getCurrentOrganizationId = async (): Promise<number | null> => {
  // Por ahora usar organización fija para pruebas
  return 2;
};

interface EventCatalogItem {
  code: string;
  module: string;
  description: string;
  sample_payload: Record<string, any>;
  created_at: string;
  category?: 'system' | 'business' | 'custom';
  is_active?: boolean;
}

// Eventos del sistema base
const SYSTEM_EVENTS: EventCatalogItem[] = [
  {
    code: 'invoice.created',
    module: 'finanzas',
    description: 'Se dispara cuando se crea una nueva factura',
    sample_payload: {
      invoice_id: 123,
      customer_id: 456,
      amount: 1000.50,
      currency: 'COP'
    },
    created_at: new Date().toISOString(),
    category: 'system'
  },
  {
    code: 'invoice.paid',
    module: 'finanzas',
    description: 'Se dispara cuando una factura es marcada como pagada',
    sample_payload: {
      invoice_id: 123,
      payment_method: 'credit_card',
      amount_paid: 1000.50
    },
    created_at: new Date().toISOString(),
    category: 'system'
  },
  {
    code: 'inventory.low_stock',
    module: 'inventario',
    description: 'Se dispara cuando el stock de un producto está bajo',
    sample_payload: {
      product_id: 789,
      current_stock: 5,
      minimum_stock: 10,
      product_name: 'Producto Ejemplo'
    },
    created_at: new Date().toISOString(),
    category: 'system'
  },
  {
    code: 'user.created',
    module: 'sistema',
    description: 'Se dispara cuando se registra un nuevo usuario',
    sample_payload: {
      user_id: 101,
      email: 'usuario@ejemplo.com',
      name: 'Usuario Ejemplo'
    },
    created_at: new Date().toISOString(),
    category: 'system'
  },
  {
    code: 'reservation.created',
    module: 'pms',
    description: 'Se dispara cuando se crea una nueva reserva',
    sample_payload: {
      reservation_id: 202,
      customer_id: 456,
      check_in: '2024-02-01',
      check_out: '2024-02-05'
    },
    created_at: new Date().toISOString(),
    category: 'system'
  }
];

const getModuleIcon = (module: string) => {
  switch (module) {
    case 'Facturación':
      return <ShoppingCart className="h-4 w-4" />;
    case 'Inventario':
      return <Settings className="h-4 w-4" />;
    case 'Usuarios':
      return <Users className="h-4 w-4" />;
    case 'Reservas':
      return <Calendar className="h-4 w-4" />;
    default:
      return <Zap className="h-4 w-4" />;
  }
};

const getModuleColor = (module: string) => {
  switch (module) {
    case 'finanzas':
    case 'Facturación':
      return 'bg-green-100 text-green-800';
    case 'inventario':
    case 'Inventario':
      return 'bg-blue-100 text-blue-800';
    case 'sistema':
    case 'Usuarios':
      return 'bg-purple-100 text-purple-800';
    case 'pms':
    case 'Reservas':
      return 'bg-orange-100 text-orange-800';
    case 'crm':
      return 'bg-cyan-100 text-cyan-800';
    case 'ventas':
      return 'bg-emerald-100 text-emerald-800';
    case 'rrhh':
      return 'bg-pink-100 text-pink-800';
    case 'custom':
      return 'bg-violet-100 text-violet-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const EventCatalogTab: React.FC = () => {
  const [events, setEvents] = useState<EventCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventCatalogItem | null>(null);

  // === CARGAR EVENTOS DE FORMA COMPLETAMENTE SEGURA ===
  const loadEvents = async () => {
    try {
      setLoading(true);
      console.log('[EventCatalogTab] Iniciando carga de eventos...');
      
      // Por ahora solo usar eventos del sistema para evitar errores
      // TODO: Reintegrar eventos personalizados cuando el servicio esté 100% estable
      
      const systemEventsOnly = SYSTEM_EVENTS.map(event => ({
        ...event,
        category: 'system' as const
      }));
      
      console.log('[EventCatalogTab] Cargando eventos del sistema:', systemEventsOnly.length);
      setEvents(systemEventsOnly);
      
      toast.success(`Catálogo cargado: ${systemEventsOnly.length} eventos`);
      
    } catch (error) {
      console.error('[EventCatalogTab] Error al cargar eventos:', error);
      toast.error('Error al cargar el catálogo de eventos');
      
      // Fallback ultra seguro
      setEvents(SYSTEM_EVENTS);
    } finally {
      setLoading(false);
      console.log('[EventCatalogTab] Carga de eventos completada');
    }
  };

  // === CARGAR EVENTOS PERSONALIZADOS DE FORMA SEGURA (SEPARADA) ===
  const loadCustomEvents = async () => {
    try {
      console.log('[EventCatalogTab] Intentando cargar eventos personalizados...');
      
      // Importar dinámicamente para evitar errores
      const { getCustomEvents } = await import('@/lib/services/customEventsService');
      
      const organizationId = await getCurrentOrganizationId();
      if (!organizationId) {
        console.warn('[EventCatalogTab] No hay organización, omitiendo eventos personalizados');
        return;
      }
      
      const customResult = await getCustomEvents(organizationId, { is_active: true });
      
      if (customResult?.data && Array.isArray(customResult.data)) {
        const customEventsFormatted = customResult.data.map(event => ({
          code: event.code,
          module: event.module,
          description: event.description || `Evento personalizado: ${event.name}`,
          sample_payload: event.sample_payload || {},
          created_at: event.created_at,
          category: event.category,
          is_active: event.is_active
        }));
        
        // Agregar eventos personalizados a los existentes
        setEvents(prevEvents => {
          const systemEvents = prevEvents.filter(e => e.category === 'system');
          return [...systemEvents, ...customEventsFormatted];
        });
        
        toast.success(`${customEventsFormatted.length} eventos personalizados agregados`);
        console.log('[EventCatalogTab] Eventos personalizados cargados exitosamente');
      }
      
    } catch (error) {
      console.error('[EventCatalogTab] Error al cargar eventos personalizados:', error);
      toast.error('No se pudieron cargar eventos personalizados');
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  // Agrupar eventos por módulo
  const eventsByModule = events.reduce((acc, event) => {
    if (!acc[event.module]) {
      acc[event.module] = [];
    }
    acc[event.module].push(event);
    return acc;
  }, {} as Record<string, EventCatalogItem[]>);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de Eventos</CardTitle>
          <CardDescription>Cargando eventos disponibles...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Catálogo de Eventos
              </CardTitle>
              <CardDescription>
                {events.length} eventos disponibles para configurar triggers
                {events.filter(e => e.category === 'custom').length > 0 && (
                  <span className="text-violet-600"> • {events.filter(e => e.category === 'custom').length} personalizados</span>
                )}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={loadEvents} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(eventsByModule).map(([module, moduleEvents]) => (
              <Card key={module}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {getModuleIcon(module)}
                    {module}
                    <Badge variant="secondary" className="ml-auto">
                      {moduleEvents.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {moduleEvents.map((event) => (
                    <div
                      key={event.code}
                      className="p-3 rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                            {event.code}
                          </code>
                          <p className="text-sm text-muted-foreground mt-1">
                            {event.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal de detalles del evento */}
      {selectedEvent && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <code className="text-lg font-mono">{selectedEvent.code}</code>
                <Badge className={getModuleColor(selectedEvent.module)}>
                  {selectedEvent.module}
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                ✕
              </Button>
            </div>
            <CardDescription>{selectedEvent.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Ejemplo de Payload:</h4>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(selectedEvent.sample_payload, null, 2)}
                </pre>
              </div>
              <div className="text-xs text-muted-foreground">
                Evento disponible desde: {new Date(selectedEvent.created_at).toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
