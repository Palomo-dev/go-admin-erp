'use client';

/**
 * Configuración › Chat › IA › Comportamiento: tono, idioma, reglas, mensaje de
 * respaldo, respuestas automáticas y umbral de confianza. Textos en
 * `chatConfig.ia` (es/en/fr/pt) y colores por tokens.
 */
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('chatConfig.ia.comportamiento');
  const ti = useTranslations('chatConfig.ia');
  return (
    <div className="space-y-6">
      <Card className="border-line bg-surface">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium text-fg">
            <MessageSquare aria-hidden="true" className="h-4 w-4 text-brand" />
            {t('tonoTitulo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ia-tono" className="text-fg-secondary">{t('tono')}</Label>
              <Select value={tone} onValueChange={onToneChange}>
                <SelectTrigger id="ia-tono" className="bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {ti.has(`tonos.${o.value}`) ? ti(`tonos.${o.value}`) : o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ia-idioma" className="flex items-center gap-2 text-fg-secondary">
                <Globe aria-hidden="true" className="h-4 w-4" />
                {t('idioma')}
              </Label>
              <Select value={language} onValueChange={onLanguageChange}>
                <SelectTrigger id="ia-idioma" className="bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {ti.has(`idiomas.${o.value}`) ? ti(`idiomas.${o.value}`) : o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ia-reglas" className="text-fg-secondary">{t('reglas')}</Label>
            <Textarea
              id="ia-reglas"
              value={systemRules}
              onChange={(e) => onSystemRulesChange(e.target.value)}
              placeholder={t('reglasPlaceholder')}
              rows={6}
              className="resize-none bg-surface"
            />
            <p className="text-xs text-fg-muted">{t('reglasAyuda')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ia-respaldo" className="text-fg-secondary">{t('fallback')}</Label>
            <Textarea
              id="ia-respaldo"
              value={fallbackMessage}
              onChange={(e) => onFallbackChange(e.target.value)}
              placeholder={t('fallbackPlaceholder')}
              rows={3}
              className="resize-none bg-surface"
            />
            <p className="text-xs text-fg-muted">{t('fallbackAyuda')}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-line bg-surface">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium text-fg">
            <Clock aria-hidden="true" className="h-4 w-4 text-brand" />
            {t('autoTitulo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-lg bg-subtle p-4">
            <div>
              <p id="ia-auto" className="font-medium text-fg">{t('auto')}</p>
              <p className="text-sm text-fg-muted">{t('autoAyuda')}</p>
            </div>
            <Switch aria-labelledby="ia-auto" checked={autoResponseEnabled} onCheckedChange={onAutoResponseChange} />
          </div>

          {autoResponseEnabled && (
            <div className="space-y-2">
              <Label htmlFor="ia-retraso" className="text-fg-secondary">{t('retraso')}</Label>
              <Input
                id="ia-retraso"
                type="number"
                value={autoResponseDelay}
                onChange={(e) => onDelayChange(parseInt(e.target.value) || 5)}
                min={0}
                max={60}
                className="max-w-[200px] bg-surface"
              />
              <p className="text-xs text-fg-muted">{t('retrasoAyuda')}</p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-fg-secondary">
                <Target aria-hidden="true" className="h-4 w-4" />
                {t('umbral')}
              </Label>
              <span className="rounded bg-subtle px-2 py-1 font-mono text-sm text-fg-secondary">
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
              aria-label={t('umbral')}
            />
            <p className="text-xs text-fg-muted">{t('umbralAyuda')}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
