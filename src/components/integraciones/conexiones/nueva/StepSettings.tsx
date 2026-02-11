'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Settings, Tag, FileText, ExternalLink, Hash } from 'lucide-react';
import { IntegrationProvider, IntegrationConnector } from '@/lib/services/integrationsService';

interface StepSettingsProps {
  provider: IntegrationProvider | null;
  connector: IntegrationConnector | null;
  connectionName: string;
  settings: Record<string, unknown>;
  organizationDomain?: string;
  onNameChange: (name: string) => void;
  onSettingsChange: (settings: Record<string, unknown>) => void;
}

export function StepSettings({
  provider,
  connector,
  connectionName,
  settings,
  organizationDomain,
  onNameChange,
  onSettingsChange,
}: StepSettingsProps) {
  const handleSettingChange = (key: string, value: unknown) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-600" />
          Configuración de la Conexión
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Configura los ajustes generales y datos de identificación
        </p>
      </div>

      {/* Nombre de la conexión */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="connection_name" className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-gray-500" />
              Nombre de la Conexión *
            </Label>
            <Input
              id="connection_name"
              value={connectionName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={`Ej: ${provider?.name || 'Proveedor'} - ${connector?.name || 'Conector'}`}
              className="max-w-md"
            />
            <p className="text-xs text-gray-500">
              Un nombre descriptivo para identificar esta conexión
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Settings específicos según el proveedor */}
      <Card>
        <CardContent className="p-4 space-y-6">
          <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            Configuración Adicional
          </h4>

          {/* ID Externo / Merchant ID */}
          <div className="space-y-2">
            <Label htmlFor="external_id" className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-500" />
              ID de Comercio / Merchant ID
            </Label>
            <Input
              id="external_id"
              value={(settings.external_id as string) || ''}
              onChange={(e) => handleSettingChange('external_id', e.target.value)}
              placeholder="Ej: merchant_123456"
              className="max-w-md"
            />
            <p className="text-xs text-gray-500">
              Identificador proporcionado por {provider?.name || 'el proveedor'}
            </p>
          </div>

          {/* Store ID / Tienda */}
          <div className="space-y-2">
            <Label htmlFor="store_id" className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-500" />
              ID de Tienda / Store ID (opcional)
            </Label>
            <Input
              id="store_id"
              value={(settings.store_id as string) || ''}
              onChange={(e) => handleSettingChange('store_id', e.target.value)}
              placeholder="Ej: store_001"
              className="max-w-md"
            />
            <p className="text-xs text-gray-500">
              Identificador de tienda si aplica
            </p>
          </div>

          {/* Webhook URL (solo lectura, se genera automáticamente) */}
          {connector?.capabilities?.webhooks && (
            <div className="space-y-2">
              <Label htmlFor="webhook_url" className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-gray-500" />
                URL de Webhook
              </Label>
              <Input
                id="webhook_url"
                value={organizationDomain
                  ? `https://${organizationDomain}/api/webhooks/${connector?.code || 'provider'}`
                  : `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/${connector?.code || 'provider'}`
                }
                readOnly
                className="max-w-lg bg-gray-50 dark:bg-gray-800"
              />
              <p className="text-xs text-gray-500">
                Configura esta URL en el panel de {provider?.name || 'el proveedor'} para recibir notificaciones
              </p>
            </div>
          )}

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              value={(settings.notes as string) || ''}
              onChange={(e) => handleSettingChange('notes', e.target.value)}
              placeholder="Notas o comentarios sobre esta conexión..."
              rows={3}
              className="max-w-lg"
            />
          </div>
        </CardContent>
      </Card>

      {/* Opciones de sincronización */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-white">
            Opciones de Sincronización
          </h4>

          <div className="space-y-4">
            {/* Auto-sync */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto_sync">Sincronización automática</Label>
                <p className="text-xs text-gray-500">
                  Sincronizar datos automáticamente según programación
                </p>
              </div>
              <Switch
                id="auto_sync"
                checked={(settings.auto_sync as boolean) ?? true}
                onCheckedChange={(checked) => handleSettingChange('auto_sync', checked)}
              />
            </div>

            {/* Notificaciones */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notifications">Notificaciones de errores</Label>
                <p className="text-xs text-gray-500">
                  Recibir alertas cuando ocurran errores de conexión
                </p>
              </div>
              <Switch
                id="notifications"
                checked={(settings.error_notifications as boolean) ?? true}
                onCheckedChange={(checked) => handleSettingChange('error_notifications', checked)}
              />
            </div>

            {/* Logs detallados */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="verbose_logs">Logs detallados</Label>
                <p className="text-xs text-gray-500">
                  Registrar eventos detallados para depuración
                </p>
              </div>
              <Switch
                id="verbose_logs"
                checked={(settings.verbose_logs as boolean) ?? false}
                onCheckedChange={(checked) => handleSettingChange('verbose_logs', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
