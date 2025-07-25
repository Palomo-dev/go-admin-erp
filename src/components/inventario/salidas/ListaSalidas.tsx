'use client'

import { useState, useEffect, useCallback } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import { supabase } from '@/lib/supabase/config'
import { formatCurrency, formatDate } from '@/utils/Utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Eye, FileCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/use-toast'

interface ListaSalidasProps {
  readonly filtro: 'todas' | 'pendientes'
  readonly organizationId: number
  readonly searchTerm: string
}

// Interface para la estructura de datos que devuelve Supabase
interface SalidaDB {
  readonly id: string
  readonly sale_date: string
  readonly total: number
  readonly status: string
  readonly created_at: string
  readonly customers: Array<{
    readonly id: string
    readonly full_name: string
  }>
  readonly sale_items: Array<{
    readonly id: string
  }>
}

// Interface para la UI
interface Salida {
  readonly id: string  // uuid en la BD
  readonly reference_number?: string
  readonly customer_name: string
  readonly sale_date: string
  readonly status: string
  readonly total: number
  readonly items_count: number
}



export default function ListaSalidas({ filtro, organizationId, searchTerm }: ListaSalidasProps) {
  const [salidas, setSalidas] = useState<Salida[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  
  // Estados de paginación
  const [paginaActual, setPaginaActual] = useState(1)
  const [itemsPorPagina, setItemsPorPagina] = useState(25)
  const [totalItems, setTotalItems] = useState(0)
  
  // Hooks
  const router = useRouter()
  const { toast } = useToast()

  // Reset página al cambiar filtros
  useEffect(() => {
    setPaginaActual(1)
  }, [filtro, searchTerm])

  // Función para ver detalle de salida
  const handleVerDetalle = (salidaId: string) => {
    router.push(`/app/inventario/salidas/${salidaId}`)
  }

  // Función para procesar salida
  const handleProcesarSalida = async (salidaId: string) => {
    setIsProcessing(salidaId)
    
    try {
      const { error } = await supabase
        .from('sales')
        .update({ 
          status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', salidaId)
        .eq('organization_id', organizationId)
      
      if (error) throw error
      
      toast({
        title: "Éxito",
        description: "La salida ha sido procesada correctamente.",
      })
      
      // Recargar la lista para mostrar el cambio de estado
      await cargarSalidas()
      
    } catch (error) {
      console.error('Error al procesar la salida:', error)
      toast({
        title: "Error",
        description: "No se pudo procesar la salida. Intenta de nuevo.",
        variant: "destructive"
      })
    } finally {
      setIsProcessing(null)
    }
  }

  // Función para cargar las salidas
  const cargarSalidas = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Calcular offset para paginación
      const offset = (paginaActual - 1) * itemsPorPagina
      
      // Query para conteo total
      let countQuery = supabase
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
      
      if (filtro === 'pendientes') {
        countQuery = countQuery.in('status', ['draft', 'processing'])
      }
      
      if (searchTerm) {
        countQuery = countQuery.or(`id.ilike.%${searchTerm}%`)
      }
      
      // Query para datos paginados
      let dataQuery = supabase
        .from('sales')
        .select(`
          id,
          sale_date,
          total,
          status,
          created_at,
          customers(id, full_name),
          sale_items!sale_items_sale_id_fkey(id)
        `)
        .eq('organization_id', organizationId)
        .range(offset, offset + itemsPorPagina - 1)
        .order('created_at', { ascending: false })
      
      if (filtro === 'pendientes') {
        dataQuery = dataQuery.in('status', ['draft', 'processing'])
      }
      
      if (searchTerm) {
        dataQuery = dataQuery.or(`id.ilike.%${searchTerm}%`)
      }
      
      // Ejecutar ambas queries
      const [{ count }, { data, error: queryError }] = await Promise.all([
        countQuery,
        dataQuery
      ])
      
      if (queryError) throw queryError
      
      setTotalItems(count || 0)
      
      // Formatear los datos para la tabla usando la estructura correcta
      const salidasFormateadas = (data || []).map((salida: SalidaDB) => ({
        id: salida.id,
        reference_number: `S-${salida.id.slice(-8)}`, // Últimos 8 caracteres del UUID
        customer_name: salida.customers?.[0]?.full_name || 'Venta directa',
        sale_date: salida.sale_date,
        total: salida.total || 0,
        status: salida.status,
        items_count: Array.isArray(salida.sale_items) ? salida.sale_items.length : 0
      }))
      
      setSalidas(salidasFormateadas)
    } catch (error) {
      console.error('Error al cargar las salidas:', error)
      setError('No se pudieron cargar las salidas. Por favor, intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, filtro, searchTerm, paginaActual, itemsPorPagina])

  useEffect(() => {
    cargarSalidas()
  }, [cargarSalidas])
  
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
          <Skeleton key={`loading-skeleton-${i}`} className="h-12 w-full" />
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
  
  // Generar números de página con elipsis
  const generarNumerosPagina = () => {
    const totalPaginas = Math.ceil(totalItems / itemsPorPagina)
    const paginas = []
    
    if (totalPaginas <= 7) {
      for (let i = 1; i <= totalPaginas; i++) {
        paginas.push(i)
      }
    } else if (paginaActual <= 4) {
      paginas.push(1, 2, 3, 4, 5, '...', totalPaginas)
    } else if (paginaActual >= totalPaginas - 3) {
      paginas.push(1, '...', totalPaginas - 4, totalPaginas - 3, totalPaginas - 2, totalPaginas - 1, totalPaginas)
    } else {
      paginas.push(1, '...', paginaActual - 1, paginaActual, paginaActual + 1, '...', totalPaginas)
    }
    
    return paginas
  }

  const totalPaginas = Math.ceil(totalItems / itemsPorPagina)
  const inicio = (paginaActual - 1) * itemsPorPagina + 1
  const fin = Math.min(paginaActual * itemsPorPagina, totalItems)

  return (
    <div className="space-y-4">
      {/* Info de resultados y controles */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Mostrando {inicio} a {fin} de {totalItems} resultados
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Items por página:</span>
          <Select
            value={itemsPorPagina.toString()}
            onValueChange={(value) => {
              setItemsPorPagina(Number(value))
              setPaginaActual(1)
            }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Referencia</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-center">Items</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salidas.map((salida) => (
              <TableRow key={salida.id}>
                <TableCell className="font-medium">{salida.reference_number}</TableCell>
                <TableCell>{salida.customer_name}</TableCell>
                <TableCell>{formatDate(salida.sale_date)}</TableCell>
                <TableCell>{getStatusBadge(salida.status)}</TableCell>
                <TableCell className="text-right">{formatCurrency(salida.total)}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline">{salida.items_count}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex space-x-1">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleVerDetalle(salida.id)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Ver</span>
                    </Button>
                    {salida.status === 'draft' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleProcesarSalida(salida.id)}
                        disabled={isProcessing === salida.id}
                      >
                        <FileCheck className="h-3.5 w-3.5 mr-1" />
                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                          {isProcessing === salida.id ? 'Procesando...' : 'Procesar'}
                        </span>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setPaginaActual(Math.max(1, paginaActual - 1))}
                  className={paginaActual === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              
              {generarNumerosPagina().map((pagina, index) => (
                <PaginationItem key={`pagination-${pagina}-${index}`}>
                  {pagina === '...' ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      onClick={() => setPaginaActual(pagina as number)}
                      isActive={paginaActual === pagina}
                      className="cursor-pointer"
                    >
                      {pagina}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPaginaActual(Math.min(totalPaginas, paginaActual + 1))}
                  className={paginaActual === totalPaginas ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}
