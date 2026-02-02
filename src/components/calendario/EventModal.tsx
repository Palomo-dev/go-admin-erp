'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  User, 
  FileText,
  Trash2,
  Edit3,
  ExternalLink,
  Copy,
  Building2,
  Users,
  Tag,
  Save,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/supabase/config';
import { CalendarEvent, SOURCE_TYPE_LABELS, SOURCE_TYPE_COLORS, EventStatus } from './types';
import { RecurrenceSelector, RecurrenceRule, DEFAULT_RECURRENCE, recurrenceToRRule } from './RecurrenceSelector';
import { EventDetailView } from './EventDetailView';
import { CalendarException } from './ExceptionsPanel';
import { cn } from '@/utils/Utils';

type SaveAction = 'save' | 'save-duplicate' | 'save-new';

interface EventModalProps {
  event: CalendarEvent | null;
  isOpen: boolean;
  mode: 'view' | 'create' | 'edit';
  defaultDate?: Date;
  organizationId?: number | null;
  onClose: () => void;
  onSave: (eventData: Partial<CalendarEvent>, action?: SaveAction) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onNavigateToSource?: (event: CalendarEvent) => void;
}

interface Branch {
  id: number;
  name: string;
}

interface Member {
  user_id: string;
  profiles: { first_name: string; last_name: string } | null;
}

interface Customer {
  id: string;
  name: string;
}

const EVENT_TYPES = [
  { value: 'meeting', label: 'Reunión' },
  { value: 'appointment', label: 'Cita' },
  { value: 'reminder', label: 'Recordatorio' },
  { value: 'task', label: 'Tarea' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Otro' },
];

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Público (visible para todos)' },
  { value: 'private', label: 'Privado (solo tú)' },
  { value: 'organization', label: 'Organización' },
];

const COLORS = [
  { value: '#3B82F6', label: 'Azul' },
  { value: '#10B981', label: 'Verde' },
  { value: '#F59E0B', label: 'Amarillo' },
  { value: '#EF4444', label: 'Rojo' },
  { value: '#8B5CF6', label: 'Violeta' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#F97316', label: 'Naranja' },
];

export function EventModal({
  event,
  isOpen,
  mode,
  defaultDate = new Date(),
  organizationId,
  onClose,
  onSave,
  onDelete,
  onNavigateToSource,
}: EventModalProps) {
  const [isEditing, setIsEditing] = useState(mode === 'create' || mode === 'edit');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [assignedUser, setAssignedUser] = useState<{ first_name: string; last_name: string } | null>(null);
  const [customerInfo, setCustomerInfo] = useState<{ name: string } | null>(null);
  const [branchInfo, setBranchInfo] = useState<{ name: string } | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_at: format(defaultDate, "yyyy-MM-dd'T'HH:mm"),
    end_at: format(new Date(defaultDate.getTime() + 3600000), "yyyy-MM-dd'T'HH:mm"),
    all_day: false,
    location: '',
    color: '#3B82F6',
    status: 'confirmed' as EventStatus,
    event_type: 'meeting',
    visibility: 'organization',
    branch_id: null as number | null,
    assigned_to: null as string | null,
    customer_id: null as string | null,
  });

  const [recurrence, setRecurrence] = useState<RecurrenceRule>(DEFAULT_RECURRENCE);

  // Cargar datos de selectores
  useEffect(() => {
    if (!organizationId || !isOpen) return;

    const loadSelectData = async () => {
      const [branchesRes, membersRes, customersRes] = await Promise.all([
        supabase
          .from('branches')
          .select('id, name')
          .eq('organization_id', organizationId)
          .eq('is_active', true),
        supabase
          .from('organization_members')
          .select('user_id, profiles(first_name, last_name)')
          .eq('organization_id', organizationId)
          .eq('is_active', true),
        supabase
          .from('customers')
          .select('id, name')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .limit(100),
      ]);

      if (branchesRes.data) setBranches(branchesRes.data);
      if (membersRes.data) {
        const mappedMembers = membersRes.data.map((m) => ({
          user_id: m.user_id,
          profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
        })) as Member[];
        setMembers(mappedMembers);
      }
      if (customersRes.data) setCustomers(customersRes.data);
    };

    loadSelectData();
  }, [organizationId, isOpen]);

  useEffect(() => {
    if (event && mode !== 'create') {
      setFormData({
        title: event.title || '',
        description: event.description || '',
        start_at: event.start_at ? format(new Date(event.start_at), "yyyy-MM-dd'T'HH:mm") : '',
        end_at: event.end_at ? format(new Date(event.end_at), "yyyy-MM-dd'T'HH:mm") : '',
        all_day: event.all_day || false,
        location: event.location || '',
        color: event.color || '#3B82F6',
        status: event.status || 'confirmed',
        event_type: (event.metadata as Record<string, unknown>)?.event_type as string || 'meeting',
        visibility: (event.metadata as Record<string, unknown>)?.visibility as string || 'organization',
        branch_id: event.branch_id || null,
        assigned_to: event.assigned_to || null,
        customer_id: event.customer_id || null,
      });
      setIsEditing(mode === 'edit');
    } else if (mode === 'create') {
      // Usar start_at y end_at del evento si están disponibles (selección de rango)
      const startDate = event?.start_at ? new Date(event.start_at) : defaultDate;
      const endDate = event?.end_at ? new Date(event.end_at) : new Date(defaultDate.getTime() + 3600000);
      
      setFormData({
        title: event?.title ? `${event.title} (copia)` : '',
        description: event?.description || '',
        start_at: format(startDate, "yyyy-MM-dd'T'HH:mm"),
        end_at: format(endDate, "yyyy-MM-dd'T'HH:mm"),
        all_day: event?.all_day || false,
        location: event?.location || '',
        color: event?.color || '#3B82F6',
        status: 'confirmed',
        event_type: 'meeting',
        visibility: 'organization',
        branch_id: event?.branch_id || null,
        assigned_to: event?.assigned_to || null,
        customer_id: event?.customer_id || null,
      });
      setRecurrence(DEFAULT_RECURRENCE);
      setIsEditing(true);
    }
  }, [event, mode, defaultDate]);

  // Cargar excepciones y relaciones cuando hay un evento
  useEffect(() => {
    if (!event || !isOpen || mode === 'create') return;
    if (event.source_type !== 'calendar_event') return;

    const loadEventDetails = async () => {
      // Cargar excepciones
      const { data: exceptionsData } = await supabase
        .from('calendar_exceptions')
        .select('*')
        .eq('calendar_event_id', event.id || event.source_id)
        .order('original_date', { ascending: true });

      if (exceptionsData) setExceptions(exceptionsData);

      // Cargar usuario asignado
      if (event.assigned_to) {
        const { data: userData } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', event.assigned_to)
          .single();
        if (userData) setAssignedUser(userData);
      }

      // Cargar cliente
      if (event.customer_id) {
        const { data: custData } = await supabase
          .from('customers')
          .select('name')
          .eq('id', event.customer_id)
          .single();
        if (custData) setCustomerInfo(custData);
      }

      // Cargar sucursal
      if (event.branch_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name')
          .eq('id', event.branch_id)
          .single();
        if (branchData) setBranchInfo(branchData);
      }
    };

    loadEventDetails();
  }, [event, isOpen, mode]);

  // Handler para cancelar una ocurrencia específica
  const handleCancelOccurrence = async (date: Date) => {
    if (!event) return;

    const { error } = await supabase.from('calendar_exceptions').insert({
      calendar_event_id: event.id || event.source_id,
      original_date: format(date, 'yyyy-MM-dd'),
      exception_type: 'cancelled',
    });

    if (!error) {
      setExceptions((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          calendar_event_id: event.id || event.source_id,
          original_date: format(date, 'yyyy-MM-dd'),
          exception_type: 'cancelled',
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  // Handler para cancelar todo el evento
  const handleCancelEvent = async () => {
    if (!event) return;
    await onSave({ ...event, status: 'cancelled' }, 'save');
    onClose();
  };

  // Handler para duplicar
  const handleDuplicate = () => {
    if (!event) return;
    setFormData({
      ...formData,
      title: `${event.title} (copia)`,
    });
    setIsEditing(true);
  };

  const handleSave = async (action: SaveAction = 'save') => {
    if (!formData.title.trim()) return;

    setIsSaving(true);
    try {
      const rrule = recurrenceToRRule(recurrence);
      const eventData: Partial<CalendarEvent> = {
        title: formData.title,
        description: formData.description || null,
        start_at: new Date(formData.start_at).toISOString(),
        end_at: formData.end_at ? new Date(formData.end_at).toISOString() : null,
        all_day: formData.all_day,
        location: formData.location || null,
        color: formData.color,
        status: formData.status,
        branch_id: formData.branch_id,
        assigned_to: formData.assigned_to,
        customer_id: formData.customer_id,
        recurrence_rule: rrule || null,
        metadata: {
          event_type: formData.event_type,
          visibility: formData.visibility,
          rrule,
        },
      };

      await onSave(eventData, action);
      
      if (action === 'save-new') {
        // Resetear formulario para nuevo evento
        setFormData({
          ...formData,
          title: '',
          description: '',
        });
        setRecurrence(DEFAULT_RECURRENCE);
      } else {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event || !onDelete) return;
    await onDelete(event.id || event.source_id);
    setDeleteDialogOpen(false);
    onClose();
  };

  const isManualEvent = !event || event.source_type === 'calendar_event';
  const canEdit = isManualEvent;
  const eventColor = event?.color || SOURCE_TYPE_COLORS[event?.source_type || 'calendar_event'] || '#3B82F6';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] lg:max-w-[800px] max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-800">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                {mode === 'create' ? (
                  'Nuevo Evento'
                ) : (
                  <>
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: eventColor }}
                    />
                    {isEditing ? 'Editar Evento' : 'Detalle del Evento'}
                  </>
                )}
              </DialogTitle>
              {event && !isManualEvent && (
                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {SOURCE_TYPE_LABELS[event.source_type]}
                </span>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isEditing ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="title">Título *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Nombre del evento"
                    className="dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descripción opcional"
                    rows={3}
                    className="dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="all_day">Todo el día</Label>
                  <Switch
                    id="all_day"
                    checked={formData.all_day}
                    onCheckedChange={(checked) => setFormData({ ...formData, all_day: checked })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_at">Inicio</Label>
                    <Input
                      id="start_at"
                      type={formData.all_day ? 'date' : 'datetime-local'}
                      value={formData.all_day ? formData.start_at.split('T')[0] : formData.start_at}
                      onChange={(e) => setFormData({ ...formData, start_at: e.target.value })}
                      className="dark:bg-gray-800 dark:border-gray-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_at">Fin</Label>
                    <Input
                      id="end_at"
                      type={formData.all_day ? 'date' : 'datetime-local'}
                      value={formData.all_day ? formData.end_at.split('T')[0] : formData.end_at}
                      onChange={(e) => setFormData({ ...formData, end_at: e.target.value })}
                      className="dark:bg-gray-800 dark:border-gray-700"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Ubicación</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Lugar del evento"
                    className="dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, color: color.value })}
                          className={cn(
                            'w-6 h-6 rounded-full transition-transform hover:scale-110',
                            formData.color === color.value && 'ring-2 ring-offset-2 ring-gray-400'
                          )}
                          style={{ backgroundColor: color.value }}
                          title={color.label}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Estado</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => setFormData({ ...formData, status: v as EventStatus })}
                    >
                      <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="confirmed">Confirmado</SelectItem>
                        <SelectItem value="tentative">Tentativo</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Tipo de evento y visibilidad */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="event_type">Tipo de evento</Label>
                    <Select
                      value={formData.event_type}
                      onValueChange={(v) => setFormData({ ...formData, event_type: v })}
                    >
                      <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visibility">Visibilidad</Label>
                    <Select
                      value={formData.visibility}
                      onValueChange={(v) => setFormData({ ...formData, visibility: v })}
                    >
                      <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VISIBILITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Sucursal */}
                {branches.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="branch_id">Sucursal</Label>
                    <Select
                      value={formData.branch_id?.toString() || 'none'}
                      onValueChange={(v) => setFormData({ ...formData, branch_id: v === 'none' ? null : parseInt(v, 10) })}
                    >
                      <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                        <SelectValue placeholder="Seleccionar sucursal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin sucursal</SelectItem>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id.toString()}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Asignado y Cliente */}
                <div className="grid grid-cols-2 gap-4">
                  {members.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="assigned_to">Asignado a</Label>
                      <Select
                        value={formData.assigned_to || 'none'}
                        onValueChange={(v) => setFormData({ ...formData, assigned_to: v === 'none' ? null : v })}
                      >
                        <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin asignar</SelectItem>
                          {members.map((member) => (
                            <SelectItem key={member.user_id} value={member.user_id}>
                              {member.profiles ? `${member.profiles.first_name} ${member.profiles.last_name}` : member.user_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {customers.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="customer_id">Cliente</Label>
                      <Select
                        value={formData.customer_id || 'none'}
                        onValueChange={(v) => setFormData({ ...formData, customer_id: v === 'none' ? null : v })}
                      >
                        <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin cliente</SelectItem>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Recurrencia */}
                <RecurrenceSelector
                  value={recurrence}
                  onChange={setRecurrence}
                  startDate={formData.start_at ? new Date(formData.start_at) : new Date()}
                />
              </>
            ) : event ? (
              <EventDetailView
                event={event}
                exceptions={exceptions}
                assignedUser={assignedUser}
                customer={customerInfo}
                branch={branchInfo}
                onEdit={() => setIsEditing(true)}
                onDuplicate={handleDuplicate}
                onCancel={handleCancelEvent}
                onDelete={() => setDeleteDialogOpen(true)}
                onCancelOccurrence={handleCancelOccurrence}
                onExceptionsChange={setExceptions}
              />
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t dark:border-gray-800 pt-4">
            <div>
              {event && !isManualEvent && onNavigateToSource && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateToSource(event)}
                  className="text-blue-600"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver en módulo
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose}>
                {isEditing ? 'Cancelar' : 'Cerrar'}
              </Button>
              {isEditing ? (
                <>
                  {mode === 'create' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={!formData.title.trim() || isSaving}
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Más opciones
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleSave('save-duplicate')}>
                          <Copy className="h-4 w-4 mr-2" />
                          Guardar y duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSave('save-new')}>
                          <Plus className="h-4 w-4 mr-2" />
                          Guardar y crear otro
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button
                    onClick={() => handleSave('save')}
                    disabled={!formData.title.trim() || isSaving}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isSaving ? 'Guardando...' : mode === 'create' ? 'Crear' : 'Guardar'}
                  </Button>
                </>
              ) : canEdit ? (
                <Button onClick={() => setIsEditing(true)}>
                  <Edit3 className="h-4 w-4 mr-2" />
                  Editar
                </Button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El evento &quot;{event?.title}&quot; será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
