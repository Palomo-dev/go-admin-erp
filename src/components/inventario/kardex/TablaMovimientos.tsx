'use client'

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowDownUp, ArrowUpDown } from 'lucide-react'
import { supabase } from '@/lib/supabase/config'
import { formatCurrency, formatDate } from '@/utils/Utils'
import { useToast } from '@/components/ui/use-toast'

interface TablaMovimientosProps {
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

interface Movimiento {
  id: number
  fecha: string
  producto: string
  sku: string
  lote: string | null
  direccion: 'in' | 'out'
  cantidad: number
  costo_unitario: number
  total: number
  origen: string
  nota: string
  sucursal: string
}

export default function TablaMovimientos({
  organizationId,
  searchTerm,
  filtros
}: TablaMovimientosProps) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagina, setPagina] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const itemsPorPagina = 20
  const { toast } = useToast()

  useEffect(() => {
    cargarMovimientos()
  }, [organizationId, searchTerm, filtros, pagina])

  const cargarMovimientos = async () => {
    setIsLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('stock_movements')
        .select(`
          id,
          created_at,
          products (name, sku),
          lots (lot_code),
          direction,
          qty,
          unit_cost,
          source,
          source_id,
          note,
          branches (name)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: filtros.ordenar_por === 'fecha_asc' })
        .range(pagina * itemsPorPagina, (pagina + 1) * itemsPorPagina - 1)

      // Aplicar filtros
      if (filtros.sucursal_id) {
        query = query.eq('branch_id', parseInt(filtros.sucursal_id))
      }

      if (filtros.fecha_inicio) {
        query = query.gte('created_at', filtros.fecha_inicio)
      }

      if (filtros.fecha_fin) {
        // Añadir un día a la fecha fin para incluir todo el día
        const fechaFinAjustada = new Date(filtros.fecha_fin)
        fechaFinAjustada.setDate(fechaFinAjustada.getDate() + 1)
        query = query.lt('created_at', fechaFinAjustada.toISOString())
      }

      if (filtros.tipo_movimiento) {
        query = query.eq('direction', filtros.tipo_movimiento)
      }

      if (searchTerm) {
        query = query.or(`products.name.ilike.%${searchTerm}%,products.sku.ilike.%${searchTerm}%`)
      }

      if (filtros.categoria_id) {
        // Aplicar filtro por categoría requiere un join adicional
        query = query.eq('products.category_id', parseInt(filtros.categoria_id))
      }

      const { data, error: queryError } = await query

      if (queryError) throw queryError

      // Contar total para paginación
      const { count, error: countError } = await supabase
        .from('stock_movements')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)

      if (countError) throw countError

      setTotalPaginas(Math.ceil((count || 0) / itemsPorPagina))

      // Formatear los datos para la tabla
      const movimientosFormateados = (data || []).map(mov => ({
        id: mov.id,
        fecha: mov.created_at,
        producto: mov.products?.name || 'Producto desconocido',
        sku: mov.products?.sku || '',
        lote: mov.lots?.lot_code || null,
        direccion: mov.direction as 'in' | 'out',
        cantidad: mov.qty,
        costo_unitario: mov.unit_cost,
        total: mov.qty * mov.unit_cost,
        origen: `${mov.source} #${mov.source_id}`,
        nota: mov.note || '',
        sucursal: mov.branches?.name || 'Sucursal desconocida'
      }))

      setMovimientos(movimientosFormateados)
    } catch (error: any) {
      console.error('Error al cargar movimientos:', error)
      setError('No se pudieron cargar los movimientos. Por favor, intenta de nuevo.')
      toast({
        title: "Error",
        description: "No se pudieron cargar los movimientos de inventario.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const obtenerDireccion = (direccion: 'in' | 'out') => {
    if (direccion === 'in') {
      return <Badge className="bg-green-500">Entrada</Badge>
    } else {
      return <Badge className="bg-red-500">Salida</Badge>
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
            onClick={() => cargarMovimientos()}
          >
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  if (movimientos.length === 0) {
    return (
      <div className="text-center py-10">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          No se encontraron movimientos de inventario
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Ajusta los filtros o añade productos al inventario para ver movimientos aquí.
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
              <TableHead>Fecha</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Costo Unit.</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Sucursal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movimientos.map((movimiento) => (
              <TableRow key={movimiento.id}>
                <TableCell>{formatDate(movimiento.fecha, 'short')}</TableCell>
                <TableCell className="font-medium">{movimiento.producto}</TableCell>
                <TableCell>{movimiento.sku}</TableCell>
                <TableCell>{movimiento.lote || '-'}</TableCell>
                <TableCell>{obtenerDireccion(movimiento.direccion)}</TableCell>
                <TableCell>{movimiento.cantidad}</TableCell>
                <TableCell>{formatCurrency(movimiento.costo_unitario)}</TableCell>
                <TableCell className="text-right">{formatCurrency(movimiento.total)}</TableCell>
                <TableCell>{movimiento.origen}</TableCell>
                <TableCell>{movimiento.sucursal}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mostrando {pagina * itemsPorPagina + 1} a {Math.min((pagina + 1) * itemsPorPagina, (pagina * itemsPorPagina + movimientos.length))} de {totalPaginas * itemsPorPagina} movimientos
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
