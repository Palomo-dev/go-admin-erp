'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Clock, Archive, AlertTriangle } from 'lucide-react';
import type { TimelineSettings } from '@/lib/services/timelineSettingsService';

interface RetentionSettingsProps {
  settings: TimelineSettings;
  onChange: (key: keyof TimelineSettings, value: number | boolean) => void;
}

export function RetentionSettings({ settings, onChange }: RetentionSettingsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500" />
          Retención de Datos
        </CardTitle>
        <CardDescription>
          Configuración de retención y archivado de eventos de auditoría.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Días de retención */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1 space-y-2">
              <Label htmlFor="retentionDays" className="text-sm font-medium">
                Período de retención
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Número de días que se mantienen los eventos en el timeline antes de ser archivados.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  id="retentionDays"
                  type="number"
                  min={30}
                  max={3650}
                  value={settings.retentionDays}
                  onChange={(e) => onChange('retentionDays', parseInt(e.target.value) || 365)}
                  className="w-32"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">días</span>
              </div>
              <p className="text-xs text-gray-400">
                {settings.retentionDays >= 365 
                  ? `≈ ${Math.floor(settings.retentionDays / 365)} año(s)` 
                  : `≈ ${Math.floor(settings.retentionDays / 30)} meses`}
              </p>
            </div>
          </div>
        </div>

        {/* Archivar eventos antiguos */}
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Archive className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="archiveOldEvents" className="text-sm font-medium cursor-pointer">
                Archivar eventos antiguos
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Los eventos que excedan el período de retención se mueven a un archivo de solo lectura.
              </p>
            </div>
          </div>
          <Switch
            id="archiveOldEvents"
            checked={settings.archiveOldEvents}
            onCheckedChange={(checked) => onChange('archiveOldEvents', checked)}
          />
        </div>

        {/* Nota informativa */}
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Importante:</strong> La retención de datos de auditoría puede estar sujeta a 
              regulaciones legales. Consulta con tu departamento legal antes de modificar estos valores.
              Los datos nunca se eliminan automáticamente, solo se archivan.
            </div>
          </div>
        </div>

        {/* Estadísticas informativas */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400">Retención actual</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {settings.retentionDays} días
            </p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400">Archivado</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {settings.archiveOldEvents ? 'Activo' : 'Inactivo'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
