'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { TimesheetConsolidationService } from '@/lib/services/timesheetConsolidationService';
import type { ShiftComparisonResult } from '@/lib/services/timesheetConsolidationService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Timer,
  Moon,
  TrendingUp,
  ArrowLeft,
  Play,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  on_time: { label: 'A tiempo', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle2 },
  late: { label: 'Tardanza', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', icon: AlertTriangle },
  absent: { label: 'Ausente', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', icon: XCircle },
  incomplete: { label: 'Incompleto', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', icon: Timer },
  no_shift: { label: 'Sin turno', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300', icon: Clock },
  rest_day: { label: 'Descanso', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: Moon },
};

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '--:--';
  if (timeStr.includes('T')) {
    return format(new Date(timeStr), 'HH:mm');
  }
  return timeStr.substring(0, 5);
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

export default function ComparacionAsistenciaPage() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [comparisons, setComparisons] = useState<ShiftComparisonResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);

  const loadComparisons = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const service = new TimesheetConsolidationService(organization.id);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const results = await service.compareShiftsWithAttendance(dateStr);
      setComparisons(results);
    } catch (error) {
      console.error('Error loading comparisons:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la comparación',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, selectedDate, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadComparisons();
    }
  }, [organization?.id, orgLoading, loadComparisons]);

  const handleConsolidate = async () => {
    if (!organization?.id) return;

    setIsConsolidating(true);
    try {
      const service = new TimesheetConsolidationService(organization.id);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const result = await service.consolidateDayWithShifts(dateStr);

      toast({
        title: 'Consolidación completada',
        description: `Creados: ${result.created}, Actualizados: ${result.updated}, Omitidos: ${result.skipped}`,
      });

      // Recargar datos
      await loadComparisons();
    } catch (error) {
      console.error('Error consolidating:', error);
      toast({
        title: 'Error',
        description: 'No se pudo consolidar los timesheets',
        variant: 'destructive',
      });
    } finally {
      setIsConsolidating(false);
    }
  };

  // Estadísticas
  const stats = {
    total: comparisons.length,
    onTime: comparisons.filter(c => c.attendance_status === 'on_time').length,
    late: comparisons.filter(c => c.attendance_status === 'late').length,
    absent: comparisons.filter(c => c.attendance_status === 'absent').length,
    incomplete: comparisons.filter(c => c.attendance_status === 'incomplete').length,
    totalOvertime: comparisons.reduce((sum, c) => sum + c.overtime_minutes, 0),
    totalNight: comparisons.reduce((sum, c) => sum + c.night_minutes, 0),
  };

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
        <div className="flex items-center gap-4">
          <Link href="/app/hrm/asistencia">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="h-7 w-7 text-blue-600" />
              Turno vs Asistencia
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Comparación de turnos programados con asistencia real
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[200px] justify-start">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                locale={es}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" onClick={loadComparisons} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button onClick={handleConsolidate} disabled={isConsolidating || comparisons.length === 0}>
            <Play className={`h-4 w-4 mr-2 ${isConsolidating ? 'animate-spin' : ''}`} />
            Consolidar Timesheets
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="bg-white dark:bg-gray-800">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
              <p className="text-xs text-gray-500">Total Turnos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.onTime}</div>
              <p className="text-xs text-gray-500">A tiempo</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.late}</div>
              <p className="text-xs text-gray-500">Tardanzas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.absent}</div>
              <p className="text-xs text-gray-500">Ausentes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.incomplete}</div>
              <p className="text-xs text-gray-500">Incompletos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{formatMinutes(stats.totalOvertime)}</div>
              <p className="text-xs text-gray-500">Horas Extra</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{formatMinutes(stats.totalNight)}</div>
              <p className="text-xs text-gray-500">Nocturnas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-lg">Detalle de Asistencia</CardTitle>
          <CardDescription>
            Comparación entre turno programado y asistencia registrada
          </CardDescription>
        </CardHeader>
        <CardContent>
          {comparisons.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No hay turnos programados para esta fecha</p>
              <p className="text-sm mt-2">
                <Link href="/app/hrm/turnos/nuevo" className="text-blue-600 hover:underline">
                  Crear un turno
                </Link>
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead className="text-center">Turno Programado</TableHead>
                    <TableHead className="text-center">Entrada Real</TableHead>
                    <TableHead className="text-center">Salida Real</TableHead>
                    <TableHead className="text-center">Tardanza</TableHead>
                    <TableHead className="text-center">Trabajado</TableHead>
                    <TableHead className="text-center">Extras</TableHead>
                    <TableHead className="text-center">Nocturnas</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisons.map((item) => {
                    const statusConfig = STATUS_CONFIG[item.attendance_status] || STATUS_CONFIG.no_shift;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <TableRow key={item.employment_id}>
                        <TableCell className="font-medium">{item.employee_name}</TableCell>
                        <TableCell className="text-center font-mono">
                          {formatTime(item.shift_start_time)} - {formatTime(item.shift_end_time)}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {item.actual_check_in ? (
                            <span className={item.late_minutes > 0 ? 'text-yellow-600' : 'text-green-600'}>
                              {formatTime(item.actual_check_in)}
                            </span>
                          ) : (
                            <span className="text-gray-400">--:--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {item.actual_check_out ? (
                            <span className={item.early_departure_minutes > 0 ? 'text-orange-600' : 'text-green-600'}>
                              {formatTime(item.actual_check_out)}
                            </span>
                          ) : (
                            <span className="text-gray-400">--:--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.late_minutes > 0 ? (
                            <span className="text-yellow-600 font-medium">{formatMinutes(item.late_minutes)}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {formatMinutes(item.worked_minutes)}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.overtime_minutes > 0 ? (
                            <span className="text-blue-600 font-medium flex items-center justify-center gap-1">
                              <TrendingUp className="h-3 w-3" />
                              {formatMinutes(item.overtime_minutes)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.night_minutes > 0 ? (
                            <span className="text-purple-600 font-medium flex items-center justify-center gap-1">
                              <Moon className="h-3 w-3" />
                              {formatMinutes(item.night_minutes)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={statusConfig.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
