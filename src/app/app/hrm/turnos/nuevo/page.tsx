'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import ShiftsService from '@/lib/services/shiftsService';
import { ShiftCreateForm } from '@/components/hrm/turnos/nuevo';
import type {
  ShiftCreateFormData,
  ShiftTemplateOption,
  EmployeeOption,
  BranchOption,
} from '@/components/hrm/turnos/nuevo';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, CalendarPlus } from 'lucide-react';
import Link from 'next/link';
import { format, eachDayOfInterval } from 'date-fns';

export default function NuevoTurnoPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [templates, setTemplates] = useState<ShiftTemplateOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new ShiftsService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [templateData, empData, branchData] = await Promise.all([
        service.getTemplates(),
        service.getEmployees(),
        service.getBranches(),
      ]);

      setTemplates(
        templateData.map((t) => ({
          id: t.id,
          name: t.name,
          code: t.code,
          start_time: t.start_time,
          end_time: t.end_time,
          color: t.color,
        }))
      );
      setEmployees(empData);
      setBranches(branchData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Check conflict
  const handleCheckConflict = async (employmentId: string, workDate: string) => {
    const service = getService();
    if (!service) return { hasConflict: false };
    return service.checkConflicts(employmentId, workDate);
  };

  // Submit
  const handleSubmit = async (data: ShiftCreateFormData) => {
    const service = getService();
    if (!service) return;

    // Determinar las fechas a crear
    let datesToCreate: string[] = [data.work_date];
    
    if (data.work_date_end && data.work_date_end > data.work_date) {
      // Modo rango: crear turnos para cada día del intervalo
      const days = eachDayOfInterval({
        start: new Date(data.work_date),
        end: new Date(data.work_date_end),
      });
      datesToCreate = days.map(day => format(day, 'yyyy-MM-dd'));
    }

    // Crear todos los turnos
    const createdCount = await Promise.all(
      datesToCreate.map(async (workDate) => {
        try {
          await service.create({
            employment_id: data.employment_id,
            shift_template_id: data.shift_template_id,
            branch_id: data.branch_id || undefined,
            work_date: workDate,
            notes: data.notes || undefined,
          });
          return true;
        } catch (error) {
          console.warn(`Error creating shift for ${workDate}:`, error);
          return false;
        }
      })
    );

    const successCount = createdCount.filter(Boolean).length;

    toast({
      title: successCount > 1 ? 'Turnos creados' : 'Turno creado',
      description: successCount > 1 
        ? `Se han asignado ${successCount} turnos correctamente`
        : 'El turno se ha asignado correctamente',
    });
  };

  // Cancelar
  const handleCancel = () => {
    router.push('/app/hrm/turnos');
  };

  if (orgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/app/hrm/turnos">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarPlus className="h-6 w-6 text-blue-600" />
                Nuevo Turno
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Asigna un turno a un empleado
              </p>
            </div>
          </div>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/app/hrm" className="hover:text-blue-600 dark:hover:text-blue-400">
              HRM
            </Link>
            <span>/</span>
            <Link href="/app/hrm/turnos" className="hover:text-blue-600 dark:hover:text-blue-400">
              Turnos
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white">Nuevo</span>
          </nav>
        </div>

        {/* Formulario */}
        <ShiftCreateForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          templates={templates}
          employees={employees}
          branches={branches}
          checkConflict={handleCheckConflict}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
