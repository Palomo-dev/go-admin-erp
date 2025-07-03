'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/config'
import { formatCurrency, formatDate } from '@/utils/Utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Eye, FileCheck } from 'lucide-react'

interface ListaSalidasProps {
  filtro: 'todas' | 'pendientes'
  organizationId: number
  searchTerm: string
}

interface Salida {
  id: number
  reference_number: string
  customer_name: string
  order_date: string
  status: string
  total_amount: number
  items_count: number
}

export default function ListaSalidas({ filtro, organizationId, searchTerm }: ListaSalidasProps) {
  const [salidas, setSalidas] = useState<Salida[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cargarSalidas = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        let query = supabase
          .from('sales_orders')
          .select(`
            id,
            reference_number,
            customers(name),
            order_date,
            total_amount,
            status,
            so_items(count)
          `)
          .eq('organization_id', organizationId)
        
        if (filtro === 'pendientes') {
          query = query.in('status', ['draft', 'processing'])
        }
        
        if (searchTerm) {
          query = query.or(`reference_number.ilike.%${searchTerm}%,customers.name.ilike.%${searchTerm}%`)
        }
        
        const { data, error: queryError } = await query.order('created_at', { ascending: false })
        
        if (queryError) throw queryError
        
        // Formatear los datos para la tabla
        const salidasFormateadas = (data || []).map(salida => ({
          id: salida.id,
          reference_number: salida.reference_number,
          customer_name: salida.customers?.name || 'Venta directa',
          order_date: salida.order_date,
          total_amount: salida.total_amount,
          status: salida.status,
          items_count: salida.so_items[0]?.count || 0
        }))
        
        setSalidas(salidasFormateadas)
      } catch (error) {
        console.error('Error al cargar las salidas:', error)
        setError('No se pudieron cargar las salidas. Por favor, intenta de nuevo.')
      } finally {
        setIsLoading(false)
      }
    }
    
    cargarSalidas()
  }, [organizationId, filtro, searchTerm])
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge variant="outline">Borrador</Badge>
      case 'processing':
        return <Badge variant="secondary">En proceso</Badge>
      case 'shipped':
        return <Badge variant="warning">Enviado</Badge>
      case 'completed':
        return <Badge variant="success">Completado</Badge>
      case 'cancelled':
        return <Badge variant="destructive">Cancelado</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="flex justify-center p-6">
        <div className="text-center">
          <p className="text-destructive">{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    )
  }
  
  if (salidas.length === 0) {
    return (
      <div className="text-center py-10">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          No hay salidas {filtro === 'pendientes' ? 'pendientes' : ''} de inventario
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {filtro === 'pendientes' 
            ? 'Todas las salidas han sido completadas o aún no has creado ninguna.'
            : 'No se han encontrado registros de salidas de inventario.'}
        </p>
      </div>
    )
  }
  
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Referencia</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {salidas.map((salida) => (
            <TableRow key={salida.id}>
              <TableCell className="font-medium">{salida.reference_number}</TableCell>
              <TableCell>{salida.customer_name}</TableCell>
              <TableCell>{formatDate(salida.order_date)}</TableCell>
              <TableCell>{getStatusBadge(salida.status)}</TableCell>
              <TableCell className="text-right">{formatCurrency(salida.total_amount)}</TableCell>
              <TableCell>
                <div className="flex space-x-1">
                  <Button variant="outline" size="sm">
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Ver</span>
                  </Button>
                  {salida.status === 'draft' && (
                    <Button variant="outline" size="sm">
                      <FileCheck className="h-3.5 w-3.5 mr-1" />
                      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Procesar</span>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
