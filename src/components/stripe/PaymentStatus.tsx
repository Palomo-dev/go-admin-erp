/**
 * Componente de Estado de Pago
 * GO Admin ERP - Payment Status Component
 * 
 * Muestra el estado visual de un pago de Stripe
 */

'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react'
import { PaymentStatus as PaymentStatusEnum } from '@/lib/stripe/types'

interface PaymentStatusProps {
  status: PaymentStatusEnum | string
  amount?: number
  currency?: string
  paymentIntentId?: string
  errorMessage?: string
  showDetails?: boolean
}

export function PaymentStatus({
  status,
  amount,
  currency,
  paymentIntentId,
  errorMessage,
  showDetails = true,
}: PaymentStatusProps) {
  /**
   * Obtener configuración visual según el estado
   */
  const getStatusConfig = () => {
    switch (status) {
      case PaymentStatusEnum.SUCCEEDED:
      case 'succeeded':
        return {
          icon: CheckCircle2,
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/20',
          borderColor: 'border-green-200 dark:border-green-800',
          badge: 'Exitoso',
          badgeVariant: 'default' as const,
          title: '¡Pago Procesado!',
          description: 'El pago se ha completado exitosamente',
        }

      case PaymentStatusEnum.FAILED:
      case 'failed':
        return {
          icon: XCircle,
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          borderColor: 'border-red-200 dark:border-red-800',
          badge: 'Fallido',
          badgeVariant: 'destructive' as const,
          title: 'Pago Fallido',
          description: errorMessage || 'El pago no pudo ser procesado',
        }

      case PaymentStatusEnum.PENDING:
      case 'pending':
        return {
          icon: Clock,
          color: 'text-yellow-600 dark:text-yellow-400',
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          badge: 'Pendiente',
          badgeVariant: 'secondary' as const,
          title: 'Pago Pendiente',
          description: 'El pago está siendo procesado',
        }

      case PaymentStatusEnum.PROCESSING:
      case 'processing':
        return {
          icon: RefreshCw,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          badge: 'Procesando',
          badgeVariant: 'secondary' as const,
          title: 'Procesando Pago',
          description: 'El pago está siendo verificado',
        }

      case PaymentStatusEnum.CANCELED:
      case 'canceled':
        return {
          icon: XCircle,
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-900/20',
          borderColor: 'border-gray-200 dark:border-gray-800',
          badge: 'Cancelado',
          badgeVariant: 'outline' as const,
          title: 'Pago Cancelado',
          description: 'El pago fue cancelado',
        }

      case PaymentStatusEnum.REFUNDED:
      case 'refunded':
        return {
          icon: AlertCircle,
          color: 'text-orange-600 dark:text-orange-400',
          bgColor: 'bg-orange-50 dark:bg-orange-900/20',
          borderColor: 'border-orange-200 dark:border-orange-800',
          badge: 'Reembolsado',
          badgeVariant: 'secondary' as const,
          title: 'Pago Reembolsado',
          description: 'El pago fue reembolsado',
        }

      default:
        return {
          icon: AlertCircle,
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-900/20',
          borderColor: 'border-gray-200 dark:border-gray-800',
          badge: 'Desconocido',
          badgeVariant: 'outline' as const,
          title: 'Estado Desconocido',
          description: 'El estado del pago no es conocido',
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  /**
   * Formatear monto
   */
  const formatAmount = () => {
    if (!amount || !currency) return null

    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount)
  }

  return (
    <Card className={`${config.bgColor} border ${config.borderColor}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            {config.title}
          </CardTitle>
          <Badge variant={config.badgeVariant}>{config.badge}</Badge>
        </div>
      </CardHeader>

      {showDetails && (
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">{config.description}</p>

          {amount && currency && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm font-medium">Monto:</span>
              <span className="text-lg font-semibold">{formatAmount()}</span>
            </div>
          )}

          {paymentIntentId && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>ID de Pago:</span>
              <code className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                {paymentIntentId.slice(0, 20)}...
              </code>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
