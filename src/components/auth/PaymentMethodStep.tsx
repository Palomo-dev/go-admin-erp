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

// Cargar Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface PaymentMethodStepProps {
  formData: {
    email: string;
    firstName: string;
    lastName: string;
    subscriptionPlan: string;
  };
  updateFormData: (data: any) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  loading: boolean;
}

// Estilos para Stripe Elements
const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1f2937',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': {
        color: '#9ca3af',
      },
      iconColor: '#6b7280',
    },
    invalid: {
      color: '#dc2626',
      iconColor: '#dc2626',
    },
  },
  hidePostalCode: true,
};

function PaymentForm({ formData, updateFormData, onNext, onBack, onSkip, loading }: PaymentMethodStepProps) {
  const stripe = useStripe();
  const elements = useElements();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [setupIntentSecret, setSetupIntentSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [verifiedCard, setVerifiedCard] = useState<any>(null);

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
          setSetupIntentSecret(data.clientSecret);
          setCustomerId(data.customerId);
          // Guardar customer ID temporal en formData
          updateFormData({ stripeCustomerId: data.customerId });
        } else {
          setError('Error preparando el sistema de pago. Puedes omitir este paso.');
        }
      } catch (err) {
        console.error('Error creating setup intent:', err);
        setError('Error de conexión. Puedes omitir este paso.');
      }
    };

    if (formData.email) {
      createSetupIntent();
    }
  }, [formData.email]);

  const handleCardChange = (event: any) => {
    setCardComplete(event.complete);
    if (event.error) {
      setError(event.error.message);
    } else {
      setError(null);
    }
  };

  const handleVerifyPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !setupIntentSecret) {
      setError('El sistema de pago no está listo. Intenta de nuevo.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const cardElement = elements.getElement(CardElement);
      
      if (!cardElement) {
        throw new Error('No se encontró el elemento de tarjeta');
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
        throw new Error(confirmError.message || 'Error al verificar la tarjeta');
      }

      if (setupIntent?.status === 'succeeded') {
        // Obtener detalles del método de pago verificado
        const verifyResponse = await fetch(`/api/stripe/setup-intent?setupIntentId=${setupIntent.id}`);
        const verifyData = await verifyResponse.json();

        if (verifyData.success && verifyData.paymentMethod) {
          setVerifiedCard(verifyData.paymentMethod);
          setPaymentVerified(true);
          // Guardar el ID del método de pago en formData
          updateFormData({ 
            stripePaymentMethodId: verifyData.paymentMethod.id,
            stripeCustomerId: customerId,
          });
        }
      }
    } catch (err: any) {
      console.error('Error verificando tarjeta:', err);
      setError(err.message || 'Error al verificar el método de pago');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleContinue = () => {
    onNext();
  };

  const isPaidPlan = formData.subscriptionPlan !== 'free';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="text-center mb-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-2 sm:mb-3 bg-blue-100 rounded-full flex items-center justify-center">
          <CreditCardIcon className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">
          Método de Pago
        </h3>
        <p className="text-xs sm:text-sm text-gray-600 mt-1 px-2">
          {isPaidPlan 
            ? 'Agrega un método de pago para cuando termine tu período de prueba.'
            : 'Puedes agregar un método de pago ahora o más tarde.'
          }
        </p>
        {isPaidPlan && (
          <div className="mt-2 inline-flex items-center px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
            <CheckCircleIcon className="w-3.5 h-3.5 mr-1" />
            No se realizará ningún cobro ahora
          </div>
        )}
      </div>

      {/* Tarjeta verificada */}
      {paymentVerified && verifiedCard ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircleIcon className="w-5 h-5 text-green-600 mr-2" />
            <div>
              <p className="text-sm font-medium text-green-800">
                ¡Método de pago verificado!
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                {verifiedCard.brand?.toUpperCase()} •••• {verifiedCard.last4} - Exp. {verifiedCard.expMonth}/{verifiedCard.expYear}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Formulario de tarjeta */
        <form onSubmit={handleVerifyPayment} className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Información de la tarjeta
            </label>
            <div className="bg-white rounded-md border border-gray-300 p-3 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <CardElement 
                options={cardElementOptions}
                onChange={handleCardChange}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Solo verificamos que la tarjeta sea válida. No se realizará ningún cargo.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start">
              <ExclamationTriangleIcon className="w-4 h-4 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!stripe || !cardComplete || isProcessing || !setupIntentSecret}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center"
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Verificando...
              </>
            ) : (
              <>
                <CreditCardIcon className="w-4 h-4 mr-2" />
                Verificar Tarjeta
              </>
            )}
          </button>
        </form>
      )}

      {/* Información de seguridad */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-4">
        <div className="flex items-start text-xs text-blue-700">
          <svg className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <div>
            <p className="font-medium">Pago seguro con Stripe</p>
            <p className="mt-0.5 text-blue-600">Tus datos están protegidos con encriptación de nivel bancario.</p>
          </div>
        </div>
      </div>

      {/* Botones de navegación */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onBack}
          disabled={loading || isProcessing}
          className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          Anterior
        </button>
        
        <button
          type="button"
          onClick={onSkip}
          disabled={loading || isProcessing}
          className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
        >
          Omitir por ahora
        </button>

        {paymentVerified && (
          <button
            type="button"
            onClick={handleContinue}
            disabled={loading}
            className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 flex items-center justify-center"
          >
            Continuar
            <ArrowRightIcon className="w-4 h-4 ml-1" />
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
