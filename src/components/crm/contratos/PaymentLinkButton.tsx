'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import { formatMoney } from '@/lib/services/crm/proposalNarrative';
import { ApiError, paymentApi, type PaymentStatus } from '@/components/crm/propuestas/proposalApi';

/**
 * F10 — Stripe Payment Link para la propuesta. Requiere factura (se genera al
 * ganar la oportunidad): el enlace cobra el SALDO de la factura y el webhook
 * registra el pago por `paymentService`. Sin Stripe real → «Pago en línea no
 * configurado» con qué falta, sin llamar al proveedor.
 */
export interface PaymentLinkButtonProps {
  quotationId: string | null;
  /** Cambia cuando la propuesta se regenera/gana para recargar el estado. */
  refreshToken?: number;
}

export function PaymentLinkButton({ quotationId, refreshToken = 0 }: PaymentLinkButtonProps) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!quotationId) { setStatus(null); return; }
    setError(null);
    try {
      setStatus(await paymentApi.status(quotationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo consultar el estado del pago');
    }
  }, [quotationId]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const create = async () => {
    if (!quotationId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await paymentApi.createLink(quotationId);
      setStatus((s) => (s ? { ...s, payment_link_url: r.url } : s));
      toast({ title: r.reused ? 'Enlace de pago listo' : 'Enlace de pago creado', description: `${formatMoney(r.amount, r.currency)} · cópialo o compártelo con el cliente.` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStatus((s) => (s ? { ...s, configured: false, missing: e.payload?.missing ?? s.missing } : s));
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo crear el enlace');
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!status?.payment_link_url) return;
    try {
      await navigator.clipboard.writeText(status.payment_link_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'No se pudo copiar', description: status.payment_link_url });
    }
  };

  if (!quotationId) {
    return <p className="text-sm text-gray-600 dark:text-gray-400">Genera la propuesta para habilitar el pago en línea.</p>;
  }

  return (
    <div className="space-y-2">
      {status && !status.configured && (
        <Alert className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
          <CreditCard className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <AlertTitle className="text-amber-900 dark:text-amber-100">Pago en línea no configurado</AlertTitle>
          <AlertDescription className="text-amber-900 dark:text-amber-100"><ul className="list-disc pl-5 text-sm">{status.missing.map((m, i) => <li key={i}>{m}</li>)}</ul></AlertDescription>
        </Alert>
      )}
      {status?.configured && !status.invoice && (
        <p className="text-sm text-gray-700 dark:text-gray-300">La propuesta aún no tiene factura. Al ganar la oportunidad se genera automáticamente y aquí aparecerá el enlace de pago por el saldo.</p>
      )}
      {status?.configured && status.invoice && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-700 dark:text-gray-300">Factura {status.invoice.number} · saldo {formatMoney(status.invoice.balance, status.invoice.currency)}{status.invoice.status === 'paid' ? ' · pagada' : ''}</span>
          {status.payment_link_url ? (
            <>
              <Button type="button" variant="outline" size="sm" asChild><a href={status.payment_link_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Abrir enlace de pago</a></Button>
              <Button type="button" variant="outline" size="sm" onClick={copy} aria-live="polite">{copied ? <Check className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 mr-1" aria-hidden="true" />}{copied ? 'Copiado' : 'Copiar enlace'}</Button>
            </>
          ) : (
            <Button type="button" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={create} disabled={busy || status.invoice.balance <= 0}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden="true" /> : <CreditCard className="h-3.5 w-3.5 mr-1" aria-hidden="true" />}Crear enlace de pago
            </Button>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}
