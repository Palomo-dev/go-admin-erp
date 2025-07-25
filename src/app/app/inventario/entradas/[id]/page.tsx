'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { supabase } from '@/lib/supabase/config'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MoveRight, ArrowLeft, Package, FileText, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/utils/Utils'
import { Entrada, TipoEntrada, EntradaCompra, EntradaAjuste, EntradaDevolucion } from '@/components/inventario/entradas/types'

// Componente temporal de Spinner
const Spinner = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }[size]
  
  return (
    <div className={`animate-spin rounded-full border-2 border-t-transparent ${sizeClass}`} />
  )
}

export default function EntradaDetallePage() {
  const searchParams = useParams()
  const entradaId = searchParams?.id as string
  
  const [entrada, setEntrada] = useState<Entrada | null>(null)
  const [tipoEntrada, setTipoEntrada] = useState<TipoEntrada | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const { organization } = useOrganization()
  
  const cargarDatosEntrada = useCallback(async (id: number) => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Determinar qué tipo de entrada es buscando en las diferentes tablas
      const tipo = await determinarTipoEntrada(id)
      
      if (!tipo) {
        throw new Error('Entrada no encontrada')
      }
      
      setTipoEntrada(tipo)
      
      // Cargar datos según el tipo
      switch (tipo) {
        case 'compra':
          await cargarCompra(id)
          break
        case 'ajuste':
          await cargarAjuste(id)
          break
        case 'devolucion':
          await cargarDevolucion(id)
          break
      }
    } catch (err: unknown) {
      console.error('Error al cargar datos de la entrada:', err)
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar datos de la entrada'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id])
  
  useEffect(() => {
    if (organization?.id && entradaId) {
      cargarDatosEntrada(parseInt(entradaId))
    }
  }, [organization?.id, entradaId, cargarDatosEntrada])
  
  const determinarTipoEntrada = async (id: number): Promise<TipoEntrada | null> => {
    // Buscar en purchase_orders
    const { data: compra } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('id', id)
      .eq('organization_id', organization?.id)
      .single()
    
    if (compra) return 'compra'
    
    // Buscar en inventory_adjustments
    const { data: ajuste } = await supabase
      .from('inventory_adjustments')
      .select('id')
      .eq('id', id)
      .eq('organization_id', organization?.id)
      .single()
    
    if (ajuste) return 'ajuste'
    
    // Buscar en returns
    const { data: devolucion } = await supabase
      .from('returns')
      .select('id')
      .eq('id', id)
      .eq('organization_id', organization?.id)
      .single()
    
    if (devolucion) return 'devolucion'
    
    return null
  }
  
  const cargarCompra = async (id: number) => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        branch_id,
        supplier_id,
        status,
        expected_date,
        total,
        created_at,
        updated_at,
        created_by,
        organization_id,
        notes,
        suppliers(id, name),
        branches(id, name),
        po_items(
          id,
          product_id,
          quantity,
          unit_cost,
          lot_code,
          received_qty,
          status,
          products(id, name, sku)
        )
      `)
      .eq('id', id)
      .eq('organization_id', organization?.id)
      .single()
    
    if (error) throw error
    
    const entradaCompra: EntradaCompra = {
      ...data,
      tipo: 'compra',
      suppliers: Array.isArray(data.suppliers) && data.suppliers.length > 0 
        ? (data.suppliers[0] as unknown as { id: number; name: string })
        : (data.suppliers as unknown as { id: number; name: string } | undefined),
      branches: Array.isArray(data.branches) && data.branches.length > 0 
        ? (data.branches[0] as unknown as { id: number; name: string })
        : (data.branches as unknown as { id: number; name: string } | undefined),
      po_items: data.po_items?.map(item => ({
        ...item,
        purchase_order_id: data.id,
        products: Array.isArray(item.products) && item.products.length > 0 
          ? (item.products[0] as unknown as { id: number; name: string; sku: string })
          : (item.products as unknown as { id: number; name: string; sku: string } | undefined)
      })) || []
    }
    
    setEntrada(entradaCompra)
  }
  
  const cargarAjuste = async (id: number) => {
    const { data, error } = await supabase
      .from('inventory_adjustments')
      .select(`
        id,
        organization_id,
        branch_id,
        type,
        reason,
        status,
        created_by,
        created_at,
        updated_at,
        notes,
        branches(id, name),
        adjustment_items(
          id,
          product_id,
          quantity_change,
          unit_cost,
          lot_code,
          reason,
          products(id, name, sku)
        )
      `)
      .eq('id', id)
      .eq('organization_id', organization?.id)
      .single()
    
    if (error) throw error
    
    const entradaAjuste: EntradaAjuste = {
      ...data,
      tipo: 'ajuste',
      branches: Array.isArray(data.branches) && data.branches.length > 0 
        ? (data.branches[0] as unknown as { id: number; name: string })
        : (data.branches as unknown as { id: number; name: string } | undefined),
      adjustment_items: data.adjustment_items?.map(item => ({
        ...item,
        adjustment_id: data.id,
        products: Array.isArray(item.products) && item.products.length > 0 
          ? (item.products[0] as unknown as { id: number; name: string; sku: string })
          : (item.products as unknown as { id: number; name: string; sku: string } | undefined)
      })) || []
    }
    
    setEntrada(entradaAjuste)
  }
  
  const cargarDevolucion = async (id: number) => {
    const { data, error } = await supabase
      .from('returns')
      .select(`
        id,
        organization_id,
        branch_id,
        sale_id,
        user_id,
        total_refund,
        reason,
        return_date,
        status,
        return_items,
        created_at,
        updated_at,
        branches(id, name)
      `)
      .eq('id', id)
      .eq('organization_id', organization?.id)
      .single()
    
    if (error) throw error
    
    const entradaDevolucion: EntradaDevolucion = {
      ...data,
      tipo: 'devolucion',
      branches: Array.isArray(data.branches) && data.branches.length > 0 
        ? (data.branches[0] as unknown as { id: number; name: string })
        : (data.branches as unknown as { id: number; name: string } | undefined)
    }
    
    setEntrada(entradaDevolucion)
  }
  
  const getTipoIcon = (tipo: TipoEntrada) => {
    switch (tipo) {
      case 'compra':
        return <Package className="h-5 w-5" />
      case 'ajuste':
        return <FileText className="h-5 w-5" />
      case 'devolucion':
        return <RotateCcw className="h-5 w-5" />
    }
  }
  
  const getTipoTexto = (tipo: TipoEntrada) => {
    switch (tipo) {
      case 'compra':
        return 'Compra'
      case 'ajuste':
        return 'Ajuste de Inventario'
      case 'devolucion':
        return 'Devolución'
    }
  }
  
  const getTipoColor = (tipo: TipoEntrada) => {
    switch (tipo) {
      case 'compra':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      case 'ajuste':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      case 'devolucion':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
    }
  }
  
  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'draft':
      case 'pending':
        return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      case 'ordered':
      case 'approved':
        return 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      case 'partially_received':
        return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      case 'received':
      case 'completed':
        return 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'cancelled':
        return 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300'
      default:
        return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }
  
  const getEstadoTexto = (estado: string) => {
    switch (estado) {
      case 'draft': return 'Borrador'
      case 'pending': return 'Pendiente'
      case 'ordered': return 'Ordenado'
      case 'approved': return 'Aprobado'
      case 'partially_received': return 'Parcialmente Recibido'
      case 'received': return 'Recibido'
      case 'completed': return 'Completado'
      case 'cancelled': return 'Cancelado'
      default: return estado
    }
  }
  
  return (
    <div className="flex flex-col space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div className="flex flex-col space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {entrada && tipoEntrada 
              ? `${getTipoTexto(tipoEntrada)} #${entrada.id}` 
              : 'Detalle de Entrada'}
          </h1>
          <div className="flex items-center text-sm text-muted-foreground">
            <Link href="/app/inicio" className="hover:underline">Inicio</Link>
            <MoveRight className="h-3 w-3 mx-1" />
            <Link href="/app/inventario" className="hover:underline">Inventario</Link>
            <MoveRight className="h-3 w-3 mx-1" />
            <Link href="/app/inventario/entradas" className="hover:underline">Entradas</Link>
            <MoveRight className="h-3 w-3 mx-1" />
            <span>Detalle</span>
          </div>
        </div>
        <div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => router.push('/app/inventario/entradas')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver a la lista
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <Button 
                variant="outline" 
                onClick={() => entradaId && cargarDatosEntrada(parseInt(entradaId))}
              >
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : entrada && tipoEntrada ? (
        <div className="space-y-6">
          {/* Información general */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getTipoIcon(tipoEntrada)}
                Información General
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Tipo</span>
                  <div className="mt-1">
                    <Badge className={getTipoColor(tipoEntrada)}>
                      {getTipoTexto(tipoEntrada)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Estado</span>
                  <div className="mt-1">
                    <Badge className={getEstadoColor(entrada.status)}>
                      {getEstadoTexto(entrada.status)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Sucursal</span>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {entrada.branches?.name || 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha de Creación</span>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {formatDate(entrada.created_at)}
                  </p>
                </div>
              </div>
              
              {/* Información específica por tipo */}
              {tipoEntrada === 'compra' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t">
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Proveedor</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {(entrada as EntradaCompra).suppliers?.name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha Esperada</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {(entrada as EntradaCompra).expected_date 
                        ? formatDate((entrada as EntradaCompra).expected_date!) 
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Total</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-semibold">
                      {formatCurrency((entrada as EntradaCompra).total)}
                    </p>
                  </div>
                </div>
              )}
              
              {tipoEntrada === 'ajuste' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Tipo de Ajuste</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {(entrada as EntradaAjuste).type === 'increase' ? 'Incremento' : 'Decremento'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Motivo</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {(entrada as EntradaAjuste).reason}
                    </p>
                  </div>
                </div>
              )}
              
              {tipoEntrada === 'devolucion' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">ID de Venta</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {(entrada as EntradaDevolucion).sale_id}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Motivo</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {(entrada as EntradaDevolucion).reason}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Reembolso</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-semibold">
                      {formatCurrency((entrada as EntradaDevolucion).total_refund)}
                    </p>
                  </div>
                </div>
              )}
              
              {entrada.notes && (
                <div className="pt-4 border-t">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Notas</label>
                  <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {entrada.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Lista de items */}
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              {tipoEntrada === 'compra' && (entrada as EntradaCompra).po_items && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Producto</th>
                        <th className="text-left py-2">SKU</th>
                        <th className="text-right py-2">Cantidad</th>
                        <th className="text-right py-2">Costo Unitario</th>
                        <th className="text-right py-2">Recibido</th>
                        <th className="text-left py-2">Lote</th>
                        <th className="text-left py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(entrada as EntradaCompra).po_items?.map((item) => (
                        <tr key={item.id} className="border-b">
                          <td className="py-2">{item.products?.name || 'N/A'}</td>
                          <td className="py-2">{item.products?.sku || 'N/A'}</td>
                          <td className="py-2 text-right">{item.quantity}</td>
                          <td className="py-2 text-right">{formatCurrency(item.unit_cost)}</td>
                          <td className="py-2 text-right">{item.received_qty || 0}</td>
                          <td className="py-2">{item.lot_code || 'N/A'}</td>
                          <td className="py-2">
                            <Badge className={getEstadoColor(item.status || 'pending')}>
                              {getEstadoTexto(item.status || 'pending')}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {tipoEntrada === 'ajuste' && (entrada as EntradaAjuste).adjustment_items && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Producto</th>
                        <th className="text-left py-2">SKU</th>
                        <th className="text-right py-2">Cambio de Cantidad</th>
                        <th className="text-right py-2">Costo Unitario</th>
                        <th className="text-left py-2">Lote</th>
                        <th className="text-left py-2">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(entrada as EntradaAjuste).adjustment_items?.map((item) => (
                        <tr key={item.id} className="border-b">
                          <td className="py-2">{item.products?.name || 'N/A'}</td>
                          <td className="py-2">{item.products?.sku || 'N/A'}</td>
                          <td className={`py-2 text-right font-semibold ${
                            item.quantity_change > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {item.quantity_change > 0 ? '+' : ''}{item.quantity_change}
                          </td>
                          <td className="py-2 text-right">
                            {item.unit_cost ? formatCurrency(item.unit_cost) : 'N/A'}
                          </td>
                          <td className="py-2">{item.lot_code || 'N/A'}</td>
                          <td className="py-2">{item.reason || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {tipoEntrada === 'devolucion' && (entrada as EntradaDevolucion).return_items && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Items devueltos:</p>
                  <pre className="text-xs bg-white dark:bg-gray-900 p-3 rounded border overflow-auto">
                    {JSON.stringify((entrada as EntradaDevolucion).return_items, null, 2)}
                  </pre>
                </div>
              )}
              
              {/* Mensaje si no hay items */}
              {((tipoEntrada === 'compra' && !(entrada as EntradaCompra).po_items?.length) ||
                (tipoEntrada === 'ajuste' && !(entrada as EntradaAjuste).adjustment_items?.length) ||
                (tipoEntrada === 'devolucion' && !(entrada as EntradaDevolucion).return_items)) && (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No hay items para mostrar</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-10">
              <p className="text-gray-500 dark:text-gray-400">No se encontraron datos para mostrar</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
