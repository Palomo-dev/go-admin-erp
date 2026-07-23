'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Package } from 'lucide-react';
import {
  productionOrderService,
  type CreateProductionOrderData,
  type ProductionOrderStatus,
} from '@/lib/services/productionOrderService';
import { recipeService, type ProductRecipe } from '@/lib/services/recipeService';
import { useOrganization, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';

interface ProductionOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ProductionOrderDialog({
  open,
  onOpenChange,
  onSaved,
}: ProductionOrderDialogProps) {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const [formData, setFormData] = useState({
    recipe_id: 0,
    product_id: 0,
    product_name: '',
    qty_to_produce: 1,
    notes: '',
  });

  useEffect(() => {
    if (open && organizationId) {
      cargarRecetas();
      setFormData({
        recipe_id: 0,
        product_id: 0,
        product_name: '',
        qty_to_produce: 1,
        notes: '',
      });
    }
  }, [open, organizationId]);

  const cargarRecetas = async () => {
    if (!organizationId) return;
    try {
      setLoadingRecipes(true);
      const data = await recipeService.getRecipes(organizationId);
      setRecipes(data.filter((r) => r.is_active));
    } catch (error) {
      console.error('Error cargando recetas:', error);
    } finally {
      setLoadingRecipes(false);
    }
  };

  const filteredRecipes = recipes.filter(
    (r) =>
      r.product?.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectRecipe = (recipe: ProductRecipe) => {
    setFormData((prev) => ({
      ...prev,
      recipe_id: recipe.id,
      product_id: recipe.product_id,
      product_name: recipe.product?.name ?? '',
      qty_to_produce: recipe.yield_qty,
    }));
    setShowDropdown(false);
    setSearch('');
  };

  const handleSave = async () => {
    if (formData.recipe_id === 0) {
      toast({ title: 'Error', description: 'Selecciona una receta', variant: 'destructive' });
      return;
    }

    if (formData.qty_to_produce <= 0) {
      toast({ title: 'Error', description: 'La cantidad debe ser mayor a 0', variant: 'destructive' });
      return;
    }

    const branchId = getCurrentBranchId() ?? 2;

    try {
      setSaving(true);

      const payload: CreateProductionOrderData = {
        organization_id: organizationId!,
        branch_id: branchId,
        recipe_id: formData.recipe_id,
        product_id: formData.product_id,
        qty_to_produce: formData.qty_to_produce,
        notes: formData.notes || undefined,
      };

      await productionOrderService.createOrder(payload);
      toast({ title: 'Orden de producción creada' });

      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error('Error creando orden:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la orden de producción',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">Nueva Orden de Producción</DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Crea una orden para producir un producto compuesto
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Receta */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Receta *</Label>
            {formData.recipe_id !== 0 ? (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20 dark:border-gray-600">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  <div>
                    <span className="font-medium dark:text-white">{formData.product_name}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Receta: {recipes.find((r) => r.id === formData.recipe_id)?.name ?? 'N/A'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, recipe_id: 0, product_id: 0, product_name: '' }));
                    setShowProductDropdown(true);
                  }}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar receta por producto..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="pl-10 dark:bg-gray-900 dark:border-gray-600"
                  />
                </div>
                {showDropdown && !loadingRecipes && filteredRecipes.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
                    {filteredRecipes.slice(0, 15).map((recipe) => (
                      <button
                        key={recipe.id}
                        onClick={() => handleSelectRecipe(recipe)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                      >
                        <div className="font-medium text-sm dark:text-white">
                          {recipe.product?.name ?? `#${recipe.product_id}`}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {recipe.name ?? 'Sin nombre'} · Rendimiento: {recipe.yield_qty} {recipe.yield_unit_code ?? ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown && !loadingRecipes && filteredRecipes.length === 0 && (
                  <div className="absolute z-50 mt-1 w-full p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg text-center text-sm text-gray-500 dark:text-gray-400">
                    No hay recetas activas. Crea una receta primero.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cantidad */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Cantidad a producir *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={formData.qty_to_produce}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, qty_to_produce: parseFloat(e.target.value) || 1 }))
              }
              className="dark:bg-gray-900 dark:border-gray-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Unidades del producto final a producir
            </p>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Notas</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Notas internas sobre la orden..."
              rows={2}
              className="dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="dark:border-gray-600"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              'Crear Orden'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
