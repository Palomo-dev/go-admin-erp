'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  Loader2,
  Star
} from 'lucide-react';
import { Instructor, getInstructorStats, getClasses, GymClass } from '@/lib/services/gymService';
import { useOrganization } from '@/lib/hooks/useOrganization';

interface InstructorPerformanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor: Instructor | null;
}

interface PerformanceMetrics {
  totalClasses: number;
  completedClasses: number;
  cancelledClasses: number;
  totalReservations: number;
  totalAttendance: number;
  avgAttendanceRate: number;
  completionRate: number;
  avgCapacityUtilization: number;
  classesByType: { type: string; count: number }[];
  monthlyTrend: { month: string; classes: number; attendance: number }[];
}

export function InstructorPerformanceDialog({ open, onOpenChange, instructor }: InstructorPerformanceDialogProps) {
  const { organization } = useOrganization();
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open && instructor) {
      loadMetrics();
    }
  }, [open, instructor]);

  const loadMetrics = async () => {
    if (!instructor || !organization?.id) return;
    setIsLoading(true);
    try {
      const [stats, classes] = await Promise.all([
        getInstructorStats(instructor.user_id, organization.id),
        getClasses(organization.id, { instructorId: instructor.user_id })
      ]);

      // Calcular métricas adicionales
      const completionRate = stats.totalClasses > 0 
        ? (stats.completedClasses / stats.totalClasses) * 100 
        : 0;

      // Calcular utilización de capacidad promedio
      const classesWithCapacity = classes.filter(c => c.capacity > 0);
      const avgCapacityUtilization = classesWithCapacity.length > 0
        ? classesWithCapacity.reduce((sum, c) => sum + ((c.reservations_count || 0) / c.capacity) * 100, 0) / classesWithCapacity.length
        : 0;

      // Agrupar por tipo de clase
      const typeCount: Record<string, number> = {};
      classes.forEach(c => {
        typeCount[c.class_type] = (typeCount[c.class_type] || 0) + 1;
      });
      const classesByType = Object.entries(typeCount)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // Tendencia mensual (últimos 3 meses)
      const now = new Date();
      const monthlyTrend = [];
      for (let i = 2; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        const monthClasses = classes.filter(c => {
          const classDate = new Date(c.start_at);
          return classDate >= monthStart && classDate <= monthEnd;
        });
        monthlyTrend.push({
          month: monthStart.toLocaleDateString('es-ES', { month: 'short' }),
          classes: monthClasses.length,
          attendance: monthClasses.reduce((sum, c) => sum + (c.reservations_count || 0), 0)
        });
      }

      setMetrics({
        ...stats,
        completionRate,
        avgCapacityUtilization,
        classesByType,
        monthlyTrend
      });
    } catch (error) {
      console.error('Error cargando métricas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!instructor) return null;

  const getPerformanceLevel = (rate: number) => {
    if (rate >= 80) return { label: 'Excelente', color: 'text-green-600', bg: 'bg-green-100' };
    if (rate >= 60) return { label: 'Bueno', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    if (rate >= 40) return { label: 'Regular', color: 'text-orange-600', bg: 'bg-orange-100' };
    return { label: 'Necesita mejorar', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const getClassTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      spinning: 'Spinning',
      yoga: 'Yoga',
      pilates: 'Pilates',
      crossfit: 'CrossFit',
      zumba: 'Zumba',
      boxing: 'Boxeo',
      functional: 'Funcional',
      stretching: 'Estiramiento',
      aerobics: 'Aeróbicos',
      swimming: 'Natación',
      other: 'Otro'
    };
    return labels[type] || type;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Desempeño de {instructor.profiles?.first_name} {instructor.profiles?.last_name}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : metrics ? (
          <div className="space-y-6">
            {/* Resumen general */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Calificación General</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" />
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {((metrics.avgAttendanceRate + metrics.completionRate + metrics.avgCapacityUtilization) / 3).toFixed(0)}
                    </span>
                    <span className="text-lg text-gray-500">/100</span>
                  </div>
                </div>
                <Badge className={`${getPerformanceLevel(metrics.avgAttendanceRate).bg} ${getPerformanceLevel(metrics.avgAttendanceRate).color}`}>
                  {getPerformanceLevel(metrics.avgAttendanceRate).label}
                </Badge>
              </div>
            </div>

            {/* KPIs principales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-xl font-bold">{metrics.totalClasses}</p>
                      <p className="text-xs text-gray-500">Total Clases</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-xl font-bold text-green-600">{metrics.completionRate.toFixed(0)}%</p>
                      <p className="text-xs text-gray-500">Completadas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-600" />
                    <div>
                      <p className="text-xl font-bold text-purple-600">{metrics.avgAttendanceRate.toFixed(0)}%</p>
                      <p className="text-xs text-gray-500">Asistencia</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="text-xl font-bold text-orange-600">{metrics.avgCapacityUtilization.toFixed(0)}%</p>
                      <p className="text-xs text-gray-500">Ocupación</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Métricas con progreso */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Indicadores de Desempeño</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Tasa de Asistencia</span>
                    <span className="font-medium">{metrics.avgAttendanceRate.toFixed(0)}%</span>
                  </div>
                  <Progress value={metrics.avgAttendanceRate} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Tasa de Completitud</span>
                    <span className="font-medium">{metrics.completionRate.toFixed(0)}%</span>
                  </div>
                  <Progress value={metrics.completionRate} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Utilización de Capacidad</span>
                    <span className="font-medium">{metrics.avgCapacityUtilization.toFixed(0)}%</span>
                  </div>
                  <Progress value={metrics.avgCapacityUtilization} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Distribución por tipo de clase */}
            {metrics.classesByType.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Clases por Tipo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {metrics.classesByType.map(({ type, count }) => (
                      <Badge key={type} variant="outline" className="text-sm">
                        {getClassTypeLabel(type)}: {count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tendencia mensual */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tendencia Últimos 3 Meses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {metrics.monthlyTrend.map((month, idx) => {
                    const prevMonth = metrics.monthlyTrend[idx - 1];
                    const trend = prevMonth ? month.classes - prevMonth.classes : 0;
                    return (
                      <div key={month.month} className="text-center p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <p className="text-sm text-gray-500 uppercase">{month.month}</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{month.classes}</p>
                        <p className="text-xs text-gray-500">clases</p>
                        {trend !== 0 && (
                          <div className={`flex items-center justify-center gap-1 text-xs ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {Math.abs(trend)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="text-center text-gray-500 py-8">No hay datos disponibles</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
