/**
 * Botón para que personal interno de GO Admin genere enlaces de pago Stripe
 * sin período de prueba para organizaciones clientes.
 * 
 * Visible solo para personal interno (is_super_admin O role 1/2/5 en org interna).
 * Permite buscar y seleccionar la organización cliente objetivo.
 */

'use client'

import { useState, useEffect } from 'react'
import { CreditCard, Copy, Loader2, Search } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { useOrganization } from '@/lib/hooks/useOrganization'

interface AdvisorPaymentLinkButtonProps {
  /** Email del cliente de la oportunidad para pre-llenar búsqueda */
  customerEmail?: string | null
  compact?: boolean
  className?: string
}

type PlanCode = 'pro' | 'business' | 'ultimate'
type Interval = 'year' | 'month'

interface ClientOrg {
  id: number
  name: string
  email: string | null
  nit: string | null
}

const PLANS: Record<PlanCode, string> = {
  pro: 'Pro',
  business: 'Business',
  ultimate: 'Ultimate',
}

const GOADMIN_INTERNAL_ORG_ID = process.env.NEXT_PUBLIC_GOADMIN_INTERNAL_ORG_ID
  ? parseInt(process.env.NEXT_PUBLIC_GOADMIN_INTERNAL_ORG_ID, 10)
  : null

export function AdvisorPaymentLinkButton({ customerEmail, compact, className }: AdvisorPaymentLinkButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [plan, setPlan] = useState<PlanCode>('pro')
  const [interval, setInterval] = useState<Interval>('year')
  const [searchQuery, setSearchQuery] = useState('')
  const [organizations, setOrganizations] = useState<ClientOrg[]>([])
  const [selectedOrg, setSelectedOrg] = useState<ClientOrg | null>(null)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const { organizationId, memberRoleId, isSuperAdmin } = useOrganization()

  // Verificar si es personal interno: super admin O role 1/2/5 en la org interna
  const isInternalStaff =
    isSuperAdmin ||
    (GOADMIN_INTERNAL_ORG_ID &&
      organizationId === GOADMIN_INTERNAL_ORG_ID &&
      memberRoleId &&
      [1, 2, 5].includes(memberRoleId))

  // Pre-llenar búsqueda con email del cliente al abrir el diálogo
  useEffect(() => {
    if (open && customerEmail && !selectedOrg && !searchQuery) {
      setSearchQuery(customerEmail)
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      searchOrganizations(customerEmail)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerEmail])

  // Solo mostrar para personal interno
  if (!isInternalStaff) return null

  const searchOrganizations = async (query: string) => {
    if (!query.trim()) {
      setOrganizations([])
      return
    }

    setSearching(true)
    try {
      const res = await fetch(`/api/stripe/search-client-organizations?q=${encodeURIComponent(query)}&limit=20`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error buscando organizaciones')
      }

      setOrganizations(data.organizations || [])
    } catch (error) {
      console.error('Error buscando organizaciones:', error)
      toast({
        title: 'Error',
        description: 'No se pudieron buscar organizaciones',
        variant: 'destructive',
      })
      setOrganizations([])
    } finally {
      setSearching(false)
    }
  }

  const handleGenerate = async () => {
    if (!selectedOrg) {
      toast({
        title: 'Error',
        description: 'Selecciona una organización cliente',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    setPaymentLink(null)
    setExpiresAt(null)

    try {
      const res = await fetch('/api/stripe/advisor-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrg.id,
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
      setSearchQuery('')
      setOrganizations([])
      setSelectedOrg(null)
    }, 200)
  }

  const handleSearch = () => {
    searchOrganizations(searchQuery)
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
                Genera un enlace de pago Stripe anual sin período de prueba para cerrar la venta
              </CardDescription>
              <Button variant="outline" size="sm" className="w-full">
                <CreditCard className="h-4 w-4 mr-2" />
                Generar enlace
              </Button>
            </CardContent>
          </Card>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generar enlace de pago Stripe</DialogTitle>
          <DialogDescription>
            Crea un enlace de pago sin período de prueba para una organización cliente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!paymentLink ? (
            <>
              {/* Selector de organización cliente */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Organización cliente *
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar por nombre, email o NIT..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSearch}
                    disabled={searching}
                  >
                    {searching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {organizations.length > 0 && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-md max-h-48 overflow-y-auto">
                    {organizations.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => setSelectedOrg(org)}
                        className={`w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                          selectedOrg?.id === org.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="font-medium text-sm">{org.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {org.email && <span>{org.email}</span>}
                          {org.nit && <span className="ml-2">NIT: {org.nit}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedOrg && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Organización seleccionada:
                    </p>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      {selectedOrg.name} (ID: {selectedOrg.id})
                    </p>
                  </div>
                )}
              </div>

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

              <Button onClick={handleGenerate} disabled={loading || !selectedOrg} className="w-full">
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
                <Button onClick={() => { setPaymentLink(null); setExpiresAt(null); setSelectedOrg(null); }} variant="secondary" className="flex-1">
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
