'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import ShiftsService from '@/lib/services/shiftsService';
import type { ShiftAssignment, ShiftTemplate } from '@/lib/services/shiftsService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  Edit3,
  Loader2,
  Calendar as CalendarIcon,
  AlertCircle,
  Clock,
  Building2,
  Save,
} from 'lucide-react';
import Link from 'next/link';

interface BranchOption {
  id: number;
  name: string;
}

export default function EditarTurnoPage() {
  const params = useParams();
  const router = useRouter();
  const shiftId = params.id as string;
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [shift, setShift] = useState<ShiftAssignment | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    shift_template_id: '',
    branch_id: null as number | null,
    work_date: '',
    notes: '',
  });

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new ShiftsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service || !shiftId) return;

    setIsLoading(true);
    try {
      const [shiftData, templateData, branchData] = await Promise.all([
        service.getById(shiftId),
        service.getTemplates(),
        service.getBranches(),
      ]);

      if (!shiftData) {
        setNotFound(true);
        return;
      }

      setShift(shiftData);
      setTemplates(templateData);
      setBranches(branchData);

      // Inicializar form
      setFormData({
        shift_template_id: shiftData.shift_template_id || '',
        branch_id: shiftData.branch_id,
        work_date: shiftData.work_date,
        notes: shiftData.notes || '',
      });
    } catch (error) {
      console.error('Error loading shift:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el turno',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, shiftId, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading && shiftId) {
      loadData();
    }
  }, [organization?.id, orgLoading, shiftId, loadData]);

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!formData.work_date) {
      setSubmitError('La fecha es requerida');
      return;
    }

    const service = getService();
    if (!service) return;

    setIsSubmitting(true);
    try {
      await service.update(shiftId, {
        shift_template_id: formData.shift_template_id || null,
        branch_id: formData.branch_id,
        work_date: formData.work_date,
        notes: formData.notes || null,
      });

      toast({
        title: 'Turno actualizado',
        description: 'Los cambios se guardaron correctamente',
      });

      router.push(`/app/hrm/turnos/${shiftId}`);
    } catch (error: any) {
      setSubmitError(error.message || 'Error al guardar los cambios');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === formData.shift_template_id);

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (notFound || !shift) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="max-w-2xl mx-auto text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Turno no encontrado
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            El turno que intentas editar no existe.
          </p>
          <Link href="/app/hrm/turnos">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a Turnos
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href={`/app/hrm/turnos/${shiftId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit3 className="h-6 w-6 text-blue-600" />
                Editar Turno
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Turno de {shift.employee_name}
              </p>
            </div>
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/app/hrm" className="hover:text-blue-600">HRM</Link>
            <span>/</span>
            <Link href="/app/hrm/turnos" className="hover:text-blue-600">Turnos</Link>
            <span>/</span>
            <Link href={`/app/hrm/turnos/${shiftId}`} className="hover:text-blue-600">
              {format(new Date(shift.work_date), 'd MMM', { locale: es })}
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white">Editar</span>
          </nav>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error */}
          {submitError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* Formulario */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                <Clock className="h-5 w-5 text-blue-600" />
                Datos del Turno
              </CardTitle>
              <CardDescription className="text-gray-500 dark:text-gray-400">
                Empleado: <strong>{shift.employee_name}</strong>
                {shift.employee_code && ` (${shift.employee_code})`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Plantilla */}
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Tipo de Turno</Label>
                <Select
                  value={formData.shift_template_id || 'none'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, shift_template_id: value === 'none' ? '' : value })
                  }
                >
                  <SelectTrigger className="bg-white dark:bg-gray-900">
                    <SelectValue placeholder="Seleccionar turno..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin plantilla</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          {template.color && (
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: template.color }}
                            />
                          )}
                          <span>{template.name}</span>
                          <span className="text-xs text-gray-500">
                            ({template.start_time.substring(0, 5)} - {template.end_time.substring(0, 5)})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview */}
              {selectedTemplate && (
                <div
                  className="p-3 rounded-lg border-l-4"
                  style={{
                    backgroundColor: selectedTemplate.color ? `${selectedTemplate.color}15` : '#3b82f615',
                    borderLeftColor: selectedTemplate.color || '#3b82f6',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {selectedTemplate.name}
                      </p>
                      {selectedTemplate.code && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Código: {selectedTemplate.code}
                        </p>
                      )}
                    </div>
                    <div className="text-right font-mono text-lg text-gray-900 dark:text-white">
                      <div>{selectedTemplate.start_time.substring(0, 5)}</div>
                      <div>{selectedTemplate.end_time.substring(0, 5)}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Fecha */}
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">Fecha</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal bg-white dark:bg-gray-900',
                          !formData.work_date && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.work_date
                          ? format(new Date(formData.work_date), "d 'de' MMMM yyyy", { locale: es })
                          : 'Seleccionar fecha'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={formData.work_date ? new Date(formData.work_date) : undefined}
                        onSelect={(date: Date | undefined) =>
                          setFormData({
                            ...formData,
                            work_date: date ? format(date, 'yyyy-MM-dd') : '',
                          })
                        }
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Sede */}
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">Sede</Label>
                  <Select
                    value={formData.branch_id?.toString() || 'none'}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        branch_id: value === 'none' ? null : parseInt(value),
                      })
                    }
                  >
                    <SelectTrigger className="bg-white dark:bg-gray-900">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
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
              </div>

              {/* Notas */}
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Notas</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Notas adicionales..."
                  rows={3}
                  className="bg-white dark:bg-gray-900"
                />
              </div>
            </CardContent>
          </Card>

          {/* Acciones */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/app/hrm/turnos/${shiftId}`)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-[150px]">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
