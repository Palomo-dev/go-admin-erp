'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { CreditCardIcon, CheckCircleIcon, ExclamationTriangleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import PriceSummary from './PriceSummary';
import type { CouponData } from './PriceSummary';

// Cargar Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

/** Tarjeta ya confirmada en Stripe, para cerrar el alta sin depender del estado del padre. */
export interface TarjetaConfirmada {
  customerId: string | null;
  paymentMethodId: string;
}

interface PaymentMethodStepProps {
  formData: {
    email: string;
    firstName: string;
    lastName: string;
    subscriptionPlan: string;
    billingPeriod?: 'monthly' | 'yearly';
    skipTrial?: boolean;
    validatedCoupon?: CouponData | null;
  };
  updateFormData: (data: { stripeCustomerId?: string; stripePaymentMethodId?: string }) => void;
  onNext: (tarjeta?: TarjetaConfirmada) => void;
  onBack: () => void;
  onSkip: () => void;
  loading: boolean;
  /** El registro ya titula el paso. En la app el título vive aquí. */
  encabezado?: boolean;
}

interface TarjetaVerificada {
  id?: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
}

/** Stripe pinta en un iframe: no hereda las variables. Se leen del tema activo. */
function rgbDeToken(nombre: string, respaldo: string): string {
  if (typeof document === 'undefined') return respaldo;
  const crudo = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  const partes = crudo.split(/\s+/).slice(0, 3);
  if (partes.length < 3 || partes.some((p) => Number.isNaN(Number(p)))) return respaldo;
  return `rgb(${partes.join(', ')})`;
}

function opcionesTarjetaStripe() {
  const peligro = rgbDeToken('--state-danger', '#dc2626');
  return {
    style: {
      base: {
        fontSize: '16px',
        color: rgbDeToken('--text-primary', '#0f172a'),
        fontFamily: 'system-ui, -apple-system, sans-serif',
        '::placeholder': {
          color: rgbDeToken('--text-muted', '#94a3b8'),
        },
        iconColor: rgbDeToken('--text-secondary', '#64748b'),
      },
      invalid: {
        color: peligro,
        iconColor: peligro,
      },
    },
    hidePostalCode: true,
  };
}

function useTemaTarjeta() {
  const [tema, setTema] = useState<'claro' | 'oscuro'>('claro');
  const [opciones, setOpciones] = useState(opcionesTarjetaStripe);

  useEffect(() => {
    const aplicar = () => {
      const oscuro = document.documentElement.classList.contains('dark');
      setTema(oscuro ? 'oscuro' : 'claro');
      setOpciones(opcionesTarjetaStripe());
    };
    aplicar();
    const obs = new MutationObserver(aplicar);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  return { tema, opciones };
}

function PaymentForm({ formData, updateFormData, onNext, onBack, onSkip, loading, encabezado = true }: PaymentMethodStepProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { tema, opciones } = useTemaTarjeta();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [setupIntentSecret, setSetupIntentSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [verifiedCard, setVerifiedCard] = useState<TarjetaVerificada | null>(null);
  const t = useTranslations('auth.signup.payment');
  const tc = useTranslations('common');

  // Crear Setup Intent al montar el componente
  useEffect(() => {
    const createSetupIntent = async () => {
      try {
        const response = await fetch('/api/stripe/setup-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            name: `${formData.firstName} ${formData.lastName}`,
          }),
        });

        const data = await response.json();
        
        if (data.success) {
          const customer = typeof data.customerId === 'string' ? data.customerId : null;
          setSetupIntentSecret(typeof data.clientSecret === 'string' ? data.clientSecret : null);
          setCustomerId(customer);
          if (customer) updateFormData({ stripeCustomerId: customer });
        } else {
          setError(t('errorSetupPayment'));
        }
      } catch (err) {
        console.error('Error creating setup intent:', err);
        setError(t('errorConnection'));
      }
    };

    if (formData.email) {
      createSetupIntent();
    }
    // Solo con el correo: el nombre ya viene del paso anterior y updateFormData
    // cambia en cada render. Repetir el efecto crearía varios Setup Intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.email]);

  const handleCardChange = (event: { complete: boolean; error?: { message?: string } }) => {
    setCardComplete(event.complete);
    if (event.error) {
      setError(event.error.message ?? null);
    } else {
      setError(null);
    }
  };

  const handleVerifyPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !setupIntentSecret) {
      setError(t('paymentNotReady'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const cardElement = elements.getElement(CardElement);
      
      if (!cardElement) {
        throw new Error(t('cardNotFound'));
      }

      // Confirmar el Setup Intent (esto verifica que la tarjeta es válida)
      const { error: confirmError, setupIntent } = await stripe.confirmCardSetup(
        setupIntentSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              email: formData.email,
              name: `${formData.firstName} ${formData.lastName}`,
            },
          },
        }
      );

      if (confirmError) {
        throw new Error(confirmError.message || t('errorVerifyCard'));
      }

      if (setupIntent?.status === 'succeeded') {
        // Obtener detalles del método de pago verificado
        const verifyResponse = await fetch(`/api/stripe/setup-intent?setupIntentId=${setupIntent.id}`);
        const verifyData = await verifyResponse.json();

        const medio = verifyData.paymentMethod;
        if (verifyData.success && medio?.id) {
          const paymentMethodId = String(medio.id);
          setVerifiedCard({
            id: paymentMethodId,
            brand: typeof medio.brand === 'string' ? medio.brand : undefined,
            last4: typeof medio.last4 === 'string' ? medio.last4 : undefined,
            expMonth: typeof medio.expMonth === 'number' ? medio.expMonth : undefined,
            expYear: typeof medio.expYear === 'number' ? medio.expYear : undefined,
          });
          setPaymentVerified(true);
          updateFormData({
            stripePaymentMethodId: paymentMethodId,
            stripeCustomerId: customerId ?? undefined,
          });
          // «Pagar ahora» cobra al terminar el alta. El botón de seguir no se
          // puede quedar como único camino: en móvil el flex lo escondía y la
          // organización no se creaba, así que la tarjeta no quedaba en ningún lado.
          if (formData.skipTrial === true) {
            onNext({ customerId, paymentMethodId });
          }
        }
      }
    } catch (err: unknown) {
      console.error('Error verificando tarjeta:', err);
      setError(err instanceof Error && err.message ? err.message : t('errorVerifyCard'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleContinue = () => {
    const paymentMethodId = verifiedCard?.id ? String(verifiedCard.id) : undefined;
    onNext(paymentMethodId ? { customerId, paymentMethodId } : undefined);
  };

  const isPaidPlan = formData.subscriptionPlan !== 'free';
  const isPayNow = formData.skipTrial === true;
  const billingPeriod = formData.billingPeriod || 'monthly';

  return (
    <div className="space-y-4">
      {(encabezado || isPaidPlan) && (
        <div className="flex flex-col items-center gap-2 text-center">
          {encabezado && (
            <>
              <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-tint text-brand-deep" aria-hidden="true">
                <CreditCardIcon className="size-7" />
              </span>
              <h3 className="text-lg font-semibold text-fg">{t('title')}</h3>
              <p className="text-sm text-fg-secondary">
                {isPaidPlan ? (isPayNow ? t('payNowMessage') : t('paidPlanMessage')) : t('freePlanMessage')}
              </p>
            </>
          )}
          {isPaidPlan && !isPayNow && (
            <p className="inline-flex items-center rounded-full bg-success-subtle px-2.5 py-1 text-xs font-medium text-success-text">
              <CheckCircleIcon className="mr-1 size-3.5" aria-hidden="true" />
              {t('noChargeNow')}
            </p>
          )}
          {isPayNow && (
            <p className="inline-flex items-center rounded-full bg-warning-subtle px-2.5 py-1 text-xs font-medium text-warning-text">
              <ExclamationTriangleIcon className="mr-1 size-3.5" aria-hidden="true" />
              {t('chargeNow')}
            </p>
          )}
        </div>
      )}

      {isPaidPlan && (
        <PriceSummary
          subscriptionPlan={formData.subscriptionPlan}
          billingPeriod={billingPeriod}
          skipTrial={isPayNow}
          coupon={formData.validatedCoupon || null}
          compact
        />
      )}

      {paymentVerified && verifiedCard ? (
        <div className="rounded-xl border border-line-success bg-success-subtle p-4">
          <div className="flex items-center">
            <CheckCircleIcon className="mr-2 size-5 text-success-text" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-success-text">{t('verified')}</p>
              <p className="mt-0.5 text-xs text-success-text">
                {verifiedCard.brand?.toUpperCase()} •••• {verifiedCard.last4} - Exp. {verifiedCard.expMonth}/{verifiedCard.expYear}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleVerifyPayment} className="space-y-4">
          <div className="rounded-xl border border-line bg-canvas p-4">
            <label className="mb-2 block text-sm font-medium text-fg">{t('cardInfo')}</label>
            <div
              className="rounded-lg border border-line-strong bg-surface p-3 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand"
              style={{ colorScheme: tema === 'oscuro' ? 'dark' : 'light' }}
            >
              <CardElement key={tema} options={opciones} onChange={handleCardChange} />
            </div>
            <p className="mt-2 text-xs text-fg-secondary">{isPayNow ? t('chargeNowDescription') : t('verifyOnly')}</p>
          </div>

          {error && (
            <div className="flex items-start rounded-xl border border-line-danger bg-danger-subtle p-3">
              <ExclamationTriangleIcon className="mr-2 mt-0.5 size-4 shrink-0 text-danger-text" aria-hidden="true" />
              <p className="text-sm text-danger-text">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!stripe || !cardComplete || isProcessing || !setupIntentSecret}
            className={cn(clasesBoton({ tamano: 'lg', anchoCompleto: true }))}
          >
            {isProcessing ? (
              <>
                <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('verifying')}
              </>
            ) : (
              <>
                <CreditCardIcon className="size-4" aria-hidden="true" />
                {isPayNow ? t('payNow') : t('verifyCard')}
              </>
            )}
          </button>
        </form>
      )}

      <div className="rounded-xl border border-line-brand bg-brand-tint p-3 text-xs text-brand-deep">
        <div className="flex items-start">
          <svg className="mr-2 mt-0.5 size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <p className="font-medium">{t('securePayment')}</p>
            <p className="mt-0.5">{t('securePaymentDescription')}</p>
          </div>
        </div>
      </div>

      {/* Sin flex-1: en una columna, basis 0% dejaba en altura cero todo
          botón salvo el primero y en el celular solo se veía «Anterior». */}
      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:gap-3">
        {paymentVerified && (
          <button
            type="button"
            onClick={handleContinue}
            disabled={loading}
            className={cn(clasesBoton({ tamano: 'md' }), 'w-full sm:w-auto')}
          >
            {tc('continue')}
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          disabled={loading || isProcessing}
          className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-full sm:w-auto')}
        >
          {t('previous')}
        </button>
        {!isPayNow && (
          <button
            type="button"
            onClick={onSkip}
            disabled={loading || isProcessing}
            className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-full sm:w-auto')}
          >
            {t('skipForNow')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PaymentMethodStep(props: PaymentMethodStepProps) {
  return (
    <Elements stripe={stripePromise}>
      <PaymentForm {...props} />
    </Elements>
  );
}
