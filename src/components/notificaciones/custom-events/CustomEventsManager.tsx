'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Edit, Trash2, Power, PowerOff, Code, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  getCustomEvents, 
  createCustomEvent, 
  updateCustomEvent, 
  deleteCustomEvent, 
  toggleCustomEventStatus,
  type CustomEvent,
  type CustomEventFilter,
  type CreateCustomEventData
} from '@/lib/services/customEventsService';
import { getCurrentUserId } from '@/lib/hooks/useOrganization';
import { CustomEventForm } from './CustomEventForm';
import { CustomEventCard } from './CustomEventCard';

interface CustomEventsManagerProps {
  organizationId: number;
}

export function CustomEventsManager({ organizationId }: CustomEventsManagerProps) {
  const [events, setEvents] = useState<CustomEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CustomEvent | null>(null);
  const [filter, setFilter] = useState<CustomEventFilter>({});
  const [search, setSearch] = useState('');

  // ========================================
  // EFECTOS
  // ========================================

  useEffect(() => {
    loadEvents();
  }, [organizationId, filter]);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      setFilter(prev => ({ ...prev, search: search || undefined }));
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [search]);

  // ========================================
  // FUNCIONES DE CARGA
  // ========================================

  const loadEvents = async () => {
    try {
      setLoading(true);
      console.log('[CustomEventsManager] 🚀 Cargando eventos...');
      
      // DESTRUCTURING ULTRA SEGURO - evita error TypeError
      const result = await getCustomEvents(organizationId, filter);
      console.log('[CustomEventsManager] 📊 Resultado obtenido:', result);
      
      if (result && typeof result === 'object' && result.data) {
        setEvents(result.data);
        console.log('[CustomEventsManager] ✅ Eventos cargados:', result.data.length);
      } else {
        console.warn('[CustomEventsManager] ⚠️ Resultado no válido, usando array vacío');
        setEvents([]);
      }
    } catch (error) {
      console.error('Error al cargar eventos:', error);
      toast.error('Error al cargar eventos personalizados');
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // HANDLERS DEL FORMULARIO
  // ========================================

  const handleCreateEvent = async (eventData: CreateCustomEventData) => {
    try {
      await createCustomEvent(organizationId, eventData);
      toast.success('Evento personalizado creado exitosamente');
      setIsFormOpen(false);
      loadEvents();
    } catch (error: any) {
      console.error('Error al crear evento:', error);
      toast.error(error.message || 'Error al crear evento');
    }
  };

  const handleUpdateEvent = async (eventData: CreateCustomEventData) => {
    if (!editingEvent) return;

    try {
      await updateCustomEvent(editingEvent.id, eventData);
      toast.success('Evento actualizado exitosamente');
      setIsFormOpen(false);
      setEditingEvent(null);
      loadEvents();
    } catch (error: any) {
      console.error('Error al actualizar evento:', error);
      toast.error(error.message || 'Error al actualizar evento');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este evento? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      await deleteCustomEvent(eventId);
      toast.success('Evento eliminado exitosamente');
      loadEvents();
    } catch (error: any) {
      console.error('Error al eliminar evento:', error);
      toast.error(error.message || 'Error al eliminar evento');
    }
  };

  const handleToggleStatus = async (eventId: string, isActive: boolean) => {
    try {
      await toggleCustomEventStatus(eventId, isActive);
      toast.success(`Evento ${isActive ? 'activado' : 'desactivado'} exitosamente`);
      loadEvents();
    } catch (error: any) {
      console.error('Error al cambiar estado:', error);
      toast.error('Error al cambiar estado del evento');
    }
  };

  // ========================================
  // HANDLERS DE UI
  // ========================================

  const handleEditEvent = (event: CustomEvent) => {
    setEditingEvent(event);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingEvent(null);
  };

  const handleFilterChange = (key: keyof CustomEventFilter, value: string | boolean | undefined) => {
    setFilter(prev => ({ ...prev, [key]: value }));
  };

  // ========================================
  // CONTADORES Y ESTADÍSTICAS
  // ========================================

  const activeEvents = events.filter(e => e.is_active).length;
  const inactiveEvents = events.filter(e => !e.is_active).length;
  const moduleGroups = events.reduce((acc, event) => {
    acc[event.module] = (acc[event.module] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Eventos Personalizados
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestiona eventos personalizados para tu organización
          </p>
        </div>
        <Button 
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Crear Evento
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-2xl font-bold">{events.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Power className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Activos</p>
                <p className="text-2xl font-bold">{activeEvents}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                <PowerOff className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Inactivos</p>
                <p className="text-2xl font-bold">{inactiveEvents}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Code className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Módulos</p>
                <p className="text-2xl font-bold">{Object.keys(moduleGroups).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Búsqueda */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar eventos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Filtro por módulo */}
            <select
              value={filter.module || ''}
              onChange={(e) => handleFilterChange('module', e.target.value || undefined)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            >
              <option value="">Todos los módulos</option>
              <option value="crm">CRM</option>
              <option value="ventas">Ventas</option>
              <option value="inventario">Inventario</option>
              <option value="finanzas">Finanzas</option>
              <option value="rrhh">RR.HH.</option>
              <option value="pms">PMS</option>
              <option value="custom">Personalizado</option>
            </select>

            {/* Filtro por categoría */}
            <select
              value={filter.category || ''}
              onChange={(e) => handleFilterChange('category', e.target.value || undefined)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            >
              <option value="">Todas las categorías</option>
              <option value="business">Negocio</option>
              <option value="custom">Personalizado</option>
            </select>

            {/* Filtro por estado */}
            <select
              value={filter.is_active === undefined ? '' : filter.is_active ? 'true' : 'false'}
              onChange={(e) => handleFilterChange('is_active', e.target.value === '' ? undefined : e.target.value === 'true')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            >
              <option value="">Todos los estados</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de eventos */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Code className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No hay eventos personalizados
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Crea tu primer evento personalizado para comenzar
            </p>
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Evento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {events.map((event) => (
            <CustomEventCard
              key={event.id}
              event={event}
              onEdit={handleEditEvent}
              onDelete={handleDeleteEvent}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </div>
      )}

      {/* Modal del formulario */}
      {isFormOpen && (
        <CustomEventForm
          isOpen={isFormOpen}
          onClose={handleCloseForm}
          onSubmit={editingEvent ? handleUpdateEvent : handleCreateEvent}
          initialData={editingEvent}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}
