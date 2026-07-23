'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  Download,
  RefreshCw,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  ChefHat,
  TrendingUp,
} from 'lucide-react';
import { CostoRecetasService, type RecetaCostoEntry } from './CostoRecetasService';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/utils/Utils';

export function CostoRecetasPage() {
  const { toast } = useToast();
  const [data, setData] = useState<RecetaCostoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const result = await CostoRecetasService.obtenerCostoRecetas();
      setData(result);
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar los costos', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const csv = await CostoRecetasService.exportarCSV(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `costo_recetas_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: 'CSV exportado', description: `${data.length} recetas exportadas` });
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo exportar', variant: 'destructive' });
    }
  };

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredData = data.filter(
    (r) =>
      r.recipe_name.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.product_name.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.product_sku.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalCostoPromedio = data.length > 0
    ? data.reduce((sum, r) => sum + r.cost_per_unit, 0) / data.length
    : 0;

  const recetasActivas = data.filter((r) => r.is_active).length;

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Costo de Recetas</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Análisis de costos de producción por receta
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={cargarDatos}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
              <ChefHat className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{data.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Recetas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-100 dark:bg-green-900/30">
              <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{recetasActivas}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Recetas Activas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
              <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(totalCostoPromedio)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Costo Promedio/Unidad</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 dark:bg-gray-800/50 dark:border-gray-700 bg-white border-gray-200">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Buscar por receta, producto o SKU..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <ChefHat className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No hay recetas para mostrar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300 w-10"></TableHead>
                  <TableHead className="dark:text-gray-300">Receta</TableHead>
                  <TableHead className="dark:text-gray-300">Producto</TableHead>
                  <TableHead className="dark:text-gray-300">SKU</TableHead>
                  <TableHead className="dark:text-gray-300">Rendimiento</TableHead>
                  <TableHead className="dark:text-gray-300">Estado</TableHead>
                  <TableHead className="text-right dark:text-gray-300">Costo Total</TableHead>
                  <TableHead className="text-right dark:text-gray-300">Costo/Unidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((receta) => (
                  <React.Fragment key={receta.recipe_id}>
                    <TableRow
                      className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => toggleRow(receta.recipe_id)}
                    >
                      <TableCell className="dark:text-gray-300">
                        {receta.ingredients.length > 0 ? (
                          expandedRows.has(receta.recipe_id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium dark:text-white">{receta.recipe_name}</TableCell>
                      <TableCell className="dark:text-gray-300">{receta.product_name}</TableCell>
                      <TableCell className="text-sm dark:text-gray-300">{receta.product_sku}</TableCell>
                      <TableCell className="text-sm dark:text-gray-300">
                        {receta.yield_qty} {receta.yield_unit_code}
                      </TableCell>
                      <TableCell>
                        {receta.is_active ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Activa
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                            Inactiva
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium dark:text-white">
                        {formatCurrency(receta.total_cost)}
                      </TableCell>
                      <TableCell className="text-right font-medium dark:text-white">
                        {formatCurrency(receta.cost_per_unit)}
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(receta.recipe_id) && receta.ingredients.length > 0 && (
                      <TableRow className="dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
                        <TableCell colSpan={8} className="p-4">
                          <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="dark:border-gray-700">
                                  <TableHead className="dark:text-gray-300">Ingrediente</TableHead>
                                  <TableHead className="dark:text-gray-300">SKU</TableHead>
                                  <TableHead className="dark:text-gray-300">Cantidad</TableHead>
                                  <TableHead className="dark:text-gray-300">Unidad</TableHead>
                                  <TableHead className="text-right dark:text-gray-300">Costo Unit.</TableHead>
                                  <TableHead className="text-right dark:text-gray-300">Costo Linea</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {receta.ingredients.map((ing) => (
                                  <TableRow key={ing.ingredient_product_id} className="dark:border-gray-700">
                                    <TableCell className="dark:text-gray-300">{ing.ingredient_name}</TableCell>
                                    <TableCell className="text-sm dark:text-gray-300">{ing.ingredient_sku}</TableCell>
                                    <TableCell className="dark:text-gray-300">{ing.quantity}</TableCell>
                                    <TableCell className="dark:text-gray-300">{ing.unit_code}</TableCell>
                                    <TableCell className="text-right dark:text-gray-300">
                                      {formatCurrency(ing.avg_cost)}
                                    </TableCell>
                                    <TableCell className="text-right font-medium dark:text-white">
                                      {formatCurrency(ing.line_cost)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
