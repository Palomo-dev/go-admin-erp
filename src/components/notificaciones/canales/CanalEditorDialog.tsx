'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, Plus, X, Settings } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { NotificationChannel, ChannelFormData } from './types';

interface CanalEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: NotificationChannel | null;
  onSave: (data: ChannelFormData, id?: string) => Promise<boolean>;
}

export function CanalEditorDialog({ open, onOpenChange, channel, onSave }: CanalEditorDialogProps) {
  const [providerName, setProviderName] = useState('');
  const [configEntries, setConfigEntries] = useState<{ key: string; value: string }[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (channel) {
      setProviderName(channel.provider_name);
      setConfigEntries(
        Object.entries(channel.config_json || {}).map(([key, value]) => ({ key, value: String(value) }))
      );
      setIsActive(channel.is_active);
    } else {
      setProviderName('');
      setConfigEntries([]);
      setIsActive(true);
    }
    setNewKey('');
  }, [channel, open]);

  const addConfigEntry = () => {
    const k = newKey.trim();
    if (k && !configEntries.find((e) => e.key === k)) {
      setConfigEntries([...configEntries, { key: k, value: '' }]);
      setNewKey('');
    }
  };

  const removeConfigEntry = (key: string) => {
    setConfigEntries(configEntries.filter((e) => e.key !== key));
  };

  const updateConfigValue = (key: string, value: string) => {
    setConfigEntries(configEntries.map((e) => (e.key === key ? { ...e, value } : e)));
  };

  const handleSave = async () => {
    if (!channel) return;
    setIsSaving(true);

    const configJson: Record<string, any> = {};
    configEntries.forEach((e) => {
      if (e.key.trim()) configJson[e.key.trim()] = e.value;
    });

    const data: ChannelFormData = {
      code: channel.code,
      provider_name: providerName.trim() || channel.provider_name,
      config_json: configJson,
      is_active: isActive,
      connection_id: channel.connection_id,
    };

    const ok = await onSave(data, channel.id);
    setIsSaving(false);
    if (ok) onOpenChange(false);
  };

  if (!channel) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-500" />
            Configuración del Canal
          </DialogTitle>
          <DialogDescription>
            Ajustes de notificación para <strong>{channel.code}</strong>. Las credenciales del proveedor se gestionan desde Integraciones.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nombre y estado */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Nombre del canal</Label>
              <Input
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="ej: Email (SendGrid)"
                className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Estado</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsActive(!isActive)}
                className={cn('w-full h-9', isActive ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400' : 'border-gray-300 text-gray-500')}
              >
                {isActive ? 'Activo' : 'Inactivo'}
              </Button>
            </div>
          </div>

          {/* Integración vinculada (solo lectura) */}
          {channel.linked_connection && (
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Integración vinculada</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{channel.linked_connection.name}</p>
              <p className="text-xs text-gray-500">{channel.linked_connection.provider_name} · {channel.linked_connection.status}</p>
            </div>
          )}

          <Separator />

          {/* Config de notificaciones (no credenciales) */}
          <div className="space-y-2">
            <Label className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <Settings className="h-3.5 w-3.5" /> Ajustes de notificación
            </Label>
            <p className="text-[10px] text-gray-400">
              Configuración específica del canal: rate limits, remitente por defecto, etc.
            </p>

            {configEntries.map((entry) => (
              <div key={entry.key} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-32 flex-shrink-0 truncate font-mono">
                  {entry.key}
                </span>
                <Input
                  value={entry.value}
                  onChange={(e) => updateConfigValue(entry.key, e.target.value)}
                  placeholder={`Valor de ${entry.key}`}
                  className="flex-1 text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 font-mono"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeConfigEntry(entry.key)}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 flex-shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            <div className="flex gap-2">
              <Input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="nueva_clave (ej: max_per_day)"
                className="text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 font-mono"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addConfigEntry(); } }}
              />
              <Button variant="outline" size="sm" onClick={addConfigEntry} disabled={!newKey.trim()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
