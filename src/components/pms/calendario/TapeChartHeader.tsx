'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw,
  Plus,
  Ban
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/utils/Utils';

interface TapeChartHeaderProps {
  startDate: Date;
  daysToShow: number;
  onStartDateChange: (date: Date) => void;
  onDaysToShowChange: (days: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onRefresh: () => void;
  onNewReservation?: () => void;
  onNewBlock?: () => void;
  isRefreshing?: boolean;
}

export function TapeChartHeader({
  startDate,
  daysToShow,
  onStartDateChange,
  onDaysToShowChange,
  onPrevious,
  onNext,
  onToday,
  onRefresh,
  onNewReservation,
  onNewBlock,
  isRefreshing = false,
}: TapeChartHeaderProps) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + daysToShow - 1);

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Tape Chart
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {format(startDate, "d 'de' MMMM", { locale: es })} - {format(endDate, "d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Navigation */}
        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrevious}
            className="rounded-r-none"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToday}
            className="border-x border-gray-200 dark:border-gray-700 rounded-none"
          >
            Hoy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNext}
            className="rounded-l-none"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Date Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <CalendarDays className="h-4 w-4 mr-2" />
              {format(startDate, 'dd/MM/yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={(date) => date && onStartDateChange(date)}
              locale={es}
            />
          </PopoverContent>
        </Popover>

        {/* Days to show */}
        <Select
          value={daysToShow.toString()}
          onValueChange={(value) => onDaysToShowChange(parseInt(value))}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 días</SelectItem>
            <SelectItem value="14">14 días</SelectItem>
            <SelectItem value="21">21 días</SelectItem>
            <SelectItem value="30">30 días</SelectItem>
          </SelectContent>
        </Select>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
          
          {onNewBlock && (
            <Button
              variant="outline"
              size="sm"
              onClick={onNewBlock}
              className="text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950"
            >
              <Ban className="h-4 w-4 mr-1" />
              Bloqueo
            </Button>
          )}
          
          {onNewReservation && (
            <Button
              size="sm"
              onClick={onNewReservation}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1" />
              Reserva
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
