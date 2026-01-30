'use client';

import React, { useState, useEffect } from 'react';
import { Paintbrush, Loader2, Check, MessageCircle, MessageSquare, Headphones, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { WidgetStyle } from '@/lib/services/chatChannelsService';

interface WidgetStyleSectionProps {
  style: WidgetStyle;
  onUpdate: (style: WidgetStyle) => Promise<void>;
}

const defaultStyle: WidgetStyle = {
  primaryColor: '#3B82F6',
  iconColor: '#FFFFFF',
  iconType: 'chat',
  buttonSize: 56,
  borderRadius: 28,
  borderWidth: 0,
  borderColor: '#FFFFFF',
  shadowEnabled: true,
  shadowStrength: 'medium'
};

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

const iconOptions = [
  { type: 'chat' as const, label: 'Chat', icon: MessageCircle },
  { type: 'message' as const, label: 'Mensaje', icon: MessageSquare },
  { type: 'support' as const, label: 'Soporte', icon: Headphones },
  { type: 'whatsapp' as const, label: 'WhatsApp Style', icon: HelpCircle },
];

export default function WidgetStyleSection({
  style,
  onUpdate
}: WidgetStyleSectionProps) {
  const [localStyle, setLocalStyle] = useState<WidgetStyle>({
    ...defaultStyle,
    ...style
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalStyle({ ...defaultStyle, ...style });
  }, [style]);

  const hasChanges = JSON.stringify(localStyle) !== JSON.stringify({ ...defaultStyle, ...style });

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await onUpdate(localStyle);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const getShadowStyle = () => {
    if (!localStyle.shadowEnabled) return 'none';
    switch (localStyle.shadowStrength) {
      case 'light': return '0 2px 8px rgba(0,0,0,0.15)';
      case 'medium': return '0 4px 16px rgba(0,0,0,0.2)';
      case 'strong': return '0 8px 32px rgba(0,0,0,0.3)';
      default: return '0 4px 16px rgba(0,0,0,0.2)';
    }
  };

  const IconComponent = iconOptions.find(i => i.type === localStyle.iconType)?.icon || MessageCircle;

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Paintbrush className="h-5 w-5 text-blue-600" />
          Estilo Visual
        </CardTitle>
        <CardDescription>
          Personaliza la apariencia del botón y colores del widget
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Color Principal */}
        <div className="space-y-2">
          <Label>Color Principal (Botón y Header)</Label>
          <div className="flex gap-2 flex-wrap">
            {colorPresets.map((color) => (
              <button
                key={color.value}
                onClick={() => setLocalStyle({ ...localStyle, primaryColor: color.value })}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  localStyle.primaryColor === color.value
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
                value={localStyle.primaryColor}
                onChange={(e) => setLocalStyle({ ...localStyle, primaryColor: e.target.value })}
                className="w-8 h-8 p-0 border-0 cursor-pointer"
              />
              <Input
                value={localStyle.primaryColor}
                onChange={(e) => setLocalStyle({ ...localStyle, primaryColor: e.target.value })}
                className="w-24 font-mono text-xs"
                placeholder="#3B82F6"
              />
            </div>
          </div>
        </div>

        {/* Color del Ícono */}
        <div className="space-y-2">
          <Label>Color del Ícono</Label>
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={localStyle.iconColor}
              onChange={(e) => setLocalStyle({ ...localStyle, iconColor: e.target.value })}
              className="w-10 h-10 p-0 border-0 cursor-pointer"
            />
            <Input
              value={localStyle.iconColor}
              onChange={(e) => setLocalStyle({ ...localStyle, iconColor: e.target.value })}
              className="w-24 font-mono text-xs"
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocalStyle({ ...localStyle, iconColor: '#FFFFFF' })}
            >
              Blanco
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocalStyle({ ...localStyle, iconColor: '#000000' })}
            >
              Negro
            </Button>
          </div>
        </div>

        {/* Tipo de Ícono */}
        <div className="space-y-2">
          <Label>Ícono del Botón</Label>
          <div className="grid grid-cols-4 gap-2">
            {iconOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.type}
                  onClick={() => setLocalStyle({ ...localStyle, iconType: option.type })}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                    localStyle.iconType === option.type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs">{option.label}</span>
                </button>
              );
            })}
          </div>
          {localStyle.iconType === 'custom' && (
            <Input
              value={localStyle.iconUrl || ''}
              onChange={(e) => setLocalStyle({ ...localStyle, iconUrl: e.target.value })}
              placeholder="URL del ícono SVG personalizado"
              className="mt-2"
            />
          )}
        </div>

        {/* Tamaño del Botón */}
        <div className="space-y-2">
          <Label>Tamaño del Botón: {localStyle.buttonSize}px</Label>
          <Slider
            value={[localStyle.buttonSize]}
            onValueChange={(value) => setLocalStyle({ ...localStyle, buttonSize: value[0] })}
            min={40}
            max={80}
            step={4}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Pequeño (40px)</span>
            <span>Grande (80px)</span>
          </div>
        </div>

        {/* Bordes */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Radio de Borde: {localStyle.borderRadius}px</Label>
            <Slider
              value={[localStyle.borderRadius]}
              onValueChange={(value) => setLocalStyle({ ...localStyle, borderRadius: value[0] })}
              min={0}
              max={40}
              step={2}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label>Grosor de Borde: {localStyle.borderWidth}px</Label>
            <Slider
              value={[localStyle.borderWidth]}
              onValueChange={(value) => setLocalStyle({ ...localStyle, borderWidth: value[0] })}
              min={0}
              max={4}
              step={1}
              className="w-full"
            />
          </div>
        </div>

        {localStyle.borderWidth > 0 && (
          <div className="space-y-2">
            <Label>Color del Borde</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={localStyle.borderColor}
                onChange={(e) => setLocalStyle({ ...localStyle, borderColor: e.target.value })}
                className="w-10 h-10 p-0 border-0 cursor-pointer"
              />
              <Input
                value={localStyle.borderColor}
                onChange={(e) => setLocalStyle({ ...localStyle, borderColor: e.target.value })}
                className="w-24 font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Sombra */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Sombra</Label>
            <Switch
              checked={localStyle.shadowEnabled}
              onCheckedChange={(checked) => setLocalStyle({ ...localStyle, shadowEnabled: checked })}
            />
          </div>
          {localStyle.shadowEnabled && (
            <Select
              value={localStyle.shadowStrength}
              onValueChange={(value: 'light' | 'medium' | 'strong') => 
                setLocalStyle({ ...localStyle, shadowStrength: value })
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Suave</SelectItem>
                <SelectItem value="medium">Media</SelectItem>
                <SelectItem value="strong">Fuerte</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Preview del Botón */}
        <div className="p-6 bg-gray-100 dark:bg-gray-900 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Vista previa del botón:</p>
            <button
              className="transition-all flex items-center justify-center"
              style={{
                width: `${localStyle.buttonSize}px`,
                height: `${localStyle.buttonSize}px`,
                backgroundColor: localStyle.primaryColor,
                borderRadius: `${localStyle.borderRadius}px`,
                border: localStyle.borderWidth > 0 ? `${localStyle.borderWidth}px solid ${localStyle.borderColor}` : 'none',
                boxShadow: getShadowStyle(),
                color: localStyle.iconColor
              }}
            >
              <IconComponent style={{ width: localStyle.buttonSize * 0.4, height: localStyle.buttonSize * 0.4 }} />
            </button>
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
              'Guardar Estilo'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
