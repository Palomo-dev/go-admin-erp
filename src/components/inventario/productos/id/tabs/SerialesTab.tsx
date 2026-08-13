'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@/components/ui/pagination'
import { useRouter } from 'next/navigation'
import {
  Barcode,
  Download,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Package,
  Search,
  Plus,
  Loader2,
  AlertCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { supabase } from '@/lib/supabase/config'
import { serialTrackingService, type SerialNumber, type SerialStatus } from '@/lib/services/serialTrackingService'
import { CreateClaimDialog } from '@/components/inventario/garantias/CreateClaimDialog'

interface SerialesTabProps {
  producto: any
}

const STATUS_LABELS: Record<SerialStatus, string> = {
  in_stock: 'En stock',
  reserved: 'Reservado',
  sold: 'Vendido',
  returned: 'Devuelto',
  in_transit: 'En tránsito',
  damaged: 'Dañado',
  rma: 'RMA',
  warranty_claim: 'Reclamo garantía',
}

const STATUS_COLORS: Record<SerialStatus, string> = {
  in_stock: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  reserved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  sold: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  returned: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  in_transit: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  damaged: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  rma: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  warranty_claim: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
}

export default function SerialesTab({ producto }: SerialesTabProps) {
  const router = useRouter()
  const { organization } = useOrganization()
  const [loading, setLoading] = useState(true)
  const [seriales, setSeriales] = useState<SerialNumber[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<SerialStatus | 'all'>('all')
  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [generateQty, setGenerateQty] = useState(1)
  const [generateBranchId, setGenerateBranchId] = useState<number | null>(null)
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [stockTotal, setStockTotal] = useState(0)
  const [showClaimDialog, setShowClaimDialog] = useState(false)
  const [claimSerialId, setClaimSerialId] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const trackSerial = producto.track_serial ?? false
  const autoGenerate = producto.auto_generate_serial ?? false
  const serialPattern = producto.serial_pattern ?? ''
  const warrantyMonths = producto.warranty_months ?? null

  useEffect(() => {
    if (!trackSerial || !producto.id) {
      setLoading(false)
      return
    }
    const loadSeriales = async () => {
      setLoading(true)
      try {
        const { data, error } = await serialTrackingService.getSerialsByProduct(producto.id)
        if (error) throw error
        setSeriales(data)
      } catch (err: any) {
        console.error('Error cargando seriales:', err)
        toast({
          title: 'Error',
          description: 'No se pudieron cargar los seriales del producto',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }
    loadSeriales()
  }, [producto.id, trackSerial])

  useEffect(() => {
    if (organization?.id) {
      loadBranchesAndStock()
    }
  }, [organization?.id, producto.id])

  const loadBranchesAndStock = async () => {
    if (!organization?.id) return
    try {
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organization.id)
        .order('name')
      if (branchesData) setBranches(branchesData)

      const { data: stockData } = await supabase
        .from('stock_levels')
        .select('qty_on_hand')
        .eq('product_id', producto.id)
      const total = stockData?.reduce((sum, s) => sum + (s.qty_on_hand || 0), 0) ?? 0
      setStockTotal(total)
    } catch (err) {
      console.error('Error cargando sucursales/stock:', err)
    }
  }

  const handleGenerateSerials = async () => {
    if (!organization?.id || !serialPattern || generateQty <= 0) return
    setIsGenerating(true)
    try {
      const { data, errors } = await serialTrackingService.generateSerialsFromPattern(
        producto.id,
        organization.id,
        serialPattern,
        generateQty,
        generateBranchId ?? undefined,
        warrantyMonths,
        producto.cost || 0,
        producto.price || 0
      )

      if (errors.length > 0) {
        toast({
          title: 'Generación parcial',
          description: `${data.length} seriales generados. ${errors.length} errores.`,
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Seriales generados',
          description: `${data.length} seriales generados correctamente.`,
        })
      }

      setShowGenerateDialog(false)
      setGenerateQty(1)

      const { data: refreshed } = await serialTrackingService.getSerialsByProduct(producto.id)
      setSeriales(refreshed)
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Error al generar seriales',
        variant: 'destructive',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const filteredSeriales = useMemo(() => {
    return seriales.filter((s) => {
      const matchesSearch = !searchTerm || s.serial.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [seriales, searchTerm, statusFilter])

  const totalPages = Math.ceil(filteredSeriales.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedSeriales = filteredSeriales.slice(startIndex, startIndex + pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, pageSize])

  const stats = useMemo(() => {
    const total = seriales.length
    const inStock = seriales.filter((s) => s.status === 'in_stock').length
    const sold = seriales.filter((s) => s.status === 'sold').length
    const reserved = seriales.filter((s) => s.status === 'reserved').length
    return { total, inStock, sold, reserved }
  }, [seriales])

  const handleExport = () => {
    if (filteredSeriales.length === 0) return

    const headers = ['Serial', 'Estado', 'Sucursal ID', 'Fecha Recepción', 'Fecha Venta', 'Garantía Inicio', 'Garantía Fin', 'Costo Compra', 'Precio Venta']
    const rows = filteredSeriales.map((s) => [
      s.serial,
      STATUS_LABELS[s.status] || s.status,
      s.current_branch_id ?? '',
      s.received_date ?? '',
      s.sale_date ?? '',
      s.warranty_start ?? '',
      s.warranty_end ?? '',
      s.cost_at_purchase ?? '',
      s.price_at_sale ?? '',
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `seriales_${producto.sku || producto.id}.csv`
    link.click()
    URL.revokeObjectURL(url)

    toast({ title: 'Exportación completa', description: `${filteredSeriales.length} seriales exportados` })
  }

  // Si el producto no tiene track_serial
  if (!trackSerial) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
          <Barcode className="h-10 w-10 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Este producto no requiere seriales
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          Para habilitar la trazabilidad de seriales, edita el producto y activa
          la opción &quot;Requiere número de serial&quot; en la sección de Trazabilidad.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push(`/app/inventario/productos/${producto.uuid || producto.id}/editar`)}
        >
          Editar producto
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Info del producto */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{producto.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {producto.sku && <span className="font-mono">SKU: {producto.sku}</span>}
            {producto.sku && producto.price ? ' · ' : ''}
            {producto.price ? <span>Precio: ${producto.price.toLocaleString()}</span> : ''}
            {producto.cost ? <span> · Costo: ${producto.cost.toLocaleString()}</span> : ''}
          </p>
        </div>
      </div>

      {/* Configuración actual */}
      <div className="flex flex-wrap gap-3 mb-2">
        <Badge variant="outline" className="flex items-center gap-1.5 py-1.5 px-3">
          <Barcode className="h-3.5 w-3.5 text-blue-600" />
          Trazabilidad activa
        </Badge>
        {producto.auto_generate_serial && (
          <Badge variant="outline" className="flex items-center gap-1.5 py-1.5 px-3 bg-amber-50 dark:bg-amber-900/20">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Auto-generación
          </Badge>
        )}
        {producto.warranty_months && (
          <Badge variant="outline" className="flex items-center gap-1.5 py-1.5 px-3 bg-green-50 dark:bg-green-900/20">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
            {producto.warranty_months} meses garantía
          </Badge>
        )}
        {producto.serial_pattern && (
          <Badge variant="outline" className="flex items-center gap-1.5 py-1.5 px-3 font-mono">
            Patrón: {producto.serial_pattern}
          </Badge>
        )}
        {autoGenerate && serialPattern && (
          <Button
            size="sm"
            onClick={() => setShowGenerateDialog(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Generar seriales
          </Button>
        )}
      </div>

      {/* Info de stock vs seriales */}
      {autoGenerate && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Package className="h-4 w-4" />
          <span>Stock total: <strong>{stockTotal}</strong> unidades</span>
          <span>·</span>
          <span>Seriales generados: <strong>{seriales.length}</strong></span>
          {stockTotal > seriales.length && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              {stockTotal - seriales.length} sin serial
            </Badge>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
            <Package className="h-3.5 w-3.5" />
            Total
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
        </div>
        <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            En stock
          </div>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.inStock}</p>
        </div>
        <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Reservados
          </div>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.reserved}</p>
        </div>
        <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            Vendidos
          </div>
          <p className="text-xl font-bold text-purple-600 dark:text-purple-400">{stats.sold}</p>
        </div>
      </div>

      {/* Filtros + Export */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por número de serial..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(val) => setStatusFilter(val as SerialStatus | 'all')}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="in_stock">En stock</SelectItem>
            <SelectItem value="reserved">Reservado</SelectItem>
            <SelectItem value="sold">Vendido</SelectItem>
            <SelectItem value="returned">Devuelto</SelectItem>
            <SelectItem value="in_transit">En tránsito</SelectItem>
            <SelectItem value="damaged">Dañado</SelectItem>
            <SelectItem value="rma">RMA</SelectItem>
            <SelectItem value="warranty_claim">Reclamo garantía</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExport} disabled={filteredSeriales.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filteredSeriales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Barcode className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {seriales.length === 0
              ? 'Aún no hay seriales registrados para este producto.'
              : 'No se encontraron seriales con los filtros aplicados.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-800">
                <TableHead className="w-[200px]">Serial</TableHead>
                <TableHead className="w-[120px]">Estado</TableHead>
                <TableHead className="w-[120px]">Garantía</TableHead>
                <TableHead className="w-[120px]">Costo compra</TableHead>
                <TableHead className="w-[120px]">Precio venta</TableHead>
                <TableHead>Fecha recepción</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedSeriales.map((serial) => (
                <TableRow
                  key={serial.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                  onClick={() => router.push(`/app/inventario/seriales/${serial.id}`)}
                >
                  <TableCell className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">
                    {serial.serial}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[serial.status]}`}>
                      {STATUS_LABELS[serial.status] || serial.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                    {serial.warranty_start
                      ? `${serial.warranty_start.slice(0, 10)} → ${serial.warranty_end?.slice(0, 10) || 'N/A'}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                    {serial.cost_at_purchase ? `$${serial.cost_at_purchase.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600 dark:text-gray-400">
                    {serial.price_at_sale ? `$${serial.price_at_sale.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 dark:text-gray-400">
                    {serial.received_date ? new Date(serial.received_date).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="flex items-center gap-1">
                    {serial.status === 'sold' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          setClaimSerialId(serial.id)
                          setShowClaimDialog(true)
                        }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-500" />
                        Reclamo
                      </Button>
                    )}
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Paginación de la tabla de seriales */}
      {filteredSeriales.length > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap mt-4 px-2">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Mostrando {startIndex + 1} a {Math.min(startIndex + pageSize, filteredSeriales.length)} de {filteredSeriales.length} seriales</span>
            <Select value={pageSize.toString()} onValueChange={(val) => setPageSize(parseInt(val))}>
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  />
                </PaginationItem>
                {(() => {
                  const pages: React.ReactNode[] = []
                  const maxVisible = 5
                  const start = Math.max(1, currentPage - 2)
                  const end = Math.min(totalPages, start + maxVisible - 1)
                  const adjustedStart = Math.max(1, end - maxVisible + 1)

                  if (adjustedStart > 1) {
                    pages.push(
                      <PaginationItem key="first">
                        <PaginationLink onClick={() => setCurrentPage(1)} isActive={currentPage === 1}>
                          1
                        </PaginationLink>
                      </PaginationItem>
                    )
                    if (adjustedStart > 2) {
                      pages.push(
                        <PaginationItem key="ellipsis-start">
                          <PaginationEllipsis />
                        </PaginationItem>
                      )
                    }
                  }

                  for (let i = adjustedStart; i <= end; i++) {
                    pages.push(
                      <PaginationItem key={i}>
                        <PaginationLink onClick={() => setCurrentPage(i)} isActive={i === currentPage}>
                          {i}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  }

                  if (end < totalPages - 1) {
                    pages.push(
                      <PaginationItem key="ellipsis-end">
                        <PaginationEllipsis />
                      </PaginationItem>
                    )
                  }
                  if (end < totalPages) {
                    pages.push(
                      <PaginationItem key="last">
                        <PaginationLink onClick={() => setCurrentPage(totalPages)} isActive={currentPage === totalPages}>
                          {totalPages}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  }

                  return pages
                })()}
                <PaginationItem>
                  <PaginationNext
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}

      {/* Dialog: Crear reclamo de garantía */}
      <CreateClaimDialog
        open={showClaimDialog}
        onOpenChange={setShowClaimDialog}
        preselectedSerialId={claimSerialId}
        onCreated={() => {
          setClaimSerialId(null)
          if (producto.id) {
            serialTrackingService.getSerialsByProduct(producto.id).then(({ data }) => {
              if (data) setSeriales(data)
            })
          }
        }}
      />

      {/* Dialog: Generación masiva de seriales */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar seriales masivamente</DialogTitle>
            <DialogDescription>
              Genera números de serie automáticamente usando el patrón:{' '}
              <code className="font-mono text-blue-600 dark:text-blue-400">{serialPattern}</code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="generate-qty">Cantidad de seriales a generar</Label>
              <Input
                id="generate-qty"
                type="number"
                min="1"
                max="1000"
                value={generateQty}
                onChange={(e) => setGenerateQty(parseInt(e.target.value) || 1)}
              />
              {stockTotal > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Stock actual: {stockTotal} unidades · Seriales existentes: {seriales.length}
                  {stockTotal > seriales.length && (
                    <> · Faltan <strong>{stockTotal - seriales.length}</strong> seriales</>
                  )}
                </p>
              )}
              {stockTotal > seriales.length && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGenerateQty(stockTotal - seriales.length)}
                  className="w-full"
                >
                  Generar los {stockTotal - seriales.length} seriales faltantes
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="generate-branch">Sucursal destino (opcional)</Label>
              <Select
                value={generateBranchId?.toString() || 'none'}
                onValueChange={(val) => setGenerateBranchId(val === 'none' ? null : parseInt(val))}
              >
                <SelectTrigger id="generate-branch">
                  <SelectValue placeholder="Sin sucursal específica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin sucursal específica</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {warrantyMonths && (
              <div className="text-xs text-gray-500 dark:text-gray-400 p-2 bg-green-50 dark:bg-green-900/10 rounded border border-green-200 dark:border-green-800">
                <ShieldCheck className="h-3.5 w-3.5 inline mr-1 text-green-600" />
                Cada serial tendrá {warrantyMonths} meses de garantía desde hoy.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)} disabled={isGenerating}>
              Cancelar
            </Button>
            <Button onClick={handleGenerateSerials} disabled={isGenerating || generateQty <= 0}>
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generar {generateQty} seriales
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
