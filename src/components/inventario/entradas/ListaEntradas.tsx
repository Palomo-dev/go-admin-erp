'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/config'
import { formatCurrency, formatDate } from '@/utils/Utils'
import { Skeleton } from '@/components/ui/skeleton'

interface ListaEntradasProps {
  filtro: 'todas' | 'pendientes'
  organizationId: number
  searchTerm: string
}

type Entrada = {
  id: number
  supplier_name: string
  created_date: string
  expected_date: string
  total: number
  status: string
  items_count: number
  notes?: string
}

export default function ListaEntradas({ filtro, organizationId, searchTerm }: ListaEntradasProps) {
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cargarEntradas = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        let query = supabase
          .from('purchase_orders')
          .select(`
            id,
            supplier_id,
            suppliers(name),
            created_at,
            expected_date,
            total,
            status,
            notes,
            po_items(count)
          `)
          .eq('organization_id', organizationId)
        
        if (filtro === 'pendientes') {
          query = query.in('status', ['draft', 'ordered'])
        }
        
        if (searchTerm) {
          query = query.or(`suppliers.name.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`)
        }
        
        const { data, error } = await query.order('created_at', { ascending: false })
        
        if (error) throw error
        
        // Transformar los datos para el formato que esperamos
        const entradasFormateadas = data.map(entrada => ({
          id: entrada.id,
          supplier_name: entrada.suppliers?.name || 'Sin proveedor',
          created_date: entrada.created_at,
          expected_date: entrada.expected_date,
          total: entrada.total || 0,
          status: entrada.status,
          notes: entrada.notes,
          items_count: entrada.po_items[0]?.count || 0
        }))
        
        setEntradas(entradasFormateadas)
      } catch (error) {
        console.error('Error al cargar las entradas:', error)
        setError('No se pudieron cargar las entradas. Por favor, intenta de nuevo.')
      } finally {
        setIsLoading(false)
      }
    }
    
    cargarEntradas()
  }, [organizationId, filtro, searchTerm])
  
  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'draft': return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
      case 'ordered': return 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
      case 'partially_received': return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
      case 'received': return 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-300'
      case 'cancelled': return 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-300'
      default: return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }
  
  const getEstadoTexto = (estado: string) => {
    switch (estado) {
      case 'draft': return 'Borrador'
      case 'ordered': return 'Ordenado'
      case 'partially_received': return 'Parcialmente Recibido'
      case 'received': return 'Recibido'
      case 'cancelled': return 'Cancelado'
      default: return estado
    }
  }

  if (isLoading) {
    return (
      <div className="w-full space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-6 w-1/4" />
        </div>
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full p-8 text-center">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (entradas.length === 0) {
    return (
      <div className="w-full p-8 text-center">
        <p className="text-gray-600 dark:text-gray-400">No hay entradas de inventario {filtro === 'pendientes' ? 'pendientes' : ''} que mostrar.</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>Fecha Creación</TableHead>
            <TableHead>Fecha Esperada</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Items</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entradas.map((entrada) => (
            <TableRow key={entrada.id}>
              <TableCell className="font-medium">#{entrada.id}</TableCell>
              <TableCell>{entrada.supplier_name}</TableCell>
              <TableCell>{formatDate(entrada.created_date)}</TableCell>
              <TableCell>{formatDate(entrada.expected_date)}</TableCell>
              <TableCell className="text-right">{formatCurrency(entrada.total)}</TableCell>
              <TableCell>
                <Badge className={getEstadoColor(entrada.status)}>
                  {getEstadoTexto(entrada.status)}
                </Badge>
              </TableCell>
              <TableCell>{entrada.items_count}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <span className="sr-only">Ver detalles</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
