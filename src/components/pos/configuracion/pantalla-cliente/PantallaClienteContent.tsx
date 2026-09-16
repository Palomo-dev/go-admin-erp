'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2, MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { ConfiguracionService } from '../configuracionService';
import { DEFAULT_CUSTOMER_DISPLAY_SETTINGS, type CustomerDisplaySettings } from '@/lib/pos/display/settings';
import { applyPosDisplaySettings } from '@/lib/pos/display/posDisplay';
import { markCustomerDisplayHintShown, openCustomerDisplay } from '@/lib/pos/display/openDisplay';

/**
 * Contenido de la tarjeta «Pantalla del cliente» de Configuración › POS
 * (PLAN pos-doble-pantalla §5.2), montado dentro de ConfigModal como el
 * resto de tarjetas avanzadas.
 *
 * Fase 0: solo el interruptor maestro (`pos_customer_display.enabled`) y
 * «Abrir ahora». El ajuste es de la ORGANIZACIÓN: todas sus cajas obedecen.
 * Al guardar, el servicio escribe la marca `pos_customer_display_changed` en
 * localStorage y las cajas abiertas en OTRAS pestañas o ventanas de este
 * navegador la reciben por el evento `storage` y releen el interruptor sin
 * recargar (posDisplay.ts). La ventana que escribe no recibe su propio
 * evento, así que aquí se llama además a `applyPosDisplaySettings()` para la
 * caja de esta misma ventana, si la hay: aplica la caché que el servicio ya
 * fijó con el valor recién guardado, sin volver a leer la BD (una relectura
 * fallida apagaría una caja que acaba de encenderse).
 *
 * Pendiente para la Fase 2 (NO va en esta fase): propina en pantalla
 * (porcentajes sugeridos, «Otro»), calificación al final, desglose de
 * impuestos, nombre del cliente, modo reposo, idioma y forzar táctil. Todo
 * en la misma clave `pos_customer_display`; ver PLAN §6.1.
 */
export function PantallaClienteContent({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('posCustomerDisplay.config');
  const tToast = useTranslations('posCustomerDisplay.toast');
  const { toast } = useToast();
  const [settings, setSettings] = useState<CustomerDisplaySettings>({ ...DEFAULT_CUSTOMER_DISPLAY_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ConfiguracionService.getCustomerDisplayConfig()
      .then(({ settings: loaded }) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch((err: unknown) => {
        console.error('Error cargando la configuración de la pantalla del cliente:', err);
        if (!cancelled) toast({ title: t('loadError'), variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t, toast]);

  const handleToggleEnabled = useCallback(async (value: boolean) => {
    const previous = settings;
    setSettings({ ...settings, enabled: value });
    setSaving(true);
    try {
      const saved = await ConfiguracionService.saveCustomerDisplayConfig({ enabled: value });
      setSettings(saved);
      // La caja de esta misma ventana (si la hay) aplica el interruptor recién guardado y se
      // vuelve a anunciar; las de otras ventanas ya recibieron el evento `storage` del servicio.
      applyPosDisplaySettings();
      toast({ title: t('saved'), description: value ? t('savedOn') : t('savedOff') });
    } catch (err) {
      console.error('Error guardando la configuración de la pantalla del cliente:', err);
      setSettings(previous);
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [settings, t, toast]);

  const handleOpenNow = useCallback(async () => {
    const result = await openCustomerDisplay();
    if (result.via === 'web' && result.firstTime) {
      toast({ title: tToast('dragHint'), duration: 8000 });
      // Solo se recuerda como visto después de pintarlo.
      markCustomerDisplayHintShown();
    } else if (result.via === 'blocked') {
      toast({ title: tToast('popupBlocked'), variant: 'destructive' });
    }
  }, [tToast, toast]);

  if (loading) {
    return (
      <div className={embedded ? 'space-y-4' : 'p-6 space-y-4'}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-4' : 'min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-4'}>
      <p className="text-sm text-gray-600 dark:text-gray-300">{t('description')}</p>

      {/* Interruptor maestro */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white break-words">{t('masterSwitch')}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 break-words">
            {settings.enabled ? t('masterOn') : t('masterOff')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-hidden="true" />}
          <Switch
            checked={settings.enabled}
            onCheckedChange={handleToggleEnabled}
            disabled={saving}
            aria-label={t('masterSwitch')}
          />
        </div>
      </div>

      {/* Abrir ahora */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
            <MonitorSmartphone className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white break-words">{t('openNow')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{t('openNowHint')}</p>
            {!settings.enabled && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300 break-words">{t('disabledNotice')}</p>
            )}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => void handleOpenNow()} className="shrink-0 gap-2">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t('openNow')}
        </Button>
      </div>

      {/* Fase 2: propina, calificación, impuestos, reposo, idioma, táctil (PLAN §5.2). No se muestran controles que aún no actúan. */}
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('comingSoon')}</p>
    </div>
  );
}
