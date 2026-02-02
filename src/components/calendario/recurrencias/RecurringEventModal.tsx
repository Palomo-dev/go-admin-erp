'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  Clock,
  Repeat,
  MapPin,
  User,
  Building2,
  AlertCircle,
  XCircle,
  Edit3,
  Trash2,
  Plus,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/Utils';
import { RecurringEvent, CalendarException } from './useRecurringEvents';

interface RecurringEventModalProps {
  event: RecurringEvent | null;
  exceptions: CalendarException[];
  isOpen: boolean;
  mode: 'view' | 'edit' | 'exceptions';
  onClose: () => void;
  onSave: (updates: Partial<RecurringEvent>) => Promise<void>;
  onCreateException: (exception: Omit<CalendarException, 'id' | 'created_at'>) => Promise<void>;
  onUpdateException: (id: string, updates: Partial<CalendarException>) => Promise<void>;
  onDeleteException: (id: string) => Promise<void>;
}

const STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'tentative', label: 'Tentativo' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'pending', label: 'Pendiente' },
];

function parseRecurrenceRule(rrule: string): string {
  if (!rrule) return 'Sin recurrencia';

  const parts = rrule.split(';').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const freq = parts['FREQ'];
  const interval = parseInt(parts['INTERVAL'] || '1');
  const byDay = parts['BYDAY'];

  let text = '';

  switch (freq) {
    case 'DAILY':
      text = interval === 1 ? 'Diario' : `Cada ${interval} días`;
      break;
    case 'WEEKLY':
      text = interval === 1 ? 'Semanal' : `Cada ${interval} semanas`;
      if (byDay) {
        const days: Record<string, string> = {
          MO: 'Lun', TU: 'Mar', WE: 'Mié', TH: 'Jue', FR: 'Vie', SA: 'Sáb', SU: 'Dom'
        };
        const selectedDays = byDay.split(',').map(d => days[d] || d).join(', ');
        text += ` (${selectedDays})`;
      }
      break;
    case 'MONTHLY':
      text = interval === 1 ? 'Mensual' : `Cada ${interval} meses`;
      break;
    case 'YEARLY':
      text = interval === 1 ? 'Anual' : `Cada ${interval} años`;
      break;
    default:
      text = 'Recurrente';
  }

  if (parts['COUNT']) {
    text += ` (${parts['COUNT']} ocurrencias)`;
  } else if (parts['UNTIL']) {
    const untilDate = parts['UNTIL'].substring(0, 8);
    const year = untilDate.substring(0, 4);
    const month = untilDate.substring(4, 6);
    const day = untilDate.substring(6, 8);
    text += ` hasta ${day}/${month}/${year}`;
  }

  return text;
}

export function RecurringEventModal({
  event,
  exceptions,
  isOpen,
  mode,
  onClose,
  onSave,
  onCreateException,
  onUpdateException,
  onDeleteException,
}: RecurringEventModalProps) {
  const [activeTab, setActiveTab] = useState<string>(mode === 'exceptions' ? 'exceptions' : 'details');
  const [isEditing, setIsEditing] = useState(mode === 'edit');
  const [isSaving, setIsSaving] = useState(false);

  // Estado del formulario de edición
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    status: 'confirmed',
  });

  // Estado para nueva excepción
  const [showNewException, setShowNewException] = useState(false);
  const [newException, setNewException] = useState({
    original_date: '',
    exception_type: 'cancelled' as 'cancelled' | 'modified',
    new_start_at: '',
    new_end_at: '',
    new_title: '',
  });

  // Estado para eliminar excepción
  const [exceptionToDelete, setExceptionToDelete] = useState<CalendarException | null>(null);

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        description: event.description || '',
        location: event.location || '',
        status: event.status || 'confirmed',
      });
    }
    setActiveTab(mode === 'exceptions' ? 'exceptions' : 'details');
    setIsEditing(mode === 'edit');
  }, [event, mode]);

  const handleSave = async () => {
    if (!event) return;

    setIsSaving(true);
    try {
      await onSave({
        title: formData.title,
        description: formData.description || null,
        location: formData.location || null,
        status: formData.status,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateException = async () => {
    if (!event || !newException.original_date) return;

    setIsSaving(true);
    try {
      await onCreateException({
        calendar_event_id: event.id,
        original_date: newException.original_date,
        exception_type: newException.exception_type,
        new_start_at: newException.exception_type === 'modified' && newException.new_start_at
          ? new Date(newException.new_start_at).toISOString()
          : null,
        new_end_at: newException.exception_type === 'modified' && newException.new_end_at
          ? new Date(newException.new_end_at).toISOString()
          : null,
        new_title: newException.exception_type === 'modified' && newException.new_title
          ? newException.new_title
          : null,
        new_description: null,
      });
      setShowNewException(false);
      setNewException({
        original_date: '',
        exception_type: 'cancelled',
        new_start_at: '',
        new_end_at: '',
        new_title: '',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteException = async () => {
    if (!exceptionToDelete) return;

    try {
      await onDeleteException(exceptionToDelete.id);
      setExceptionToDelete(null);
    } catch (error) {
      console.error('Error deleting exception:', error);
    }
  };

  if (!event) return null;

  const startDate = parseISO(event.start_at);
  const endDate = parseISO(event.end_at);
  const eventColor = event.color || '#3B82F6';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: eventColor }}
              />
              <DialogTitle className="text-xl">
                {isEditing ? 'Editar evento recurrente' : event.title}
              </DialogTitle>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details" className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Detalles
              </TabsTrigger>
              <TabsTrigger value="exceptions" className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Excepciones ({exceptions.length})
              </TabsTrigger>
            </TabsList>

            {/* Tab: Detalles */}
            <TabsContent value="details" className="space-y-4 mt-4">
              {isEditing ? (
                // Formulario de edición
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Título *</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Nombre del evento"
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Descripción</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descripción opcional"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="location">Ubicación</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="Lugar del evento"
                    />
                  </div>

                  <div>
                    <Label htmlFor="status">Estado</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                // Vista de solo lectura
                <div className="space-y-4">
                  {/* Información básica */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarIcon className="h-4 w-4 text-blue-500" />
                      <span className="text-gray-500 dark:text-gray-400">Fecha inicio:</span>
                      <span className="font-medium">
                        {format(startDate, "d 'de' MMMM yyyy", { locale: es })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-blue-500" />
                      <span className="text-gray-500 dark:text-gray-400">Hora:</span>
                      <span className="font-medium">
                        {event.all_day
                          ? 'Todo el día'
                          : `${format(startDate, 'HH:mm')} - ${format(endDate, 'HH:mm')}`}
                      </span>
                    </div>
                  </div>

                  {/* Recurrencia */}
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <Repeat className="h-4 w-4 text-purple-600" />
                      <span className="font-medium text-purple-700 dark:text-purple-300">
                        {parseRecurrenceRule(event.recurrence_rule)}
                      </span>
                    </div>
                    {event.recurrence_end_date && (
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 ml-6">
                        Finaliza: {format(parseISO(event.recurrence_end_date), "d 'de' MMMM yyyy", { locale: es })}
                      </p>
                    )}
                  </div>

                  {/* Descripción */}
                  {event.description && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Descripción
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {event.description}
                      </p>
                    </div>
                  )}

                  {/* Detalles adicionales */}
                  <div className="grid grid-cols-2 gap-3">
                    {event.location && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <MapPin className="h-4 w-4" />
                        {event.location}
                      </div>
                    )}

                    {event.assigned_user && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <User className="h-4 w-4" />
                        {event.assigned_user.first_name} {event.assigned_user.last_name}
                      </div>
                    )}

                    {event.branch && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Building2 className="h-4 w-4" />
                        {event.branch.name}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Tab: Excepciones */}
            <TabsContent value="exceptions" className="space-y-4 mt-4">
              {/* Botón para nueva excepción */}
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Las excepciones permiten cancelar o modificar ocurrencias específicas.
                </p>
                <Button
                  size="sm"
                  onClick={() => setShowNewException(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Nueva excepción
                </Button>
              </div>

              {/* Formulario de nueva excepción */}
              {showNewException && (
                <div className="p-4 border rounded-lg dark:border-gray-700 space-y-3 bg-gray-50 dark:bg-gray-800/50">
                  <h4 className="font-medium text-sm">Nueva excepción</h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="exception_date">Fecha de la ocurrencia *</Label>
                      <Input
                        id="exception_date"
                        type="date"
                        value={newException.original_date}
                        onChange={(e) => setNewException({ ...newException, original_date: e.target.value })}
                      />
                    </div>

                    <div>
                      <Label htmlFor="exception_type">Tipo de excepción</Label>
                      <Select
                        value={newException.exception_type}
                        onValueChange={(value: 'cancelled' | 'modified') =>
                          setNewException({ ...newException, exception_type: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cancelled">Cancelar ocurrencia</SelectItem>
                          <SelectItem value="modified">Modificar ocurrencia</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {newException.exception_type === 'modified' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="new_start">Nueva hora inicio</Label>
                        <Input
                          id="new_start"
                          type="datetime-local"
                          value={newException.new_start_at}
                          onChange={(e) => setNewException({ ...newException, new_start_at: e.target.value })}
                        />
                      </div>

                      <div>
                        <Label htmlFor="new_end">Nueva hora fin</Label>
                        <Input
                          id="new_end"
                          type="datetime-local"
                          value={newException.new_end_at}
                          onChange={(e) => setNewException({ ...newException, new_end_at: e.target.value })}
                        />
                      </div>

                      <div className="col-span-2">
                        <Label htmlFor="new_title">Nuevo título (opcional)</Label>
                        <Input
                          id="new_title"
                          value={newException.new_title}
                          onChange={(e) => setNewException({ ...newException, new_title: e.target.value })}
                          placeholder="Dejar vacío para mantener el original"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewException(false)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCreateException}
                      disabled={!newException.original_date || isSaving}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Guardar
                    </Button>
                  </div>
                </div>
              )}

              {/* Lista de excepciones */}
              {exceptions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                  <p>No hay excepciones para este evento</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {exceptions.map((exception) => (
                    <div
                      key={exception.id}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-lg border',
                        exception.exception_type === 'cancelled'
                          ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                          : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {exception.exception_type === 'cancelled' ? (
                          <XCircle className="h-5 w-5 text-red-500" />
                        ) : (
                          <Edit3 className="h-5 w-5 text-blue-500" />
                        )}
                        <div>
                          <p className="font-medium text-sm">
                            {format(parseISO(exception.original_date), "EEEE d 'de' MMMM yyyy", { locale: es })}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {exception.exception_type === 'cancelled'
                              ? 'Ocurrencia cancelada'
                              : exception.new_title || 'Ocurrencia modificada'}
                          </p>
                          {exception.exception_type === 'modified' && exception.new_start_at && (
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                              Nuevo horario: {format(parseISO(exception.new_start_at), 'HH:mm')}
                              {exception.new_end_at && ` - ${format(parseISO(exception.new_end_at), 'HH:mm')}`}
                            </p>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExceptionToDelete(exception)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            {activeTab === 'details' && (
              <>
                {isEditing ? (
                  <>
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={!formData.title || isSaving}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isSaving ? 'Guardando...' : 'Guardar cambios'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={onClose}>
                      Cerrar
                    </Button>
                    <Button
                      onClick={() => setIsEditing(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Edit3 className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                  </>
                )}
              </>
            )}
            {activeTab === 'exceptions' && (
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para confirmar eliminación de excepción */}
      <AlertDialog open={!!exceptionToDelete} onOpenChange={() => setExceptionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta excepción?</AlertDialogTitle>
            <AlertDialogDescription>
              La ocurrencia del{' '}
              {exceptionToDelete && format(parseISO(exceptionToDelete.original_date), "d 'de' MMMM yyyy", { locale: es })}{' '}
              volverá a seguir la regla de recurrencia normal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteException}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
