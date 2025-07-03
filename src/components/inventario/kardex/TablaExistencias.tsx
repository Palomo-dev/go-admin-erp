'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Package } from 'lucide-react'
import { supabase } from '@/lib/supabase/config'
import { formatCurrency } from '@/utils/Utils'
import { useToast } from '@/components/ui/use-toast'

interface TablaExistenciasProps {
  organizationId: number
  searchTerm: string
  filtros: {
    sucursal_id: string
    categoria_id: string
    fecha_inicio: string
    fecha_fin: string
    tipo_movimiento: string
    ordenar_por: string
  }
}

interface Existencia {
  id: number
  producto: string
  sku: string
  categoria: string
  sucursal: string
  stock_actual: number
  costo_promedio: number
  valor_total: number
}

export default function TablaExistencias({
  organizationId,
  searchTerm,
  filtros
}: TablaExistenciasProps) {
  const [existencias, setExistencias] = useState<Existencia[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagina, setPagina] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const itemsPorPagina = 20
  const { toast } = useToast()

  useEffect(() => {
    cargarExistencias()
  }, [organizationId, searchTerm, filtros, pagina])

  const cargarExistencias = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Usaremos una función RPC en Supabase para obtener el stock actual
      // Esta función debería combinar datos de productos, categorías, sucursales y movimientos
      let query = supabase
        .rpc('get_current_stock', {
          p_organization_id: organizationId
        })
        .range(pagina * itemsPorPagina, (pagina + 1) * itemsPorPagina - 1)

      // Aplicar filtros
      if (filtros.sucursal_id) {
        query = query.eq('branch_id', parseInt(filtros.sucursal_id))
      }

      if (filtros.categoria_id) {
        query = query.eq('category_id', parseInt(filtros.categoria_id))
      }

      if (searchTerm) {
        query = query.or(`product_name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`)
      }

      // Ordenar según preferencia
      if (filtros.ordenar_por === 'fecha_asc' || filtros.ordenar_por === 'fecha_desc') {
        // Si es por fecha, ordenamos por ID del producto (más reciente primero)
        query = query.order('product_id', { ascending: filtros.ordenar_por === 'fecha_asc' })
      } else {
        // Por defecto ordenamos por cantidad
        query = query.order('current_stock', { ascending: false })
      }

      const { data, error: queryError } = await query

      if (queryError) {
        // Si la función RPC no existe, usamos una alternativa
        console.error("Error al usar RPC, intentando consulta directa:", queryError)
        // Aquí implementaríamos una consulta alternativa si la RPC falla
        throw new Error("No se pudo obtener el stock actual. La función RPC puede no estar definida.")
      }

      // Contar total para paginación
      const { count, error: countError } = await supabase
        .rpc('count_current_stock', {
          p_organization_id: organizationId
        })

      if (countError) {
        console.error("Error al contar existencias:", countError)
        // Estimamos basado en los datos actuales
        setTotalPaginas(Math.ceil(((data?.length || 0) + itemsPorPagina * pagina) / itemsPorPagina))
      } else {
        setTotalPaginas(Math.ceil((count || 0) / itemsPorPagina))
      }

      // Formatear los datos para la tabla
      const existenciasFormateadas = (data || []).map(item => ({
        id: item.product_id,
        producto: item.product_name || 'Producto desconocido',
        sku: item.sku || '',
        categoria: item.category_name || 'Sin categoría',
        sucursal: item.branch_name || 'Sucursal desconocida',
        stock_actual: item.current_stock || 0,
        costo_promedio: item.average_cost || 0,
        valor_total: (item.current_stock || 0) * (item.average_cost || 0)
      }))

      setExistencias(existenciasFormateadas)
    } catch (error: any) {
      console.error('Error al cargar existencias:', error)
      setError('No se pudieron cargar las existencias. Por favor, intenta de nuevo.')
      toast({
        title: "Error",
        description: error.message || "No se pudieron cargar las existencias de inventario.",
        variant: "destructive"
      })
      // Si falla, mostramos datos de muestra para desarrollo
      const datosEjemplo = [
        {
          id: 1,
          producto: "Ejemplo: Producto 1",
          sku: "SKU001",
          categoria: "Categoría de Prueba",
          sucursal: "Sucursal Principal",
          stock_actual: 100,
          costo_promedio: 25.50,
          valor_total: 2550
        },
        {
          id: 2,
          producto: "Ejemplo: Producto 2",
          sku: "SKU002",
          categoria: "Categoría de Prueba",
          sucursal: "Sucursal Principal",
          stock_actual: 50,
          costo_promedio: 15.75,
          valor_total: 787.5
        }
      ]
      setExistencias(datosEjemplo)
    } finally {
      setIsLoading(false)
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
            onClick={() => cargarExistencias()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  if (existencias.length === 0) {
    return (
      <div className="text-center py-10">
        <Package className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
          No hay existencias en inventario
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Ajusta los filtros o añade productos al inventario para ver existencias aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead className="text-right">Stock Actual</TableHead>
              <TableHead className="text-right">Costo Promedio</TableHead>
              <TableHead className="text-right">Valor Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {existencias.map((existencia) => (
              <TableRow key={`${existencia.id}-${existencia.sucursal}`}>
                <TableCell className="font-medium">{existencia.producto}</TableCell>
                <TableCell>{existencia.sku}</TableCell>
                <TableCell>{existencia.categoria}</TableCell>
                <TableCell>{existencia.sucursal}</TableCell>
                <TableCell className="text-right">
                  <span className={`font-medium ${existencia.stock_actual <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {existencia.stock_actual}
                  </span>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(existencia.costo_promedio)}</TableCell>
                <TableCell className="text-right">{formatCurrency(existencia.valor_total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mostrando {pagina * itemsPorPagina + 1} a {Math.min((pagina + 1) * itemsPorPagina, (pagina * itemsPorPagina + existencias.length))} existencias
        </p>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagina(p => Math.max(0, p - 1))}
            disabled={pagina === 0}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
            disabled={pagina >= totalPaginas - 1}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
