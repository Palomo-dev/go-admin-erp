'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock,
  MapPin,
  Users,
  Loader2
} from 'lucide-react';
import { Instructor, getClasses, GymClass, getClassTypeLabel, getClassStatusColor, getClassStatusLabel } from '@/lib/services/gymService';
import { useOrganization } from '@/lib/hooks/useOrganization';

interface InstructorScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor: Instructor | null;
}

export function InstructorScheduleDialog({ open, onOpenChange, instructor }: InstructorScheduleDialogProps) {
  const { organization } = useOrganization();
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      days.push(day);
    }
    return days;
  }, [currentWeekStart]);

  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6:00 - 21:00

  useEffect(() => {
    if (open && instructor) {
      loadClasses();
    }
  }, [open, instructor, currentWeekStart]);

  const loadClasses = async () => {
    if (!instructor || !organization?.id) return;
    setIsLoading(true);
    try {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const data = await getClasses(organization.id, { 
        instructorId: instructor.user_id,
        dateFrom: currentWeekStart.toISOString(),
        dateTo: weekEnd.toISOString()
      });
      setClasses(data);
    } catch (error) {
      console.error('Error cargando clases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const previousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const nextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(newStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToToday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  const getClassesForDayHour = (day: Date, hour: number) => {
    return classes.filter(c => {
      const classDate = new Date(c.start_at);
      return (
        classDate.getDate() === day.getDate() &&
        classDate.getMonth() === day.getMonth() &&
        classDate.getFullYear() === day.getFullYear() &&
        classDate.getHours() === hour
      );
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() && 
           date.getMonth() === today.getMonth() && 
           date.getFullYear() === today.getFullYear();
  };

  const formatMonthYear = () => {
    const endOfWeek = new Date(currentWeekStart);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    
    if (currentWeekStart.getMonth() === endOfWeek.getMonth()) {
      return currentWeekStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    }
    return `${currentWeekStart.toLocaleDateString('es-ES', { month: 'short' })} - ${endOfWeek.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`;
  };

  // Calcular carga horaria semanal - DEBE estar antes de cualquier return condicional
  const weeklyStats = useMemo(() => {
    const totalClasses = classes.length;
    const totalMinutes = classes.reduce((sum, c) => sum + (c.duration_minutes || 60), 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
    return { totalClasses, totalHours };
  }, [classes]);

  if (!instructor) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Horario de {instructor.profiles?.first_name} {instructor.profiles?.last_name}
          </DialogTitle>
        </DialogHeader>

        {/* Navegación de semana */}
        <div className="flex items-center justify-between py-2 border-b">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>Hoy</Button>
            <Button variant="ghost" size="icon" onClick={previousWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={nextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-lg font-semibold capitalize">{formatMonthYear()}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="outline" className="font-normal">
              {weeklyStats.totalClasses} clases
            </Badge>
            <Badge variant="outline" className="font-normal">
              {weeklyStats.totalHours}h carga horaria
            </Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="min-w-[800px]">
              {/* Header de días */}
              <div className="grid grid-cols-8 border-b sticky top-0 bg-white dark:bg-gray-800 z-10">
                <div className="p-2 text-center text-sm font-medium text-gray-500 border-r" style={{ width: 60 }}>
                  Hora
                </div>
                {weekDays.map((day, idx) => (
                  <div 
                    key={idx} 
                    className={`p-2 text-center border-r ${isToday(day) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <div className="text-xs text-gray-500 uppercase">
                      {day.toLocaleDateString('es-ES', { weekday: 'short' })}
                    </div>
                    <div className={`text-lg font-semibold ${isToday(day) ? 'text-blue-600' : 'text-gray-900 dark:text-white'}`}>
                      {day.getDate()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Grid de horas */}
              {hours.map((hour) => (
                <div key={hour} className="grid grid-cols-8 border-b">
                  <div className="p-2 text-center text-sm text-gray-500 border-r" style={{ width: 60, minHeight: 60 }}>
                    {hour}:00
                  </div>
                  {weekDays.map((day, idx) => {
                    const dayClasses = getClassesForDayHour(day, hour);
                    return (
                      <div 
                        key={idx} 
                        className={`p-1 border-r min-h-[60px] ${isToday(day) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                      >
                        {dayClasses.map((gymClass) => (
                          <div 
                            key={gymClass.id}
                            className="p-1 rounded text-xs bg-blue-100 dark:bg-blue-900/50 border-l-2 border-blue-600 mb-1"
                          >
                            <p className="font-medium text-blue-900 dark:text-blue-100 truncate">{gymClass.title}</p>
                            <div className="flex items-center gap-1 text-blue-700 dark:text-blue-300">
                              <Clock className="h-3 w-3" />
                              {gymClass.duration_minutes}min
                            </div>
                            <div className="flex items-center gap-1 text-blue-700 dark:text-blue-300">
                              <Users className="h-3 w-3" />
                              {gymClass.reservations_count || 0}/{gymClass.capacity}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
