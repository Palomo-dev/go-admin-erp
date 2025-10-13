/**
 * Formulario de Checkout de Stripe
 * GO Admin ERP - Stripe Checkout Form
 * 
 * Formulario interno que muestra los elementos de pago de Stripe
 */

'use client'

import React from 'react'
import { PaymentElement } from '@stripe/react-stripe-js'
import { useStripePayment } from '@/hooks/useStripePayment'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CreditCard, AlertCircle } from 'lucide-react'
import type { PaymentIntent } from '@stripe/stripe-js'

interface StripeCheckoutFormProps {
  amount: number
  currency: string
  onSuccess: (paymentIntentId: string) => void
  onError: (error: string) => void
  onCancel: () => void
}

export function StripeCheckoutForm({
  amount,
  currency,
  onSuccess,
  onError,
  onCancel,
}: StripeCheckoutFormProps) {
  const { isProcessing, error, isReady, processPayment } = useStripePayment({
    onSuccess: (paymentIntent: PaymentIntent) => {
      onSuccess(paymentIntent.id)
    },
    onError,
  })

  /**
   * Manejar submit del formulario
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isReady) {
      return
    }

    await processPayment()
  }

  /**
   * Formatear monto
   */
  const formatAmount = () => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount)
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Información de Pago
            </span>
            <span className="text-lg font-semibold">{formatAmount()}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Mostrar error si existe */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Elementos de pago de Stripe */}
          <div className="stripe-payment-element">
            <PaymentElement
              options={{
                layout: 'tabs',
                fields: {
                  billingDetails: {
                    email: 'auto',
                    name: 'auto',
                  },
                },
              }}
            />
          </div>

          {/* Información de seguridad */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              🔒 Pago seguro con cifrado SSL
            </p>
            <p className="text-xs text-muted-foreground">
              Tus datos de tarjeta nunca son almacenados en nuestros servidores
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            type="submit"
            disabled={!isReady || isProcessing}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Pagar {formatAmount()}
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancelar
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
