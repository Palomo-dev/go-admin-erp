'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { localeNames, locales } from '@/i18n/config';
import { ConfiguracionService } from '../configuracionService';
import { applyPosDisplaySettings } from '@/lib/pos/display/posDisplay';
import {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  IDLE_AFTER_SECONDS_MAX,
  IDLE_AFTER_SECONDS_MIN,
  IDLE_MEDIA_URLS_MAX,
  IDLE_MODES,
  TIP_PRESET_MAX,
  TIP_PRESET_MIN,
  TOUCH_OVERRIDES,
  isValidMediaUrl,
  isValidTipPresets,
  type CustomerDisplaySettings,
  type IdleMode,
} from '@/lib/pos/display/settings';
import type { DisplayTouchOverride } from '@/lib/pos/display/protocol';

/** Valor del selector de idioma para «el de la organización» (el Select de shadcn no admite '' ni null). */
const ORG_LOCALE_VALUE = 'org';

/** Lo que edita este formulario: todo `pos_customer_display` menos el interruptor maestro (va aparte, guarda al instante). */
export type DisplayPresentationDraft = Omit<CustomerDisplaySettings, 'enabled'>;

interface Props {
  settings: CustomerDisplaySettings;
  /**
   * true si la fila no se pudo leer (no se debe guardar sobre valores que no
   * son los reales) o si el interruptor maestro está guardando: los dos
   * guardados hacen lectura-mezcla-upsert sobre la misma fila y no deben
   * solaparse (el último pisaría al otro).
   */
  disabled: boolean;
  onSaved: (saved: CustomerDisplaySettings) => void;
  /** Avisa al padre mientras esta sección guarda, para que deshabilite el interruptor maestro. */
  onSavingChange?: (saving: boolean) => void;
}

function toDraft(settings: CustomerDisplaySettings): DisplayPresentationDraft {
  return {
    tips: { ...settings.tips, presets: [...settings.tips.presets] },
    rating: { ...settings.rating },
    showTaxBreakdown: settings.showTaxBreakdown,
    showCustomerName: settings.showCustomerName,
    idle: { ...settings.idle, mediaUrls: [...settings.idle.mediaUrls] },
    locale: settings.locale,
    touch: settings.touch,
  };
}

type DraftError = 'presets' | 'idleSeconds' | 'mediaUrls' | 'mediaUrlsTooMany';

/** Claves planas de mensaje (el guard de i18n solo admite dos niveles). */
const INVALID_KEY: Record<DraftError, string> = {
  presets: 'invalidPresets',
  idleSeconds: 'invalidIdleSeconds',
  mediaUrls: 'invalidMediaUrls',
  mediaUrlsTooMany: 'invalidMediaUrlsTooMany',
};
const IDLE_MODE_KEY: Record<IdleMode, string> = { brand: 'idleModeBrand', promotions: 'idleModePromotions', media: 'idleModeMedia' };
const TOUCH_MODE_KEY: Record<DisplayTouchOverride, string> = { auto: 'touchModeAuto', touch: 'touchModeTouch', 'no-touch': 'touchModeNoTouch' };

/**
 * Lo que se manda a guardar a partir del borrador (ronda 2 de F2-A):
 * - Con la propina APAGADA, unos presets inválidos (un input borrado y luego
 *   apagado el bloque) vuelven a los de PLAN §5.2 en vez de bloquear el
 *   guardado con un aviso sobre campos que no se ven; unos válidos se
 *   conservan para cuando se vuelva a encender.
 * - Los presets válidos se ORDENAN de menor a mayor (la BD los guarda así).
 */
export function normalizeDraftForSave(draft: DisplayPresentationDraft): DisplayPresentationDraft {
  const valid = isValidTipPresets(draft.tips.presets);
  let presets = draft.tips.presets;
  if (valid) presets = [...draft.tips.presets].sort((a, b) => a - b);
  else if (!draft.tips.enabled) presets = [...DEFAULT_CUSTOMER_DISPLAY_SETTINGS.tips.presets];
  return { ...draft, tips: { ...draft.tips, presets } };
}

/**
 * Validación en cliente ANTES de llamar al servicio, con el mismo criterio
 * que el esquema zod (settings.ts): así el usuario ve QUÉ campo está mal en
 * vez de que el guardado lo degrade en silencio al valor por defecto. Se
 * aplica sobre el borrador ya normalizado (`normalizeDraftForSave`).
 *
 * - Presets: tres enteros DISTINTOS entre 1 y 100 (`isValidTipPresets`).
 * - Imágenes de reposo: se validan en CUALQUIER modo (antes solo en «media»:
 *   una URL mal escrita en «media» y luego cambiado el modo se descartaba en
 *   silencio al guardar) y como máximo IDLE_MEDIA_URLS_MAX (zod las recorta
 *   sin avisar; aquí se nombra el campo). Cada URL pasa por
 *   `isValidMediaUrl`, el MISMO predicado que usa el esquema zod (patrón +
 *   `new URL()`): lo que la tarjeta deja pasar, el guardado lo conserva
 *   (ronda 4 de F2-A; antes `https://%` pasaba aquí y zod la tiraba).
 */
export function validateDraft(draft: DisplayPresentationDraft): DraftError | null {
  if (!isValidTipPresets(draft.tips.presets)) return 'presets';
  const secs = draft.idle.idleAfterSeconds;
  if (!Number.isInteger(secs) || secs < IDLE_AFTER_SECONDS_MIN || secs > IDLE_AFTER_SECONDS_MAX) return 'idleSeconds';
  if (draft.idle.mediaUrls.length > IDLE_MEDIA_URLS_MAX) return 'mediaUrlsTooMany';
  if (firstInvalidMediaUrl(draft) !== null) return 'mediaUrls';
  return null;
}

/** Primera imagen de reposo mal formada del borrador (para nombrarla en el aviso), o null si todas son válidas. */
export function firstInvalidMediaUrl(draft: DisplayPresentationDraft): string | null {
  return draft.idle.mediaUrls.find((u) => !isValidMediaUrl(u)) ?? null;
}

/** Textarea → lista de URL (una por línea, sin vacías). */
export function parseMediaUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Ajustes de presentación de la tarjeta «Pantalla del cliente» (PLAN §5.2):
 * propina en pantalla (3 porcentajes + «Otro»), calificación al final,
 * desglose de impuestos, nombre del cliente, modo reposo, idioma y forzar
 * táctil. Son de la ORGANIZACIÓN (todas sus cajas obedecen) y se guardan
 * todos juntos con «Guardar ajustes» en `organization_settings` /
 * `pos_customer_display` (settings.ts valida con zod antes del upsert).
 *
 * Al guardar, la caja de esta ventana vuelve a saludar
 * (`applyPosDisplaySettings` → `refresh()` → `hello.settings`) y las de otras
 * ventanas releen por el evento `storage` que escribe el servicio: la
 * pantalla aplica los cambios sin recargar.
 *
 * Mientras guarda avisa al padre (`onSavingChange`) y el padre, mientras
 * guarda el interruptor maestro, deshabilita esta sección (`disabled`): un
 * solo guardado en vuelo a la vez sobre la fila.
 */
export function AjustesPantallaSection({ settings, disabled, onSaved, onSavingChange }: Props) {
  const t = useTranslations('posCustomerDisplay.config');
  const tPres = useTranslations('posCustomerDisplay.presentation');
  const { toast } = useToast();
  const [draft, setDraft] = useState<DisplayPresentationDraft>(() => toDraft(settings));
  const [mediaText, setMediaText] = useState(() => settings.idle.mediaUrls.join('\n'));
  const [saving, setSavingState] = useState(false);
  const setSaving = useCallback(
    (value: boolean) => {
      setSavingState(value);
      onSavingChange?.(value);
    },
    [onSavingChange],
  );

  // Si cambian los ajustes de presentación del padre (recarga, guardado) se rehace el
  // borrador. Se compara por contenido: alternar el interruptor maestro (que solo cambia
  // `enabled`) no debe tirar lo que el usuario esté editando aquí.
  const presentationKey = useMemo(() => JSON.stringify(toDraft(settings)), [settings]);
  useEffect(() => {
    const parsed = JSON.parse(presentationKey) as DisplayPresentationDraft;
    setDraft(parsed);
    setMediaText(parsed.idle.mediaUrls.join('\n'));
  }, [presentationKey]);

  const dirty = useMemo(
    () => JSON.stringify({ ...draft, idle: { ...draft.idle, mediaUrls: parseMediaUrls(mediaText) } }) !== JSON.stringify(toDraft(settings)),
    [draft, mediaText, settings],
  );

  const update = useCallback(<K extends keyof DisplayPresentationDraft>(key: K, value: DisplayPresentationDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setPreset = useCallback((index: number, raw: string) => {
    setDraft((prev) => {
      const presets = [...prev.tips.presets];
      presets[index] = raw === '' ? Number.NaN : Number(raw);
      return { ...prev, tips: { ...prev.tips, presets } };
    });
  }, []);

  const handleSave = useCallback(async () => {
    const toSave = normalizeDraftForSave({ ...draft, idle: { ...draft.idle, mediaUrls: parseMediaUrls(mediaText) } });
    const invalid = validateDraft(toSave);
    if (invalid) {
      // Una URL mal formada se nombra: así el usuario sabe cuál corregir.
      const badUrl = invalid === 'mediaUrls' ? firstInvalidMediaUrl(toSave) : null;
      toast({ title: tPres(INVALID_KEY[invalid]), description: badUrl ?? undefined, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const saved = await ConfiguracionService.saveCustomerDisplayConfig(toSave);
      onSaved(saved);
      // El borrador se rehace con lo guardado aquí mismo: si lo normalizado
      // coincide con lo que ya había (presets en otro orden, un preset vacío
      // con la propina apagada), presentationKey no cambia y el efecto de
      // [presentationKey] no correría, dejando «cambios sin guardar» en verde.
      setDraft(toDraft(saved));
      setMediaText(saved.idle.mediaUrls.join('\n'));
      // La caja de esta ventana (si la hay) vuelve a saludar con los ajustes nuevos.
      applyPosDisplaySettings();
      toast({ title: t('saved'), description: tPres('savedHint') });
    } catch (err) {
      console.error('Error guardando los ajustes de la pantalla del cliente:', err);
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [draft, mediaText, onSaved, setSaving, t, tPres, toast]);

  const controlsDisabled = disabled || saving;

  return (
    <div className="space-y-3">
      {/* Propina en pantalla */}
      <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white break-words">{tPres('tips')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{tPres('tipsHint')}</p>
          </div>
          <Switch
            checked={draft.tips.enabled}
            onCheckedChange={(v) => update('tips', { ...draft.tips, enabled: v })}
            disabled={controlsDisabled}
            aria-label={tPres('tips')}
          />
        </div>
        {draft.tips.enabled && (
          <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{tPres('tipPresets')}</p>
              <div className="mt-1 grid grid-cols-3 gap-2 max-w-xs">
                {draft.tips.presets.map((preset, index) => (
                  <div key={index} className="relative">
                    <Label htmlFor={`pd-tip-${index}`} className="sr-only">
                      {tPres('tipPresetN', { n: index + 1 })}
                    </Label>
                    <Input
                      id={`pd-tip-${index}`}
                      type="number"
                      inputMode="numeric"
                      min={TIP_PRESET_MIN}
                      max={TIP_PRESET_MAX}
                      step={1}
                      value={Number.isFinite(preset) ? preset : ''}
                      onChange={(e) => setPreset(index, e.target.value)}
                      disabled={controlsDisabled}
                      className="pr-7"
                    />
                    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-gray-400">
                      %
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{tPres('tipPresetsHint')}</p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">{tPres('tipAllowCustom')}</p>
              <Switch
                checked={draft.tips.allowCustom}
                onCheckedChange={(v) => update('tips', { ...draft.tips, allowCustom: v })}
                disabled={controlsDisabled}
                aria-label={tPres('tipAllowCustom')}
              />
            </div>
          </div>
        )}
      </div>

      {/* Calificación, desglose, nombre del cliente */}
      {(
        [
          { key: 'rating', label: tPres('rating'), hint: tPres('ratingHint'), checked: draft.rating.enabled, set: (v: boolean) => update('rating', { enabled: v }) },
          { key: 'tax', label: tPres('taxBreakdown'), hint: tPres('taxBreakdownHint'), checked: draft.showTaxBreakdown, set: (v: boolean) => update('showTaxBreakdown', v) },
          { key: 'customer', label: tPres('customerName'), hint: tPres('customerNameHint'), checked: draft.showCustomerName, set: (v: boolean) => update('showCustomerName', v) },
        ] as const
      ).map((row) => (
        <div key={row.key} className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white break-words">{row.label}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{row.hint}</p>
          </div>
          <Switch checked={row.checked} onCheckedChange={row.set} disabled={controlsDisabled} aria-label={row.label} />
        </div>
      ))}

      {/* Modo reposo */}
      <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white break-words">{tPres('idle')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{tPres('idleHint')}</p>
          </div>
          <Select value={draft.idle.mode} onValueChange={(v) => update('idle', { ...draft.idle, mode: v as IdleMode })} disabled={controlsDisabled}>
            <SelectTrigger className="w-full sm:w-64" aria-label={tPres('idle')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IDLE_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {tPres(IDLE_MODE_KEY[mode])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Sigue visible fuera de «media» mientras haya URLs escritas: se validan y guardan en cualquier modo, nunca se descartan en silencio. */}
        {(draft.idle.mode === 'media' || mediaText.trim().length > 0) && (
          <div className="space-y-1">
            <Label htmlFor="pd-idle-media">{tPres('idleMedia')}</Label>
            <Textarea
              id="pd-idle-media"
              rows={3}
              value={mediaText}
              onChange={(e) => setMediaText(e.target.value)}
              placeholder="https://…"
              disabled={controlsDisabled}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">{tPres('idleMediaHint', { max: IDLE_MEDIA_URLS_MAX })}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="pd-idle-seconds" className="text-sm text-gray-700 dark:text-gray-200">
            {tPres('idleAfter')}
          </Label>
          <Input
            id="pd-idle-seconds"
            type="number"
            inputMode="numeric"
            min={IDLE_AFTER_SECONDS_MIN}
            max={IDLE_AFTER_SECONDS_MAX}
            step={1}
            className="w-28"
            value={Number.isFinite(draft.idle.idleAfterSeconds) ? draft.idle.idleAfterSeconds : ''}
            onChange={(e) => update('idle', { ...draft.idle, idleAfterSeconds: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
            disabled={controlsDisabled}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">{tPres('seconds')}</span>
        </div>
      </div>

      {/* Idioma y táctil */}
      <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white break-words">{tPres('locale')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{tPres('localeHint')}</p>
          </div>
          <Select
            value={draft.locale ?? ORG_LOCALE_VALUE}
            onValueChange={(v) => update('locale', v === ORG_LOCALE_VALUE ? null : v)}
            disabled={controlsDisabled}
          >
            <SelectTrigger className="w-full sm:w-64" aria-label={tPres('locale')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ORG_LOCALE_VALUE}>{tPres('localeOrg')}</SelectItem>
              {locales.map((code) => (
                <SelectItem key={code} value={code}>
                  {localeNames[code]}
                </SelectItem>
              ))}
              {/* Un locale guardado que no está en la lista (p. ej. es-CO, escrito por otro cliente) sigue visible. */}
              {draft.locale !== null && !(locales as readonly string[]).includes(draft.locale) && <SelectItem value={draft.locale}>{draft.locale}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white break-words">{tPres('touch')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{tPres('touchHint')}</p>
          </div>
          <Select value={draft.touch} onValueChange={(v) => update('touch', v as DisplayTouchOverride)} disabled={controlsDisabled}>
            <SelectTrigger className="w-full sm:w-64" aria-label={tPres('touch')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOUCH_OVERRIDES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {tPres(TOUCH_MODE_KEY[mode])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty && !saving && <p className="text-xs text-gray-500 dark:text-gray-400">{tPres('unsaved')}</p>}
        <Button type="button" onClick={() => void handleSave()} disabled={controlsDisabled || !dirty} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saving ? tPres('saving') : tPres('save')}
        </Button>
      </div>
    </div>
  );
}
