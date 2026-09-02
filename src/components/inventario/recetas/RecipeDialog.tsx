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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  Package,
} from 'lucide-react';
import { recipeService, type ProductRecipe, type CreateRecipeData } from '@/lib/services/recipeService';
import { purchaseOrderService } from '@/lib/services/purchaseOrderService';
import { ProductSearchCombobox, type ProductOption } from '@/components/inventario/ordenes-compra/ProductSearchCombobox';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';

interface IngredientRow {
  ingredient_product_id: number;
  quantity: number;
  unit_code: string;
  is_optional: boolean;
  notes: string;
  sort_order: number;
}

interface RecipeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  recipe?: ProductRecipe | null;
  onSaved: () => void;
}

export function RecipeDialog({
  open,
  onOpenChange,
  organizationId,
  recipe,
  onSaved,
}: RecipeDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [units, setUnits] = useState<{ code: string; name: string }[]>([]);

  const [formData, setFormData] = useState({
    product_id: '',
    name: '',
    yield_qty: 1,
    yield_unit_code: '',
    notes: '',
  });

  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);

  // Cargar productos (con imagen + variantes + parent) y unidades al abrir.
  // Se reutiliza purchaseOrderService.getProducts para mantener paridad exacta
  // con el selector de órdenes-compra: paginado completo, parentMap, imágenes.
  useEffect(() => {
    if (!open) return;
    setLoadingProducts(true);
    Promise.all([
      purchaseOrderService.getProducts(organizationId),
      cargarUnidades(),
    ])
      .then(([productsData]) => {
        setProducts(productsData as ProductOption[]);
      })
      .finally(() => setLoadingProducts(false));

    if (recipe) {
      setFormData({
        product_id: recipe.product_id.toString(),
        name: recipe.name ?? '',
        yield_qty: recipe.yield_qty,
        yield_unit_code: recipe.yield_unit_code ?? '',
        notes: recipe.notes ?? '',
      });
      setIngredients(
        (recipe.ingredients ?? []).map((ing, i) => ({
          ingredient_product_id: ing.ingredient_product_id,
          quantity: ing.quantity,
          unit_code: ing.unit_code,
          is_optional: ing.is_optional,
          notes: ing.notes ?? '',
          sort_order: ing.sort_order ?? i,
        }))
      );
    } else {
      setFormData({ product_id: '', name: '', yield_qty: 1, yield_unit_code: '', notes: '' });
      setIngredients([]);
    }
  }, [open, recipe, organizationId]);

  const cargarUnidades = async () => {
    const { data, error } = await supabase
      .from('units')
      .select('code, name')
      .order('name', { ascending: true });
    if (error) {
      console.error('Error cargando unidades:', error);
      return;
    }
    setUnits(data || []);
  };

  const handleSelectProduct = (product: ProductOption | null) => {
    setFormData((prev) => ({
      ...prev,
      product_id: product ? product.id.toString() : '',
      yield_unit_code: product?.unit_code ?? prev.yield_unit_code,
    }));
  };

  const handleAddIngredient = () => {
    setIngredients((prev) => [
      ...prev,
      {
        ingredient_product_id: 0,
        quantity: 1,
        unit_code: '',
        is_optional: false,
        notes: '',
        sort_order: prev.length,
      },
    ]);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: keyof IngredientRow, value: unknown) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing))
    );
  };

  const handleIngredientProductSelect = (index: number, product: ProductOption | null) => {
    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === index
          ? {
              ...ing,
              ingredient_product_id: product ? product.id : 0,
              unit_code: product?.unit_code ?? ing.unit_code,
            }
          : ing
      )
    );
  };

  const handleSave = async () => {
    if (!formData.product_id) {
      toast({ title: 'Error', description: 'Selecciona un producto', variant: 'destructive' });
      return;
    }

    if (ingredients.length === 0) {
      toast({ title: 'Error', description: 'Agrega al menos un ingrediente', variant: 'destructive' });
      return;
    }

    const invalidIngredient = ingredients.find((ing) => ing.ingredient_product_id === 0 || ing.quantity <= 0);
    if (invalidIngredient) {
      toast({ title: 'Error', description: 'Todos los ingredientes deben tener producto y cantidad', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);

      const payload: CreateRecipeData = {
        organization_id: organizationId,
        product_id: parseInt(formData.product_id),
        name: formData.name || undefined,
        yield_qty: formData.yield_qty,
        yield_unit_code: formData.yield_unit_code || undefined,
        notes: formData.notes || undefined,
        ingredients: ingredients.map((ing) => ({
          ingredient_product_id: ing.ingredient_product_id,
          quantity: ing.quantity,
          unit_code: ing.unit_code,
          is_optional: ing.is_optional,
          notes: ing.notes || undefined,
          sort_order: ing.sort_order,
        })),
      };

      if (recipe) {
        await recipeService.updateRecipe(recipe.id, payload);
        toast({ title: 'Receta actualizada' });
      } else {
        await recipeService.createRecipe(payload);
        toast({ title: 'Receta creada' });
      }

      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error('Error guardando receta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la receta',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            {recipe ? 'Editar Receta' : 'Nueva Receta'}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {recipe ? 'Modificar receta e ingredientes' : 'Crear receta para producto compuesto'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Producto (resultado de la receta) */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Producto *</Label>
            {loadingProducts ? (
              <div className="flex items-center gap-2 p-3 border rounded-lg dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando productos...
              </div>
            ) : (
              <ProductSearchCombobox
                products={products}
                value={formData.product_id}
                onSelect={handleSelectProduct}
                placeholder="Buscar producto por nombre o SKU..."
              />
            )}
          </div>

          {/* Nombre receta + rendimiento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-1">
              <Label className="dark:text-gray-300">Nombre receta</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Receta Pizza Margarita"
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Rendimiento (qty)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.yield_qty}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, yield_qty: parseFloat(e.target.value) || 1 }))
                }
                className="dark:bg-gray-900 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-300">Unidad rendimiento</Label>
              <Select
                value={formData.yield_unit_code}
                onValueChange={(val) => setFormData((prev) => ({ ...prev, yield_unit_code: val }))}
              >
                <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                  {units.map((unit) => (
                    <SelectItem key={unit.code} value={unit.code}>
                      {unit.code} - {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Notas</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Instrucciones de preparación, notas internas..."
              rows={2}
              className="dark:bg-gray-900 dark:border-gray-600"
            />
          </div>

          {/* Ingredientes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="dark:text-gray-300">Ingredientes *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddIngredient}
                className="dark:border-gray-600"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </div>

            {ingredients.length === 0 ? (
              <div className="text-center py-6 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No hay ingredientes. Agrega al menos uno.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ingredients.map((ing, index) => (
                  <IngredientRowCard
                    key={index}
                    ingredient={ing}
                    products={products}
                    units={units}
                    loadingProducts={loadingProducts}
                    onRemove={() => handleRemoveIngredient(index)}
                    onChange={(field, value) => handleIngredientChange(index, field, value)}
                    onProductSelect={(product) => handleIngredientProductSelect(index, product)}
                  />
                ))}
              </div>
            )}
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
                Guardando...
              </>
            ) : (
              'Guardar Receta'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IngredientRowCard({
  ingredient,
  products,
  units,
  loadingProducts,
  onRemove,
  onChange,
  onProductSelect,
}: {
  ingredient: IngredientRow;
  products: ProductOption[];
  units: { code: string; name: string }[];
  loadingProducts: boolean;
  onRemove: () => void;
  onChange: (field: keyof IngredientRow, value: unknown) => void;
  onProductSelect: (product: ProductOption | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/30">
      <div className="flex items-start gap-2">
        <div className="flex items-center pt-2 text-gray-400">
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2">
          {/* Producto */}
          <div className="md:col-span-5">
            {loadingProducts ? (
              <div className="flex items-center gap-2 h-9 px-3 border rounded bg-white dark:bg-gray-900 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Cargando...
              </div>
            ) : (
              <ProductSearchCombobox
                products={products}
                value={ingredient.ingredient_product_id.toString()}
                onSelect={onProductSelect}
                placeholder="Buscar ingrediente..."
              />
            )}
          </div>

          {/* Cantidad */}
          <div className="md:col-span-2">
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={ingredient.quantity}
              onChange={(e) => onChange('quantity', parseFloat(e.target.value) || 0)}
              placeholder="Qty"
              className="h-9 dark:bg-gray-900 dark:border-gray-600 text-sm"
            />
          </div>

          {/* Unidad */}
          <div className="md:col-span-2">
            <Select
              value={ingredient.unit_code}
              onValueChange={(val) => onChange('unit_code', val)}
            >
              <SelectTrigger className="h-9 dark:bg-gray-900 dark:border-gray-600 text-sm">
                <SelectValue placeholder="Unidad" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-600">
                {units.map((unit) => (
                  <SelectItem key={unit.code} value={unit.code} className="text-sm">
                    {unit.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Opcional */}
          <div className="md:col-span-2 flex items-center">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={ingredient.is_optional}
                onChange={(e) => onChange('is_optional', e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="dark:text-gray-300">Opcional</span>
            </label>
          </div>

          {/* Eliminar */}
          <div className="md:col-span-1 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="h-9 w-9 p-0 text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {ingredient.is_optional && (
        <div className="pl-6">
          <Badge variant="outline" className="text-xs">
            Ingrediente opcional
          </Badge>
        </div>
      )}
    </div>
  );
}
