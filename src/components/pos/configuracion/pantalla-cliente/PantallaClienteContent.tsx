'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Loader2, Monitor, MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { ConfiguracionService } from '../configuracionService';
import { DEFAULT_CUSTOMER_DISPLAY_SETTINGS, type CustomerDisplaySettings } from '@/lib/pos/display/settings';
import { applyPosDisplaySettings } from '@/lib/pos/display/posDisplay';
import { closeCustomerDisplay, markCustomerDisplayHintShown, openCustomerDisplay } from '@/lib/pos/display/openDisplay';
import {
  UNKNOWN_DISPLAY_CHOICE,
  describeSelectedDisplay,
  describeWindowStatus,
  displayChoiceToPersist,
  formatDisplayOption,
  getDesktopPosDisplayBridge,
  listDesktopDisplays,
  needsReopenForDisplayChange,
  persistDesktopDisplayChoice,
  readDesktopDisplayStatus,
  readSavedDisplayChoiceFromBrowser,
  resolveSelectedDisplayId,
  saveDisplayChoiceInBrowser,
  subscribeDesktopDisplayStatus,
  supportsDesktopDisplayPicker,
  type DesktopDisplayPickerBridge,
  type DisplayChoice,
} from '@/lib/pos/display/desktopDisplay';
import type { DesktopDisplayInfo, DesktopPosDisplayStatus } from '@/lib/utils/desktop';

/** Valor del selector para «automático» (el Select de shadcn no admite '' ni null). */
const AUTO_DISPLAY_VALUE = 'auto';

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
 * Fase 1 (solo en Go Admin Desktop >= 0.2.1, cuando el puente expone
 * `listDisplays`): selector de monitor (etiqueta · tamaño · «principal»),
 * estado de la ventana (abierta/cerrada y en qué monitor, por `status()` +
 * `onStatus()`) y «Abrir ahora» por el puente en el monitor elegido. El
 * interruptor de la ORGANIZACIÓN sigue mandando (es el que decide si las
 * cajas emiten); el monitor es de ESTA máquina y se persiste en el proceso
 * principal con `setEnabled(enabled, displayId)` cada vez que cambia
 * cualquiera de los dos, más una copia en localStorage para preseleccionarlo
 * (el puente no devuelve el monitor guardado). Esa copia es por origen y el
 * servidor embebido rota puertos, así que puede faltar: entonces la elección
 * es «desconocida» (`DisplayChoice.known === false`) y al alternar el
 * interruptor se manda `displayId: undefined`, que CONSERVA el monitor del
 * proceso principal; `null` (automático) solo viaja cuando el usuario lo
 * elige a propósito. Un monitor elegido que ya no está en la lista se
 * muestra como «desconectado» sin volver a automático.
 *
 * El proceso principal (`config.json`: abrir sola al arrancar + monitor) se
 * escribe SOLO por una acción del usuario en esta tarjeta —alternar el
 * interruptor o elegir monitor—, exactamente una vez por acción, y NUNCA a
 * partir de lo que se LEE de la organización (no hay sincronía hacia abajo:
 * ver desktopDisplay.ts, cabecera, punto 4). Por eso importa distinguir
 * «no se pudo leer» de «apagado»: si `getCustomerDisplayConfig` no pudo leer
 * la fila (`loadFailed`, p. ej. sin red), se avisa y el interruptor y el
 * selector de monitor quedan deshabilitados —persistir `setEnabled(false,
 * id)` con un `enabled` que no es fiable apagaría la auto-apertura de esta
 * máquina por un fallo de red—; «Abrir ahora» sigue disponible. La lista de
 * monitores se relee al desplegar el selector, en cada `onStatus` y al
 * volver a esta ventana (`focus` / `visibilitychange`): un monitor conectado
 * sin apertura automática no emite `onStatus` y, si no, seguía
 * «(desconectado)» hasta reabrir la tarjeta. Y «Abrir ahora» con la ventana
 * ya abierta en OTRO monitor (`needsReopenForDisplayChange`) la cierra y la
 * vuelve a abrir por el puente: el proceso principal solo la traía al frente
 * sin reubicarla. Con un Desktop anterior, o en el navegador, nada de esto
 * se pinta y el comportamiento es el de la Fase 0.
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
  // true si la fila de la organización no se pudo leer: el `enabled` que se pinta es el valor por
  // defecto, no el real, y no se debe persistir ni alternar hasta releer con éxito.
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Escritorio (Fase 1): monitores y estado de la ventana ──
  const [desktopBridge, setDesktopBridge] = useState<DesktopDisplayPickerBridge | null>(null);
  const [displays, setDisplays] = useState<DesktopDisplayInfo[]>([]);
  // `known`: el usuario eligió en esta máquina (o hay copia local). Sin copia, el id que se pinta
  // es solo orientativo (el de la ventana abierta) y no se persiste.
  const [displayChoice, setDisplayChoice] = useState<DisplayChoice>({ ...UNKNOWN_DISPLAY_CHOICE });
  const [windowStatus, setWindowStatus] = useState<DesktopPosDisplayStatus | null>(null);
  const [savingDisplay, setSavingDisplay] = useState(false);

  useEffect(() => {
    const bridge = getDesktopPosDisplayBridge();
    // Navegador, o Desktop < 0.2.1 sin listDisplays: comportamiento web, sin selector ni estado.
    if (!supportsDesktopDisplayPicker(bridge)) return;
    let cancelled = false;
    setDesktopBridge(bridge);
    void Promise.all([listDesktopDisplays(bridge), readDesktopDisplayStatus(bridge)]).then(([list, status]) => {
      if (cancelled) return;
      setDisplays(list);
      setWindowStatus(status);
      const saved = readSavedDisplayChoiceFromBrowser();
      // Elección conocida: se respeta aunque el monitor no esté (se pinta «desconectado»).
      // Desconocida: se muestra el de la ventana abierta si lo hay, o automático, sin darlo por elegido.
      setDisplayChoice(saved.known ? saved : { known: false, id: resolveSelectedDisplayId(list, null, status) });
    });
    const off = subscribeDesktopDisplayStatus(bridge, (status) => {
      if (cancelled) return;
      setWindowStatus(status);
      // Al abrir/cerrar puede haber cambiado la lista (monitor que va y viene): se relee.
      void listDesktopDisplays(bridge).then((list) => {
        if (!cancelled) setDisplays(list);
      });
    });
    // Un monitor conectado SIN apertura automática (organización apagada, monitor guardado ajeno)
    // no emite `onStatus`: al volver a esta ventana se relee la lista para que aparezca en el selector.
    const refreshOnReturn = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void listDesktopDisplays(bridge).then((list) => {
        if (!cancelled) setDisplays(list);
      });
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      cancelled = true;
      off();
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, []);

  // Al desplegar el selector se relee la lista: lo que se ve es lo que hay conectado ahora mismo.
  const handleSelectOpenChange = useCallback(
    (open: boolean) => {
      if (!open || !desktopBridge) return;
      void listDesktopDisplays(desktopBridge).then(setDisplays);
    },
    [desktopBridge],
  );

  const handleDisplayChange = useCallback(
    async (value: string) => {
      // Elegir en el selector siempre es una elección conocida: «Automático» se guarda como tal ('auto').
      const choice: DisplayChoice = { known: true, id: value === AUTO_DISPLAY_VALUE ? null : Number(value) };
      const previous = displayChoice;
      setDisplayChoice(choice);
      saveDisplayChoiceInBrowser(choice);
      setSavingDisplay(true);
      // El interruptor de la organización manda: el proceso principal solo abre sola al arrancar si está encendido.
      const ok = await persistDesktopDisplayChoice(desktopBridge, settings.enabled, choice.id);
      setSavingDisplay(false);
      if (!ok) {
        setDisplayChoice(previous);
        saveDisplayChoiceInBrowser(previous);
        toast({ title: t('monitorSaveError'), variant: 'destructive' });
      }
    },
    [desktopBridge, displayChoice, settings.enabled, t, toast],
  );

  useEffect(() => {
    let cancelled = false;
    ConfiguracionService.getCustomerDisplayConfig()
      .then(({ settings: loaded, loadFailed: failed }) => {
        if (cancelled) return;
        setSettings(loaded);
        setLoadFailed(failed);
        // «No se pudo leer» no es «apagado»: se avisa y los controles que persistirían ese valor quedan deshabilitados.
        if (failed) toast({ title: t('loadError'), variant: 'destructive' });
      })
      .catch((err: unknown) => {
        // El servicio no lanza; por si acaso, mismo trato que una lectura fallida.
        console.error('Error cargando la configuración de la pantalla del cliente:', err);
        if (cancelled) return;
        setLoadFailed(true);
        toast({ title: t('loadError'), variant: 'destructive' });
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
      // Escritorio: el proceso principal recuerda el interruptor (abrir sola al arrancar) junto al monitor de esta máquina.
      // Sin elección conocida aquí viaja `undefined`: conserva el monitor guardado en vez de pisarlo con «automático».
      // Una sola escritura por acción del usuario (no hay sincronía que la repita). Si falla no se
      // revierte el ajuste de la organización: es el que manda; solo se avisa.
      const persisted = desktopBridge
        ? await persistDesktopDisplayChoice(desktopBridge, saved.enabled, displayChoiceToPersist(displayChoice))
        : true;
      // La caja de esta misma ventana (si la hay) aplica el interruptor recién guardado y se
      // vuelve a anunciar; las de otras ventanas ya recibieron el evento `storage` del servicio.
      applyPosDisplaySettings();
      toast({ title: t('saved'), description: value ? t('savedOn') : t('savedOff') });
      if (!persisted) toast({ title: t('monitorSaveError'), variant: 'destructive' });
    } catch (err) {
      console.error('Error guardando la configuración de la pantalla del cliente:', err);
      setSettings(previous);
      toast({ title: t('saveError'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [desktopBridge, displayChoice, settings, t, toast]);

  const handleOpenNow = useCallback(async () => {
    // Escritorio con la ventana YA abierta en otro monitor: el proceso principal solo la traería al
    // frente (ignora el displayId pedido). Se cierra por el puente y se reabre en el monitor elegido.
    let movedToChosenDisplay = false;
    if (desktopBridge && needsReopenForDisplayChange(windowStatus, displayChoice)) {
      movedToChosenDisplay = (await closeCustomerDisplay({ bridgeWindowOpen: true })) === 'electron';
      if (!movedToChosenDisplay) toast({ title: t('monitorChangeRequiresReopen') });
    }
    // En escritorio abre por el puente en el monitor elegido (openDisplay.ts lee la elección de esta máquina).
    const result = await openCustomerDisplay();
    if (movedToChosenDisplay && result.via === 'electron') toast({ title: t('monitorChangeReopened') });
    if (result.via === 'web' && result.firstTime) {
      toast({ title: tToast('dragHint'), duration: 8000 });
      // Solo se recuerda como visto después de pintarlo.
      markCustomerDisplayHintShown();
    } else if (result.via === 'blocked') {
      toast({ title: tToast('popupBlocked'), variant: 'destructive' });
    }
  }, [desktopBridge, displayChoice, t, tToast, toast, windowStatus]);

  if (loading) {
    return (
      <div className={embedded ? 'space-y-4' : 'p-6 space-y-4'}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // Estado de la ventana en escritorio: cerrada / abierta en <monitor> / abierta en ventana normal (displayId null:
  // un solo monitor) / abierta en un monitor que no está en la lista (desconectado o lista desactualizada).
  const windowView = windowStatus ? describeWindowStatus(windowStatus, displays) : null;
  const windowStatusLabel = !windowView
    ? null
    : windowView.kind === 'closed'
      ? t('windowClosed')
      : windowView.kind === 'on-listed'
        ? t('windowOpenOn', { monitor: formatDisplayOption(windowView.display, t('monitorPrimary')) })
        : windowView.kind === 'on-unknown'
          ? t('windowOpenUnknownMonitor', { id: windowView.id })
          : t('windowOpenWindowed');
  // Monitor elegido que ya no está en la lista: opción deshabilitada «(desconectado)», sin volver a automático.
  const selectedView = describeSelectedDisplay(displays, displayChoice.id);

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
            disabled={saving || loadFailed}
            aria-label={t('masterSwitch')}
          />
        </div>
        {loadFailed && (
          <p className="w-full text-xs text-amber-700 dark:text-amber-300 break-words" role="alert">
            {t('loadError')}
          </p>
        )}
      </div>

      {/* Escritorio (Fase 1): monitor de esta máquina y estado de la ventana. Solo con puente que sepa listar monitores. */}
      {desktopBridge && (
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
                <Monitor className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white break-words">{t('monitor')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{t('monitorHint')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              {savingDisplay && <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-hidden="true" />}
              <Select
                value={displayChoice.id === null ? AUTO_DISPLAY_VALUE : String(displayChoice.id)}
                onValueChange={(value) => void handleDisplayChange(value)}
                onOpenChange={handleSelectOpenChange}
                disabled={savingDisplay || loadFailed}
              >
                <SelectTrigger className="w-full sm:w-72" aria-label={t('monitor')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_DISPLAY_VALUE}>{t('monitorAuto')}</SelectItem>
                  {displays.map((display) => (
                    <SelectItem key={display.id} value={String(display.id)}>
                      {formatDisplayOption(display, t('monitorPrimary'))}
                    </SelectItem>
                  ))}
                  {selectedView.kind === 'missing' && (
                    <SelectItem value={String(selectedView.id)} disabled>
                      {t('monitorDisconnected', { id: selectedView.id })}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          {displays.length === 0 && <p className="text-xs text-amber-700 dark:text-amber-300 break-words">{t('displaysUnavailable')}</p>}
          {windowStatusLabel && (
            <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 break-words" role="status">
              <span
                aria-hidden="true"
                className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', windowStatus?.open ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600')}
              />
              {windowStatusLabel}
            </p>
          )}
        </div>
      )}

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
