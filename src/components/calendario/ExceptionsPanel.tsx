'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  XCircle,
  Edit3,
  Trash2,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Save,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { supabase } from '@/lib/supabase/config';
import { cn } from '@/utils/Utils';

export interface CalendarException {
  id: string;
  calendar_event_id: string;
  original_date: string;
  exception_type: 'cancelled' | 'modified';
  new_start_at?: string | null;
  new_end_at?: string | null;
  new_title?: string | null;
  new_description?: string | null;
  created_at: string;
}

interface ExceptionsPanelProps {
  eventId: string;
  eventTitle: string;
  exceptions: CalendarException[];
  isOpen: boolean;
  onClose: () => void;
  onExceptionsChange: (exceptions: CalendarException[]) => void;
}

interface ExceptionFormData {
  original_date: string;
  exception_type: 'cancelled' | 'modified';
  new_start_at: string;
  new_end_at: string;
  new_title: string;
  new_description: string;
}

const EXCEPTION_TYPE_COLORS = {
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  modified: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const EXCEPTION_TYPE_LABELS = {
  cancelled: 'Cancelada',
  modified: 'Modificada',
};

export function ExceptionsPanel({
  eventId,
  eventTitle,
  exceptions,
  isOpen,
  onClose,
  onExceptionsChange,
}: ExceptionsPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingException, setEditingException] = useState<CalendarException | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exceptionToDelete, setExceptionToDelete] = useState<CalendarException | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<ExceptionFormData>({
    original_date: format(new Date(), 'yyyy-MM-dd'),
    exception_type: 'cancelled',
    new_start_at: '',
    new_end_at: '',
    new_title: '',
    new_description: '',
  });

  const resetForm = () => {
    setFormData({
      original_date: format(new Date(), 'yyyy-MM-dd'),
      exception_type: 'cancelled',
      new_start_at: '',
      new_end_at: '',
      new_title: '',
      new_description: '',
    });
    setEditingException(null);
    setIsEditing(false);
  };

  const handleNew = () => {
    resetForm();
    setIsEditing(true);
  };

  const handleEdit = (exception: CalendarException) => {
    setEditingException(exception);
    setFormData({
      original_date: exception.original_date,
      exception_type: exception.exception_type,
      new_start_at: exception.new_start_at ? format(new Date(exception.new_start_at), "yyyy-MM-dd'T'HH:mm") : '',
      new_end_at: exception.new_end_at ? format(new Date(exception.new_end_at), "yyyy-MM-dd'T'HH:mm") : '',
      new_title: exception.new_title || '',
      new_description: exception.new_description || '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!formData.original_date) return;

    setIsSaving(true);
    try {
      const exceptionData = {
        calendar_event_id: eventId,
        original_date: formData.original_date,
        exception_type: formData.exception_type,
        new_start_at: formData.exception_type === 'modified' && formData.new_start_at
          ? new Date(formData.new_start_at).toISOString()
          : null,
        new_end_at: formData.exception_type === 'modified' && formData.new_end_at
          ? new Date(formData.new_end_at).toISOString()
          : null,
        new_title: formData.exception_type === 'modified' && formData.new_title
          ? formData.new_title
          : null,
        new_description: formData.exception_type === 'modified' && formData.new_description
          ? formData.new_description
          : null,
      };

      if (editingException) {
        // Actualizar
        const { error } = await supabase
          .from('calendar_exceptions')
          .update(exceptionData)
          .eq('id', editingException.id);

        if (!error) {
          const updated = exceptions.map((e) =>
            e.id === editingException.id ? { ...e, ...exceptionData } : e
          );
          onExceptionsChange(updated);
        }
      } else {
        // Crear nuevo
        const { data, error } = await supabase
          .from('calendar_exceptions')
          .insert(exceptionData)
          .select()
          .single();

        if (!error && data) {
          onExceptionsChange([...exceptions, data]);
        }
      }

      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!exceptionToDelete) return;

    const { error } = await supabase
      .from('calendar_exceptions')
      .delete()
      .eq('id', exceptionToDelete.id);

    if (!error) {
      onExceptionsChange(exceptions.filter((e) => e.id !== exceptionToDelete.id));
    }

    setExceptionToDelete(null);
    setDeleteDialogOpen(false);
  };

  const confirmDelete = (exception: CalendarException) => {
    setExceptionToDelete(exception);
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-orange-600" />
              Excepciones de "{eventTitle}"
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Formulario de edición/creación */}
            {isEditing ? (
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {editingException ? 'Editar Excepción' : 'Nueva Excepción'}
                  </h4>
                  <Button variant="ghost" size="sm" onClick={resetForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="original_date">Fecha Original</Label>
                    <Input
                      id="original_date"
                      type="date"
                      value={formData.original_date}
                      onChange={(e) => setFormData({ ...formData, original_date: e.target.value })}
                      className="dark:bg-gray-800 dark:border-gray-700"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="exception_type">Tipo</Label>
                    <Select
                      value={formData.exception_type}
                      onValueChange={(v) => setFormData({ ...formData, exception_type: v as 'cancelled' | 'modified' })}
                    >
                      <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cancelled">Cancelada</SelectItem>
                        <SelectItem value="modified">Modificada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {formData.exception_type === 'modified' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="new_start_at">Nueva Hora Inicio</Label>
                        <Input
                          id="new_start_at"
                          type="datetime-local"
                          value={formData.new_start_at}
                          onChange={(e) => setFormData({ ...formData, new_start_at: e.target.value })}
                          className="dark:bg-gray-800 dark:border-gray-700"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="new_end_at">Nueva Hora Fin</Label>
                        <Input
                          id="new_end_at"
                          type="datetime-local"
                          value={formData.new_end_at}
                          onChange={(e) => setFormData({ ...formData, new_end_at: e.target.value })}
                          className="dark:bg-gray-800 dark:border-gray-700"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="new_title">Nuevo Título (opcional)</Label>
                      <Input
                        id="new_title"
                        value={formData.new_title}
                        onChange={(e) => setFormData({ ...formData, new_title: e.target.value })}
                        placeholder="Dejar vacío para mantener el original"
                        className="dark:bg-gray-800 dark:border-gray-700"
                      />
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={resetForm}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={!formData.original_date || isSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={handleNew} className="w-full" variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Nueva Excepción
              </Button>
            )}

            {/* Lista de excepciones */}
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                Excepciones ({exceptions.length})
              </h4>

              {exceptions.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No hay excepciones registradas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {exceptions
                    .sort((a, b) => a.original_date.localeCompare(b.original_date))
                    .map((exception) => (
                      <div
                        key={exception.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border',
                          'dark:border-gray-700 bg-white dark:bg-gray-800'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {exception.exception_type === 'cancelled' ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                          ) : (
                            <Edit3 className="h-5 w-5 text-blue-500" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {format(parseISO(exception.original_date), "d 'de' MMMM yyyy", { locale: es })}
                              </span>
                              <Badge className={EXCEPTION_TYPE_COLORS[exception.exception_type]}>
                                {EXCEPTION_TYPE_LABELS[exception.exception_type]}
                              </Badge>
                            </div>
                            {exception.exception_type === 'modified' && exception.new_start_at && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Nuevo horario: {format(new Date(exception.new_start_at), 'HH:mm')}
                                {exception.new_end_at && ` - ${format(new Date(exception.new_end_at), 'HH:mm')}`}
                                {exception.new_title && ` • "${exception.new_title}"`}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(exception)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => confirmDelete(exception)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar excepción?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la excepción del{' '}
              {exceptionToDelete && format(parseISO(exceptionToDelete.original_date), "d 'de' MMMM yyyy", { locale: es })}.
              La ocurrencia volverá a su estado normal.
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
