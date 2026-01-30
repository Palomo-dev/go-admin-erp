'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquare, Globe, Clock, Target } from 'lucide-react';
import { TONE_OPTIONS, LANGUAGE_OPTIONS } from '@/lib/services/aiSettingsService';

interface BehaviorSettingsProps {
  tone: string;
  language: string;
  systemRules: string;
  fallbackMessage: string;
  autoResponseEnabled: boolean;
  autoResponseDelay: number;
  confidenceThreshold: number;
  onToneChange: (tone: string) => void;
  onLanguageChange: (language: string) => void;
  onSystemRulesChange: (rules: string) => void;
  onFallbackChange: (message: string) => void;
  onAutoResponseChange: (enabled: boolean) => void;
  onDelayChange: (delay: number) => void;
  onConfidenceChange: (threshold: number) => void;
}

export default function BehaviorSettings({
  tone,
  language,
  systemRules,
  fallbackMessage,
  autoResponseEnabled,
  autoResponseDelay,
  confidenceThreshold,
  onToneChange,
  onLanguageChange,
  onSystemRulesChange,
  onFallbackChange,
  onAutoResponseChange,
  onDelayChange,
  onConfidenceChange
}: BehaviorSettingsProps) {
  return (
    <div className="space-y-6">
      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Tono y Lenguaje
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Tono de Comunicación</Label>
              <Select value={tone} onValueChange={onToneChange}>
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
              <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Idioma
              </Label>
              <Select value={language} onValueChange={onLanguageChange}>
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

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Reglas del Sistema (Instrucciones para la IA)
            </Label>
            <Textarea
              value={systemRules}
              onChange={(e) => onSystemRulesChange(e.target.value)}
              placeholder="Eres un asistente de atención al cliente. No inventes información. Si no sabes algo, indica que un agente humano ayudará..."
              rows={6}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 resize-none"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Define el comportamiento, restricciones y personalidad de la IA
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">
              Mensaje de Fallback
            </Label>
            <Textarea
              value={fallbackMessage}
              onChange={(e) => onFallbackChange(e.target.value)}
              placeholder="Lo siento, no puedo ayudarte con eso. Un agente humano te atenderá pronto."
              rows={3}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 resize-none"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Mensaje cuando la IA no puede responder o la confianza es baja
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Respuestas Automáticas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Respuestas Automáticas</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                La IA responde automáticamente a los mensajes entrantes
              </p>
            </div>
            <Switch
              checked={autoResponseEnabled}
              onCheckedChange={onAutoResponseChange}
            />
          </div>

          {autoResponseEnabled && (
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Retraso antes de responder (segundos)
              </Label>
              <Input
                type="number"
                value={autoResponseDelay}
                onChange={(e) => onDelayChange(parseInt(e.target.value) || 5)}
                min={0}
                max={60}
                className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 max-w-[200px]"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Espera antes de que la IA responda (0-60 segundos)
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Umbral de Confianza
              </Label>
              <span className="text-sm font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                {(confidenceThreshold * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              value={[confidenceThreshold]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={(value) => onConfidenceChange(value[0])}
              className="w-full"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Si la confianza está por debajo de este umbral, se usa el mensaje de fallback
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
