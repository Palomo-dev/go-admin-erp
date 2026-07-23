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
  Search,
  GripVertical,
  Package,
} from 'lucide-react';
import { recipeService, type ProductRecipe, type CreateRecipeData } from '@/lib/services/recipeService';
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

interface ProductOption {
  id: number;
  name: string;
  sku: string;
  unit_code: string | null;
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
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [units, setUnits] = useState<{ code: string; name: string }[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  const [formData, setFormData] = useState({
    product_id: 0,
    product_name: '',
    name: '',
    yield_qty: 1,
    yield_unit_code: '',
    notes: '',
  });

  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);

  useEffect(() => {
    if (open) {
      cargarProductos();
      cargarUnidades();
      if (recipe) {
        setFormData({
          product_id: recipe.product_id,
          product_name: recipe.product?.name ?? '',
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
        setFormData({
          product_id: 0,
          product_name: '',
          name: '',
          yield_qty: 1,
          yield_unit_code: '',
          notes: '',
        });
        setIngredients([]);
      }
    }
  }, [open, recipe]);

  const cargarProductos = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, unit_code')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })
      .limit(200);

    if (error) {
      console.error('Error cargando productos:', error);
      return;
    }

    setProducts(data || []);
  };

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

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const handleSelectProduct = (product: ProductOption) => {
    setFormData((prev) => ({
      ...prev,
      product_id: product.id,
      product_name: product.name,
      yield_unit_code: product.unit_code ?? prev.yield_unit_code,
    }));
    setShowProductDropdown(false);
    setProductSearch('');
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

  const handleIngredientProductSelect = (index: number, product: ProductOption) => {
    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === index
          ? { ...ing, ingredient_product_id: product.id, unit_code: product.unit_code ?? ing.unit_code }
          : ing
      )
    );
  };

  const handleSave = async () => {
    if (formData.product_id === 0) {
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
        product_id: formData.product_id,
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            {recipe ? 'Editar Receta' : 'Nueva Receta'}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {recipe ? 'Modificar receta e ingredientes' : 'Crear receta para producto compuesto'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Producto */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Producto *</Label>
            {formData.product_id !== 0 ? (
              <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20 dark:border-gray-600">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  <span className="font-medium dark:text-white">{formData.product_name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, product_id: 0, product_name: '' }));
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
                    placeholder="Buscar producto por nombre o SKU..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="pl-10 dark:bg-gray-900 dark:border-gray-600"
                  />
                </div>
                {showProductDropdown && filteredProducts.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
                    {filteredProducts.slice(0, 20).map((product) => (
                      <button
                        key={product.id}
                        onClick={() => handleSelectProduct(product)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                      >
                        <div className="font-medium text-sm dark:text-white">{product.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          SKU: {product.sku || 'N/A'} {product.unit_code ? `· ${product.unit_code}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                    index={index}
                    ingredient={ing}
                    products={products}
                    units={units}
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
  index,
  ingredient,
  products,
  units,
  onRemove,
  onChange,
  onProductSelect,
}: {
  index: number;
  ingredient: IngredientRow;
  products: ProductOption[];
  units: { code: string; name: string }[];
  onRemove: () => void;
  onChange: (field: keyof IngredientRow, value: unknown) => void;
  onProductSelect: (product: ProductOption) => void;
}) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const selectedProduct = products.find((p) => p.id === ingredient.ingredient_product_id);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/30">
      <div className="flex items-start gap-2">
        <div className="flex items-center pt-2 text-gray-400">
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2">
          {/* Producto */}
          <div className="md:col-span-5 relative">
            {selectedProduct ? (
              <div className="flex items-center justify-between p-2 border rounded bg-white dark:bg-gray-900 dark:border-gray-600">
                <span className="text-sm font-medium dark:text-white truncate">
                  {selectedProduct.name}
                </span>
                <button
                  onClick={() => {
                    onChange('ingredient_product_id', 0);
                    setShowDropdown(true);
                  }}
                  className="text-xs text-blue-600 hover:underline ml-2 shrink-0"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  className="h-9 dark:bg-gray-900 dark:border-gray-600 text-sm"
                />
                {showDropdown && filtered.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
                    {filtered.slice(0, 10).map((product) => (
                      <button
                        key={product.id}
                        onClick={() => {
                          onProductSelect(product);
                          setShowDropdown(false);
                          setSearch('');
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                      >
                        <div className="text-sm font-medium dark:text-white">{product.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {product.sku || 'N/A'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
