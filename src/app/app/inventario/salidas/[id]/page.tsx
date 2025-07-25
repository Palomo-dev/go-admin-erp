'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Calendar, User, MapPin, Hash, DollarSign, Package, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase/config'
import { formatCurrency, formatDate } from '@/utils/Utils'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Skeleton } from '@/components/ui/skeleton'

// Interfaces basadas en la estructura real de la BD
interface SalidaDetalle {
  readonly id: string
  readonly organization_id: number
  readonly branch_id: number
  readonly customer_id: string | null
  readonly user_id: string
  readonly total: number
  readonly balance: number
  readonly status: string
  readonly sale_date: string
  readonly notes: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly payment_status: string
  readonly tax_total: number
  readonly subtotal: number
  readonly discount_total: number
}

interface SalidaItem {
  readonly id: string
  readonly sale_id: string
  readonly product_id: number
  readonly quantity: number
  readonly unit_price: number
  readonly total: number
}

interface Customer {
  readonly id: string
  readonly full_name: string
}

interface Product {
  readonly id: number
  readonly name: string
  readonly sku: string
}

interface Branch {
  readonly id: number
  readonly name: string
}

export default function DetalleSalidaPage() {
  const params = useParams()
  const router = useRouter()
  const { organization } = useOrganization()
  const [salida, setSalida] = useState<SalidaDetalle | null>(null)
  const [items, setItems] = useState<(SalidaItem & { product: Product })[]>([])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const salidaId = params.id as string

  useEffect(() => {
    if (!organization?.id || !salidaId) return

    const cargarDetalleSalida = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Cargar datos principales de la salida
        const { data: salidaData, error: salidaError } = await supabase
          .from('sales')
          .select('*')
          .eq('id', salidaId)
          .eq('organization_id', organization.id)
          .single()

        if (salidaError) throw salidaError
        if (!salidaData) throw new Error('Salida no encontrada')

        setSalida(salidaData)

        // Cargar items de la salida con productos
        const { data: itemsData, error: itemsError } = await supabase
          .from('sale_items')
          .select(`
            *,
            products (
              id,
              name,
              sku
            )
          `)
          .eq('sale_id', salidaId)

        if (itemsError) {
          console.error('Error cargando items:', itemsError)
          throw itemsError
        }
        
        console.log('Items cargados:', itemsData)
        setItems(itemsData || [])

        // Cargar información del cliente si existe
        if (salidaData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('id, full_name')
            .eq('id', salidaData.customer_id)
            .single()

          if (!customerError && customerData) {
            setCustomer(customerData)
          }
        }

        // Cargar información de la sucursal
        const { data: branchData, error: branchError } = await supabase
          .from('branches')
          .select('id, name')
          .eq('id', salidaData.branch_id)
          .single()

        if (!branchError && branchData) {
          setBranch(branchData)
        }

      } catch (error) {
        console.error('Error al cargar el detalle de la salida:', error)
        setError('No se pudo cargar el detalle de la salida')
      } finally {
        setIsLoading(false)
      }
    }

    cargarDetalleSalida()
  }, [organization?.id, salidaId])

  const descargarPDF = () => {
    if (!salida) return
    
    // Crear contenido HTML para el PDF
    const contenidoPDF = `
      <html>
        <head>
          <title>Salida S-${salida.id.slice(-8)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .info { margin: 20px 0; }
            .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .table th { background-color: #f2f2f2; }
            .total { text-align: right; font-weight: bold; font-size: 18px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Comprobante de Salida</h1>
            <h2>S-${salida.id.slice(-8)}</h2>
          </div>
          
          <div class="info">
            <p><strong>Fecha:</strong> ${formatDate(salida.sale_date)}</p>
            <p><strong>Cliente:</strong> ${customer?.full_name || 'Venta directa'}</p>
            <p><strong>Sucursal:</strong> ${branch?.name || 'N/A'}</p>
            <p><strong>Estado:</strong> ${salida.status}</p>
          </div>
          
          <table class="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Cantidad</th>
                <th>Precio Unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>${item.product?.name || 'Producto no encontrado'}</td>
                  <td>${item.product?.sku || 'N/A'}</td>
                  <td>${item.quantity}</td>
                  <td>${formatCurrency(item.unit_price)}</td>
                  <td>${formatCurrency(item.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="total">
            <p>Subtotal: ${formatCurrency(salida.subtotal)}</p>
            <p>Descuento: ${formatCurrency(salida.discount_total)}</p>
            <p>Impuestos: ${formatCurrency(salida.tax_total)}</p>
            <p><strong>Total: ${formatCurrency(salida.total)}</strong></p>
          </div>
        </body>
      </html>
    `
    
    // Abrir ventana nueva para imprimir
    const ventana = window.open('', '_blank')
    if (ventana) {
      ventana.document.write(contenidoPDF)
      ventana.document.close()
      ventana.print()
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">Borrador</Badge>
      case 'paid':
        return <Badge variant="default">Pagada</Badge>
      case 'partial':
        return <Badge variant="outline">Pago Parcial</Badge>
      case 'pending':
        return <Badge variant="secondary">Pendiente</Badge>
      case 'void':
        return <Badge variant="destructive">Anulada</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPaymentStatusBadge = (paymentStatus: string) => {
    switch (paymentStatus) {
      case 'pending':
        return <Badge variant="secondary">Pendiente</Badge>
      case 'paid':
        return <Badge variant="default">Pagado</Badge>
      case 'partial':
        return <Badge variant="outline">Pago Parcial</Badge>
      default:
        return <Badge variant="outline">{paymentStatus}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !salida) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-destructive text-lg mb-4">
              {error || 'Salida no encontrada'}
            </p>
            <Button onClick={() => router.push('/app/inventario/salidas')}>
              Ir a Salidas
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Salida S-{salida.id.slice(-8)}</h1>
            <p className="text-muted-foreground">
              Detalle de la salida de inventario
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(salida.status)}
          {getPaymentStatusBadge(salida.payment_status)}
          <Button 
            variant="outline" 
            size="sm"
            className="gap-2"
            onClick={() => descargarPDF()}
          >
            <Download className="h-4 w-4" />
            Descargar PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items de la salida */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Productos ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay productos en esta salida
                </p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Precio Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.product?.name || 'Producto no encontrado'}
                          </TableCell>
                          <TableCell>
                            {item.product?.sku || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.unit_price)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notas */}
          {salida.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{salida.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Panel lateral con información */}
        <div className="space-y-6">
          {/* Información de la salida */}
          <Card>
            <CardHeader>
              <CardTitle>Información de la Salida</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">ID</p>
                  <p className="text-sm text-muted-foreground">S-{salida.id.slice(-8)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Fecha de Salida</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(salida.sale_date)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Cliente</p>
                  <p className="text-sm text-muted-foreground">
                    {customer?.full_name || 'Venta directa'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Sucursal</p>
                  <p className="text-sm text-muted-foreground">
                    {branch?.name || 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen financiero */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Resumen Financiero
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Subtotal:</span>
                <span className="text-sm font-medium">
                  {formatCurrency(salida.subtotal)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm">Descuento:</span>
                <span className="text-sm font-medium">
                  {formatCurrency(salida.discount_total)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm">Impuestos:</span>
                <span className="text-sm font-medium">
                  {formatCurrency(salida.tax_total)}
                </span>
              </div>
              
              <Separator />
              
              <div className="flex justify-between">
                <span className="font-medium">Total:</span>
                <span className="font-bold text-lg">
                  {formatCurrency(salida.total)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm">Saldo:</span>
                <span className="text-sm font-medium">
                  {formatCurrency(salida.balance)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Información adicional */}
          <Card>
            <CardHeader>
              <CardTitle>Información Adicional</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium">Creado:</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(salida.created_at)}
                </p>
              </div>
              
              <div>
                <p className="text-sm font-medium">Última actualización:</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(salida.updated_at)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
