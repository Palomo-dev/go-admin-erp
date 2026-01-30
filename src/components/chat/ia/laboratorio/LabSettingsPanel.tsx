'use client';

import { Settings, Thermometer, Hash, FileText, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AI_PROVIDERS, TONE_OPTIONS, LANGUAGE_OPTIONS } from '@/lib/services/aiSettingsService';
import type { LabSettings, Channel } from '@/lib/services/aiLabService';

interface LabSettingsPanelProps {
  settings: LabSettings;
  channels: Channel[];
  onChange: (settings: LabSettings) => void;
}

export default function LabSettingsPanel({
  settings,
  channels,
  onChange
}: LabSettingsPanelProps) {
  const selectedProvider = AI_PROVIDERS.find(p => p.value === 'openai');
  const availableModels = selectedProvider?.models || [];

  const updateSetting = <K extends keyof LabSettings>(key: K, value: LabSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Settings className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Configuración de Prueba
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300 text-sm">Modelo</Label>
            <Select value={settings.model} onValueChange={(v) => updateSetting('model', v)}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300 text-sm">Simular Canal</Label>
            <Select 
              value={settings.simulatedChannel} 
              onValueChange={(v) => updateSetting('simulatedChannel', v)}
            >
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue placeholder="Seleccionar canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="webchat">Web Chat</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.name} ({ch.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300 text-sm">Tono</Label>
            <Select value={settings.tone} onValueChange={(v) => updateSetting('tone', v)}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300 text-sm">Idioma</Label>
            <Select value={settings.language} onValueChange={(v) => updateSetting('language', v)}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-gray-700 dark:text-gray-300 text-sm flex items-center gap-2">
              <Thermometer className="h-4 w-4" />
              Temperatura
            </Label>
            <span className="text-sm font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              {settings.temperature.toFixed(2)}
            </span>
          </div>
          <Slider
            value={[settings.temperature]}
            min={0}
            max={1}
            step={0.1}
            onValueChange={(value) => updateSetting('temperature', value[0])}
            className="w-full"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300 text-sm flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Máx. Tokens
            </Label>
            <Input
              type="number"
              value={settings.maxTokens}
              onChange={(e) => updateSetting('maxTokens', parseInt(e.target.value) || 500)}
              min={100}
              max={4000}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300 text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Máx. Fragmentos
            </Label>
            <Input
              type="number"
              value={settings.maxFragments}
              onChange={(e) => updateSetting('maxFragments', parseInt(e.target.value) || 5)}
              min={1}
              max={20}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-gray-700 dark:text-gray-300 text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Reglas del Sistema (Prompt)
          </Label>
          <Textarea
            value={settings.systemRules}
            onChange={(e) => updateSetting('systemRules', e.target.value)}
            placeholder="Instrucciones adicionales para la IA..."
            className="min-h-[80px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 resize-none text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}
