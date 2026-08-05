'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Minus, Search, X, ShoppingCart, Package, Image as ImageIcon, Check } from 'lucide-react';
import { formatCurrency, cn } from '@/utils/Utils';
import { getPublicUrl } from '@/lib/supabase/imageUtils';
import type { Product, ProductToAdd, SelectedProductModifier } from './types';
import { POSService } from '@/lib/services/posService';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VariantSelectorDialog } from '@/components/pos/VariantSelectorDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryFilterBar } from '@/components/pos/CategoryFilterBar';
import { ConfiguracionService, PosCategoriesDisplayConfig, defaultCategoriesDisplayConfig } from '@/components/pos/configuracion/configuracionService';

interface Category {
  id: number;
  name: string;
  slug: string;
  rank: number;
  icon?: string | null;
  color?: string | null;
  image_url?: string | null;
  display_order?: number;
}

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProducts: (products: ProductToAdd[], chargeType?: 'room_charge' | 'direct_payment') => Promise<void>;
  comensales?: number;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  selectedRoom?: { space_label: string; folio_id?: string } | null;
  includedProductIds?: Set<number>;
}

export function AddProductDialog({
  open,
  onOpenChange,
  onAddProducts,
  comensales = 1,
  title = 'Agregar Productos',
  subtitle,
  submitLabel = 'Agregar al Pedido',
  selectedRoom,
  includedProductIds,
}: AddProductDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [chargeType, setChargeType] = useState<'room_charge' | 'direct_payment'>('room_charge');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categoriesDisplay, setCategoriesDisplay] = useState<PosCategoriesDisplayConfig>(defaultCategoriesDisplayConfig);
  const [cart, setCart] = useState<Map<number, ProductToAdd>>(new Map());
  
  // Estado para selector de variantes
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [selectedParentProduct, setSelectedParentProduct] = useState<any>(null);
  // Ref sincrónico para prevenir cierre del diálogo cuando se abre el selector de variantes
  const variantDialogOpeningRef = useRef(false);

  // Cargar productos reales de la base de datos
  useEffect(() => {
    if (open) {
      loadProducts();
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
      
      console.log('📦 Productos cargados:', result.data.length);
      console.log('📦 Primer producto:', result.data[0]);
      
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
      const data = await POSService.getCategories();
      setCategories(data || []);
    } catch (error) {
      console.error('Error cargando categorías:', error);
      setCategories([]);
    }
  };

  // Cargar categorías al abrir
  useEffect(() => {
    if (open) {
      loadCategories();
      ConfiguracionService.getCategoriesDisplayConfig()
        .then(setCategoriesDisplay)
        .catch((error) => console.error('Error cargando configuración de categorías:', error));
    }
  }, [open]);

  // Recargar cuando cambia el término de búsqueda o categoría
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        loadProducts();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchTerm, selectedCategory, open]);

  const filteredProducts = products;

  // Agregar producto al carrito (manejar variantes)
  const handleProductClick = (product: any) => {
    // Bloquear si el producto está agotado
    if (product.is_out_of_stock) {
      return;
    }
    // Si el producto tiene variantes o modificadores configurados, abrir el selector
    if ((product.has_variants && product.variant_count > 0) || product.has_modifiers) {
      variantDialogOpeningRef.current = true;
      setSelectedParentProduct(product);
      setShowVariantDialog(true);
    } else {
      // Producto simple sin modificadores, agregar directamente
      addToCart(product);
    }
  };

  // Manejar selección de variante (y sus modificadores) desde el diálogo
  const handleVariantSelect = (variant: any, modifiers: SelectedProductModifier[] = []) => {
    // La variante hereda la estación del producto padre (o la categoría de este) si no tiene una propia
    const inheritedStation = variant.station || selectedParentProduct?.station || selectedParentProduct?.categories?.station || null;
    const inheritedRequiresPreparation = selectedParentProduct?.categories?.requires_preparation ?? false;
    addToCart({ ...variant, station: inheritedStation, requires_preparation: inheritedRequiresPreparation, categories: selectedParentProduct?.categories }, modifiers);
    setShowVariantDialog(false);
    setSelectedParentProduct(null);
    // Retrasar reset del ref para prevenir race condition en móvil
    setTimeout(() => {
      variantDialogOpeningRef.current = false;
    }, 100);
  };

  // Agregar producto al carrito
  const addToCart = (product: any, modifiers: SelectedProductModifier[] = []) => {
    const basePrice = product.price || 0;
    if (basePrice === 0) {
      alert('Este producto no tiene precio configurado');
      return;
    }
    const extraTotal = modifiers.reduce((sum, m) => sum + (m.extraPrice || 0), 0);
    const unitPrice = basePrice + extraTotal;

    const newCart = new Map(cart);
    const existing = newCart.get(product.id);

    if (existing) {
      existing.quantity += 1;
    } else {
      const station = product.station || product.categories?.station || '';
      const requires_preparation = product.categories?.requires_preparation ?? false;
      newCart.set(product.id, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_price: Number(unitPrice),
        notes: '',
        station,
        requires_preparation,
        guest_number: comensales > 1 ? 1 : undefined,
        variant_data: product.variant_data || null,
        modifiers: modifiers.length > 0 ? modifiers : undefined,
      });
    }

    setCart(newCart);
  };

  // Actualizar cantidad en carrito
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

  // Eliminar del carrito
  const removeFromCart = (productId: number) => {
    const newCart = new Map(cart);
    newCart.delete(productId);
    setCart(newCart);
  };

  // Actualizar notas de un item
  const updateCartNotes = (productId: number, notes: string) => {
    const newCart = new Map(cart);
    const item = newCart.get(productId);
    if (item) {
      item.notes = notes;
      setCart(newCart);
    }
  };

  // Actualizar comensal asignado a un item
  const updateCartGuestNumber = (productId: number, guestNumber: number | undefined) => {
    const newCart = new Map(cart);
    const item = newCart.get(productId);
    if (item) {
      item.guest_number = guestNumber;
      setCart(newCart);
    }
  };

  // Calcular total
  const cartTotal = Array.from(cart.values()).reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  // Enviar carrito
  const handleSubmit = async () => {
    if (cart.size === 0) return;

    setIsSubmitting(true);
    try {
      const products = Array.from(cart.values());
      await onAddProducts(products, selectedRoom?.folio_id ? chargeType : undefined);

      // Resetear
      setCart(new Map());
      setSearchTerm('');
      setSelectedCategory('all');
      onOpenChange(false);
    } catch (error) {
      console.error('Error agregando productos:', error);
      alert('Error al agregar productos. Por favor intente nuevamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resetear estado al cerrar
  const handleClose = (open: boolean) => {
    // Evitar que Radix cierre este diálogo cuando se abre el VariantSelectorDialog
    // (conflicto de diálogos anidados en móvil). Usar ref además del state para
    // evitar race conditions (el state puede no haberse actualizado aún).
    if (!open && (showVariantDialog || variantDialogOpeningRef.current)) return;
    if (!open) {
      setCart(new Map());
      setSearchTerm('');
      setSelectedCategory('all');
    }
    onOpenChange(open);
  };

  // Obtener imagen del producto
  const getProductImage = (product: any) => {
    const images = product.product_images;
    
    if (!images || images.length === 0) {
      console.log('🖼️ No images for product:', product.name);
      return null;
    }
    
    const primaryImage = images.find((img: any) => img.is_primary) || images[0];
    
    if (!primaryImage?.storage_path) {
      console.log('🖼️ No storage_path for product:', product.name);
      return null;
    }
    
    const imageUrl = getPublicUrl(primaryImage.storage_path);
    console.log('🖼️ Image URL for', product.name, ':', imageUrl);
    
    return imageUrl;
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="max-w-[100vw] sm:max-w-[95vw] w-full sm:w-[1400px] max-h-[100dvh] sm:max-h-[85vh] h-[100dvh] sm:h-[85vh] p-0 gap-0 overflow-hidden flex flex-col"
        onInteractOutside={(e) => {
          // Prevenir cierre cuando el VariantSelectorDialog está abierto o abriéndose
          if (showVariantDialog || variantDialogOpeningRef.current) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Prevenir cierre con ESC cuando el VariantSelectorDialog está abierto
          if (showVariantDialog || variantDialogOpeningRef.current) {
            e.preventDefault();
          }
        }}
      >
        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          {/* Panel izquierdo - Productos */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <DialogHeader className="px-3 sm:px-6 py-3 border-b shrink-0 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-base sm:text-xl shrink-0">{title}</DialogTitle>
                {subtitle && (
                  <p className="text-sm text-gray-500 hidden sm:block">{subtitle}</p>
                )}
                <div className="relative w-full sm:w-80">
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
              <div className="-mx-3 sm:mx-0 px-3 sm:px-0">
                <CategoryFilterBar
                  categories={categories}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  mode={categoriesDisplay.mode}
                  orderBy={categoriesDisplay.orderBy}
                />
              </div>
            </DialogHeader>

            {/* Grid de productos */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-4">
              {isLoadingProducts ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Skeleton className="w-20 h-20 rounded" />
                      </div>
                      <div className="p-3 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-6 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No se encontraron productos</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {filteredProducts.map((product: any) => {
                    const productImage = getProductImage(product);
                    const price = product.price || 0;
                    const comparePrice = product.compare_price || 0;
                    const inCart = cart.has(product.id);
                    const hasVariants = product.has_variants && product.variant_count > 0;
                    const hasModifiersOnly = !hasVariants && product.has_modifiers;
                    const isIncluded = includedProductIds?.has(product.id) ?? false;

                    return (
                      <div
                        key={product.id}
                        onClick={() => handleProductClick(product)}
                        className={cn(
                          'relative group rounded-xl border overflow-hidden transition-all duration-200',
                          product.is_out_of_stock
                            ? 'opacity-50 cursor-not-allowed border-gray-300 dark:border-gray-700'
                            : inCart
                            ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                            : hasVariants
                              ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] border-purple-200 dark:border-purple-800 bg-white dark:bg-gray-800/50 hover:border-purple-400'
                              : hasModifiersOnly
                                ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800/50 hover:border-amber-400'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-blue-300'
                        )}
                      >
                        {/* Imagen */}
                        <div className="aspect-square relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                          {productImage ? (
                            <Image
                              src={productImage}
                              alt={product.name}
                              fill
                              className="object-cover group-hover:scale-105 transition-transform duration-200"
                              sizes="(max-width: 768px) 50vw, 25vw"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                              <ImageIcon className="h-10 w-10 mb-1" />
                              <span className="text-[0.6rem]">Sin imagen</span>
                            </div>
                          )}
                          {/* Badge de agotado */}
                          {product.is_out_of_stock && (
                            <div className="absolute inset-0 m-auto w-fit h-fit bg-red-600 text-white rounded px-3 py-1 text-sm font-bold z-20 pointer-events-none">
                              Agotado
                            </div>
                          )}
                          {/* Badge de descuento */}
                          {comparePrice > price && (
                            <div className="absolute top-2 right-2 bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold z-10">
                              -{Math.round((1 - price / comparePrice) * 100)}%
                            </div>
                          )}
                          {/* Badge de variantes */}
                          {hasVariants && (
                            <div className={cn(
                              'absolute left-2 bg-purple-600 text-white rounded-full px-2 py-0.5 text-[0.6rem] font-bold z-10',
                              comparePrice > price ? 'top-8' : 'top-2'
                            )}>
                              {product.variant_count} var.
                            </div>
                          )}
                          {/* Badge de personalización (producto simple con modificadores) */}
                          {hasModifiersOnly && (
                            <div className={cn(
                              'absolute left-2 bg-amber-600 text-white rounded-full px-2 py-0.5 text-[0.6rem] font-bold z-10',
                              comparePrice > price ? 'top-8' : 'top-2'
                            )}>
                              Personalizable
                            </div>
                          )}
                          {inCart && (
                            <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold z-10">
                              {cart.get(product.id)?.quantity}
                            </div>
                          )}
                          {isIncluded && !inCart && (
                            <div className="absolute top-2 right-2 bg-green-600 text-white rounded-full px-2 py-0.5 text-[0.6rem] font-bold z-10 flex items-center gap-0.5">
                              <Check className="h-2.5 w-2.5" /> Incluido
                            </div>
                          )}
                        </div>

                        {/* Información */}
                        <div className="p-2 sm:p-3 space-y-1">
                          <h3 className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">
                            {product.name}
                          </h3>
                          {product.description && (
                            <p className="text-[0.6rem] text-gray-500 dark:text-gray-400 line-clamp-1 leading-tight">
                              {product.description}
                            </p>
                          )}
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            {comparePrice > price && (
                              <span className="line-through text-[0.65rem] text-gray-400">
                                {formatCurrency(comparePrice)}
                              </span>
                            )}
                            <span className={cn(
                              'font-bold text-xs sm:text-sm px-1.5 py-0.5 rounded',
                              hasVariants
                                ? 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30'
                                : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
                            )}>
                              {hasVariants ? 'Desde ' : ''}{formatCurrency(price || 0)}
                            </span>
                          </div>
                          {product.sku && (
                            <div className="text-[0.6rem] text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded truncate text-center">
                              {product.sku}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Panel derecho - Carrito */}
          <div className="w-full sm:w-[380px] border-t sm:border-l bg-gray-50 dark:bg-gray-900 flex flex-col min-h-0 overflow-hidden max-h-[35vh] sm:max-h-none">
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
                      <div className="flex items-start justify-between mb-1">
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

                      {item.variant_data && Object.keys(item.variant_data).length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {Object.entries(item.variant_data).filter(([, v]) => !!v).map(([attr, value]) => (
                            <Badge key={attr} variant="outline" className="text-[0.65rem] px-1.5 py-0 border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
                              {attr}: {value}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.modifiers.map((mod) => (
                            <Badge key={mod.modifierId} variant="outline" className="text-[0.65rem] px-1.5 py-0 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
                              {mod.name}{mod.extraPrice > 0 ? ` (+${formatCurrency(mod.extraPrice)})` : ''}
                            </Badge>
                          ))}
                        </div>
                      )}

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

                      {comensales > 1 && (
                        <div className="flex items-center gap-1 mb-2 flex-wrap">
                          <span className="text-[0.65rem] text-gray-500 dark:text-gray-400 shrink-0">
                            Comensal:
                          </span>
                          {Array.from({ length: comensales }, (_, i) => i + 1).map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => updateCartGuestNumber(item.product_id, num)}
                              className={cn(
                                'h-6 w-6 rounded-full text-[0.65rem] font-semibold transition-colors shrink-0',
                                item.guest_number === num
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                              )}
                            >
                              {num}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => updateCartGuestNumber(item.product_id, undefined)}
                            className={cn(
                              'h-6 px-2 rounded-full text-[0.6rem] font-medium transition-colors shrink-0',
                              !item.guest_number
                                ? 'bg-purple-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                            )}
                          >
                            General
                          </button>
                        </div>
                      )}

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
              {/* Toggle: Cargar a Habitación vs Pagar Ahora */}
              {selectedRoom?.folio_id && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>Habitación: <strong>{selectedRoom.space_label}</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setChargeType('room_charge')}
                      className={cn(
                        'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
                        chargeType === 'room_charge'
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      )}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', chargeType === 'room_charge' ? 'bg-white' : 'bg-amber-400')} />
                        Cargar a Habitación
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChargeType('direct_payment')}
                      className={cn(
                        'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
                        chargeType === 'direct_payment'
                          ? 'bg-green-500 text-white border-green-500'
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      )}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', chargeType === 'direct_payment' ? 'bg-white' : 'bg-green-400')} />
                        Pagar Ahora
                      </span>
                    </button>
                  </div>
                </div>
              )}

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
                      {submitLabel}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Selector de variantes: fuera del Dialog padre para evitar el conflicto de Radix con Dialogs anidados */}
    {selectedParentProduct && (
      <VariantSelectorDialog
        open={showVariantDialog}
        onOpenChange={(open) => {
          setShowVariantDialog(open);
          if (!open) {
            setSelectedParentProduct(null);
            // Retrasar el reset del ref para que el handleClose del padre
            // aún vea variantDialogOpeningRef=true y no se cierre en móvil
            setTimeout(() => {
              variantDialogOpeningRef.current = false;
            }, 100);
          }
        }}
        product={selectedParentProduct}
        onSelectVariant={handleVariantSelect}
      />
    )}
    </>
  );
}
