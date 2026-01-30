'use client';

import React, { useState } from 'react';
import { Palette, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChannelWebsiteSettings } from '@/lib/services/chatChannelsService';

interface BrandingSectionProps {
  brandConfig: ChannelWebsiteSettings['brand_config'];
  welcomeMessage: string;
  onUpdateBranding: (config: ChannelWebsiteSettings['brand_config']) => Promise<void>;
  onUpdateWelcomeMessage: (message: string) => Promise<void>;
}

const colorPresets = [
  { name: 'Azul', value: '#3B82F6' },
  { name: 'Verde', value: '#10B981' },
  { name: 'Violeta', value: '#8B5CF6' },
  { name: 'Rosa', value: '#EC4899' },
  { name: 'Naranja', value: '#F97316' },
  { name: 'Rojo', value: '#EF4444' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Negro', value: '#1F2937' },
];

export default function BrandingSection({
  brandConfig,
  welcomeMessage,
  onUpdateBranding,
  onUpdateWelcomeMessage
}: BrandingSectionProps) {
  const [localConfig, setLocalConfig] = useState(brandConfig);
  const [localWelcome, setLocalWelcome] = useState(welcomeMessage);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasChanges = 
    localConfig.primary_color !== brandConfig.primary_color ||
    localConfig.position !== brandConfig.position ||
    localConfig.logo_url !== brandConfig.logo_url ||
    localWelcome !== welcomeMessage;

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      if (localConfig.primary_color !== brandConfig.primary_color ||
          localConfig.position !== brandConfig.position ||
          localConfig.logo_url !== brandConfig.logo_url) {
        await onUpdateBranding(localConfig);
      }
      
      if (localWelcome !== welcomeMessage) {
        await onUpdateWelcomeMessage(localWelcome);
      }
      
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
          <Palette className="h-5 w-5 text-blue-600" />
          Apariencia del Widget
        </CardTitle>
        <CardDescription>
          Personaliza los colores, posición y mensajes del widget
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Primary Color */}
        <div className="space-y-2">
          <Label>Color Principal</Label>
          <div className="flex gap-2 flex-wrap">
            {colorPresets.map((color) => (
              <button
                key={color.value}
                onClick={() => setLocalConfig({ ...localConfig, primary_color: color.value })}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  localConfig.primary_color === color.value
                    ? 'border-gray-900 dark:border-white scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={localConfig.primary_color || '#3B82F6'}
                onChange={(e) => setLocalConfig({ ...localConfig, primary_color: e.target.value })}
                className="w-8 h-8 p-0 border-0 cursor-pointer"
              />
              <Input
                value={localConfig.primary_color || '#3B82F6'}
                onChange={(e) => setLocalConfig({ ...localConfig, primary_color: e.target.value })}
                className="w-24 font-mono text-xs"
                placeholder="#3B82F6"
              />
            </div>
          </div>
        </div>

        {/* Position */}
        <div className="space-y-2">
          <Label>Posición del Widget</Label>
          <Select
            value={`${localConfig.position?.vertical || 'bottom'}-${localConfig.position?.side || 'right'}`}
            onValueChange={(value: string) => {
              const [vertical, side] = value.split('-') as ['bottom' | 'top', 'right' | 'left'];
              setLocalConfig({ 
                ...localConfig, 
                position: { 
                  ...localConfig.position,
                  vertical, 
                  side,
                  offsetX: localConfig.position?.offsetX || 20,
                  offsetY: localConfig.position?.offsetY || 20
                } 
              });
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom-right">Abajo Derecha</SelectItem>
              <SelectItem value="bottom-left">Abajo Izquierda</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Logo URL */}
        <div className="space-y-2">
          <Label>URL del Logo (opcional)</Label>
          <div className="flex gap-2">
            <Input
              value={localConfig.logo_url || ''}
              onChange={(e) => setLocalConfig({ ...localConfig, logo_url: e.target.value })}
              placeholder="https://ejemplo.com/logo.png"
              className="flex-1"
            />
            {localConfig.logo_url && (
              <div className="w-10 h-10 rounded border dark:border-gray-600 overflow-hidden">
                <img
                  src={localConfig.logo_url}
                  alt="Logo preview"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Welcome Message */}
        <div className="space-y-2">
          <Label>Mensaje de Bienvenida</Label>
          <Input
            value={localWelcome}
            onChange={(e) => setLocalWelcome(e.target.value)}
            placeholder="¡Hola! ¿En qué podemos ayudarte?"
          />
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-100 dark:bg-gray-900 rounded-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Vista previa:</p>
          <div 
            className={`flex ${localConfig.position?.side === 'left' ? 'justify-start' : 'justify-end'}`}
          >
            <div className="w-64 rounded-lg shadow-lg overflow-hidden border dark:border-gray-700">
              <div 
                className="p-3 text-white text-sm"
                style={{ backgroundColor: localConfig.primary_color || '#3B82F6' }}
              >
                <div className="flex items-center gap-2">
                  {localConfig.logo_url ? (
                    <img 
                      src={localConfig.logo_url} 
                      alt="Logo" 
                      className="w-6 h-6 rounded-full object-cover bg-white"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-white/20" />
                  )}
                  <span className="font-medium">Chat</span>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-3">
                <div 
                  className="text-sm p-2 rounded-lg max-w-[80%]"
                  style={{ backgroundColor: `${localConfig.primary_color}20` }}
                >
                  {localWelcome || '¡Hola! ¿En qué podemos ayudarte?'}
                </div>
              </div>
            </div>
          </div>
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
