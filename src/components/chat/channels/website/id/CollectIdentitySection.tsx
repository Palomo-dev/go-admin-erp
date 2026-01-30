'use client';

import React, { useState } from 'react';
import { UserCircle, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ChannelWebsiteSettings } from '@/lib/services/chatChannelsService';

interface CollectIdentitySectionProps {
  collectIdentity: ChannelWebsiteSettings['collect_identity'];
  onUpdate: (config: ChannelWebsiteSettings['collect_identity']) => Promise<void>;
}

export default function CollectIdentitySection({
  collectIdentity,
  onUpdate
}: CollectIdentitySectionProps) {
  const [localConfig, setLocalConfig] = useState(collectIdentity);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasChanges = 
    localConfig.name !== collectIdentity.name ||
    localConfig.email !== collectIdentity.email ||
    localConfig.phone !== collectIdentity.phone;

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onUpdate(localConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserCircle className="h-5 w-5 text-blue-600" />
          Recolección de Datos
        </CardTitle>
        <CardDescription>
          Configura qué información pedir al visitante antes de iniciar el chat
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Name */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Nombre</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Solicitar nombre del visitante
            </p>
          </div>
          <Switch
            checked={localConfig.name}
            onCheckedChange={(checked) => setLocalConfig({ ...localConfig, name: checked })}
          />
        </div>

        {/* Email */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Correo Electrónico</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Solicitar email para seguimiento
            </p>
          </div>
          <Switch
            checked={localConfig.email}
            onCheckedChange={(checked) => setLocalConfig({ ...localConfig, email: checked })}
          />
        </div>

        {/* Phone */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Teléfono</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Solicitar número de teléfono
            </p>
          </div>
          <Switch
            checked={localConfig.phone}
            onCheckedChange={(checked) => setLocalConfig({ ...localConfig, phone: checked })}
          />
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Formulario que verá el visitante:
          </p>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-xs mx-auto shadow-sm border dark:border-gray-700">
            <p className="text-sm font-medium mb-3 text-gray-900 dark:text-white">
              Para comenzar, por favor ingresa tus datos:
            </p>
            <div className="space-y-3">
              {localConfig.name && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Nombre</label>
                  <div className="mt-1 h-8 bg-gray-100 dark:bg-gray-700 rounded border dark:border-gray-600" />
                </div>
              )}
              {localConfig.email && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Email</label>
                  <div className="mt-1 h-8 bg-gray-100 dark:bg-gray-700 rounded border dark:border-gray-600" />
                </div>
              )}
              {localConfig.phone && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Teléfono</label>
                  <div className="mt-1 h-8 bg-gray-100 dark:bg-gray-700 rounded border dark:border-gray-600" />
                </div>
              )}
              {!localConfig.name && !localConfig.email && !localConfig.phone && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                  El chat iniciará sin pedir datos
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
          <p className="font-medium mb-1">ℹ️ Nota</p>
          <p className="text-xs">
            Los datos recolectados se asociarán automáticamente al cliente en el CRM si existe un registro previo con el mismo email o teléfono.
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-2 text-green-500" />
                Guardado
              </>
            ) : (
              'Guardar Cambios'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
