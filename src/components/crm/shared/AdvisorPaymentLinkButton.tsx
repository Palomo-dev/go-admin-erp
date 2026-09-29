/**
 * Botón para que asesores de ventas generen enlaces de pago Stripe
 * sin período de prueba para ventas directas en reuniones con clientes.
 * 
 * Visible solo para usuarios con rol de asesor (1, 2, 5) o super admin.
 */

'use client'

import { useState } from 'react'
import { CreditCard, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { useOrganization } from '@/lib/hooks/useOrganization'

interface AdvisorPaymentLinkButtonProps {
  organizationId: number
  compact?: boolean
  className?: string
}

type PlanCode = 'pro' | 'business' | 'ultimate'
type Interval = 'year' | 'month'

const PLANS: Record<PlanCode, string> = {
  pro: 'Pro',
  business: 'Business',
  ultimate: 'Ultimate',
}

export function AdvisorPaymentLinkButton({ organizationId, compact, className }: AdvisorPaymentLinkButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState<PlanCode>('pro')
  const [interval, setInterval] = useState<Interval>('year')
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const { memberRoleId, isSuperAdmin } = useOrganization()

  // Solo mostrar para asesores y admins (roles 1, 2, 5 o super admin)
  const hasAdvisorPermission = isSuperAdmin || (memberRoleId && [1, 2, 5].includes(memberRoleId))
  if (!hasAdvisorPermission) return null

  const handleGenerate = async () => {
    setLoading(true)
    setPaymentLink(null)
    setExpiresAt(null)

    try {
      const res = await fetch('/api/stripe/advisor-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          planCode: plan,
          interval,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error generando el enlace de pago')
      }

      setPaymentLink(data.url)
      setExpiresAt(data.expiresAt)
      toast({
        title: 'Enlace de pago generado',
        description: 'Copia el enlace y compártelo con el cliente',
      })
    } catch (error) {
      console.error('Error generando enlace de pago:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo generar el enlace',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (paymentLink) {
      navigator.clipboard.writeText(paymentLink)
      toast({ title: 'Enlace copiado', description: 'El enlace se copió al portapapeles' })
    }
  }

  const handleClose = () => {
    setOpen(false)
    setTimeout(() => {
      setPaymentLink(null)
      setExpiresAt(null)
      setPlan('pro')
      setInterval('year')
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button variant="outline" size="sm" className={className}>
            <CreditCard className="h-4 w-4 mr-2" />
            Generar enlace de pago
          </Button>
        ) : (
          <Card className={`cursor-pointer hover:border-blue-400 transition-colors ${className}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-500" />
                Enlace de pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs mb-3">
                Genera un enlace de pago Stripe anual sin período de prueba para cerrar la venta en esta reunión
              </CardDescription>
              <Button variant="outline" size="sm" className="w-full">
                <CreditCard className="h-4 w-4 mr-2" />
                Generar enlace
              </Button>
            </CardContent>
          </Card>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generar enlace de pago Stripe</DialogTitle>
          <DialogDescription>
            Crea un enlace de pago sin período de prueba para que el cliente pague su plan ahora mismo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!paymentLink ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Plan
                </label>
                <Select value={plan} onValueChange={(v) => setPlan(v as PlanCode)} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLANS).map(([code, name]) => (
                      <SelectItem key={code} value={code}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Período de facturación
                </label>
                <Select value={interval} onValueChange={(v) => setInterval(v as Interval)} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">Anual (recomendado)</SelectItem>
                    <SelectItem value="month">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>Importante:</strong> Este enlace NO incluye período de prueba. El cliente pagará inmediatamente al completar el checkout.
                </p>
              </div>

              <Button onClick={handleGenerate} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Generar enlace de pago
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Enlace de pago generado
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={paymentLink}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-800"
                  />
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {expiresAt && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Expira: {new Date(expiresAt).toLocaleString('es-CO', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-xs text-green-800 dark:text-green-200">
                  Enlace generado exitosamente. Cópialo y compártelo con el cliente para que complete su pago.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Cerrar
                </Button>
                <Button onClick={() => { setPaymentLink(null); setExpiresAt(null); }} variant="secondary" className="flex-1">
                  Generar otro
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
