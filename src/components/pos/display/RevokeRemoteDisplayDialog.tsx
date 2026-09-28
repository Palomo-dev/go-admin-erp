'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { PosTerminalsService, isForbiddenError, isOrgMismatchError, isTerminalNotFoundError } from '@/lib/services/posTerminalsService';
import { markRemoteDisplayRevoked } from '@/lib/pos/display/revocation';

export interface RevokeRemoteDisplayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `pos_terminals.id` de la caja vinculada; con null se avisa «no vinculada» y no se llama a nada. */
  terminalId: string | null;
  /** Tras revocar con éxito (la tarjeta relee la terminal). */
  onRevoked?: () => void;
}

/**
 * «Revocar» la pantalla remota (PLAN §7 y §11; Fase 3, parte C): confirma y
 * llama a `POST /api/pos/display/revoke` (PosTerminalsService.revokeRemoteDisplay).
 * La tableta deja de autenticar en su siguiente latido y el canal muere en
 * <= 5 min (TTL del JWT de Realtime, F3-A ronda 3 · 2); para volver a usarla
 * hay que emparejarla con un código nuevo. Rol admin/manager en el servidor.
 *
 * Y la CAJA deja de publicar en el acto (ronda 5 · 2, `markRemoteDisplayRevoked`),
 * sin esperar a que la tableta coopere: el pestillo cierra la pata remota de
 * esa terminal en todas las ventanas de este navegador, y desde la ronda de
 * cierre también en las que se abran DESPUÉS y tras un F5 (el pestillo se
 * guarda, ya no vive solo en memoria). En una caja abierta en
 * OTRA máquina la barrera sigue siendo el 401 de la tableta y el TTL del JWT,
 * que es lo que explica `revokedHint`.
 * Idempotente: sin pantalla emparejada también «revoca».
 */
export function RevokeRemoteDisplayDialog({ open, onOpenChange, terminalId, onRevoked }: RevokeRemoteDisplayDialogProps) {
  const t = useTranslations('posCustomerDisplay.pairing');
  const { toast } = useToast();
  const [revoking, setRevoking] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (!terminalId) {
      toast({ title: t('notFound'), variant: 'destructive' });
      return;
    }
    setRevoking(true);
    try {
      await PosTerminalsService.revokeRemoteDisplay(terminalId);
      // La caja corta el flujo por su cuenta (ronda 5 · 2): la pata remota de
      // esta terminal se cierra en el acto en todas las ventanas de este
      // navegador y no la reabre ninguna señal hasta que se emita un código
      // de emparejamiento nuevo. Sin esto, «Revocar» solo surtía efecto si la
      // tableta honraba su 401, y una robada seguía recibiendo el carrito
      // mientras le durara el JWT de Realtime.
      markRemoteDisplayRevoked(terminalId);
      // El aviso explica la ventana residual (ronda 4 · 3): la ruta ya borró el
      // hash y la última señal, pero el JWT de Realtime que la tableta tiene en
      // la mano vive hasta 5 min, así que puede seguir viéndose «conectada» un
      // rato. Sin decirlo, el administrador no sabe si la revocación surtió
      // efecto, que en una acción de seguridad es lo peor que puede pasar.
      toast({ title: t('revoked'), description: t('revokedHint') });
      onRevoked?.();
    } catch (err) {
      console.error('No se pudo revocar la pantalla remota:', err);
      toast({
        title: isForbiddenError(err) ? t('forbidden') : isTerminalNotFoundError(err) ? t('notFound') : isOrgMismatchError(err) ? t('orgChanged') : t('revokeError'),
        variant: 'destructive',
      });
    } finally {
      setRevoking(false);
    }
  }, [onRevoked, t, terminalId, toast]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('revokeTitle')}
      description={t('revokeDescription')}
      confirmLabel={t('revokeConfirm')}
      cancelLabel={t('revokeCancel')}
      variant="destructive"
      loading={revoking}
      onConfirm={handleConfirm}
    />
  );
}
