'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sparkles, Wrench } from 'lucide-react';
import type { PMSSettings } from '@/lib/services/pmsSettingsService';

interface OperationsSettingsProps {
  settings: PMSSettings;
  onChange: (key: keyof PMSSettings, value: any) => void;
}

export function OperationsSettings({ settings, onChange }: OperationsSettingsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wrench className="h-5 w-5 text-orange-600" />
          Operaciones
        </CardTitle>
        <CardDescription>
          Configuración de housekeeping y mantenimiento
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Asignación automática de limpieza
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Crear tareas de limpieza automáticamente al hacer check-out
            </p>
          </div>
          <Switch
            checked={settings.housekeepingAutoAssign}
            onCheckedChange={(checked) => onChange('housekeepingAutoAssign', checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
