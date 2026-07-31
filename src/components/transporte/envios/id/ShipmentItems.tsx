'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Package, Plus, Trash2, Loader2, Tag, Percent, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ItemModifier {
  groupId: number;
  groupName: string;
  modifierId: number;
  name: string;
  extraPrice: number;
}

interface ShipmentItem {
  id: string;
  description: string;
  sku?: string;
  qty: number;
  unit?: string;
  unit_value?: number;
  total_value?: number;
  weight_kg?: number;
  notes?: string;
  product_id?: number;
  sale_item_id?: string;
  product_image?: string | null;
  products?: { id: number; name: string; sku: string };
}

interface ProductSearchResult {
  id: number;
  sku?: string;
  name: string;
  unit_code?: string;
  description?: string;
  price: number;
}

interface ShipmentItemsProps {
  items: ShipmentItem[];
  isLoading: boolean;
  canEdit: boolean;
  organizationId?: number;
  onAddItem: (item: Omit<ShipmentItem, 'id' | 'products'>) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onSearchProduct?: (query: string) => Promise<ProductSearchResult[]>;
}

export function ShipmentItems({ items, isLoading, canEdit, organizationId, onAddItem, onDeleteItem, onSearchProduct }: ShipmentItemsProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ShipmentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    description: '',
    sku: '',
    qty: 1,
    unit: 'und',
    unit_value: 0,
    weight_kg: 0,
    notes: '',
  });

  const handleProductSearch = async () => {
    if (!onSearchProduct || !productSearch.trim()) return;
    setSearchingProducts(true);
    try {
      const results = await onSearchProduct(productSearch);
      setProductResults(results);
    } catch (error) {
      console.error('Error searching products:', error);
    } finally {
      setSearchingProducts(false);
    }
  };

  const selectProduct = (product: ProductSearchResult) => {
    setSelectedProductId(product.id);
    setFormData((prev) => ({
      ...prev,
      description: product.name,
      sku: product.sku || '',
      unit: product.unit_code || 'und',
      unit_value: product.price,
    }));
    setProductResults([]);
    setProductSearch('');
  };

  const handleSubmit = async () => {
    if (!formData.description) return;
    
    setIsSubmitting(true);
    try {
      await onAddItem({
        ...formData,
        product_id: selectedProductId || undefined,
      });
      setShowDialog(false);
      setFormData({
        description: '',
        sku: '',
        qty: 1,
        unit: 'und',
        unit_value: 0,
        weight_kg: 0,
        notes: '',
      });
      setSelectedProductId(null);
    } catch (error) {
      console.error('Error adding item:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalValue = items.reduce((sum, item) => sum + (item.total_value || 0), 0);
  const totalWeight = items.reduce((sum, item) => sum + ((item.weight_kg || 0) * (item.qty || 1)), 0);

  const formatCOP = (value: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);

  const parseItemNotes = (notes?: string): {
    modifiers?: ItemModifier[];
    variant_data?: Record<string, string>;
    discount_amount?: number;
    tax_amount?: number;
    tax_rate?: number;
    tax_excluded?: boolean;
    product_image?: string;
  } => {
    if (!notes) return {};
    try {
      return JSON.parse(notes);
    } catch {
      return {};
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await onDeleteItem(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      console.error('Error deleting item:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Package className="h-4 w-4" />
          Items del Envío ({items.length})
        </h3>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar Item
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-300" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-center py-4 dark:text-gray-400">No hay items registrados</p>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => {
              const { modifiers, variant_data, discount_amount, tax_amount, tax_rate, tax_excluded, product_image: noteImage } = parseItemNotes(item.notes);
              const variantEntries = variant_data
                ? Object.entries(variant_data).filter(([, v]) => !!v)
                : [];
              const productSku = item.sku || item.products?.sku || null;
              const productName = item.products?.name || item.description;
              const productImage = item.product_image || noteImage || null;

              return (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
                  {/* Imagen del producto */}
                  <div className="shrink-0">
                    {productImage ? (
                      <div className="relative w-12 h-12 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800">
                        <img
                          src={productImage}
                          alt={productName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Package className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                      </div>
                    )}
                  </div>

                  {/* Información del producto */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight" title={productName}>
                      {productName}
                    </h4>

                    {/* Badges de variantes */}
                    {variantEntries.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        {variantEntries.map(([attr, value]) => (
                          <Badge key={attr} variant="outline" className="text-[0.65rem] px-1 py-0 border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300 shrink-0">
                            {attr}: {value}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Badges de modificadores */}
                    {modifiers && modifiers.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        {modifiers.map((mod) => (
                          <Badge key={mod.modifierId} variant="outline" className="text-[0.65rem] px-1 py-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300 shrink-0">
                            {mod.name}{mod.extraPrice > 0 ? ` (+${formatCOP(mod.extraPrice)})` : ''}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Badge de descuento */}
                    {discount_amount && discount_amount > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <Badge variant="outline" className="text-[0.65rem] px-1 py-0 border-red-300 text-red-700 dark:border-red-700 dark:text-red-300 shrink-0">
                          <Tag className="h-3 w-3 mr-0.5" />
                          Desc: -{formatCOP(discount_amount)}
                        </Badge>
                      </div>
                    )}

                    {/* Badge de impuesto */}
                    {tax_amount && tax_amount > 0 && (
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <Badge variant="outline" className="text-[0.65rem] px-1 py-0 border-green-300 text-green-700 dark:border-green-700 dark:text-green-300 shrink-0">
                          <Percent className="h-3 w-3 mr-0.5" />
                          Imp: {formatCOP(tax_amount)} ({tax_rate || 0}%{tax_excluded ? ' excl.' : ' incl.'})
                        </Badge>
                      </div>
                    )}

                    {/* SKU y info secundaria */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {productSku && (
                        <Badge variant="outline" className="text-[0.65rem] px-1 py-0 dark:border-gray-600 dark:text-gray-400 border-gray-400 text-gray-600 shrink-0">
                          {productSku}
                        </Badge>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {item.qty} {item.unit || 'und'} × {item.unit_value ? formatCOP(item.unit_value) : '-'}
                      </span>
                      {item.weight_kg ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{item.weight_kg} kg</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Total y acciones */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                      {item.total_value ? formatCOP(item.total_value) : '-'}
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(item)} className="h-6 w-6 p-0">
                        <Trash2 className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Peso Total: <strong>{totalWeight.toFixed(2)} kg</strong></span>
            <span className="text-gray-500 dark:text-gray-400">
              Valor Total: <strong className="text-blue-600 dark:text-blue-300">{formatCOP(totalValue)}</strong>
            </span>
          </div>
        </>
      )}

      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) {
          setSelectedProductId(null);
          setProductResults([]);
          setProductSearch('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            {onSearchProduct && (
              <div className="space-y-2">
                <Label>Buscar Producto del Inventario</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar por nombre, SKU o código de barras..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleProductSearch()}
                  />
                  <Button type="button" variant="outline" onClick={handleProductSearch} disabled={searchingProducts}>
                    {searchingProducts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {productResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-32 overflow-y-auto">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduct(p)}
                        className="w-full p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
                      >
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {p.sku && `${p.sku} · `}
                          {p.unit_code || 'und'} · {formatCOP(p.price)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {selectedProductId && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    ✓ Producto del inventario seleccionado
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Descripción *</Label>
              <Input
                value={formData.description}
                onChange={(e) => {
                  setFormData((p) => ({ ...p, description: e.target.value }));
                  setSelectedProductId(null);
                }}
                placeholder="Descripción del producto"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData((p) => ({ ...p, sku: e.target.value }))}
                  placeholder="Código"
                />
              </div>
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  value={formData.qty}
                  onChange={(e) => setFormData((p) => ({ ...p, qty: Number(e.target.value) || 1 }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <div className="space-y-2">
                <Label>Valor Unitario</Label>
                <Input
                  type="number"
                  value={formData.unit_value}
                  onChange={(e) => setFormData((p) => ({ ...p, unit_value: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.weight_kg}
                  onChange={(e) => setFormData((p) => ({ ...p, weight_kg: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !formData.description}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar item del envío?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.products?.name || deleteTarget?.description}</strong> del envío.
              Esta acción no se puede deshacer y se registrará en el timeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
