'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Shield, Eye, EyeOff, User } from 'lucide-react';
import type { TimelineSettings } from '@/lib/services/timelineSettingsService';

interface PrivacySettingsProps {
  settings: TimelineSettings;
  onChange: (key: keyof TimelineSettings, value: boolean) => void;
}

export function PrivacySettings({ settings, onChange }: PrivacySettingsProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          Privacidad y Seguridad
        </CardTitle>
        <CardDescription>
          Controla qué información se muestra en el timeline de auditoría.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mostrar payload completo */}
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Eye className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="showFullPayload" className="text-sm font-medium cursor-pointer">
                Mostrar payload completo
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Permite ver todos los datos en el detalle de cada evento, incluyendo campos JSON.
              </p>
            </div>
          </div>
          <Switch
            id="showFullPayload"
            checked={settings.showFullPayload}
            onCheckedChange={(checked) => onChange('showFullPayload', checked)}
          />
        </div>

        {/* Ocultar datos sensibles */}
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <EyeOff className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="hideSensitiveData" className="text-sm font-medium cursor-pointer">
                Ocultar datos sensibles
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Enmascara automáticamente campos como contraseñas, tokens, tarjetas de crédito, etc.
              </p>
            </div>
          </div>
          <Switch
            id="hideSensitiveData"
            checked={settings.hideSensitiveData}
            onCheckedChange={(checked) => onChange('hideSensitiveData', checked)}
          />
        </div>

        {/* Enmascarar nombres de actores */}
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="maskActorNames" className="text-sm font-medium cursor-pointer">
                Enmascarar nombres de usuarios
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Muestra solo iniciales o IDs en lugar de nombres completos de los actores.
              </p>
            </div>
          </div>
          <Switch
            id="maskActorNames"
            checked={settings.maskActorNames}
            onCheckedChange={(checked) => onChange('maskActorNames', checked)}
          />
        </div>

        {/* Nota informativa */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <strong>Nota:</strong> Estas configuraciones afectan la visualización para todos los usuarios 
            de la organización. Los datos originales siempre se mantienen en la base de datos.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
