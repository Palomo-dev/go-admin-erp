'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Zap, Calendar, Download, RefreshCw, LayoutList, Link2 } from 'lucide-react';
import type { TimelineSettings } from '@/lib/services/timelineSettingsService';

interface PerformanceSettingsProps {
  settings: TimelineSettings;
  onChange: (key: keyof TimelineSettings, value: number | boolean) => void;
}

export function PerformanceSettings({ settings, onChange }: PerformanceSettingsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-500" />
          Rendimiento y UI
        </CardTitle>
        <CardDescription>
          Optimiza el rendimiento y personaliza la experiencia de usuario.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Rango de fechas por defecto */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium">
                Rango de fechas por defecto
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Número de días que se cargan inicialmente al abrir el timeline.
              </p>
              <Select
                value={String(settings.defaultDateRangeDays)}
                onValueChange={(value) => onChange('defaultDateRangeDays', parseInt(value))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Hoy (1 día)</SelectItem>
                  <SelectItem value="7">Última semana (7 días)</SelectItem>
                  <SelectItem value="14">Últimas 2 semanas</SelectItem>
                  <SelectItem value="30">Último mes (30 días)</SelectItem>
                  <SelectItem value="90">Últimos 3 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Límite de exportación */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Download className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1 space-y-2">
              <Label htmlFor="maxExportRecords" className="text-sm font-medium">
                Límite de exportación
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Número máximo de registros permitidos por exportación.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  id="maxExportRecords"
                  type="number"
                  min={100}
                  max={100000}
                  step={1000}
                  value={settings.maxExportRecords}
                  onChange={(e) => onChange('maxExportRecords', parseInt(e.target.value) || 10000)}
                  className="w-32"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">registros</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tamaño de página */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <LayoutList className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium">
                Eventos por página
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cantidad de eventos a cargar por página en el timeline.
              </p>
              <Select
                value={String(settings.defaultPageSize)}
                onValueChange={(value) => onChange('defaultPageSize', parseInt(value))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 eventos</SelectItem>
                  <SelectItem value="50">50 eventos</SelectItem>
                  <SelectItem value="100">100 eventos</SelectItem>
                  <SelectItem value="200">200 eventos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Actualizaciones en tiempo real */}
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <RefreshCw className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="enableRealTimeUpdates" className="text-sm font-medium cursor-pointer">
                Actualizaciones en tiempo real
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Recibe nuevos eventos automáticamente sin refrescar la página.
              </p>
            </div>
          </div>
          <Switch
            id="enableRealTimeUpdates"
            checked={settings.enableRealTimeUpdates}
            onCheckedChange={(checked) => onChange('enableRealTimeUpdates', checked)}
          />
        </div>

        {/* Vista compacta */}
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <LayoutList className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="compactView" className="text-sm font-medium cursor-pointer">
                Vista compacta
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Reduce el espacio entre eventos para mostrar más información.
              </p>
            </div>
          </div>
          <Switch
            id="compactView"
            checked={settings.compactView}
            onCheckedChange={(checked) => onChange('compactView', checked)}
          />
        </div>

        {/* Mostrar links de correlación */}
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="showCorrelationLinks" className="text-sm font-medium cursor-pointer">
                Mostrar enlaces de correlación
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Muestra botones para ver eventos relacionados por correlation_id.
              </p>
            </div>
          </div>
          <Switch
            id="showCorrelationLinks"
            checked={settings.showCorrelationLinks}
            onCheckedChange={(checked) => onChange('showCorrelationLinks', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
