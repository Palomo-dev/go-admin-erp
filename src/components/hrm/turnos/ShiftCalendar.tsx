'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, isSameMonth, addWeeks, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ShiftAssignmentListItem } from '@/lib/services/shiftsService';

export type CalendarView = 'day' | 'week' | 'month';

interface ShiftCalendarProps {
  assignments: ShiftAssignmentListItem[];
  currentDate: Date;
  view: CalendarView;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onShiftClick: (id: string) => void;
  isLoading?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300',
  completed: 'bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300',
  cancelled: 'bg-gray-100 border-gray-300 text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400 line-through',
  swap_pending: 'bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300',
  absent: 'bg-red-100 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300',
  late: 'bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300',
};

export function ShiftCalendar({
  assignments,
  currentDate,
  view,
  onDateChange,
  onViewChange,
  onShiftClick,
  isLoading,
}: ShiftCalendarProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (time: string | null) => {
    if (!time) return '--:--';
    return time.substring(0, 5);
  };

  // Navigation
  const navigate = (direction: 'prev' | 'next') => {
    if (view === 'day') {
      onDateChange(addDays(currentDate, direction === 'next' ? 1 : -1));
    } else if (view === 'week') {
      onDateChange(addWeeks(currentDate, direction === 'next' ? 1 : -1));
    } else {
      onDateChange(addMonths(currentDate, direction === 'next' ? 1 : -1));
    }
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  // Get days to display based on view
  const displayDays = useMemo(() => {
    if (view === 'day') {
      return [currentDate];
    } else if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    } else {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      const monthStart = startOfWeek(start, { weekStartsOn: 1 });
      const monthEnd = endOfWeek(end, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: monthStart, end: monthEnd });
    }
  }, [currentDate, view]);

  // Group assignments by date
  const assignmentsByDate = useMemo(() => {
    const grouped: Record<string, ShiftAssignmentListItem[]> = {};
    assignments.forEach((a) => {
      const key = a.work_date;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    });
    return grouped;
  }, [assignments]);

  const getAssignmentsForDay = (day: Date): ShiftAssignmentListItem[] => {
    const key = format(day, 'yyyy-MM-dd');
    return assignmentsByDate[key] || [];
  };

  // Header title
  const headerTitle = useMemo(() => {
    if (view === 'day') {
      return format(currentDate, "EEEE, d 'de' MMMM yyyy", { locale: es });
    } else if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, 'd MMM', { locale: es })} - ${format(end, "d MMM yyyy", { locale: es })}`;
    } else {
      return format(currentDate, "MMMM yyyy", { locale: es });
    }
  }, [currentDate, view]);

  const renderShiftCard = (shift: ShiftAssignmentListItem, compact = false) => {
    const statusClass = STATUS_COLORS[shift.status] || STATUS_COLORS.scheduled;
    const bgColor = shift.template_color || '#3b82f6';

    return (
      <TooltipProvider key={shift.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onShiftClick(shift.id);
              }}
              className={`
                ${compact ? 'p-1.5 text-xs' : 'p-2'}
                rounded-md border cursor-pointer transition-all hover:shadow-md
                ${statusClass}
              `}
              style={{ borderLeftWidth: '3px', borderLeftColor: bgColor }}
            >
              <div className="flex items-center gap-1.5">
                {!compact && (
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs bg-white/50 dark:bg-black/30">
                      {getInitials(shift.employee_name)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                    {shift.employee_name}
                  </p>
                  {!compact && shift.template_name && (
                    <p className="text-xs opacity-75 truncate">{shift.template_name}</p>
                  )}
                </div>
                <div className={`text-right ${compact ? 'text-xs' : 'text-sm'} font-mono`}>
                  {formatTime(shift.template_start_time)}
                  {!compact && (
                    <>
                      <br />
                      {formatTime(shift.template_end_time)}
                    </>
                  )}
                </div>
              </div>
              {shift.status === 'swap_pending' && (
                <div className="flex items-center gap-1 mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                  <RefreshCw className="h-3 w-3" />
                  Swap pendiente
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <div className="space-y-1">
              <p className="font-medium">{shift.employee_name}</p>
              {shift.employee_code && (
                <p className="text-xs text-gray-500">{shift.employee_code}</p>
              )}
              <div className="flex items-center gap-1 text-sm">
                <Clock className="h-3 w-3" />
                {formatTime(shift.template_start_time)} - {formatTime(shift.template_end_time)}
              </div>
              {shift.template_name && (
                <p className="text-xs">Turno: {shift.template_name}</p>
              )}
              {shift.branch_name && (
                <p className="text-xs">Sede: {shift.branch_name}</p>
              )}
              {shift.notes && (
                <p className="text-xs italic">"{shift.notes}"</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Day View
  const renderDayView = () => {
    const dayAssignments = getAssignmentsForDay(currentDate);

    return (
      <div className="space-y-2">
        {dayAssignments.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p>No hay turnos programados para este día</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dayAssignments.map((shift) => renderShiftCard(shift))}
          </div>
        )}
      </div>
    );
  };

  // Week View
  const renderWeekView = () => {
    return (
      <div className="grid grid-cols-7 gap-1">
        {/* Header */}
        {displayDays.map((day) => (
          <div
            key={day.toISOString()}
            className={`text-center py-2 text-sm font-medium ${
              isToday(day)
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-t-lg'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <div>{format(day, 'EEE', { locale: es })}</div>
            <div className={`text-lg ${isToday(day) ? 'font-bold' : ''}`}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
        {/* Cells */}
        {displayDays.map((day) => {
          const dayAssignments = getAssignmentsForDay(day);
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[150px] border border-gray-200 dark:border-gray-700 p-1 ${
                isToday(day) ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'bg-white dark:bg-gray-800'
              }`}
            >
              <div className="space-y-1">
                {dayAssignments.slice(0, 4).map((shift) => renderShiftCard(shift, true))}
                {dayAssignments.length > 4 && (
                  <div className="text-xs text-center text-gray-500 dark:text-gray-400 py-1">
                    +{dayAssignments.length - 4} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Month View
  const renderMonthView = () => {
    return (
      <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
        {/* Header */}
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
          <div
            key={day}
            className="bg-gray-100 dark:bg-gray-800 text-center py-2 text-sm font-medium text-gray-600 dark:text-gray-400"
          >
            {day}
          </div>
        ))}
        {/* Cells */}
        {displayDays.map((day) => {
          const dayAssignments = getAssignmentsForDay(day);
          const inMonth = isSameMonth(day, currentDate);

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[100px] p-1 ${
                inMonth
                  ? isToday(day)
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'bg-white dark:bg-gray-800'
                  : 'bg-gray-50 dark:bg-gray-900'
              }`}
            >
              <div
                className={`text-sm mb-1 ${
                  isToday(day)
                    ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto'
                    : inMonth
                    ? 'text-gray-900 dark:text-white text-center'
                    : 'text-gray-400 dark:text-gray-600 text-center'
                }`}
              >
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayAssignments.slice(0, 3).map((shift) => (
                  <div
                    key={shift.id}
                    onClick={() => onShiftClick(shift.id)}
                    className="text-xs truncate px-1 py-0.5 rounded cursor-pointer hover:opacity-80"
                    style={{ backgroundColor: shift.template_color || '#3b82f6', color: 'white' }}
                  >
                    {shift.employee_name.split(' ')[0]}
                  </div>
                ))}
                {dayAssignments.length > 3 && (
                  <div className="text-xs text-center text-gray-500 dark:text-gray-400">
                    +{dayAssignments.length - 3}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="pt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigate('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToToday}>
              Hoy
            </Button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white capitalize ml-2">
              {headerTitle}
            </h2>
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            )}
          </div>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <Button
              variant={view === 'day' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewChange('day')}
            >
              Día
            </Button>
            <Button
              variant={view === 'week' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewChange('week')}
            >
              Semana
            </Button>
            <Button
              variant={view === 'month' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onViewChange('month')}
            >
              Mes
            </Button>
          </div>
        </div>

        {/* Calendar Content */}
        <div className="min-h-[400px]">
          {view === 'day' && renderDayView()}
          {view === 'week' && renderWeekView()}
          {view === 'month' && renderMonthView()}
        </div>
      </CardContent>
    </Card>
  );
}

export default ShiftCalendar;
