'use client';

/**
 * Configuración › Chat › IA › Comportamiento (Figma pág. 10, 12.6; pantallazo
 * 94-config-01): filas de ajuste con el control a la derecha.
 *
 * - «Comportamiento»: responder automáticamente, esperar antes de responder y
 *   pasar a una persona si la IA duda.
 * - «Tono y lenguaje»: tono e idioma. Se guardan en `ai_settings.tone` y
 *   `ai_settings.language` y la Edge Function `ai-auto-response` ya los usa
 *   (antes se guardaban y se ignoraban). Aviso con enlace al Laboratorio.
 * - Reglas del sistema y mensaje de respaldo, como antes.
 *
 * Textos nuevos en `configuracionTextos.chatIa`; los de siempre siguen en
 * `chatConfig.ia` (es/en/fr/pt). Colores por tokens.
 */
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { SettingRow } from '@/components/kit';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TONE_OPTIONS, LANGUAGE_OPTIONS } from '@/lib/services/aiSettingsService';
import { GrupoAjustes } from '@/components/configuracion/layout/EnlacesAjuste';

/** Laboratorio de la IA del chat: allí se prueban tono e idioma antes de guardar. */
export const RUTA_LABORATORIO_IA = '/app/chat/ia/laboratorio';

/** Segundos que se ofrecen en «Esperar antes de responder» (0–60, como valida el servicio). */
const ESPERAS = [0, 2, 3, 5, 8, 10, 15, 20, 30, 45, 60];
/** Umbrales de «Pasar a una persona si la IA duda». */
const UMBRALES = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

/** La lista con el valor actual incluido (si se guardó uno que no está en las opciones). */
function conActual(lista: readonly number[], actual: number): number[] {
  return lista.some((v) => Math.abs(v - actual) < 1e-9) ? [...lista] : [...lista, actual].sort((a, b) => a - b);
}

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
  /** Dentro del diálogo de Configuración: navega al Laboratorio y cierra el diálogo (pregunta si hay cambios). */
  onAbrirLaboratorio?: (href: string) => void;
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
  onConfidenceChange,
  onAbrirLaboratorio,
}: BehaviorSettingsProps) {
  const t = useTranslations('chatConfig.ia.comportamiento');
  const ti = useTranslations('chatConfig.ia');
  const tn = useTranslations('configuracionTextos.chatIa');
  const idioma = useLocale();

  const nombreTono = (v: string, etiqueta: string) => (ti.has(`tonos.${v}`) ? ti(`tonos.${v}`) : etiqueta);
  const nombreIdioma = (v: string, etiqueta: string) => (ti.has(`idiomas.${v}`) ? ti(`idiomas.${v}`) : etiqueta);
  const lista = useMemo(() => new Intl.ListFormat(idioma, { type: 'disjunction' }), [idioma]);
  const decimal = useMemo(() => new Intl.NumberFormat(idioma, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [idioma]);

  const tonos = lista.format(TONE_OPTIONS.map((o) => nombreTono(o.value, o.label)));
  const idiomas = lista.format(LANGUAGE_OPTIONS.map((o) => nombreIdioma(o.value, o.label)));

  return (
    <div className="flex flex-col gap-8">
      <GrupoAjustes id="ia-comportamiento" titulo={tn('comportamiento.titulo')}>
        <SettingRow className="px-0 py-3.5" titulo={<span id="ia-auto">{tn('comportamiento.auto')}</span>} descripcion={<span className="text-fg-muted">{tn('comportamiento.autoAyuda')}</span>}>
          <Switch aria-labelledby="ia-auto" checked={autoResponseEnabled} onCheckedChange={onAutoResponseChange} />
        </SettingRow>
        <SettingRow className="px-0 py-3.5" htmlFor="ia-retraso" titulo={tn('comportamiento.espera')} descripcion={<span className="text-fg-muted">{tn('comportamiento.esperaAyuda')}</span>}>
          <Select value={String(autoResponseDelay)} onValueChange={(v) => onDelayChange(Number(v))} disabled={!autoResponseEnabled}>
            <SelectTrigger id="ia-retraso" className="w-40 bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {conActual(ESPERAS, autoResponseDelay).map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {tn('comportamiento.segundos', { n: s })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow className="px-0 py-3.5" htmlFor="ia-umbral" titulo={tn('comportamiento.umbral')} descripcion={<span className="text-fg-muted">{tn('comportamiento.umbralAyuda')}</span>}>
          <Select value={String(confidenceThreshold)} onValueChange={(v) => onConfidenceChange(Number(v))}>
            <SelectTrigger id="ia-umbral" className="w-[120px] bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {conActual(UMBRALES, confidenceThreshold).map((u) => (
                <SelectItem key={u} value={String(u)}>
                  {decimal.format(u)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </GrupoAjustes>

      <GrupoAjustes id="ia-tono-lenguaje" titulo={tn('tono.titulo')} descripcion={tn('tono.descripcion')}>
        <SettingRow className="px-0 py-3.5" htmlFor="ia-tono" titulo={tn('tono.tono')} descripcion={<span className="text-fg-muted">{tn('tono.tonoAyuda', { opciones: tonos })}</span>}>
          <Select value={tone} onValueChange={onToneChange}>
            <SelectTrigger id="ia-tono" className="w-40 bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {nombreTono(o.value, o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow className="px-0 py-3.5" htmlFor="ia-idioma" titulo={tn('tono.idioma')} descripcion={<span className="text-fg-muted">{tn('tono.idiomaAyuda', { opciones: idiomas })}</span>}>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger id="ia-idioma" className="w-40 bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {nombreIdioma(o.value, o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        <div role="note" className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-line-info bg-info-subtle px-4 py-3">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" />
          <p className="min-w-0 flex-1 basis-60 text-sm text-fg">{tn('tono.aviso')}</p>
          <Link
            href={RUTA_LABORATORIO_IA}
            className="text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={(e) => {
              if (!onAbrirLaboratorio || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onAbrirLaboratorio(RUTA_LABORATORIO_IA);
            }}
          >
            {tn('tono.abrirLaboratorio')}
          </Link>
        </div>
      </GrupoAjustes>

      <GrupoAjustes id="ia-reglas" titulo={tn('reglas.titulo')} descripcion={tn('reglas.descripcion')} sinFilas>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ia-reglas-texto" className="text-fg-secondary">{t('reglas')}</Label>
          <Textarea
            id="ia-reglas-texto"
            value={systemRules}
            onChange={(e) => onSystemRulesChange(e.target.value)}
            placeholder={t('reglasPlaceholder')}
            rows={6}
            className="resize-none bg-surface"
          />
          <p className="text-xs text-fg-muted">{t('reglasAyuda')}</p>
        </div>
        <div className="flex flex-col gap-2">
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
      </GrupoAjustes>
    </div>
  );
}
