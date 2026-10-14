'use client';

/**
 * «Método de pago» de Organización › Plan y facturación (Figma 08, sección 9):
 * tarjeta del kit con las tarjetas guardadas en Stripe, la predeterminada
 * marcada, «Gestionar facturación» (portal de Stripe) y quitar una tarjeta con
 * ConfirmDialog (antes `confirm()` nativo, auditoría 2026-10 P2-1). Los métodos
 * los resuelve el servidor por la organización
 * (`/api/subscriptions/payment-methods`).
 *
 * Si no hay ninguna tarjeta —tampoco cuando el alta no dejó cliente de Stripe—
 * el estado vacío del kit abre `DialogoVincularTarjeta`. Guardarla no cobra.
 */
import { useCallback, useEffect, useState } from 'react';
import { CreditCard, ExternalLink, Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/utils/Utils';
import { PaymentMethodSkeleton } from './OrganizationSkeletons';
import { DialogoVincularTarjeta } from './plan/DialogoVincularTarjeta';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface PaymentMethodCardProps {
  /**
   * Solo se mira si hay cliente de Stripe (verdadero/falso): los métodos los
   * resuelve el servidor por la organización (`/api/subscriptions/payment-methods`).
   */
  stripeCustomerId: string | null;
  organizationId: number;
  onPaymentMethodUpdated?: () => void;
  initialPaymentMethods?: PaymentMethod[];
}

const MARCAS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  diners: 'Diners',
  jcb: 'JCB',
  unionpay: 'UnionPay',
};

function mensaje(e: unknown, respaldo: string): string {
  return e instanceof Error && e.message ? e.message : respaldo;
}

export default function PaymentMethodCard({ stripeCustomerId, organizationId, onPaymentMethodUpdated, initialPaymentMethods }: PaymentMethodCardProps) {
  const t = useTranslations('org.paymentMethod');
  const [metodos, setMetodos] = useState<PaymentMethod[]>(initialPaymentMethods ?? []);
  const [hayCliente, setHayCliente] = useState(Boolean(stripeCustomerId));
  const [cargando, setCargando] = useState(Boolean(stripeCustomerId) && (!initialPaymentMethods || initialPaymentMethods.length === 0));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vincularAbierto, setVincularAbierto] = useState(false);
  // Confirmación del kit en lugar de `confirm()` nativo (auditoría 2026-10, P2-1).
  const [porQuitar, setPorQuitar] = useState<string | null>(null);

  useEffect(() => {
    if (stripeCustomerId) setHayCliente(true);
  }, [stripeCustomerId]);

  const cargar = useCallback(async () => {
    if (!organizationId) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/payment-methods?organizationId=${organizationId}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as { paymentMethods?: PaymentMethod[]; error?: string };
      if (!res.ok) throw new Error(json.error || t('errorLoading'));
      setMetodos(json.paymentMethods ?? []);
    } catch (e) {
      setError(mensaje(e, t('errorLoading')));
    } finally {
      setCargando(false);
    }
  }, [organizationId, t]);

  useEffect(() => {
    if (stripeCustomerId && (!initialPaymentMethods || initialPaymentMethods.length === 0)) void cargar();
    else setCargando(false);
  }, [stripeCustomerId, initialPaymentMethods, cargar]);

  const quitar = async (id: string) => {
    setOcupado(id);
    setError(null);
    try {
      const res = await fetch('/api/subscriptions/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, action: 'delete', paymentMethodId: id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || t('errorDeleting'));
      setPorQuitar(null);
      await cargar();
      onPaymentMethodUpdated?.();
    } catch (e) {
      setError(mensaje(e, t('errorDeleting')));
    } finally {
      setOcupado(null);
    }
  };

  const abrirPortal = async () => {
    if (!stripeCustomerId || !organizationId) return;
    setOcupado('portal');
    setError(null);
    try {
      const res = await fetch('/api/subscriptions/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, returnUrl: window.location.href }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || t('errorPortal'));
      window.location.href = json.url;
    } catch (e) {
      setError(mensaje(e, t('errorPortal')));
      setOcupado(null);
    }
  };

  const alVincular = async () => {
    setVincularAbierto(false);
    setHayCliente(true);
    await cargar();
    onPaymentMethodUpdated?.();
  };

  const vacio = (
    <EmptyState
      compacto
      icono={CreditCard}
      titulo={t('noPaymentMethod')}
      descripcion={t('noPaymentMethodDesc')}
      accion={{ etiqueta: t('linkCard'), onClick: () => setVincularAbierto(true), icono: Plus }}
    />
  );

  const dialogo = (
    <DialogoVincularTarjeta
      abierto={vincularAbierto}
      organizationId={organizationId}
      onAbiertoChange={setVincularAbierto}
      onListo={alVincular}
    />
  );

  if (!hayCliente) {
    return (
      <Tarjeta titulo={t('title')} descripcion={t('description')} icono={CreditCard}>
        {vacio}
        {dialogo}
      </Tarjeta>
    );
  }

  if (cargando) return <PaymentMethodSkeleton />;

  const sinTarjetas = metodos.length === 0;

  return (
    <Tarjeta
      titulo={t('title')}
      descripcion={t('description')}
      icono={CreditCard}
      accion={
        sinTarjetas ? undefined : (
          <button type="button" onClick={() => void abrirPortal()} disabled={ocupado === 'portal'} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            {ocupado === 'portal' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {ocupado === 'portal' ? t('opening') : t('manageBilling')}
          </button>
        )
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-line-danger bg-danger-subtle p-3 text-[13px] text-danger-text">
          {error}
        </p>
      )}
      {sinTarjetas ? (
        vacio
      ) : (
        <ul className="flex flex-col gap-2">
          {metodos.map((pm) => {
            const unica = metodos.length === 1;
            const marca = MARCAS[(pm.brand || '').toLowerCase()] ?? pm.brand;
            const nombre = marca ? `${marca} •••• ${pm.last4}` : `•••• ${pm.last4}`;
            return (
              <li
                key={pm.id}
                className={cn('flex items-center justify-between gap-3 rounded-xl border p-3', pm.isDefault ? 'border-line-brand bg-brand-tint' : 'border-line')}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="flex h-8 w-12 shrink-0 items-center justify-center rounded-md bg-fg text-[11px] font-bold uppercase text-surface">
                    {(pm.brand || 'card').slice(0, 4)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{nombre}</p>
                    <p className="text-xs text-fg-secondary">
                      {t('expires')} {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}
                    </p>
                  </div>
                  {pm.isDefault && <StatusBadge estado="predeterminada" tono="marca" etiqueta={t('default')} tamano="sm" />}
                </div>
                <button
                  type="button"
                  onClick={() => setPorQuitar(pm.id)}
                  disabled={ocupado === pm.id || unica}
                  aria-label={`${t('delete')} ${nombre}`}
                  title={unica ? t('cantDeleteOnly') : t('delete')}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-danger-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {ocupado === pm.id ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {dialogo}
      <ConfirmDialog
        open={porQuitar !== null}
        onOpenChange={(o) => !o && ocupado === null && setPorQuitar(null)}
        title={t('delete')}
        description={t('confirmDelete')}
        confirmLabel={t('delete')}
        variant="destructive"
        loading={ocupado !== null && ocupado === porQuitar}
        onConfirm={async () => {
          if (porQuitar) await quitar(porQuitar);
        }}
      />
    </Tarjeta>
  );
}
