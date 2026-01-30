'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Search, X, ShoppingCart, Package } from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { getPublicUrl } from '@/lib/supabase/imageUtils';
import { POSService } from '@/lib/services/posService';
import { VariantSelectorDialog } from '@/components/pos/VariantSelectorDialog';

interface Product {
  id: number;
  name: string;
  price?: number;
  product_images?: Array<{
    storage_path: string;
    is_primary: boolean;
  }>;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  rank: number;
}

interface ConsumptionToAdd {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes: string;
}

interface AddConsumptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddConsumptions: (consumptions: ConsumptionToAdd[]) => Promise<void>;
  spaceName: string;
}

export function AddConsumptionDialog({
  open,
  onOpenChange,
  onAddConsumptions,
  spaceName,
}: AddConsumptionDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<Map<number, ConsumptionToAdd>>(new Map());
  
  // Estado para selector de variantes
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [selectedParentProduct, setSelectedParentProduct] = useState<any>(null);

  useEffect(() => {
    if (open) {
      loadProducts();
      loadCategories();
    }
  }, [open]);

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const result = await POSService.getProductsPaginated({
        page: 1,
        limit: 200,
        search: searchTerm,
        category_id: selectedCategory !== 'all' ? parseInt(selectedCategory) : undefined,
      });
      setProducts(result.data);
    } catch (error) {
      console.error('Error cargando productos:', error);
      setProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const loadCategories = async () => {
    try {
      const { supabase } = await import('@/lib/supabase/config');
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, rank')
        .order('rank')
        .order('name');
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error cargando categorías:', error);
      setCategories([]);
    }
  };

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        loadProducts();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchTerm, selectedCategory, open]);

  // Manejar click en producto (con o sin variantes)
  const handleProductClick = (product: any) => {
    if (product.has_variants && product.variant_count > 0) {
      setSelectedParentProduct(product);
      setShowVariantDialog(true);
    } else {
      addToCart(product);
    }
  };

  // Manejar selección de variante desde el diálogo
  const handleVariantSelect = (variant: any) => {
    addToCart(variant);
    setShowVariantDialog(false);
    setSelectedParentProduct(null);
  };

  const addToCart = (product: any) => {
    const unitPrice = product.price || 0;
    if (unitPrice === 0) {
      alert('Este producto no tiene precio configurado');
      return;
    }

    const newCart = new Map(cart);
    const existing = newCart.get(product.id);

    if (existing) {
      existing.quantity += 1;
    } else {
      newCart.set(product.id, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: Number(unitPrice),
        notes: '',
      });
    }

    setCart(newCart);
  };

  const updateCartQuantity = (productId: number, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(productId);
      return;
    }

    const newCart = new Map(cart);
    const item = newCart.get(productId);
    if (item) {
      item.quantity = quantity;
      setCart(newCart);
    }
  };

  const removeFromCart = (productId: number) => {
    const newCart = new Map(cart);
    newCart.delete(productId);
    setCart(newCart);
  };

  const updateCartNotes = (productId: number, notes: string) => {
    const newCart = new Map(cart);
    const item = newCart.get(productId);
    if (item) {
      item.notes = notes;
      setCart(newCart);
    }
  };

  const cartTotal = Array.from(cart.values()).reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  const handleSubmit = async () => {
    if (cart.size === 0) return;

    setIsSubmitting(true);
    try {
      const consumptions = Array.from(cart.values());
      await onAddConsumptions(consumptions);

      setCart(new Map());
      setSearchTerm('');
      setSelectedCategory('all');
      onOpenChange(false);
    } catch (error) {
      console.error('Error agregando consumos:', error);
      alert('Error al agregar consumos. Por favor intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setCart(new Map());
      setSearchTerm('');
      setSelectedCategory('all');
    }
    onOpenChange(open);
  };

  const getProductImage = (product: Product) => {
    const images = product.product_images;
    
    if (!images || images.length === 0) return null;
    
    const primaryImage = images.find((img) => img.is_primary) || images[0];
    
    if (!primaryImage?.storage_path) return null;
    
    return getPublicUrl(primaryImage.storage_path);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] w-[1400px] max-h-[85vh] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <div className="flex flex-1 min-h-0">
          {/* Panel izquierdo - Productos */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <DialogHeader className="px-6 py-3 border-b shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl">Agregar Consumos</DialogTitle>
                  <p className="text-sm text-gray-500 mt-1">{spaceName}</p>
                </div>
                <div className="relative w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar productos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-10"
                  />
                </div>
              </div>
              
              {/* Filtro de categorías */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <Button
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory('all')}
                  className="shrink-0"
                >
                  Todas
                  {!isLoadingProducts && (
                    <Badge variant={selectedCategory === 'all' ? 'secondary' : 'outline'} className="ml-2 text-xs">
                      {products.length}
                    </Badge>
                  )}
                </Button>
                {categories.map((category) => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.id.toString() ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(category.id.toString())}
                    className="shrink-0"
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            </DialogHeader>

            {/* Grid de productos */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
              {isLoadingProducts ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-500">Cargando productos...</p>
                  </div>
                </div>
              ) : products.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No se encontraron productos</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {products.map((product: any) => {
                    const productImage = getProductImage(product);
                    const price = product.price || 0;
                    const inCart = cart.has(product.id);
                    const hasVariants = product.has_variants && product.variant_count > 0;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleProductClick(product)}
                        className={`relative group rounded-xl border-2 transition-all hover:shadow-lg ${
                          inCart
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                            : hasVariants
                              ? 'border-purple-200 bg-white hover:border-purple-400'
                              : 'border-gray-200 bg-white hover:border-blue-300'
                        }`}
                      >
                        {/* Imagen */}
                        <div className="aspect-square relative overflow-hidden rounded-t-lg bg-gray-100">
                          {productImage ? (
                            <Image
                              src={productImage}
                              alt={product.name}
                              fill
                              className="object-cover"
                              sizes="200px"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-12 w-12 text-gray-300" />
                            </div>
                          )}
                          {/* Badge de variantes */}
                          {hasVariants && (
                            <div className="absolute top-2 left-2 bg-purple-600 text-white rounded-full px-2 py-0.5 text-xs font-bold">
                              {product.variant_count} var
                            </div>
                          )}
                          {inCart && (
                            <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                              {cart.get(product.id)?.quantity}
                            </div>
                          )}
                        </div>

                        {/* Información */}
                        <div className="p-3">
                          <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-1 line-clamp-2 h-10">
                            {product.name}
                          </h3>
                          <div className="flex items-center justify-between mt-1">
                            <span className={`text-lg font-bold ${hasVariants ? 'text-purple-600' : 'text-blue-600'}`}>
                              {hasVariants ? 'Desde' : ''} {formatCurrency(price || 0)}
                            </span>
                            <Plus className={`h-5 w-5 ${hasVariants ? 'text-purple-600' : 'text-blue-600'} group-hover:scale-110 transition-transform`} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Panel derecho - Carrito */}
          <div className="w-[380px] border-l bg-gray-50 dark:bg-gray-900 flex flex-col min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b bg-white dark:bg-gray-800 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-6 w-6 text-blue-600" />
                <h2 className="text-xl font-bold">Carrito</h2>
                <Badge variant="secondary" className="ml-auto">
                  {cart.size} {cart.size === 1 ? 'producto' : 'productos'}
                </Badge>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {cart.size === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <ShoppingCart className="h-12 w-12 text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium text-sm">Carrito vacío</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Selecciona productos para agregar
                  </p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {Array.from(cart.values()).map((item) => (
                    <div
                      key={item.product_id}
                      className="bg-white dark:bg-gray-800 rounded-lg p-3 border"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-sm flex-1 pr-2">
                          {item.product_name}
                        </h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFromCart(item.product_id)}
                          className="h-5 w-5 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-1 mb-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateCartQuantity(item.product_id, item.quantity - 1)
                          }
                          className="h-7 w-7 p-0"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateCartQuantity(
                              item.product_id,
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-14 h-7 text-center text-sm"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateCartQuantity(item.product_id, item.quantity + 1)
                          }
                          className="h-7 w-7 p-0"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <span className="ml-auto font-bold text-blue-600 text-sm">
                          {formatCurrency(item.quantity * item.unit_price)}
                        </span>
                      </div>

                      <Textarea
                        placeholder="Notas..."
                        value={item.notes}
                        onChange={(e) =>
                          updateCartNotes(item.product_id, e.target.value)
                        }
                        rows={2}
                        className="text-xs resize-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer con total y botones */}
            <div className="border-t bg-white dark:bg-gray-800 p-4 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total:</span>
                <span className="text-xl font-bold text-blue-600">
                  {formatCurrency(cartTotal)}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleClose(false)}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={cart.size === 0 || isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Agregando...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar al Folio
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
      
      {/* Selector de variantes */}
      {selectedParentProduct && (
        <VariantSelectorDialog
          open={showVariantDialog}
          onOpenChange={setShowVariantDialog}
          product={selectedParentProduct}
          onSelectVariant={handleVariantSelect}
        />
      )}
    </Dialog>
  );
}
