'use client';

import React from 'react';
import {
  Clock,
  Database,
  Gauge,
  Bell,
  ToggleLeft,
  Save,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { IntegrationSettings } from '@/lib/services/integrationsService';

interface SettingsFormProps {
  settings: IntegrationSettings;
  onChange: (settings: IntegrationSettings) => void;
  onSave: () => void;
  saving?: boolean;
  hasChanges?: boolean;
}

export function SettingsForm({
  settings,
  onChange,
  onSave,
  saving = false,
  hasChanges = false,
}: SettingsFormProps) {
  const updateRetention = (key: keyof IntegrationSettings['retention'], value: number) => {
    onChange({
      ...settings,
      retention: { ...settings.retention, [key]: value },
    });
  };

  const updateLimits = (key: keyof IntegrationSettings['limits'], value: number) => {
    onChange({
      ...settings,
      limits: { ...settings.limits, [key]: value },
    });
  };

  const updateDefaults = (key: keyof IntegrationSettings['defaults'], value: number) => {
    onChange({
      ...settings,
      defaults: { ...settings.defaults, [key]: value },
    });
  };

  const updateNotifications = (key: keyof IntegrationSettings['notifications'], value: boolean | string) => {
    onChange({
      ...settings,
      notifications: { ...settings.notifications, [key]: value },
    });
  };

  const updateFeatures = (key: keyof IntegrationSettings['features'], value: boolean) => {
    onChange({
      ...settings,
      features: { ...settings.features, [key]: value },
    });
  };

  return (
    <div className="space-y-6">
      {/* Retención */}
      <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Retención de Datos
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Tiempo de almacenamiento de eventos, jobs y logs
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="eventsRetention" className="dark:text-gray-300">
              Eventos (días)
            </Label>
            <Input
              id="eventsRetention"
              type="number"
              min={7}
              max={365}
              value={settings.retention.eventsRetentionDays}
              onChange={(e) => updateRetention('eventsRetentionDays', parseInt(e.target.value) || 90)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jobsRetention" className="dark:text-gray-300">
              Jobs (días)
            </Label>
            <Input
              id="jobsRetention"
              type="number"
              min={7}
              max={90}
              value={settings.retention.jobsRetentionDays}
              onChange={(e) => updateRetention('jobsRetentionDays', parseInt(e.target.value) || 30)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logsRetention" className="dark:text-gray-300">
              Logs (días)
            </Label>
            <Input
              id="logsRetention"
              type="number"
              min={1}
              max={30}
              value={settings.retention.logsRetentionDays}
              onChange={(e) => updateRetention('logsRetentionDays', parseInt(e.target.value) || 14)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Límites */}
      <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <Gauge className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            Límites
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Restricciones de uso del módulo
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="maxConnections" className="dark:text-gray-300">
              Máx. Conexiones
            </Label>
            <Input
              id="maxConnections"
              type="number"
              min={1}
              max={100}
              value={settings.limits.maxConnectionsPerOrg}
              onChange={(e) => updateLimits('maxConnectionsPerOrg', parseInt(e.target.value) || 50)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxWebhooks" className="dark:text-gray-300">
              Máx. Webhooks
            </Label>
            <Input
              id="maxWebhooks"
              type="number"
              min={1}
              max={50}
              value={settings.limits.maxWebhooksPerOrg}
              onChange={(e) => updateLimits('maxWebhooksPerOrg', parseInt(e.target.value) || 20)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxApiKeys" className="dark:text-gray-300">
              Máx. API Keys
            </Label>
            <Input
              id="maxApiKeys"
              type="number"
              min={1}
              max={20}
              value={settings.limits.maxApiKeysPerOrg}
              onChange={(e) => updateLimits('maxApiKeysPerOrg', parseInt(e.target.value) || 10)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxJobsConcurrent" className="dark:text-gray-300">
              Jobs Concurrentes
            </Label>
            <Input
              id="maxJobsConcurrent"
              type="number"
              min={1}
              max={20}
              value={settings.limits.maxJobsConcurrent}
              onChange={(e) => updateLimits('maxJobsConcurrent', parseInt(e.target.value) || 5)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rateLimit" className="dark:text-gray-300">
              Rate Limit (req/min)
            </Label>
            <Input
              id="rateLimit"
              type="number"
              min={10}
              max={1000}
              value={settings.limits.rateLimitPerMinute}
              onChange={(e) => updateLimits('rateLimitPerMinute', parseInt(e.target.value) || 100)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Defaults de Sincronización */}
      <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
            Valores por Defecto
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Configuración predeterminada para sincronización
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="syncInterval" className="dark:text-gray-300">
              Intervalo Sync (min)
            </Label>
            <Input
              id="syncInterval"
              type="number"
              min={5}
              max={1440}
              value={settings.defaults.syncIntervalMinutes}
              onChange={(e) => updateDefaults('syncIntervalMinutes', parseInt(e.target.value) || 15)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retryAttempts" className="dark:text-gray-300">
              Reintentos
            </Label>
            <Input
              id="retryAttempts"
              type="number"
              min={0}
              max={10}
              value={settings.defaults.retryAttempts}
              onChange={(e) => updateDefaults('retryAttempts', parseInt(e.target.value) || 3)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retryDelay" className="dark:text-gray-300">
              Delay Reintento (seg)
            </Label>
            <Input
              id="retryDelay"
              type="number"
              min={10}
              max={600}
              value={settings.defaults.retryDelaySeconds}
              onChange={(e) => updateDefaults('retryDelaySeconds', parseInt(e.target.value) || 60)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timeout" className="dark:text-gray-300">
              Timeout (seg)
            </Label>
            <Input
              id="timeout"
              type="number"
              min={5}
              max={120}
              value={settings.defaults.timeoutSeconds}
              onChange={(e) => updateDefaults('timeoutSeconds', parseInt(e.target.value) || 30)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notificaciones */}
      <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Notificaciones
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Alertas y notificaciones del módulo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Email en error de conexión</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Recibir email cuando una conexión falle
              </p>
            </div>
            <Switch
              checked={settings.notifications.emailOnConnectionError}
              onCheckedChange={(checked) => updateNotifications('emailOnConnectionError', checked)}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Email en job fallido</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Recibir email cuando un job falle
              </p>
            </div>
            <Switch
              checked={settings.notifications.emailOnJobFailure}
              onCheckedChange={(checked) => updateNotifications('emailOnJobFailure', checked)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slackWebhook" className="dark:text-gray-300">
              Slack Webhook URL (opcional)
            </Label>
            <Input
              id="slackWebhook"
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={settings.notifications.slackWebhookUrl}
              onChange={(e) => updateNotifications('slackWebhookUrl', e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <ToggleLeft className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            Funcionalidades
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Habilitar o deshabilitar características del módulo
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Auto-sincronización</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Sincronizar automáticamente</p>
            </div>
            <Switch
              checked={settings.features.enableAutoSync}
              onCheckedChange={(checked) => updateFeatures('enableAutoSync', checked)}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Webhooks Salientes</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Enviar eventos a terceros</p>
            </div>
            <Switch
              checked={settings.features.enableWebhooks}
              onCheckedChange={(checked) => updateFeatures('enableWebhooks', checked)}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">API Keys</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Permitir acceso programático</p>
            </div>
            <Switch
              checked={settings.features.enableApiKeys}
              onCheckedChange={(checked) => updateFeatures('enableApiKeys', checked)}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Mapeos de Objetos</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Relaciones ID externo/interno</p>
            </div>
            <Switch
              checked={settings.features.enableMappings}
              onCheckedChange={(checked) => updateFeatures('enableMappings', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Botón Guardar */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button
            onClick={onSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default SettingsForm;
