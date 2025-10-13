/**
 * Componente de Checkout con Stripe
 * GO Admin ERP - Stripe Checkout Component
 * 
 * Componente reutilizable para procesar pagos con Stripe
 * en cualquier parte de la aplicación (POS, Finanzas, etc.)
 */

'use client'

import React, { useState, useEffect } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { getStripe, stripeAppearance, stripeAppearanceDark } from '@/lib/stripe/config'
import { StripeCheckoutForm } from '@/components/stripe/StripeCheckoutForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CreditCard } from 'lucide-react'
import type { Stripe } from '@stripe/stripe-js'

interface StripeCheckoutProps {
  // Datos del pago
  amount: number
  currency: string
  description?: string
  
  // IDs del sistema
  customerId?: string
  organizationId: number
  branchId: number
  
  // IDs opcionales según el contexto
  saleId?: string
  invoiceId?: string
  accountReceivableId?: string
  
  // Metadata adicional
  metadata?: Record<string, string>
  
  // Callbacks
  onSuccess: (paymentIntentId: string) => void
  onError: (error: string) => void
  onCancel?: () => void
  
  // UI
  buttonText?: string
  showAmount?: boolean
  isDarkMode?: boolean
}

export function StripeCheckout({
  amount,
  currency,
  description,
  customerId,
  organizationId,
  branchId,
  saleId,
  invoiceId,
  accountReceivableId,
  metadata,
  onSuccess,
  onError,
  onCancel,
  buttonText = 'Pagar con Tarjeta',
  showAmount = true,
  isDarkMode = false,
}: StripeCheckoutProps) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cargar Stripe
  useEffect(() => {
    setStripePromise(getStripe())
  }, [])

  /**
   * Crear Payment Intent
   */
  const handleInitiatePayment = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          currency,
          description,
          customerId,
          organizationId,
          branchId,
          saleId,
          invoiceId,
          accountReceivableId,
          metadata,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error iniciando el pago')
      }

      const data = await response.json()
      setClientSecret(data.clientSecret)
      setShowForm(true)
    } catch (err: any) {
      console.error('❌ Error iniciando pago:', err)
      setError(err.message)
      onError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Formatear monto para mostrar
   */
  const formatAmount = () => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount)
  }

  // Si no hay Stripe configurado
  if (!stripePromise) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pagos con Tarjeta No Disponibles</CardTitle>
          <CardDescription>
            Stripe no está configurado correctamente.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Mostrar formulario de pago
  if (showForm && clientSecret && stripePromise) {
    return (
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: isDarkMode ? stripeAppearanceDark : stripeAppearance,
          locale: 'es',
        }}
      >
        <StripeCheckoutForm
          amount={amount}
          currency={currency}
          onSuccess={onSuccess}
          onError={onError}
          onCancel={() => {
            setShowForm(false)
            setClientSecret(null)
            onCancel?.()
          }}
        />
      </Elements>
    )
  }

  // Botón para iniciar pago
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Pago con Tarjeta
        </CardTitle>
        {showAmount && (
          <CardDescription>
            Monto a pagar: <span className="font-semibold text-lg">{formatAmount()}</span>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleInitiatePayment}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Iniciando...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                {buttonText}
              </>
            )}
          </Button>

          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancelar
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>✓ Pagos seguros procesados por Stripe</p>
          <p>✓ Aceptamos todas las tarjetas principales</p>
          <p>✓ Cifrado de extremo a extremo</p>
        </div>
      </CardContent>
    </Card>
  )
}
