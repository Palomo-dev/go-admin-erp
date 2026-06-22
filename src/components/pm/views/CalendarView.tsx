'use client';

import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  FolderKanban,
} from 'lucide-react';
import { type PMTask, PRIORITY_COLORS, PRIORITY_LABELS, TASK_STATUS_COLORS, TASK_STATUS_LABELS } from '@/lib/services/pmService';

interface CalendarViewProps {
  tasks: PMTask[];
  onTaskClick?: (task: PMTask) => void;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Rellenar días del mes anterior para empezar en lunes
  const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  for (let i = startDayOfWeek; i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }

  // Días del mes actual
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Rellenar hasta completar grilla de 6 semanas
  while (days.length < 42) {
    days.push(new Date(year, month + 1, days.length - lastDay.getDate() - startDayOfWeek + 1));
  }

  return days;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function CalendarView({ tasks, onTaskClick }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, PMTask[]> = {};
    tasks.forEach(task => {
      if (task.due_date) {
        const key = task.due_date.split('T')[0];
        if (!map[key]) map[key] = [];
        map[key].push(task);
      }
    });
    return map;
  }, [tasks]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const isToday = (date: Date) => 
    date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();

  const isCurrentMonth = (date: Date) => date.getMonth() === month;

  return (
    <Card className="overflow-hidden">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {MONTHS[month]} {year}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800/50">
        {WEEKDAYS.map(day => (
          <div key={day} className="p-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {days.map((date, index) => {
          const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const dayTasks = tasksByDate[dateKey] || [];
          const isCurrent = isCurrentMonth(date);
          const isTodayDate = isToday(date);

          return (
            <div
              key={index}
              className={`min-h-[80px] sm:min-h-[100px] p-1 border-b border-r border-gray-100 dark:border-gray-800 ${
                isCurrent ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-900/50'
              } ${isTodayDate ? 'bg-blue-50/50 dark:bg-blue-950/10' : ''}`}
            >
              <div className={`text-xs font-medium mb-1 px-1 ${
                isTodayDate
                  ? 'text-white bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center'
                  : isCurrent
                    ? 'text-gray-700 dark:text-gray-300'
                    : 'text-gray-400 dark:text-gray-600'
              }`}>
                {date.getDate()}
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayTasks.slice(0, 3).map(task => (
                  <button
                    key={task.id}
                    onClick={() => onTaskClick?.(task)}
                    className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate block ${
                      task.status === 'done'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 line-through'
                        : task.status === 'in_progress'
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    } hover:opacity-80 transition-opacity`}
                  >
                    {task.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <p className="text-[10px] text-gray-400 px-1">+{dayTasks.length - 3} más</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
