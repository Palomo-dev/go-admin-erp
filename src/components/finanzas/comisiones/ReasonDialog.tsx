'use client';

/**
 * Diálogo con motivo obligatorio (rechazo y clawback). Error junto al campo con
 * `aria-describedby`, foco al campo al abrir y de vuelta al disparador al cerrar.
 */

import { useEffect, useId, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';

export const REASON_MAX = 500;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** Rojo para clawback; azul de marca para rechazar. */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  /** Sustituye el retorno de foco por defecto (p. ej. cuando a este diálogo le sigue otro). */
  onCloseAutoFocus?: (event: Event) => void;
  /** A dónde va el foco si el disparador ya no existe al cerrar (p. ej. la barra de selección se desmontó). */
  focusFallback?: () => HTMLElement | null;
}

export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, destructive, busy, onConfirm, onCloseAutoFocus: onCloseAutoFocusProp, focusFallback }: Props) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const defaultCloseAutoFocus = useReturnFocus(open, focusFallback);
  const onCloseAutoFocus = onCloseAutoFocusProp ?? defaultCloseAutoFocus;

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    const value = reason.trim();
    if (!value) {
      setError('Escribe el motivo: queda registrado en la comisión.');
      document.getElementById(`${id}-reason`)?.focus();
      return;
    }
    await onConfirm(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-2"
        >
          <Label htmlFor={`${id}-reason`}>Motivo</Label>
          <Textarea
            id={`${id}-reason`}
            rows={3}
            maxLength={REASON_MAX}
            value={reason}
            autoFocus
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            onChange={(e) => {
              setReason(e.target.value);
              if (error && e.target.value.trim()) setError(null);
            }}
          />
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : (
            <p id={`${id}-hint`} className="text-xs text-gray-600 dark:text-gray-400">
              Obligatorio · máximo {REASON_MAX} caracteres.
            </p>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className={destructive ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'}>
              {busy ? 'Procesando…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
