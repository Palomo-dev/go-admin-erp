'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Download, RefreshCw, Loader2, ArrowDown, ArrowUp, Filter, X } from 'lucide-react';
import { TrazabilidadService, type TrazabilidadEntry, type FiltrosTrazabilidad } from './TrazabilidadService';
import { useToast } from '@/components/ui/use-toast';
import { DataTablePagination } from '@/components/ui/DataTablePagination';

const sourceLabels: Record<string, string> = {
  production: 'Producción',
  transfer: 'Transferencia',
  purchase: 'Compra',
  sale: 'Venta',
  adjustment: 'Ajuste',
  initial: 'Inicial',
  return: 'Devolución',
  recipe_consumption: 'Consumo Receta',
};

export function TrazabilidadPage() {
  const { toast } = useToast();
  const [data, setData] = useState<TrazabilidadEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [productos, setProductos] = useState<{ id: number; name: string; sku: string }[]>([]);
  const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showFiltros, setShowFiltros] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosTrazabilidad>({
    busqueda: '',
    productId: 'todos',
    branchId: 'todos',
    direction: 'todos',
    source: 'todos',
    fechaDesde: '',
    fechaHasta: '',
  });

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  useEffect(() => {
    cargarTrazabilidad();
  }, [filtros, currentPage, pageSize]);

  const cargarDatosIniciales = async () => {
    try {
      const [prods, sucs] = await Promise.all([
        TrazabilidadService.obtenerProductos(),
        TrazabilidadService.obtenerSucursales(),
      ]);
      setProductos(prods);
      setSucursales(sucs);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const cargarTrazabilidad = async () => {
    try {
      setLoading(true);
      const result = await TrazabilidadService.obtenerTrazabilidad(filtros, currentPage, pageSize);
      setData(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'No se pudo cargar la trazabilidad', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleFiltroChange = (campo: keyof FiltrosTrazabilidad, valor: string) => {
    setFiltros({ ...filtros, [campo]: valor });
    setCurrentPage(1);
  };

  const limpiarFiltros = () => {
    setFiltros({
      busqueda: '',
      productId: 'todos',
      branchId: 'todos',
      direction: 'todos',
      source: 'todos',
      fechaDesde: '',
      fechaHasta: '',
    });
    setCurrentPage(1);
  };

  const handleExportCSV = async () => {
    try {
      const result = await TrazabilidadService.obtenerTrazabilidad(filtros, 1, 10000);
      const csv = await TrazabilidadService.exportarCSV(result.data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trazabilidad_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: 'CSV exportado', description: `${result.data.length} registros exportados` });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo exportar', variant: 'destructive' });
    }
  };

  const hayFiltrosActivos =
    filtros.productId !== 'todos' ||
    filtros.branchId !== 'todos' ||
    filtros.direction !== 'todos' ||
    filtros.source !== 'todos' ||
    filtros.fechaDesde !== '' ||
    filtros.fechaHasta !== '';

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg flex items-center justify-center">
            <Search className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trazabilidad</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Seguimiento de movimientos de inventario
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={cargarTrazabilidad}
            disabled={loading}
            className="dark:border-gray-600 dark:text-gray-300"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            onClick={handleExportCSV}
            disabled={loading || data.length === 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <Card className="p-6 dark:bg-gray-800/50 dark:border-gray-700 bg-white border-gray-200">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Buscar por notas u origen..."
              value={filtros.busqueda}
              onChange={(e) => handleFiltroChange('busqueda', e.target.value)}
              className="pl-10 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>

          <Select value={filtros.direction} onValueChange={(v) => handleFiltroChange('direction', v)}>
            <SelectTrigger className="w-full sm:w-[160px] dark:bg-gray-800 dark:border-gray-600 dark:text-white">
              <SelectValue placeholder="Dirección" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
              <SelectItem value="todos">Todas</SelectItem>
              <SelectItem value="in">Entradas</SelectItem>
              <SelectItem value="out">Salidas</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => setShowFiltros(!showFiltros)}
            className={`dark:border-gray-600 dark:text-gray-300 ${hayFiltrosActivos ? 'border-blue-500 text-blue-600' : ''}`}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {hayFiltrosActivos && (
              <span className="ml-2 bg-blue-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">!</span>
            )}
          </Button>
        </div>

        {showFiltros && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border dark:border-gray-700 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Producto</label>
              <Select value={filtros.productId} onValueChange={(v) => handleFiltroChange('productId', v)}>
                <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                  <SelectValue placeholder="Producto" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                  <SelectItem value="todos">Todos</SelectItem>
                  {productos.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Sucursal</label>
              <Select value={filtros.branchId} onValueChange={(v) => handleFiltroChange('branchId', v)}>
                <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                  <SelectValue placeholder="Sucursal" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                  <SelectItem value="todos">Todas</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Origen</label>
              <Select value={filtros.source} onValueChange={(v) => handleFiltroChange('source', v)}>
                <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                  <SelectValue placeholder="Origen" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                  <SelectItem value="todos">Todos</SelectItem>
                  {Object.entries(sourceLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Desde</label>
                <Input
                  type="date"
                  value={filtros.fechaDesde}
                  onChange={(e) => handleFiltroChange('fechaDesde', e.target.value)}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Hasta</label>
                <Input
                  type="date"
                  value={filtros.fechaHasta}
                  onChange={(e) => handleFiltroChange('fechaHasta', e.target.value)}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>

            {hayFiltrosActivos && (
              <div className="col-span-full flex justify-end">
                <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="text-gray-500 dark:text-gray-400">
                  <X className="h-4 w-4 mr-1" />
                  Limpiar filtros
                </Button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <Search className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No hay movimientos de trazabilidad</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-gray-300">Fecha</TableHead>
                    <TableHead className="dark:text-gray-300">Producto</TableHead>
                    <TableHead className="dark:text-gray-300">SKU</TableHead>
                    <TableHead className="dark:text-gray-300">Sucursal</TableHead>
                    <TableHead className="dark:text-gray-300">Dir.</TableHead>
                    <TableHead className="dark:text-gray-300">Cantidad</TableHead>
                    <TableHead className="dark:text-gray-300">Origen</TableHead>
                    <TableHead className="dark:text-gray-300">Lote</TableHead>
                    <TableHead className="dark:text-gray-300">Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((item) => (
                    <TableRow key={item.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <TableCell className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(item.created_at).toLocaleString('es-CO')}
                      </TableCell>
                      <TableCell className="font-medium dark:text-white">{item.product_name}</TableCell>
                      <TableCell className="text-sm dark:text-gray-300">{item.sku}</TableCell>
                      <TableCell className="text-sm dark:text-gray-300">{item.branch_name}</TableCell>
                      <TableCell>
                        {item.direction === 'in' ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            <ArrowDown className="h-3 w-3 mr-1" />
                            Entrada
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                            <ArrowUp className="h-3 w-3 mr-1" />
                            Salida
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium dark:text-white">{item.qty}</TableCell>
                      <TableCell className="text-sm dark:text-gray-300">
                        {sourceLabels[item.source] || item.source}
                      </TableCell>
                      <TableCell className="text-sm dark:text-gray-300">{item.lot_code || '-'}</TableCell>
                      <TableCell className="text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                        {item.note || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4">
              <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={total}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                pageSizeOptions={[25, 50, 100, 200]}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
