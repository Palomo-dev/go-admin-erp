'use client';

import { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Palette,
  Bell,
  Globe,
  Eye,
  RotateCcw,
  Save,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import {
  CalendarSettings,
  VIEW_OPTIONS,
  WEEK_START_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  REMINDER_OPTIONS,
  TIMEZONE_OPTIONS,
  WeekStartDay,
  CalendarViewType,
} from './types';

interface CalendarSettingsFormProps {
  settings: CalendarSettings;
  isLoading: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  onUpdate: (updates: Partial<CalendarSettings>) => void;
  onSave: () => Promise<void>;
  onReset: () => void;
}

export function CalendarSettingsForm({
  settings,
  isLoading,
  isSaving,
  hasChanges,
  onUpdate,
  onSave,
  onReset,
}: CalendarSettingsFormProps) {
  const [activeSection, setActiveSection] = useState<string>('view');

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const handleSourceTypeToggle = (sourceType: string, checked: boolean) => {
    const newVisibleTypes = checked
      ? [...settings.visibleSourceTypes, sourceType]
      : settings.visibleSourceTypes.filter((t) => t !== sourceType);
    onUpdate({ visibleSourceTypes: newVisibleTypes });
  };

  const handleColorChange = (sourceType: keyof typeof settings.sourceTypeColors, color: string) => {
    onUpdate({
      sourceTypeColors: {
        ...settings.sourceTypeColors,
        [sourceType]: color,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Sección: Vista y Navegación */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Vista y Navegación</CardTitle>
          </div>
          <CardDescription>
            Configura cómo se muestra el calendario por defecto
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vista por defecto */}
            <div className="space-y-2">
              <Label htmlFor="defaultView">Vista por defecto</Label>
              <Select
                value={settings.defaultView}
                onValueChange={(value: CalendarViewType) => onUpdate({ defaultView: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIEW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Primer día de la semana */}
            <div className="space-y-2">
              <Label htmlFor="weekStartDay">Primer día de la semana</Label>
              <Select
                value={settings.weekStartDay.toString()}
                onValueChange={(value) => onUpdate({ weekStartDay: parseInt(value) as WeekStartDay })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEK_START_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Mostrar fines de semana */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div>
              <Label htmlFor="showWeekends" className="font-medium">Mostrar fines de semana</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Incluir sábado y domingo en la vista semanal
              </p>
            </div>
            <Switch
              id="showWeekends"
              checked={settings.showWeekends}
              onCheckedChange={(checked) => onUpdate({ showWeekends: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sección: Horario Laboral */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-green-500" />
            <CardTitle className="text-lg">Horario Laboral</CardTitle>
          </div>
          <CardDescription>
            Define las horas de trabajo que se resaltarán en el calendario
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workStart">Hora de inicio</Label>
              <Input
                id="workStart"
                type="time"
                value={settings.workingHours.start}
                onChange={(e) =>
                  onUpdate({
                    workingHours: { ...settings.workingHours, start: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workEnd">Hora de fin</Label>
              <Input
                id="workEnd"
                type="time"
                value={settings.workingHours.end}
                onChange={(e) =>
                  onUpdate({
                    workingHours: { ...settings.workingHours, end: e.target.value },
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sección: Módulos Visibles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-lg">Módulos Visibles</CardTitle>
          </div>
          <CardDescription>
            Selecciona qué tipos de eventos mostrar por defecto
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {SOURCE_TYPE_OPTIONS.map((option) => (
              <div
                key={option.value}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                  settings.visibleSourceTypes.includes(option.value)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                )}
              >
                <Checkbox
                  id={`source-${option.value}`}
                  checked={settings.visibleSourceTypes.includes(option.value)}
                  onCheckedChange={(checked) =>
                    handleSourceTypeToggle(option.value, checked as boolean)
                  }
                />
                <Label htmlFor={`source-${option.value}`} className="cursor-pointer flex-1">
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sección: Colores */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-pink-500" />
            <CardTitle className="text-lg">Colores por Tipo</CardTitle>
          </div>
          <CardDescription>
            Personaliza los colores para cada tipo de evento
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {SOURCE_TYPE_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-center gap-3">
                <input
                  type="color"
                  value={settings.sourceTypeColors[option.value as keyof typeof settings.sourceTypeColors] || '#3B82F6'}
                  onChange={(e) =>
                    handleColorChange(
                      option.value as keyof typeof settings.sourceTypeColors,
                      e.target.value
                    )
                  }
                  className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
                />
                <Label>{option.label}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sección: Zona Horaria y Notificaciones */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-cyan-500" />
            <CardTitle className="text-lg">Zona Horaria y Recordatorios</CardTitle>
          </div>
          <CardDescription>
            Configura la zona horaria y los recordatorios predeterminados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Zona horaria</Label>
              <Select
                value={settings.timezone}
                onValueChange={(value) => onUpdate({ timezone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultReminder">Recordatorio predeterminado</Label>
              <Select
                value={settings.defaultReminder.toString()}
                onValueChange={(value) => onUpdate({ defaultReminder: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sección: Opciones de Visualización */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-500" />
            <CardTitle className="text-lg">Opciones de Visualización</CardTitle>
          </div>
          <CardDescription>
            Ajusta cómo se muestran los eventos en el calendario
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div>
              <Label htmlFor="showEventTime" className="font-medium">Mostrar hora del evento</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Muestra la hora de inicio en las tarjetas de evento
              </p>
            </div>
            <Switch
              id="showEventTime"
              checked={settings.showEventTime}
              onCheckedChange={(checked) => onUpdate({ showEventTime: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div>
              <Label htmlFor="showEventLocation" className="font-medium">Mostrar ubicación</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Muestra la ubicación en las tarjetas de evento
              </p>
            </div>
            <Switch
              id="showEventLocation"
              checked={settings.showEventLocation}
              onCheckedChange={(checked) => onUpdate({ showEventLocation: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div>
              <Label htmlFor="compactMode" className="font-medium">Modo compacto</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Reduce el tamaño de los eventos para mostrar más información
              </p>
            </div>
            <Switch
              id="compactMode"
              checked={settings.compactMode}
              onCheckedChange={(checked) => onUpdate({ compactMode: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Botones de acción */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg sticky bottom-4">
        <Button
          variant="outline"
          onClick={onReset}
          disabled={isSaving}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Restaurar predeterminados
        </Button>

        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-sm text-orange-600 dark:text-orange-400">
              Hay cambios sin guardar
            </span>
          )}
          <Button
            onClick={onSave}
            disabled={!hasChanges || isSaving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? (
              <>Guardando...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar cambios
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
