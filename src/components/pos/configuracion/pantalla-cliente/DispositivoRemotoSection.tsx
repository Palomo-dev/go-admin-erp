'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Tablet, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PosTerminalsService, type PosTerminal } from '@/lib/services/posTerminalsService';
import { REMOTE_SEEN_RECENT_MINUTES, minutesSinceRemoteSeen } from '@/lib/pos/display/remotePairing';
import { PairingCodeDialog } from '@/components/pos/display/PairingCodeDialog';
import { RevokeRemoteDisplayDialog } from '@/components/pos/display/RevokeRemoteDisplayDialog';

/** Cada cuánto se relee el id local: «Vincular esta caja» (sección de arriba) escribe localStorage sin evento en la misma ventana. */
const LOCAL_ID_POLL_MS = 2000;

/**
 * Sección «Pantalla en otro dispositivo» de la tarjeta «Pantalla del
 * cliente» (PLAN §5.2 «Emparejar otro dispositivo», §3.3; Fase 3, parte C).
 *
 * - «Emparejar otro dispositivo» abre PairingCodeDialog (código de 6 dígitos
 *   grande, cuenta atrás de 5 min y paso a paso). Solo con esta caja
 *   VINCULADA a una terminal registrada y activa (EstaCajaSection); si no,
 *   se explica y el botón va deshabilitado.
 * - «Revocar» abre RevokeRemoteDisplayDialog: la tableta deja de recibir en
 *   <= 5 min. Siempre disponible con caja vinculada (idempotente).
 * - Estado: la última señal de la tableta según
 *   `pos_terminals.display_last_seen_at` (lo escribe `/heartbeat` como mucho
 *   cada 30 s; legible por la sesión con RLS). Si tiene menos de
 *   REMOTE_SEEN_RECENT_MINUTES, la tableta está encendida y emparejada. La
 *   caja NO puede saber si hay un token emparejado (vive en
 *   `pos_terminal_secrets`, sin permisos para `authenticated`): esta señal
 *   es lo que sí sabe.
 * - Tras revocar (ronda 4 · 3) la ruta borra esa señal, así que el punto pasa
 *   a gris en el acto; y esta sección explica en claro la ventana residual:
 *   la tableta puede seguir recibiendo hasta 5 min, lo que dure el JWT de
 *   Realtime que ya tiene. Antes, el punto seguía VERDE con «hace menos de un
 *   minuto» y nada decía si la revocación había surtido efecto.
 *
 * La terminal vinculada se relee al montar, cada vez que cambia el id local
 * (sondeo barato de localStorage) y tras cerrar cualquiera de los diálogos.
 */
export function DispositivoRemotoSection() {
  const t = useTranslations('posCustomerDisplay.pairing');
  const [localId, setLocalId] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<PosTerminal | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairOpen, setPairOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  /** Se revocó desde aquí en esta sesión: hay que explicar la ventana residual de la tableta (ronda 4 · 3). */
  const [justRevoked, setJustRevoked] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const row = await PosTerminalsService.getLinkedTerminal();
      setTerminal(row);
    } catch (err) {
      // Sin organización activa (sesión caducada): se pinta como no vinculada.
      console.warn('No se pudo leer la terminal vinculada para el emparejamiento remoto:', err);
      setTerminal(null);
    } finally {
      setNow(Date.now());
      setLoading(false);
    }
  }, []);

  // Id local: al montar y cuando cambia (vincular / crear en la sección de arriba).
  useEffect(() => {
    const read = () => setLocalId(PosTerminalsService.getLocalTerminalId());
    read();
    const timer = setInterval(read, LOCAL_ID_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void reload();
  }, [localId, reload]);

  const linkedActive = terminal !== null && terminal.is_active && terminal.id === localId;
  const terminalId = linkedActive ? terminal.id : null;
  const minutes = minutesSinceRemoteSeen(terminal?.display_last_seen_at, now);
  const seenLabel = minutes === null ? t('lastSeenNever') : minutes === 0 ? t('lastSeenJustNow') : t('lastSeenMinutes', { minutes });
  const seenDotClass = minutes !== null && minutes < REMOTE_SEEN_RECENT_MINUTES ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600';

  const closePair = useCallback(
    (open: boolean) => {
      setPairOpen(open);
      if (!open) void reload();
    },
    [reload],
  );
  const closeRevoke = useCallback(
    (open: boolean) => {
      setRevokeOpen(open);
      if (!open) void reload();
    },
    [reload],
  );

  return (
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
          <Tablet className="h-5 w-5 text-indigo-600" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white break-words">{t('title')}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{t('hint')}</p>
        </div>
      </div>

      {justRevoked && (
        <p className="text-xs text-amber-700 dark:text-amber-300 break-words" role="status">
          {t('revokedHint')}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('loading')}
        </p>
      ) : !linkedActive ? (
        <p className="text-xs text-amber-700 dark:text-amber-300 break-words">{t('notLinked')}</p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 break-words" role="status">
          <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${seenDotClass}`} />
          {seenLabel}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-2" disabled={!linkedActive || loading} onClick={() => setPairOpen(true)}>
          <Tablet className="h-4 w-4" aria-hidden="true" />
          {t('pairButton')}
        </Button>
        <Button type="button" variant="ghost" className="gap-2" disabled={!linkedActive || loading} onClick={() => setRevokeOpen(true)}>
          <Unlink className="h-4 w-4" aria-hidden="true" />
          {t('revokeButton')}
        </Button>
      </div>

      <PairingCodeDialog open={pairOpen} onOpenChange={closePair} terminalId={terminalId} />
      <RevokeRemoteDisplayDialog open={revokeOpen} onOpenChange={closeRevoke} terminalId={terminalId} onRevoked={() => setJustRevoked(true)} />
    </div>
  );
}
