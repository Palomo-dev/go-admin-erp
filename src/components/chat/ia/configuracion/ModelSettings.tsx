'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Cpu, Thermometer, Hash, FileText } from 'lucide-react';
import { AI_PROVIDERS } from '@/lib/services/aiSettingsService';

interface ModelSettingsProps {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  maxFragmentsContext: number;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onTemperatureChange: (temperature: number) => void;
  onMaxTokensChange: (maxTokens: number) => void;
  onMaxFragmentsChange: (maxFragments: number) => void;
}

export default function ModelSettings({
  provider,
  model,
  temperature,
  maxTokens,
  maxFragmentsContext,
  onProviderChange,
  onModelChange,
  onTemperatureChange,
  onMaxTokensChange,
  onMaxFragmentsChange
}: ModelSettingsProps) {
  const selectedProvider = AI_PROVIDERS.find(p => p.value === provider);
  const availableModels = selectedProvider?.models || [];

  const handleProviderChange = (newProvider: string) => {
    onProviderChange(newProvider);
    const newProviderData = AI_PROVIDERS.find(p => p.value === newProvider);
    if (newProviderData && newProviderData.models.length > 0) {
      onModelChange(newProviderData.models[0].value);
    }
  };

  const getCostBadgeColor = (cost: string) => {
    switch (cost) {
      case 'muy bajo': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'bajo': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'medio': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'alto': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'muy alto': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Modelo de IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Proveedor</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Modelo</Label>
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center justify-between gap-3">
                      <span>{m.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${getCostBadgeColor(m.cost)}`}>
                        {m.cost}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Thermometer className="h-4 w-4" />
                Temperatura
              </Label>
              <span className="text-sm font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                {temperature.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[temperature]}
              min={0}
              max={1}
              step={0.1}
              onValueChange={(value) => onTemperatureChange(value[0])}
              className="w-full"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Valores bajos = respuestas más precisas. Valores altos = respuestas más creativas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Máximo de Tokens
              </Label>
              <Input
                type="number"
                value={maxTokens}
                onChange={(e) => onMaxTokensChange(parseInt(e.target.value) || 500)}
                min={100}
                max={4000}
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Longitud máxima de las respuestas (100-4000)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Fragmentos de Contexto
              </Label>
              <Input
                type="number"
                value={maxFragmentsContext}
                onChange={(e) => onMaxFragmentsChange(parseInt(e.target.value) || 5)}
                min={1}
                max={20}
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Fragmentos de conocimiento a usar (1-20)
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
