/**
 * Hook de React para pagos con Stripe
 * GO Admin ERP - useStripePayment Hook
 * 
 * Este hook maneja la lógica de pagos con Stripe desde el frontend
 */

'use client'

import { useState, useCallback } from 'react'
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js'
import type { PaymentIntent } from '@stripe/stripe-js'
import { toast } from 'sonner'

interface UseStripePaymentOptions {
  onSuccess?: (paymentIntent: PaymentIntent) => void
  onError?: (error: string) => void
  returnUrl?: string
}

export function useStripePayment(options: UseStripePaymentOptions = {}) {
  const stripe = useStripe()
  const elements = useElements()

  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Crear Payment Intent en el servidor
   */
  const createPaymentIntent = useCallback(async (data: {
    amount: number
    currency: string
    customerId?: string
    organizationId: number
    branchId: number
    description?: string
    metadata?: Record<string, string>
    saleId?: string
    invoiceId?: string
    accountReceivableId?: string
  }): Promise<{ clientSecret: string; paymentIntentId: string } | null> => {
    try {
      const response = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error creando Payment Intent')
      }

      const result = await response.json()
      return result
    } catch (error: any) {
      console.error('❌ Error creando Payment Intent:', error)
      setError(error.message)
      options.onError?.(error.message)
      toast.error(error.message)
      return null
    }
  }, [options])

  /**
   * Procesar el pago
   */
  const processPayment = useCallback(async () => {
    if (!stripe || !elements) {
      setError('Stripe no está listo. Por favor, intenta de nuevo.')
      return false
    }

    setIsProcessing(true)
    setError(null)

    try {
      // Confirmar el pago
      const { error: submitError } = await elements.submit()

      if (submitError) {
        setError(submitError.message || 'Error al enviar el formulario')
        options.onError?.(submitError.message || 'Error al enviar el formulario')
        toast.error(submitError.message)
        return false
      }

      // Confirmar el Payment Intent
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: options.returnUrl || `${window.location.origin}/app/pos`,
        },
        redirect: 'if_required', // No redirigir a menos que sea necesario (3D Secure)
      })

      if (confirmError) {
        setError(confirmError.message || 'Error procesando el pago')
        options.onError?.(confirmError.message || 'Error procesando el pago')
        toast.error(confirmError.message)
        return false
      }

      // Pago exitoso
      if (paymentIntent && paymentIntent.status === 'succeeded') {
        console.log('✅ Pago exitoso:', paymentIntent.id)
        toast.success('¡Pago procesado exitosamente!')
        options.onSuccess?.(paymentIntent)
        return true
      }

      // Pago requiere acción adicional (3D Secure)
      if (paymentIntent && paymentIntent.status === 'requires_action') {
        toast.info('Se requiere autenticación adicional')
        return false
      }

      // Otros estados
      console.log('Estado del pago:', paymentIntent?.status)
      return false
    } catch (error: any) {
      console.error('❌ Error procesando pago:', error)
      setError(error.message || 'Error desconocido')
      options.onError?.(error.message || 'Error desconocido')
      toast.error('Error procesando el pago')
      return false
    } finally {
      setIsProcessing(false)
    }
  }, [stripe, elements, options])

  /**
   * Validar que el formulario esté completo
   */
  const validatePaymentForm = useCallback(async (): Promise<boolean> => {
    if (!elements) {
      return false
    }

    const { error } = await elements.submit()
    if (error) {
      setError(error.message || 'Formulario incompleto')
      return false
    }

    return true
  }, [elements])

  /**
   * Resetear el estado
   */
  const reset = useCallback(() => {
    setIsProcessing(false)
    setError(null)
  }, [])

  return {
    // Estado
    isProcessing,
    error,
    isReady: !!stripe && !!elements,

    // Métodos
    createPaymentIntent,
    processPayment,
    validatePaymentForm,
    reset,
  }
}
