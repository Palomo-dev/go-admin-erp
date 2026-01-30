'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import ShiftsService from '@/lib/services/shiftsService';
import type { ShiftAssignmentListItem, ShiftTemplate } from '@/lib/services/shiftsService';
import { ShiftCalendar, ShiftFilters } from '@/components/hrm/turnos';
import type { CalendarView, ShiftFiltersState } from '@/components/hrm/turnos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Plus,
  RefreshCw,
  Calendar,
  Upload,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCcw,
} from 'lucide-react';
import Link from 'next/link';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';

interface BranchOption {
  id: number;
  name: string;
}

interface EmployeeOption {
  id: string;
  name: string;
  code: string | null;
}

export default function TurnosPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados principales
  const [assignments, setAssignments] = useState<ShiftAssignmentListItem[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estados del calendario
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('week');

  // Estados de filtros
  const [filters, setFilters] = useState<ShiftFiltersState>({
    branchId: null,
    templateId: '',
    employmentId: '',
    status: 'all',
  });

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new ShiftsService(organization.id);
  }, [organization?.id]);

  // Calcular rango de fechas basado en la vista
  const dateRange = useMemo(() => {
    if (view === 'day') {
      return {
        start: format(currentDate, 'yyyy-MM-dd'),
        end: format(currentDate, 'yyyy-MM-dd'),
      };
    } else if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
      };
    } else {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      // Extend to full weeks
      const monthStart = startOfWeek(start, { weekStartsOn: 1 });
      const monthEnd = endOfWeek(end, { weekStartsOn: 1 });
      return {
        start: format(monthStart, 'yyyy-MM-dd'),
        end: format(monthEnd, 'yyyy-MM-dd'),
      };
    }
  }, [currentDate, view]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      // Cargar datos de forma individual para mejor manejo de errores
      let branchData: { id: number; name: string }[] = [];
      let templateData: ShiftTemplate[] = [];
      let empData: { id: string; name: string; code: string | null }[] = [];
      let assignmentsData: ShiftAssignmentListItem[] = [];

      try {
        branchData = await service.getBranches();
      } catch (e) {
        console.warn('Error loading branches:', e);
      }

      try {
        templateData = await service.getTemplates();
      } catch (e) {
        console.warn('Error loading templates:', e);
      }

      try {
        empData = await service.getEmployees();
      } catch (e) {
        console.warn('Error loading employees:', e);
      }

      try {
        assignmentsData = await service.getAssignments({
          dateFrom: dateRange.start,
          dateTo: dateRange.end,
          branchId: filters.branchId || undefined,
          templateId: filters.templateId || undefined,
          employmentId: filters.employmentId || undefined,
          status: filters.status !== 'all' ? filters.status : undefined,
        });
      } catch (e) {
        console.warn('Error loading assignments:', e);
      }

      setAssignments(assignmentsData);
      setBranches(branchData);
      setTemplates(templateData);
      setEmployees(empData);
    } catch (error) {
      console.error('Error loading shifts:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los turnos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, dateRange, filters, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Handlers
  const handleShiftClick = (id: string) => {
    router.push(`/app/hrm/turnos/${id}`);
  };

  const handleExport = () => {
    const csvContent = [
      ['Fecha', 'Empleado', 'Código', 'Turno', 'Inicio', 'Fin', 'Sede', 'Estado'].join(','),
      ...assignments.map((a) =>
        [
          a.work_date,
          a.employee_name,
          a.employee_code || '',
          a.template_name || '',
          a.template_start_time || '',
          a.template_end_time || '',
          a.branch_name || '',
          a.status,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `turnos_${dateRange.start}_${dateRange.end}.csv`;
    link.click();
  };

  // Estadísticas
  const stats = useMemo(() => {
    return {
      total: assignments.length,
      scheduled: assignments.filter((a) => a.status === 'scheduled').length,
      completed: assignments.filter((a) => a.status === 'completed').length,
      cancelled: assignments.filter((a) => a.status === 'cancelled').length,
      swapPending: assignments.filter((a) => a.status === 'swap_pending').length,
    };
  }, [assignments]);

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="h-7 w-7 text-blue-600" />
            Planificación de Turnos
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gestiona los turnos y horarios de los empleados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Link href="/app/hrm/turnos/importar">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Importar
            </Button>
          </Link>
          <Link href="/app/hrm/turnos/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Turno
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.total}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.scheduled}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Programados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.completed}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Completados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <RefreshCcw className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {stats.swapPending}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Swap pendiente</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">
                  {stats.cancelled}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cancelados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <ShiftFilters
        filters={filters}
        onFiltersChange={setFilters}
        branches={branches}
        templates={templates.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        employees={employees}
      />

      {/* Calendario */}
      <ShiftCalendar
        assignments={assignments}
        currentDate={currentDate}
        view={view}
        onDateChange={setCurrentDate}
        onViewChange={setView}
        onShiftClick={handleShiftClick}
        isLoading={isLoading}
      />

      {/* Navigation Links */}
      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 pt-4 border-t border-gray-200 dark:border-gray-700">
        <span>Configuración:</span>
        <Link href="/app/hrm/plantillas-turno" className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1">
          <Clock className="h-4 w-4" />
          Plantillas de Turno
        </Link>
        <span>|</span>
        <Link href="/app/hrm/rotaciones" className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1">
          <RefreshCcw className="h-4 w-4" />
          Rotaciones
        </Link>
      </div>
    </div>
  );
}
