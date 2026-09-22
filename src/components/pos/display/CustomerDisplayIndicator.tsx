'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, MonitorX, Power, Tablet, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import {
  canCloseViaNativeBridge,
  closeCustomerDisplay,
  getOpenedCustomerDisplayWindow,
  markCustomerDisplayHintShown,
  openCustomerDisplay,
} from '@/lib/pos/display/openDisplay';
import { useCustomerDisplayPresence } from './useCustomerDisplayPresence';
import { useDesktopDisplayWindow } from './useDesktopDisplayWindow';
import { enableDesktopDisplayHere, getDesktopPosDisplayBridge, resolveIndicatorState, resolveNothingToClose } from '@/lib/pos/display/desktopDisplay';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import { applyPosDisplaySettings, getRemoteDisplayLegStatus } from '@/lib/pos/display/posDisplay';
import { PosTerminalsService } from '@/lib/services/posTerminalsService';
import { describePresenceOrigins } from '@/lib/pos/display/presence';
import { PairingCodeDialog } from './PairingCodeDialog';
import { RevokeRemoteDisplayDialog } from './RevokeRemoteDisplayDialog';

/** Clave de `indicator.*` por origen de la pantalla viva (F3-C): ventana en este equipo, tableta remota o las dos. */
const ORIGIN_LABEL_KEY = { local: 'originLocal', remote: 'originRemote', both: 'originBoth' } as const;

/** localStorage de esta ventana, o null si el navegador lo bloquea (entonces la elección de monitor cuenta como desconocida). */
function readLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Indicador de la pantalla del cliente en la cabecera del POS (PLAN §5.1).
 *
 * Punto verde «Pantalla del cliente conectada» / gris «Sin pantalla» según
 * la presencia que ve el emisor de la caja (señal de la pantalla en los
 * últimos 3 s). Al pulsarlo, un menú con «Abrir pantalla del cliente» y
 * «Cerrar». Si la caja no emite, el menú dice por qué según `reason`:
 * apagada en Configuración (etiqueta que manda al interruptor; solo cuando la
 * caché del interruptor existe y dice apagado), entorno sin BroadcastChannel
 * (etiqueta propia: Configuración no lo arregla) o aún cargando (sin
 * etiqueta: sin caché del interruptor, o con la caché encendida y el emisor
 * todavía sin arrancar, porque este indicador monta antes de que la página
 * resuelva la moneda base y llame a `startPosDisplay`).
 *
 * Los avisos van por el `useToast` de shadcn, el único Toaster que monta el
 * layout (el `toast` de sonner no tiene Toaster y no se ve). El aviso de
 * «arrastre la ventana… y pulse F11» se marca como visto solo DESPUÉS de
 * pintarlo, para que un cajero que no lo vio lo reciba la próxima vez.
 *
 * «Cerrar» solo alcanza la ventana que abrió ESTA pestaña o la que abrió el
 * puente de escritorio (si sabe cerrar: `canCloseViaNativeBridge`, el mismo
 * criterio que usa `closeCustomerDisplay`). Si hay pantalla pero no se puede
 * alcanzar desde aquí (la abrió otra pestaña, o esta misma antes de recargar
 * la caja) se le indica al cajero la salida real: cerrarla en su ventana o
 * pulsar «Abrir», que la reutiliza por nombre y recupera la referencia. Sin
 * nada que cerrar, el ítem va deshabilitado.
 *
 * Fase 1 (Go Admin Desktop >= 0.2.1): el puente dice además si la VENTANA
 * de la pantalla existe (`status()` + `onStatus()`, hook
 * `useDesktopDisplayWindow`). La presencia sigue siendo `display_alive` por
 * el relay; pero si la caja EMITE, el puente dice «abierta» y en 3 s no
 * llega señal, el indicador pasa a ámbar «Pantalla abierta, sin señal» en
 * vez de gris «Sin pantalla», para distinguir ventana viva de canal roto (y
 * «Cerrar» va por el puente, que sí la alcanza). Si la caja NO emite
 * (interruptor apagado, o cargando) no se acusa el canal: la ventana puede
 * estar abierta (auto-apertura al arrancar, «Abrir ahora» con la
 * organización apagada) y lo que falta es activar el interruptor, así que
 * «desactivada» va antes que «sin señal». Con el puente, «Cerrar» solo se
 * habilita si la ventana existe (`status().open`), y `closeCustomerDisplay`
 * recibe ese mismo dato (`bridgeWindowOpen`): sin ventana hija no se llama
 * al puente (no-op silencioso) y se cae a la referencia propia o al aviso
 * «ciérrela donde la abrió», como en el navegador; sin ventana del puente ni
 * referencia propia ni presencia, el ítem va deshabilitado. «Activar y abrir»
 * además persiste «abrir sola al arrancar» en esta máquina
 * (`enableDesktopDisplayHere`): es una acción explícita del cajero aquí,
 * igual que el interruptor de la tarjeta, y la ÚNICA vez que el indicador
 * escribe en el proceso principal (no hay sincronía hacia abajo: una
 * organización apagada desde otra máquina deja la ventana abierta en
 * «Conectando…» y el indicador en «desactivada», ver desktopDisplay.ts). En
 * el navegador nada cambia.
 *
 * Fase 3 (parte C): la etiqueta «conectada» dice además el ORIGEN de la
 * pantalla viva —en este equipo, remota (tableta por Supabase Broadcast) o
 * ambas—, a partir de `origins` de la presencia (por qué tubo llegó el
 * último `display_alive`). El menú gana «Emparejar otro dispositivo»
 * (PairingCodeDialog: código de 6 dígitos con cuenta atrás) y «Revocar
 * pantalla remota» (RevokeRemoteDisplayDialog); la terminal es la vinculada
 * en localStorage y las rutas exigen admin/manager en el servidor. Y si la
 * pata remota NO se abrió —esta caja no está vinculada a una terminal activa,
 * o la comprobación contra el servidor falló y se falló cerrado (ronda 4 ·
 * C1)—, el menú lo dice encima de «Emparejar»: sin eso, emparejar una tableta
 * desde una caja que nunca va a publicar parece un problema de la tableta.
 *
 * No sabe nada del carrito: solo abre, cierra, empareja y pinta. Sin vista
 * previa en miniatura.
 */
export function CustomerDisplayIndicator({ className }: { className?: string }) {
  const t = useTranslations('posCustomerDisplay');
  const { toast } = useToast();
  const { connected, emitting, reason, origins } = useCustomerDisplayPresence();
  // F3-C: emparejar / revocar la pantalla remota desde el menú. La terminal es la vinculada en
  // localStorage (pos_terminals.id si esta caja se vinculó; la ruta responde 404 si no es una fila real).
  const [pairOpen, setPairOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [pairingTerminalId, setPairingTerminalId] = useState<string | null>(null);
  const openPairing = useCallback(() => {
    setPairingTerminalId(PosTerminalsService.getLocalTerminalId());
    setPairOpen(true);
  }, []);
  const openRevoke = useCallback(() => {
    setPairingTerminalId(PosTerminalsService.getLocalTerminalId());
    setRevokeOpen(true);
  }, []);
  const { signal: windowSignal, status: windowStatus } = useDesktopDisplayWindow(connected, emitting);
  // Orden canónico (puro, desktopDisplay.ts): conectada → desactivada → abierta sin señal → sin pantalla.
  // «Sin señal» nunca se antepone a 'disabled' ni 'loading': solo con la caja emitiendo.
  const indicatorState = resolveIndicatorState({ connected, reason, signal: windowSignal });
  const openNoSignal = indicatorState === 'open-no-signal';
  // Menú controlado: al abrirse se vuelve a renderizar y `hasOwnWindow` se lee fresco.
  const [menuOpen, setMenuOpen] = useState(false);
  const hasOwnWindow = getOpenedCustomerDisplayWindow() !== null;
  // F3-C ronda 4 · C1: si la pata remota no se abrió porque esta caja no está
  // vinculada a una terminal o porque la comprobación contra el servidor falló
  // (fail closed), el menú lo dice en vez de callarse: el cajero que acaba de
  // emparejar una tableta necesita saber que aquí no va a conectar nunca. Se
  // lee en cada render, igual que `hasOwnWindow`; abrir el menú provoca uno.
  const remoteLegStatus = getRemoteDisplayLegStatus();
  const remoteLegLabel =
    remoteLegStatus === 'sin-vinculo'
      ? t('indicator.remoteUnlinked')
      : remoteLegStatus === 'sin-verificar'
        ? t('indicator.remoteUnverified')
        : null;

  const handleOpen = useCallback(async () => {
    const result = await openCustomerDisplay();
    if (result.via === 'web' && result.firstTime) {
      toast({ title: t('toast.dragHint'), duration: 8000 });
      markCustomerDisplayHintShown();
    } else if (result.via === 'blocked') {
      toast({ title: t('toast.popupBlocked'), variant: 'destructive' });
    }
  }, [t, toast]);

  const handleClose = useCallback(async () => {
    // El hook ya sabe si el puente tiene ventana: con `false`, close() del puente no se llama
    // (no cerraría nada) y el resultado es 'handle' o 'none' según haya referencia propia.
    const result = await closeCustomerDisplay({ bridgeWindowOpen: windowStatus?.open });
    if (result === 'none') {
      // Hay pantalla pero esta pestaña no tiene su referencia (la abrió otra, o se recargó la caja):
      // no se puede cerrar desde aquí; el texto da la salida sin suponer quién la abrió.
      toast({ title: t('toast.closeFromOpener') });
    }
  }, [t, toast, windowStatus?.open]);

  // Si el interruptor está apagado, el botón lo dice en claro: «Sin pantalla» hacía
  // creer que el problema era la ventana, cuando lo que faltaba era activarla.
  const baseLabel =
    indicatorState === 'connected'
      ? t('indicator.connected')
      : indicatorState === 'disabled'
        ? t('indicator.disabled')
        : indicatorState === 'open-no-signal'
          ? t('indicator.openNoSignal')
          : t('indicator.disconnected');
  // F3-C: conectada dice además por dónde (ventana en este equipo, tableta remota o ambas).
  const originKind = describePresenceOrigins(origins);
  const label =
    indicatorState === 'connected' && originKind ? t('indicator.connectedWithOrigin', { origin: t(`indicator.${ORIGIN_LABEL_KEY[originKind]}`) }) : baseLabel;
  const [enabling, setEnabling] = useState(false);
  const handleEnableAndOpen = useCallback(async () => {
    setEnabling(true);
    try {
      await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
      // La caja de esta ventana aplica el interruptor y se anuncia; las demás lo reciben por `storage`.
      applyPosDisplaySettings();
      // Escritorio: esta máquina también abrirá la pantalla sola al arrancar (con el monitor que ya
      // tuviera elegido). Si el puente falla no se bloquea la apertura: la organización ya quedó encendida.
      void enableDesktopDisplayHere(getDesktopPosDisplayBridge(), readLocalStorage());
      toast({ title: t('toast.enabled') });
      await handleOpen();
    } catch (err) {
      console.error('No se pudo activar la pantalla del cliente:', err);
      toast({ title: t('toast.enableError'), variant: 'destructive' });
    } finally {
      setEnabling(false);
    }
  }, [handleOpen, t, toast]);
  // 'loading' (o emitiendo): sin etiqueta. Solo se afirma «desactivada» cuando el interruptor ya se leyó y está apagado.
  const notEmittingLabel =
    reason === 'disabled' ? t('indicator.notEmitting') : reason === 'unsupported' ? t('indicator.unsupported') : null;
  // En escritorio (F1) el puente cierra la ventana aunque esta pestaña no la haya abierto,
  // pero solo si sabe cerrar (un puente que solo abre no cuenta) Y hay ventana según `status()`:
  // con la ventana cerrada, «Cerrar» iba habilitado y pulsarlo no hacía nada.
  const nothingToClose = resolveNothingToClose({
    connected,
    hasOwnWindow,
    bridgeCanClose: canCloseViaNativeBridge(),
    windowOpen: windowStatus?.open,
  });

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${t('indicator.ariaLabel')}: ${label}`}
            title={label}
            className={cn('h-8 px-2 gap-1.5 text-xs sm:text-sm dark:text-gray-300 text-gray-600', className)}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-block h-2.5 w-2.5 rounded-full shrink-0',
                indicatorState === 'connected'
                  ? 'bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.25)]'
                  : openNoSignal
                    ? 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]'
                    : 'bg-gray-400 dark:bg-gray-600',
              )}
            />
            <span className="hidden md:inline whitespace-nowrap">{label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {openNoSignal && (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-amber-700 dark:text-amber-300 whitespace-normal">
                {t('indicator.openNoSignalHint')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {notEmittingLabel && (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-gray-500 dark:text-gray-400 whitespace-normal">
                {notEmittingLabel}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {reason === 'disabled' && (
            <DropdownMenuItem onSelect={() => void handleEnableAndOpen()} disabled={enabling} className="gap-2 cursor-pointer">
              <Power className="h-4 w-4" aria-hidden="true" />
              {t('menu.enableAndOpen')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void handleOpen()} className="gap-2 cursor-pointer">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t('menu.open')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleClose()} disabled={nothingToClose} className="gap-2 cursor-pointer">
            <MonitorX className={cn('h-4 w-4', nothingToClose && 'opacity-60')} aria-hidden="true" />
            {t('menu.close')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {remoteLegLabel && (
            <DropdownMenuLabel className="text-xs font-normal text-amber-700 dark:text-amber-300 whitespace-normal">
              {remoteLegLabel}
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem onSelect={openPairing} className="gap-2 cursor-pointer">
            <Tablet className="h-4 w-4" aria-hidden="true" />
            {t('menu.pair')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openRevoke} className="gap-2 cursor-pointer">
            <Unlink className="h-4 w-4" aria-hidden="true" />
            {t('menu.revoke')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Fuera del menú: el menú se cierra al elegir y los diálogos siguen montados (F3-C). */}
      <PairingCodeDialog open={pairOpen} onOpenChange={setPairOpen} terminalId={pairingTerminalId} />
      <RevokeRemoteDisplayDialog open={revokeOpen} onOpenChange={setRevokeOpen} terminalId={pairingTerminalId} />
    </>
  );
}
