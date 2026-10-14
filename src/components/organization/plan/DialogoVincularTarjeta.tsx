'use client';

/**
 * Diálogo del kit para vincular la tarjeta de la suscripción (Figma 08,
 * método de pago). El SetupIntent es del cliente de la organización, no del
 * alta. Confirmarla no cobra: el servidor solo la deja predeterminada.
 */
import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { CreditCard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, Dialogo } from '@/components/kit';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

const OPCIONES_TARJETA = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1c1917',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': { color: '#a8a29e' },
      iconColor: '#78716c',
    },
    invalid: { color: '#b91c1c', iconColor: '#b91c1c' },
  },
  hidePostalCode: true,
};

function codigoDe(json: { code?: string; error?: string }): string | undefined {
  return json.code;
}

function Formulario({
  organizationId,
  onListo,
  onCerrar,
}: {
  organizationId: number;
  onListo: () => void | Promise<void>;
  onCerrar: () => void;
}) {
  const t = useTranslations('org.paymentMethod');
  const stripe = useStripe();
  const elements = useElements();
  const [secreto, setSecreto] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(true);
  const [completa, setCompleta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const preparar = async () => {
      try {
        const res = await fetch('/api/subscriptions/payment-methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId, action: 'create-setup-intent' }),
        });
        const json = (await res.json().catch(() => ({}))) as { clientSecret?: string; code?: string; error?: string };
        if (!res.ok || !json.clientSecret) {
          const code = codigoDe(json);
          if (code === 'SIN_SUSCRIPCION') throw new Error(t('errorNoSubscription'));
          if (code === 'DEMASIADAS') throw new Error(t('errorTooMany'));
          throw new Error(t('errorPrepare'));
        }
        if (vivo) setSecreto(json.clientSecret);
      } catch (e) {
        if (vivo) setError(e instanceof Error && e.message ? e.message : t('errorPrepare'));
      } finally {
        if (vivo) setPreparando(false);
      }
    };
    void preparar();
    return () => {
      vivo = false;
    };
  }, [organizationId, t]);

  const vincular = async () => {
    if (!stripe || !elements || !secreto) {
      setError(t('errorPrepare'));
      return;
    }
    const tarjeta = elements.getElement(CardElement);
    if (!tarjeta) {
      setError(t('errorPrepare'));
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(secreto, {
        payment_method: { card: tarjeta },
      });
      if (confirmError || setupIntent?.status !== 'succeeded' || !setupIntent.id) {
        throw new Error(confirmError?.message || t('errorLink'));
      }
      const res = await fetch('/api/subscriptions/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, action: 'confirmar-tarjeta', setupIntentId: setupIntent.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!res.ok) {
        throw new Error(json.code === 'SIN_SUSCRIPCION' ? t('errorNoSubscription') : t('errorLink'));
      }
      await onListo();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t('errorLink'));
      setOcupado(false);
    }
  };

  return (
    <Dialogo
      abierto
      onAbiertoChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      titulo={t('linkCardTitle')}
      descripcion={t('linkCardDialog')}
      icono={CreditCard}
      ancho={440}
      primario={{
        etiqueta: t('linkCard'),
        onClick: () => void vincular(),
        cargando: ocupado,
        deshabilitada: preparando || !completa || !secreto || !stripe,
        motivo: preparando ? t('preparingCard') : undefined,
      }}
    >
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg">{t('cardLabel')}</span>
        <div className="rounded-lg border border-line bg-surface px-3 py-3" role="group" aria-label={t('cardLabel')}>
          <CardElement
            options={OPCIONES_TARJETA}
            onChange={(event) => {
              setCompleta(event.complete);
              setError(event.error?.message ?? null);
            }}
          />
        </div>
        {error && <AvisoTonal tono="peligro" titulo={error} />}
      </div>
    </Dialogo>
  );
}

export function DialogoVincularTarjeta({
  abierto,
  organizationId,
  onAbiertoChange,
  onListo,
}: {
  abierto: boolean;
  organizationId: number;
  onAbiertoChange: (abierto: boolean) => void;
  onListo: () => void | Promise<void>;
}) {
  if (!abierto) return null;
  return (
    <Elements stripe={stripePromise}>
      <Formulario organizationId={organizationId} onListo={onListo} onCerrar={() => onAbiertoChange(false)} />
    </Elements>
  );
}
