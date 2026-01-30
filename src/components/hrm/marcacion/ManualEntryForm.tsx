'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Loader2, Hand, AlertCircle, User, Building2 } from 'lucide-react';
import { format } from 'date-fns';

interface EmployeeOption {
  id: string;
  name: string;
  code: string | null;
}

interface BranchOption {
  id: number;
  name: string;
}

interface ManualEntryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: EmployeeOption[];
  branches: BranchOption[];
  onSubmit: (data: {
    employment_id: string;
    event_type: string;
    event_at: string;
    reason: string;
    branch_id?: number;
  }) => Promise<void>;
}

export function ManualEntryForm({
  open,
  onOpenChange,
  employees,
  branches,
  onSubmit,
}: ManualEntryFormProps) {
  const [formData, setFormData] = useState({
    employment_id: '',
    event_type: 'check_in',
    event_date: format(new Date(), 'yyyy-MM-dd'),
    event_time: format(new Date(), 'HH:mm'),
    reason: '',
    branch_id: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.employment_id) {
      setError('Selecciona un empleado');
      return;
    }

    if (!formData.reason.trim()) {
      setError('La razón es requerida para entradas manuales');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        employment_id: formData.employment_id,
        event_type: formData.event_type,
        event_at: `${formData.event_date}T${formData.event_time}:00`,
        reason: formData.reason,
        branch_id: formData.branch_id ? parseInt(formData.branch_id) : undefined,
      });
      onOpenChange(false);
      // Reset form
      setFormData({
        employment_id: '',
        event_type: 'check_in',
        event_date: format(new Date(), 'yyyy-MM-dd'),
        event_time: format(new Date(), 'HH:mm'),
        reason: '',
        branch_id: '',
      });
    } catch (err: any) {
      setError(err.message || 'Error al registrar marcación');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-gray-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <Hand className="h-5 w-5 text-orange-600" />
            Marcación Manual
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Registra una entrada o salida de forma manual
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Empleado */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Empleado <span className="text-red-500">*</span>
            </Label>
            <Select
              value={formData.employment_id || 'none'}
              onValueChange={(value) =>
                setFormData({ ...formData, employment_id: value === 'none' ? '' : value })
              }
            >
              <SelectTrigger className="bg-white dark:bg-gray-900">
                <SelectValue placeholder="Seleccionar empleado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seleccionar empleado...</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      {emp.name} {emp.code && `(${emp.code})`}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de evento */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Tipo</Label>
            <Select
              value={formData.event_type}
              onValueChange={(value) => setFormData({ ...formData, event_type: value })}
            >
              <SelectTrigger className="bg-white dark:bg-gray-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="check_in">Entrada</SelectItem>
                <SelectItem value="check_out">Salida</SelectItem>
                <SelectItem value="break_start">Inicio Descanso</SelectItem>
                <SelectItem value="break_end">Fin Descanso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Fecha y Hora */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Fecha</Label>
              <Input
                type="date"
                value={formData.event_date}
                onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                className="bg-white dark:bg-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Hora</Label>
              <Input
                type="time"
                value={formData.event_time}
                onChange={(e) => setFormData({ ...formData, event_time: e.target.value })}
                className="bg-white dark:bg-gray-900"
              />
            </div>
          </div>

          {/* Sede */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Sede</Label>
            <Select
              value={formData.branch_id || 'none'}
              onValueChange={(value) =>
                setFormData({ ...formData, branch_id: value === 'none' ? '' : value })
              }
            >
              <SelectTrigger className="bg-white dark:bg-gray-900">
                <SelectValue placeholder="Seleccionar sede..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin sede específica</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      {branch.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Razón */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Razón <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Explica la razón de la marcación manual..."
              rows={3}
              className="bg-white dark:bg-gray-900"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Obligatorio para auditoría
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                'Registrar Marcación'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ManualEntryForm;
