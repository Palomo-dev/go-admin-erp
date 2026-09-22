'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/utils/Utils';
import {
  PosTerminalsService,
  isForbiddenError,
  isOrgMismatchError,
  isTerminalInactiveError,
  isTerminalNotFoundError,
  type PairingCodeIssue,
} from '@/lib/services/posTerminalsService';
import { formatCountdown, formatPairingCode, pairingRemainingMs, resolvePairingUrl } from '@/lib/pos/display/remotePairing';
import { clearRemoteDisplayRevoked } from '@/lib/pos/display/revocation';

/** Clave de `posCustomerDisplay.pairing` con la que se explica un fallo al pedir el código. */
type PairingErrorKey = 'forbidden' | 'notFound' | 'inactive' | 'orgChanged' | 'requestError';

function pairingErrorKey(err: unknown): PairingErrorKey {
  if (isForbiddenError(err)) return 'forbidden';
  if (isTerminalNotFoundError(err)) return 'notFound';
  if (isTerminalInactiveError(err)) return 'inactive';
  if (isOrgMismatchError(err)) return 'orgChanged';
  return 'requestError';
}

/** Cada cuánto se repinta la cuenta atrás. */
const TICK_MS = 1000;

export interface PairingCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `pos_terminals.id` de la caja vinculada; null si esta caja no está vinculada (se pinta el aviso y no se pide nada). */
  terminalId: string | null;
}

/**
 * «Emparejar otro dispositivo» (PLAN §5.2 y §3.3; Fase 3, parte C): pide el
 * código de 6 dígitos a `POST /api/pos/terminals/[id]/pairing-code`
 * (PosTerminalsService.requestPairingCode) al abrirse, lo pinta GRANDE con
 * la cuenta atrás de 5 minutos que marca el `expiresAt` de la ruta, y el
 * paso a paso para la tableta. El secreto nunca pasa por el navegador: solo
 * el código, que vale una vez.
 *
 * Al abrir se pide con `reuse` (ronda 4 · 5): si la terminal ya tiene un
 * código vigente se enseña ESE, no uno nuevo. «Generar otro código» sí emite
 * uno nuevo y entonces el diálogo avisa de que el anterior dejó de valer,
 * que es justo lo que antes pasaba en silencio con cada apertura.
 *
 * Quién puede: la ruta exige admin/manager (F3-A, ronda 2 · 5); un cajero
 * ve «solo un administrador…» y nada cambia. Lo comparten la tarjeta de
 * Configuración › POS y el menú del indicador del POS.
 */
export function PairingCodeDialog({ open, onOpenChange, terminalId }: PairingCodeDialogProps) {
  const t = useTranslations('posCustomerDisplay.pairing');
  const [issue, setIssue] = useState<PairingCodeIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<PairingErrorKey | null>(null);
  /** La ruta emitió un código NUEVO y el anterior dejó de valer: hay que decirlo (ronda 4 · 5). */
  const [replaced, setReplaced] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const request = useCallback(async (options: { reuse?: boolean } = {}) => {
    if (!terminalId) {
      setIssue(null);
      setErrorKey('notFound');
      return;
    }
    setLoading(true);
    setErrorKey(null);
    try {
      const next = await PosTerminalsService.requestPairingCode(terminalId, options);
      // La ruta CONFIRMA que emitió un código nuevo, y no fue la petición
      // automática de apertura del diálogo: es la única señal explícita de
      // «voy a emparejar otra pantalla».
      const emitidoNuevo = next.reused === false && options.reuse !== true;
      // Solo entonces se suelta el pestillo que «Revocar» dejó echado
      // (ronda 5 · 2, corregido en la ronda 4 · qa/tester 3). Antes se soltaba
      // tras CUALQUIER petición con éxito, incluida la automática al abrir el
      // diálogo: como `/revoke` deja `pairing_code` en null, esa primera
      // llamada emitía un código nuevo y soltaba el pestillo en el acto, así
      // que entre abrir el diálogo y teclear los 6 dígitos en la tableta nueva
      // el dispositivo REVOCADO —con su JWT de Realtime vivo hasta 5 min—
      // recuperaba carrito, totales y el payload del QR de pago. Justo la
      // ventana en la que el administrador está actuando por seguridad.
      if (emitidoNuevo) clearRemoteDisplayRevoked(terminalId);
      setIssue(next);
      // El aviso de «el anterior dejó de valer» es el mismo hecho: con
      // `reused` ausente (ruta anterior) no se afirma nada.
      setReplaced(emitidoNuevo);
      setNow(Date.now());
    } catch (err) {
      console.error('No se pudo generar el código de emparejamiento:', err);
      setIssue(null);
      setReplaced(false);
      setErrorKey(pairingErrorKey(err));
    } finally {
      setLoading(false);
    }
  }, [terminalId]);

  // Al abrir se pide el código VIGENTE (`reuse`), no uno nuevo (ronda 4 · 5):
  // este diálogo está montado en dos sitios —la tarjeta de Configuración y el
  // menú del indicador del POS— y abrirlo por segunda vez quemaba el código
  // que el administrador acababa de dictar, sin decírselo a nadie. Para
  // cambiarlo a propósito está «Generar otro código». Al cerrar se olvida (el
  // siguiente usuario no debe ver uno vencido ni ajeno).
  useEffect(() => {
    if (!open) {
      setIssue(null);
      setErrorKey(null);
      setReplaced(false);
      return;
    }
    void request({ reuse: true });
  }, [open, request]);

  // Cuenta atrás: un tick por segundo solo mientras hay código vivo.
  const remainingMs = pairingRemainingMs(issue?.expiresAt, now);
  const expired = issue !== null && remainingMs === 0;
  useEffect(() => {
    if (!open || !issue || expired) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [open, issue, expired]);

  const url = resolvePairingUrl(typeof window === 'undefined' ? null : window.location.origin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t('generating')}
          </p>
        ) : errorKey ? (
          <p className="py-4 text-sm text-amber-700 dark:text-amber-300 break-words" role="alert">
            {t(errorKey)}
          </p>
        ) : issue ? (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('codeLabel')}</p>
            <p
              className={cn(
                'font-mono text-5xl sm:text-6xl font-semibold tracking-[0.2em] text-center select-all',
                expired ? 'text-gray-400 line-through dark:text-gray-600' : 'text-gray-900 dark:text-white',
              )}
              aria-label={`${t('codeLabel')}: ${issue.code.split('').join(' ')}`}
            >
              {formatPairingCode(issue.code)}
            </p>
            <p className={cn('text-center text-sm', expired ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-300')} role="status" aria-live="polite">
              {expired ? t('expired') : t('expiresIn', { time: formatCountdown(remainingMs) })}
            </p>
            {replaced && !expired && (
              <p className="text-center text-xs text-amber-700 dark:text-amber-300 break-words" role="status">
                {t('replacedPrevious')}
              </p>
            )}
          </div>
        ) : null}

        <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-300">
          <li className="break-words">{t('step1', { url })}</li>
          <li>{t('step2')}</li>
          <li>{t('step3')}</li>
        </ol>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="gap-2" onClick={() => void request()} disabled={loading || !terminalId}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t('regenerate')}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
