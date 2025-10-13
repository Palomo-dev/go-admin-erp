/**
 * Tipos TypeScript para la integración de Stripe
 * GO Admin ERP - Stripe Integration
 */

import Stripe from 'stripe'

/**
 * Datos para crear un Payment Intent
 */
export interface CreatePaymentIntentData {
  amount: number // Monto en centavos
  currency: string // Código de moneda (usd, cop, mxn, etc.)
  customerId?: string // ID del cliente en tu sistema
  organizationId: number // ID de la organización
  branchId: number // ID de la sucursal
  description?: string // Descripción del pago
  metadata?: Record<string, string> // Metadatos adicionales
  saleId?: string // ID de la venta (si aplica)
  invoiceId?: string // ID de la factura (si aplica)
  accountReceivableId?: string // ID de cuenta por cobrar (si aplica)
}

/**
 * Respuesta al crear un Payment Intent
 */
export interface PaymentIntentResponse {
  clientSecret: string // Secret para el cliente
  paymentIntentId: string // ID del Payment Intent
  amount: number // Monto
  currency: string // Moneda
}

/**
 * Datos del pago procesado
 */
export interface ProcessedPayment {
  id: string // ID del pago en tu sistema
  stripePaymentIntentId: string // ID del Payment Intent de Stripe
  amount: number // Monto
  currency: string // Moneda
  status: PaymentStatus // Estado del pago
  customerId?: string // ID del cliente
  organizationId: number // ID de la organización
  branchId: number // ID de la sucursal
  saleId?: string // ID de la venta
  invoiceId?: string // ID de la factura
  accountReceivableId?: string // ID de cuenta por cobrar
  createdAt: Date // Fecha de creación
  metadata?: Record<string, any> // Metadatos
}

/**
 * Estados posibles de un pago
 */
export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
  REFUNDED = 'refunded',
}

/**
 * Datos del webhook de Stripe
 */
export interface StripeWebhookEvent {
  id: string // ID del evento
  type: StripeEventType // Tipo de evento
  data: {
    object: Stripe.PaymentIntent | Stripe.Charge | any
  }
  created: number // Timestamp
}

/**
 * Tipos de eventos de Stripe que manejamos
 */
export enum StripeEventType {
  PAYMENT_INTENT_SUCCEEDED = 'payment_intent.succeeded',
  PAYMENT_INTENT_FAILED = 'payment_intent.payment_failed',
  PAYMENT_INTENT_CANCELED = 'payment_intent.canceled',
  CHARGE_SUCCEEDED = 'charge.succeeded',
  CHARGE_FAILED = 'charge.failed',
  CHARGE_REFUNDED = 'charge.refunded',
}

/**
 * Configuración de pago con Stripe
 */
export interface StripePaymentConfig {
  amount: number // Monto total
  currency: string // Moneda
  description: string // Descripción
  customerId?: string // ID del cliente
  organizationId: number // ID de la organización
  branchId: number // ID de la sucursal
  metadata?: {
    saleId?: string
    invoiceId?: string
    accountReceivableId?: string
    source?: 'pos' | 'cuentas_por_cobrar' | 'cuentas_por_pagar' | 'manual'
    [key: string]: any
  }
}

/**
 * Resultado del proceso de pago
 */
export interface PaymentResult {
  success: boolean
  paymentId?: string
  stripePaymentIntentId?: string
  message?: string
  error?: string
}

/**
 * Opciones para reembolso
 */
export interface RefundOptions {
  paymentIntentId: string // ID del Payment Intent a reembolsar
  amount?: number // Monto a reembolsar (opcional, por defecto todo)
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  metadata?: Record<string, string>
}

/**
 * Resultado del reembolso
 */
export interface RefundResult {
  success: boolean
  refundId?: string
  amount?: number
  status?: string
  error?: string
}

/**
 * Información de la tarjeta (para mostrar en UI)
 */
export interface CardInfo {
  brand: string // visa, mastercard, etc.
  last4: string // Últimos 4 dígitos
  expMonth: number // Mes de expiración
  expYear: number // Año de expiración
  funding?: string // debit, credit, prepaid
}

/**
 * Estado del checkout de Stripe
 */
export interface StripeCheckoutState {
  isLoading: boolean
  error: string | null
  paymentIntent: Stripe.PaymentIntent | null
  clientSecret: string | null
}

/**
 * Props para componente de Checkout
 */
export interface StripeCheckoutProps {
  amount: number // Monto en centavos
  currency: string // Código de moneda
  description?: string // Descripción del pago
  customerId?: string // ID del cliente
  organizationId: number // ID de la organización
  branchId: number // ID de la sucursal
  metadata?: Record<string, string> // Metadatos adicionales
  onSuccess: (paymentIntent: Stripe.PaymentIntent) => void // Callback éxito
  onError: (error: string) => void // Callback error
  onCancel?: () => void // Callback cancelar
}

/**
 * Configuración del cliente Stripe
 */
export interface StripeClientConfig {
  publishableKey: string
  locale?: string // es, en, etc.
  stripeAccount?: string // Para Stripe Connect
}

/**
 * Error de Stripe personalizado
 */
export interface StripeCustomError {
  type: 'stripe_error' | 'api_error' | 'validation_error'
  message: string
  code?: string
  param?: string
  stripeError?: Stripe.StripeRawError
}

/**
 * Log de transacción de Stripe
 */
export interface StripeTransactionLog {
  id: string
  organizationId: number
  branchId: number
  stripePaymentIntentId: string
  amount: number
  currency: string
  status: PaymentStatus
  eventType: StripeEventType
  metadata?: Record<string, any>
  createdAt: Date
  processedAt?: Date
  error?: string
}
