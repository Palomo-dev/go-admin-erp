'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Calendar, 
  Users, 
  TrendingUp, 
  MoreVertical,
  Eye,
  Clock,
  CalendarDays,
  BarChart3,
  Briefcase,
  DollarSign
} from 'lucide-react';
import { Instructor, getInstructorStats } from '@/lib/services/gymService';

interface InstructorStats {
  totalClasses: number;
  completedClasses: number;
  cancelledClasses: number;
  totalReservations: number;
  totalAttendance: number;
  avgAttendanceRate: number;
}

interface InstructorCardProps {
  instructor: Instructor;
  weeklyHours?: number;
  weeklyClasses?: number;
  onViewDetails?: (instructor: Instructor) => void;
  onViewSchedule?: (instructor: Instructor) => void;
  onViewPerformance?: (instructor: Instructor) => void;
  onManageAvailability?: (instructor: Instructor) => void;
}

export function InstructorCard({ 
  instructor, 
  weeklyHours = 0,
  weeklyClasses = 0,
  onViewDetails,
  onViewSchedule,
  onViewPerformance,
  onManageAvailability
}: InstructorCardProps) {
  const [stats, setStats] = useState<InstructorStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      setIsLoadingStats(true);
      try {
        const data = await getInstructorStats(instructor.user_id);
        setStats(data);
      } catch (error) {
        console.error('Error cargando estadísticas:', error);
      } finally {
        setIsLoadingStats(false);
      }
    };
    loadStats();
  }, [instructor.user_id]);

  const getInitials = () => {
    const first = instructor.profiles?.first_name?.[0] || '';
    const last = instructor.profiles?.last_name?.[0] || '';
    return (first + last).toUpperCase() || 'IN';
  };

  const getPerformanceColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600 dark:text-green-400';
    if (rate >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={instructor.profiles?.avatar_url} />
              <AvatarFallback className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-lg">
                {getInitials()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                  {instructor.profiles?.first_name} {instructor.profiles?.last_name}
                </h3>
                <Badge 
                  className={instructor.is_active 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                  }
                >
                  {instructor.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>

              {/* Cargo/Posición de HRM */}
              {instructor.position && (
                <div className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
                  <Briefcase className="h-3 w-3" />
                  <span>{instructor.position.name}</span>
                </div>
              )}

              {instructor.profiles?.email && (
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {instructor.profiles.email}
                </p>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewDetails?.(instructor)}>
                <Eye className="h-4 w-4 mr-2" />
                Ver Detalles
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewSchedule?.(instructor)}>
                <CalendarDays className="h-4 w-4 mr-2" />
                Ver Horario
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewPerformance?.(instructor)}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Ver Desempeño
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onManageAvailability?.(instructor)}>
                <Clock className="h-4 w-4 mr-2" />
                Gestionar Disponibilidad
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Carga horaria semanal y tarifa */}
        <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Carga semanal:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {weeklyClasses} clases • {weeklyHours}h
            </span>
          </div>
          {instructor.hourly_rate && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Tarifa/hora:
              </span>
              <span className="font-medium text-green-600 dark:text-green-400">
                ${instructor.hourly_rate.toLocaleString('es-CO')}
              </span>
            </div>
          )}
          {instructor.salary_period === 'hourly' && (
            <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 text-xs">
              Pago por hora
            </Badge>
          )}
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400">
              <Calendar className="h-4 w-4" />
              <span className="font-semibold">{isLoadingStats ? '-' : stats?.totalClasses || 0}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
              <span className="font-semibold">{isLoadingStats ? '-' : stats?.completedClasses || 0}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Completadas</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-purple-600 dark:text-purple-400">
              <Users className="h-4 w-4" />
              <span className="font-semibold">{isLoadingStats ? '-' : stats?.totalAttendance || 0}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Asistentes</p>
          </div>

          <div className="text-center">
            <div className={`flex items-center justify-center gap-1 ${getPerformanceColor(stats?.avgAttendanceRate || 0)}`}>
              <TrendingUp className="h-4 w-4" />
              <span className="font-semibold">{isLoadingStats ? '-' : (stats?.avgAttendanceRate || 0).toFixed(0)}%</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Asistencia</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
