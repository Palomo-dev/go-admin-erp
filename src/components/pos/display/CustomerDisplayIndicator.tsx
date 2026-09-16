'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, MonitorX } from 'lucide-react';
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

/**
 * Indicador de la pantalla del cliente en la cabecera del POS (PLAN §5.1).
 *
 * Punto verde «Pantalla del cliente conectada» / gris «Sin pantalla» según
 * la presencia que ve el emisor de la caja (señal de la pantalla en los
 * últimos 3 s). Al pulsarlo, un menú con «Abrir pantalla del cliente» y
 * «Cerrar». Si la caja no emite, el menú dice por qué según `reason`:
 * apagada en Configuración (etiqueta que manda al interruptor), entorno sin
 * BroadcastChannel (etiqueta propia: Configuración no lo arregla) o aún
 * cargando el interruptor (sin etiqueta: todavía no se sabe).
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
 * No sabe nada del carrito: solo abre, cierra y pinta. Fase 0: sin «mostrar
 * QR de emparejamiento» (F3) ni vista previa en miniatura. El módulo de
 * propina y calificación llega en F2.
 */
export function CustomerDisplayIndicator({ className }: { className?: string }) {
  const t = useTranslations('posCustomerDisplay');
  const { toast } = useToast();
  const { connected, reason } = useCustomerDisplayPresence();
  // Menú controlado: al abrirse se vuelve a renderizar y `hasOwnWindow` se lee fresco.
  const [menuOpen, setMenuOpen] = useState(false);
  const hasOwnWindow = getOpenedCustomerDisplayWindow() !== null;

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
    const result = await closeCustomerDisplay();
    if (result === 'none') {
      // Hay pantalla pero esta pestaña no tiene su referencia (la abrió otra, o se recargó la caja):
      // no se puede cerrar desde aquí; el texto da la salida sin suponer quién la abrió.
      toast({ title: t('toast.closeFromOpener') });
    }
  }, [t, toast]);

  const label = connected ? t('indicator.connected') : t('indicator.disconnected');
  // 'loading' (o emitiendo): sin etiqueta. Solo se afirma «desactivada» cuando el interruptor ya se leyó y está apagado.
  const notEmittingLabel =
    reason === 'disabled' ? t('indicator.notEmitting') : reason === 'unsupported' ? t('indicator.unsupported') : null;
  // En escritorio (F1) el puente cierra la ventana aunque esta pestaña no la haya abierto,
  // pero solo si sabe cerrar: un puente que solo abre no habilita «Cerrar».
  const nothingToClose = !connected && !hasOwnWindow && !canCloseViaNativeBridge();

  return (
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
              connected ? 'bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.25)]' : 'bg-gray-400 dark:bg-gray-600',
            )}
          />
          <span className="hidden md:inline whitespace-nowrap">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {notEmittingLabel && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-gray-500 dark:text-gray-400 whitespace-normal">
              {notEmittingLabel}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => void handleOpen()} className="gap-2 cursor-pointer">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {t('menu.open')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleClose()} disabled={nothingToClose} className="gap-2 cursor-pointer">
          <MonitorX className={cn('h-4 w-4', nothingToClose && 'opacity-60')} aria-hidden="true" />
          {t('menu.close')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
