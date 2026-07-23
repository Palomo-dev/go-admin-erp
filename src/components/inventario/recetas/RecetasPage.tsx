'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import Link from 'next/link';
import {
  ChefHat,
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Loader2,
  RefreshCw,
  ArrowLeft,
  Package,
  AlertCircle,
} from 'lucide-react';
import { recipeService, type ProductRecipe } from '@/lib/services/recipeService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { RecipeDialog } from './RecipeDialog';

export function RecetasPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();
  const [recetas, setRecetas] = useState<ProductRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<ProductRecipe | null>(null);
  const [viewRecipe, setViewRecipe] = useState<ProductRecipe | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    if (organizationId) {
      cargarRecetas();
    }
  }, [organizationId]);

  const cargarRecetas = async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const data = await recipeService.getRecipes(organizationId);
      setRecetas(data);
    } catch (error) {
      console.error('Error cargando recetas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las recetas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNuevo = () => {
    setEditingRecipe(null);
    setShowDialog(true);
  };

  const handleEditar = (recipe: ProductRecipe) => {
    setEditingRecipe(recipe);
    setShowDialog(true);
  };

  const handleVer = async (recipe: ProductRecipe) => {
    try {
      setViewLoading(true);
      const fullRecipe = await recipeService.getRecipeById(recipe.id);
      setViewRecipe(fullRecipe);
    } catch (error) {
      console.error('Error cargando detalle:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el detalle de la receta',
        variant: 'destructive',
      });
    } finally {
      setViewLoading(false);
    }
  };

  const handleEliminar = async (recipe: ProductRecipe) => {
    if (!confirm(`¿Eliminar la receta de "${recipe.product?.name ?? 'producto'}"?`)) return;

    try {
      await recipeService.deleteRecipe(recipe.id);
      toast({ title: 'Receta eliminada' });
      cargarRecetas();
    } catch (error) {
      console.error('Error eliminando receta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la receta',
        variant: 'destructive',
      });
    }
  };

  const handleDesactivar = async (recipe: ProductRecipe) => {
    try {
      await recipeService.deactivateRecipe(recipe.id);
      toast({ title: 'Receta desactivada' });
      cargarRecetas();
    } catch (error) {
      console.error('Error desactivando receta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo desactivar la receta',
        variant: 'destructive',
      });
    }
  };

  const recetasFiltradas = recetas.filter(
    (r) =>
      r.product?.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.product?.sku?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalPages = Math.ceil(recetasFiltradas.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const recetasPaginadas = useMemo(
    () => recetasFiltradas.slice(startIndex, startIndex + pageSize),
    [recetasFiltradas, startIndex, pageSize]
  );

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda]);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                <ChefHat className="h-6 w-6 text-orange-600" />
              </div>
              Recetas de Producción
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Inventario / Recetas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={cargarRecetas}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={handleNuevo}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Receta
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total recetas</p>
                <p className="text-2xl font-bold dark:text-white">{recetas.length}</p>
              </div>
              <ChefHat className="h-8 w-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Activas</p>
                <p className="text-2xl font-bold text-green-600">
                  {recetas.filter((r) => r.is_active).length}
                </p>
              </div>
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Inactivas</p>
                <p className="text-2xl font-bold text-gray-400">
                  {recetas.filter((r) => !r.is_active).length}
                </p>
              </div>
              <div className="w-3 h-3 rounded-full bg-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Productos compuestos</p>
                <p className="text-2xl font-bold text-blue-600">
                  {new Set(recetas.map((r) => r.product_id)).size}
                </p>
              </div>
              <Package className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por producto, nombre o SKU..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-10 dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg animate-pulse"
                >
                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-48" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-24" />
                  </div>
                  <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-20" />
                </div>
              ))}
            </div>
          ) : recetasFiltradas.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <ChefHat className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No hay recetas de producción</p>
              <p className="text-sm mt-1">
                Crea una receta para definir los ingredientes de un producto compuesto
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Producto</TableHead>
                  <TableHead className="dark:text-gray-300">SKU</TableHead>
                  <TableHead className="dark:text-gray-300">Nombre receta</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Rendimiento</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Estado</TableHead>
                  <TableHead className="dark:text-gray-300 text-center">Versión</TableHead>
                  <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recetasPaginadas.map((recipe) => (
                  <TableRow
                    key={recipe.id}
                    className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                          <Package className="h-4 w-4 text-orange-600" />
                        </div>
                        <span className="font-medium dark:text-white">
                          {recipe.product?.name ?? `Producto #${recipe.product_id}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {recipe.product?.sku ?? '-'}
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      {recipe.name ?? '-'}
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      <span className="font-mono text-sm">
                        {recipe.yield_qty} {recipe.yield_unit_code ?? ''}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {recipe.is_active ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
                          Activa
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center dark:text-gray-300">
                      <span className="font-mono text-sm">v{recipe.version}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVer(recipe)}
                          className="h-8 w-8 p-0"
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditar(recipe)}
                          className="h-8 w-8 p-0"
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {recipe.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDesactivar(recipe)}
                            className="h-8 w-8 p-0 text-yellow-600"
                            title="Desactivar"
                          >
                            <AlertCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEliminar(recipe)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={recetasFiltradas.length}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </CardContent>
      </Card>

      {/* Dialog de creación/edición */}
      <RecipeDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        organizationId={organizationId ?? 0}
        recipe={editingRecipe}
        onSaved={cargarRecetas}
      />

      {/* Dialog de detalle */}
      <Dialog open={!!viewRecipe} onOpenChange={(open) => !open && setViewRecipe(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <ChefHat className="h-5 w-5 text-orange-600" />
              Detalle de Receta
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              {viewRecipe?.product?.name ?? ''}
            </DialogDescription>
          </DialogHeader>

          {viewLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : viewRecipe ? (
            <div className="space-y-4">
              {/* Info general */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Producto</p>
                  <p className="font-medium dark:text-white">
                    {viewRecipe.product?.name ?? `#${viewRecipe.product_id}`}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                    SKU: {viewRecipe.product?.sku ?? 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Rendimiento</p>
                  <p className="font-medium dark:text-white font-mono">
                    {viewRecipe.yield_qty} {viewRecipe.yield_unit_code ?? ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Estado</p>
                  <Badge
                    className={
                      viewRecipe.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : ''
                    }
                    variant={viewRecipe.is_active ? 'default' : 'secondary'}
                  >
                    {viewRecipe.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Versión</p>
                  <p className="font-medium dark:text-white font-mono">v{viewRecipe.version}</p>
                </div>
              </div>

              {/* Notas */}
              {viewRecipe.notes && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                  <p className="text-sm dark:text-gray-300 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                    {viewRecipe.notes}
                  </p>
                </div>
              )}

              {/* Ingredientes */}
              <div>
                <p className="text-sm font-medium dark:text-gray-300 mb-2">
                  Ingredientes ({viewRecipe.ingredients?.length ?? 0})
                </p>
                <div className="space-y-2">
                  {viewRecipe.ingredients?.map((ing, i) => (
                    <div
                      key={ing.id}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 font-mono w-6">#{i + 1}</span>
                        <div>
                          <p className="font-medium text-sm dark:text-white">
                            {ing.ingredient_product?.name ?? `#${ing.ingredient_product_id}`}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {ing.ingredient_product?.sku ?? 'N/A'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {ing.is_optional && (
                          <Badge variant="outline" className="text-xs">
                            Opcional
                          </Badge>
                        )}
                        <span className="font-mono text-sm dark:text-white">
                          {ing.quantity} {ing.unit_code}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
