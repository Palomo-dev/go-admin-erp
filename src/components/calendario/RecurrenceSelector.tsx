'use client';

import { useState, useEffect, useMemo } from 'react';
import { format, addMonths, addYears } from 'date-fns';
import { es } from 'date-fns/locale';
import { Repeat, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/Utils';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  enabled: boolean;
  frequency: RecurrenceFrequency;
  interval: number;
  weekDays?: number[]; // 0=Dom, 1=Lun, ..., 6=Sáb
  monthDay?: number;
  endType: 'never' | 'until' | 'count';
  until?: string;
  count?: number;
}

interface RecurrenceSelectorProps {
  value: RecurrenceRule;
  onChange: (rule: RecurrenceRule) => void;
  startDate: Date;
}

const WEEK_DAYS = [
  { value: 1, label: 'L', fullLabel: 'Lunes' },
  { value: 2, label: 'M', fullLabel: 'Martes' },
  { value: 3, label: 'X', fullLabel: 'Miércoles' },
  { value: 4, label: 'J', fullLabel: 'Jueves' },
  { value: 5, label: 'V', fullLabel: 'Viernes' },
  { value: 6, label: 'S', fullLabel: 'Sábado' },
  { value: 0, label: 'D', fullLabel: 'Domingo' },
];

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
};

export const DEFAULT_RECURRENCE: RecurrenceRule = {
  enabled: false,
  frequency: 'weekly',
  interval: 1,
  weekDays: [1], // Lunes por defecto
  endType: 'never',
};

export function recurrenceToRRule(rule: RecurrenceRule): string | null {
  if (!rule.enabled) return null;

  const parts: string[] = [];
  
  // Frecuencia
  const freqMap: Record<RecurrenceFrequency, string> = {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
    yearly: 'YEARLY',
  };
  parts.push(`FREQ=${freqMap[rule.frequency]}`);

  // Intervalo
  if (rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }

  // Días de la semana (para frecuencia semanal)
  if (rule.frequency === 'weekly' && rule.weekDays && rule.weekDays.length > 0) {
    const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const days = rule.weekDays.map((d) => dayMap[d]).join(',');
    parts.push(`BYDAY=${days}`);
  }

  // Día del mes (para frecuencia mensual)
  if (rule.frequency === 'monthly' && rule.monthDay) {
    parts.push(`BYMONTHDAY=${rule.monthDay}`);
  }

  // Fin de recurrencia
  if (rule.endType === 'until' && rule.until) {
    const untilDate = new Date(rule.until);
    parts.push(`UNTIL=${format(untilDate, "yyyyMMdd'T'HHmmss'Z'")}`);
  } else if (rule.endType === 'count' && rule.count) {
    parts.push(`COUNT=${rule.count}`);
  }

  return parts.join(';');
}

export function rruleToRecurrence(rrule: string | null): RecurrenceRule {
  if (!rrule) return DEFAULT_RECURRENCE;

  const rule: RecurrenceRule = { ...DEFAULT_RECURRENCE, enabled: true };
  const parts = rrule.split(';');

  parts.forEach((part) => {
    const [key, value] = part.split('=');
    switch (key) {
      case 'FREQ':
        const freqMap: Record<string, RecurrenceFrequency> = {
          DAILY: 'daily',
          WEEKLY: 'weekly',
          MONTHLY: 'monthly',
          YEARLY: 'yearly',
        };
        rule.frequency = freqMap[value] || 'weekly';
        break;
      case 'INTERVAL':
        rule.interval = parseInt(value, 10);
        break;
      case 'BYDAY':
        const dayMap: Record<string, number> = {
          SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
        };
        rule.weekDays = value.split(',').map((d) => dayMap[d]).filter((d) => d !== undefined);
        break;
      case 'BYMONTHDAY':
        rule.monthDay = parseInt(value, 10);
        break;
      case 'UNTIL':
        rule.endType = 'until';
        // Parse YYYYMMDDTHHMMSSZ format
        const year = value.substring(0, 4);
        const month = value.substring(4, 6);
        const day = value.substring(6, 8);
        rule.until = `${year}-${month}-${day}`;
        break;
      case 'COUNT':
        rule.endType = 'count';
        rule.count = parseInt(value, 10);
        break;
    }
  });

  return rule;
}

export function RecurrenceSelector({ value, onChange, startDate }: RecurrenceSelectorProps) {
  const handleToggle = (enabled: boolean) => {
    onChange({ ...value, enabled });
  };

  const handleFrequencyChange = (frequency: RecurrenceFrequency) => {
    const updates: Partial<RecurrenceRule> = { frequency };
    
    // Reset campos según frecuencia
    if (frequency === 'weekly') {
      updates.weekDays = [startDate.getDay()];
    } else if (frequency === 'monthly') {
      updates.monthDay = startDate.getDate();
    }

    onChange({ ...value, ...updates });
  };

  const toggleWeekDay = (day: number) => {
    const currentDays = value.weekDays || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort();
    
    onChange({ ...value, weekDays: newDays.length > 0 ? newDays : [day] });
  };

  const getPreviewText = useMemo(() => {
    if (!value.enabled) return '';

    let text = '';
    const interval = value.interval || 1;

    switch (value.frequency) {
      case 'daily':
        text = interval === 1 ? 'Cada día' : `Cada ${interval} días`;
        break;
      case 'weekly':
        const days = (value.weekDays || [])
          .map((d) => WEEK_DAYS.find((w) => w.value === d)?.fullLabel)
          .filter(Boolean)
          .join(', ');
        text = interval === 1 
          ? `Cada semana los ${days}` 
          : `Cada ${interval} semanas los ${days}`;
        break;
      case 'monthly':
        text = interval === 1 
          ? `Cada mes el día ${value.monthDay || startDate.getDate()}` 
          : `Cada ${interval} meses el día ${value.monthDay || startDate.getDate()}`;
        break;
      case 'yearly':
        text = interval === 1 
          ? `Cada año el ${format(startDate, "d 'de' MMMM", { locale: es })}` 
          : `Cada ${interval} años el ${format(startDate, "d 'de' MMMM", { locale: es })}`;
        break;
    }

    if (value.endType === 'until' && value.until) {
      text += `, hasta el ${format(new Date(value.until), "d 'de' MMMM yyyy", { locale: es })}`;
    } else if (value.endType === 'count' && value.count) {
      text += `, ${value.count} ocurrencias`;
    }

    return text;
  }, [value, startDate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-gray-500" />
          <Label>Repetir evento</Label>
        </div>
        <Switch checked={value.enabled} onCheckedChange={handleToggle} />
      </div>

      {value.enabled && (
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          {/* Frecuencia e intervalo */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frecuencia</Label>
              <Select value={value.frequency} onValueChange={(v) => handleFrequencyChange(v as RecurrenceFrequency)}>
                <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cada</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={value.interval || 1}
                  onChange={(e) => onChange({ ...value, interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                  className="w-20 dark:bg-gray-800 dark:border-gray-700"
                />
                <span className="text-sm text-gray-500">
                  {value.frequency === 'daily' && (value.interval === 1 ? 'día' : 'días')}
                  {value.frequency === 'weekly' && (value.interval === 1 ? 'semana' : 'semanas')}
                  {value.frequency === 'monthly' && (value.interval === 1 ? 'mes' : 'meses')}
                  {value.frequency === 'yearly' && (value.interval === 1 ? 'año' : 'años')}
                </span>
              </div>
            </div>
          </div>

          {/* Días de la semana (solo para frecuencia semanal) */}
          {value.frequency === 'weekly' && (
            <div className="space-y-2">
              <Label>Días de la semana</Label>
              <div className="flex gap-1">
                {WEEK_DAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleWeekDay(day.value)}
                    className={cn(
                      'w-9 h-9 rounded-full text-sm font-medium transition-colors',
                      value.weekDays?.includes(day.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
                    )}
                    title={day.fullLabel}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Día del mes (solo para frecuencia mensual) */}
          {value.frequency === 'monthly' && (
            <div className="space-y-2">
              <Label>Día del mes</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={value.monthDay || startDate.getDate()}
                onChange={(e) => onChange({ ...value, monthDay: Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                className="w-20 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          )}

          {/* Fin de recurrencia */}
          <div className="space-y-2">
            <Label>Termina</Label>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="endType"
                  checked={value.endType === 'never'}
                  onChange={() => onChange({ ...value, endType: 'never' })}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">Nunca</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="endType"
                  checked={value.endType === 'until'}
                  onChange={() => onChange({ ...value, endType: 'until', until: format(addMonths(startDate, 3), 'yyyy-MM-dd') })}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">Hasta</span>
                {value.endType === 'until' && (
                  <Input
                    type="date"
                    value={value.until || ''}
                    onChange={(e) => onChange({ ...value, until: e.target.value })}
                    className="w-40 h-8 text-sm dark:bg-gray-800 dark:border-gray-700"
                  />
                )}
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="endType"
                  checked={value.endType === 'count'}
                  onChange={() => onChange({ ...value, endType: 'count', count: 10 })}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm">Después de</span>
                {value.endType === 'count' && (
                  <>
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      value={value.count || 10}
                      onChange={(e) => onChange({ ...value, count: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      className="w-20 h-8 text-sm dark:bg-gray-800 dark:border-gray-700"
                    />
                    <span className="text-sm">ocurrencias</span>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Vista previa */}
          {getPreviewText && (
            <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded">
              <span className="font-medium">Resumen:</span> {getPreviewText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
