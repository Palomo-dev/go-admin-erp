'use client';

import { useState, useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, X, ShoppingCart, Package, Image as ImageIcon, Check, Star, Flame, ChefHat, Scale } from 'lucide-react';
import { SearchInput, EmptyState } from '@/components/kit';
import { useBranch } from '@/lib/context/BranchContext';
import { formatCurrency, cn } from '@/utils/Utils';
import { getPublicUrl } from '@/lib/supabase/imageUtils';
import type { Product, ProductToAdd, SelectedProductModifier } from './types';
import { POSService } from '@/lib/services/posService';
import { estacionEfectiva } from '@/lib/pos/estacionEfectiva';
import { VariantSelectorDialog } from '@/components/pos/VariantSelectorDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryFilterBar } from '@/components/pos/CategoryFilterBar';
import { ConfiguracionService, PosCategoriesDisplayConfig, defaultCategoriesDisplayConfig } from '@/components/pos/configuracion/configuracionService';
import { useToast } from '@/components/ui/use-toast';
import { recipeService, type ProductRecipe } from '@/lib/services/recipeService';
import { usePesarConBascula } from '@/components/pos/venta/peso/usePesarConBascula';
import type { Product as ProductoPos } from '@/components/pos/types';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { esMedido, formatoCantidad, simboloUnidad, type Pesaje } from '@/lib/pos/peso';
import { useHardwareBarcodeScanner } from '@/hooks/useHardwareBarcodeScanner';
import { useFormatoEtiquetaPeso } from '@/lib/pos/useFormatoEtiquetaPeso';
import { decidirEscaneoConPesarAbierto } from '@/lib/pos/bascula/flujoPesada';
import { pareceCodigoDeBarras, resolverEscaneo, type ResultadoEscaneo } from '@/lib/pos/venta/escaneo';
import type { PosGridProduct } from '@/lib/pos/venta/catalogo';
import {
  agregarLinea,
  claveUnidad,
  clavePesada,
  formatoCantidadCarrito,
  lineaMedida,
  productoEnCarrito,
  resumenProductoEnCarrito,
  type CarritoMesa,
} from './cantidadMesa';

/** Producto del catálogo tal como lo hidrata `POSService.getProductsPaginated`. */
type ProductoCatalogo = Product & {
  station?: string | null;
  categories?: { id?: number; station?: string | null; requires_preparation?: boolean } | null;
};

/** Variante elegida en `VariantSelectorDialog` (trae además lo que el servicio hidrata). */
type VarianteCatalogo = Partial<ProductoCatalogo> & {
  id: number;
  name: string;
  price: number | null;
  variant_data: Record<string, string> | null;
};

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
  const tNotas = useTranslations('posNotasLinea');
  const tAgregar = useTranslations('posMesas.agregar');
  const { branchFilter, branches } = useBranch();
  const nombreSucursal = branchFilter === null ? null : branches?.find((b) => b.id === branchFilter)?.name ?? undefined;
  const [searchTerm, setSearchTerm] = useState('');
  const [chargeType, setChargeType] = useState<'room_charge' | 'direct_payment'>('room_charge');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [products, setProducts] = useState<ProductoCatalogo[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categoriesDisplay, setCategoriesDisplay] = useState<PosCategoriesDisplayConfig>(defaultCategoriesDisplayConfig);
  // Clave de línea → línea: por unidad una por producto (como antes); por peso, una por pesada.
  const [cart, setCart] = useState<CarritoMesa>(new Map());
  const secuenciaPesada = useRef(0);
  const moneda = useMonedaOrganizacion();
  // «Pesar» con la báscula del equipo y la venta por peso en un paso: la misma
  // lógica del POS (`usePesarConBascula`, §11); aquí solo el destino, las
  // líneas de la mesa. Cada pesada es su propia línea (clave por secuencia).
  const pesar = usePesarConBascula<SelectedProductModifier>({
    agregar: ({ producto, precio, cantidad, pesaje, modifiers }) => {
      secuenciaPesada.current += 1;
      const clave = clavePesada(producto.id, secuenciaPesada.current);
      const linea = lineaDesdeProducto(producto as unknown as ProductoCatalogo, modifiers ?? [], precio, cantidad, pesaje);
      setCart((actual) => agregarLinea(actual, linea, clave));
      return clave;
    },
    deshacer: (clave) => {
      setCart((actual) => {
        const nuevo = new Map(actual);
        nuevo.delete(clave);
        return nuevo;
      });
    },
    cambiar: (clave, cantidad, pesaje) => {
      setCart((actual) => {
        const nuevo = new Map(actual);
        const linea = nuevo.get(clave);
        if (linea) nuevo.set(clave, { ...linea, quantity: cantidad, ...(pesaje ? { pesaje } : {}) });
        return nuevo;
      });
    },
  });
  const tPeso = useTranslations('posPeso.mesa');
  const tCatalogo = useTranslations('posVenta.catalogo');
  const tEtiqueta = useTranslations('posPeso.etiqueta');
  const tBascula = useTranslations('posBascula.venta');
  const locale = useLocale();
  const formatoEtiqueta = useFormatoEtiquetaPeso();
  // Variante leída con el lector cuando el producto lleva modificadores: el diálogo abre con ella elegida.
  const [varianteEscaneada, setVarianteEscaneada] = useState<number | null>(null);
  
  // Estado para selector de variantes
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [selectedParentProduct, setSelectedParentProduct] = useState<ProductoCatalogo | null>(null);
  // Ref sincrónico para prevenir cierre del diálogo cuando se abre el selector de variantes
  const variantDialogOpeningRef = useRef(false);
  // Productos cuyo toggle de favorito está en curso (para deshabilitar el botón)
  const [togglingFavorites, setTogglingFavorites] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  // Diálogo de detalle de receta vinculada a un producto
  const [recipeView, setRecipeView] = useState<ProductRecipe | null>(null);
  const [recipeViewLoading, setRecipeViewLoading] = useState(false);

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
  const handleProductClick = (product: ProductoCatalogo) => {
    // Bloquear si el producto está agotado
    if (product.is_out_of_stock) {
      return;
    }
    // Si el producto tiene variantes o modificadores configurados, abrir el selector
    if ((product.has_variants && (product.variant_count ?? 0) > 0) || product.has_modifiers) {
      variantDialogOpeningRef.current = true;
      setSelectedParentProduct(product);
      setShowVariantDialog(true);
    } else {
      // Producto simple sin modificadores, agregar directamente
      addToCart(product);
    }
  };

  // ── Lector de códigos (USB, o escrito + Enter en el buscador) ─────────────
  // Igual que en el POS (src/lib/pos/venta/escaneo.ts, `resolverEscaneo`):
  // código exacto primero; etiqueta de balanza → directo con su peso; variante
  // exacta → directo; simple → como tocar la tarjeta (un producto por peso:
  // con báscula estable entra de una; si no, «Pesar», §11).
  const avisar = (titulo: string, descripcion?: string) => toast({ title: titulo, description: descripcion, variant: 'destructive' });

  const conPrecio = async (p: ProductoCatalogo): Promise<ProductoCatalogo | null> => {
    if (Number(p.price) > 0) return p;
    try {
      const precio = await POSService.precioVigenteProducto(p.id, p.name);
      return Number(precio) > 0 ? { ...p, price: Number(precio) } : null;
    } catch {
      return null;
    }
  };

  const aplicarEtiqueta = async (code: string, r: Extract<ResultadoEscaneo, { tipo: 'etiqueta' | 'etiqueta_invalida' }>) => {
    if (r.tipo === 'etiqueta_invalida') {
      avisar(tEtiqueta('invalida'), tEtiqueta(r.motivo === 'digito_valor' ? 'invalidaValor' : 'invalidaDescripcion', { codigo: code }));
      return;
    }
    const { etiqueta, linea } = r;
    const producto = r.producto as ProductoCatalogo | null;
    if (!linea.ok) {
      const claves = {
        digito_control: 'invalida',
        digito_valor: 'invalida',
        plu_inexistente: 'pluInexistente',
        producto_por_unidad: 'productoPorUnidad',
        sin_precio: 'sinPrecio',
        peso_invalido: 'pesoInvalido',
        bajo_minimo: 'bajoMinimo',
      } as const;
      const minimo = linea.minimo !== undefined && producto ? formatoCantidad(linea.minimo, producto, locale) : '';
      avisar(tEtiqueta(claves[linea.error], { plu: etiqueta.plu, producto: producto?.name ?? '', minimo }), tEtiqueta('codigoLeido', { codigo: code }));
      return;
    }
    const conPrecioVigente = producto ? await conPrecio(producto) : null;
    if (!conPrecioVigente) {
      avisar(tCatalogo('sinPrecioTitulo'), tCatalogo('sinPrecioDescripcion', { producto: producto?.name ?? '' }));
      return;
    }
    // Cada etiqueta es su propia línea, con su peso y `notes.pesaje` de origen «etiqueta».
    secuenciaPesada.current += 1;
    const nueva = lineaDesdeProducto(conPrecioVigente, [], Number(conPrecioVigente.price), linea.cantidad, linea.pesaje);
    setCart((actual) => agregarLinea(actual, nueva, clavePesada(conPrecioVigente.id, secuenciaPesada.current)));
    if (linea.aviso) {
      toast({
        title: tEtiqueta('importeDifiere'),
        description: tEtiqueta('importeDifiereDescripcion', {
          etiqueta: moneda.formatear(linea.aviso.importeEtiqueta),
          calculado: moneda.formatear(linea.aviso.importeCalculado),
        }),
      });
    }
  };

  /**
   * Otro código con «Pesar» abierto (el diálogo acepta escaneos): la pesada
   * pendiente nunca se confirma de forma implícita; el mismo producto se
   * ignora (doble lectura) y otro la cancela y sigue. Misma regla que el POS
   * (`decidirEscaneoConPesarAbierto`). Devuelve si hay que seguir.
   */
  const seguirTrasPesarAbierto = (productoNuevoId: number): boolean => {
    const pendiente = pesar.pendiente;
    if (!pendiente) return true;
    const decision = decidirEscaneoConPesarAbierto({
      productoAbiertoId: pendiente.producto.id,
      productoNuevoId,
      modo: pendiente.modo,
    });
    if (decision === 'ignorar') return false;
    toast({ title: tBascula('pesadaCancelada', { producto: pendiente.producto.name }) });
    pesar.cancelar();
    return true;
  };

  const manejarCodigo = async (code: string) => {
    try {
      const r = await resolverEscaneo(code, {
        porCodigo: (c) => POSService.getProductByBarcode(c),
        grilla: async (termino, limite) =>
          (await POSService.getProductsPaginated({ page: 1, limit: limite, search: termino, status: 'active' })).data as PosGridProduct[],
        porPlu: (plu) => POSService.getProductByScalePlu(plu),
        precioVigente: (p) => POSService.precioVigenteProducto(p.id, p.name),
        formatoEtiqueta,
        decimalesMoneda: moneda.decimals ?? 0,
      });
      const idNuevo =
        r.tipo === 'etiqueta'
          ? r.producto?.id ?? null
          : r.tipo === 'producto' && r.decision.tipo !== 'no_encontrado'
            ? r.decision.tipo === 'dialogo_padre'
              ? r.decision.padre.id
              : r.decision.producto.id
            : null;
      // Un código que no da producto (no encontrado, etiqueta ilegible) no toca la pesada pendiente.
      if (idNuevo !== null && !seguirTrasPesarAbierto(idNuevo)) return;
      if (r.tipo !== 'producto') {
        await aplicarEtiqueta(code, r);
        return;
      }
      const decision = r.decision;
      if (decision.tipo === 'no_encontrado') {
        avisar(tCatalogo('codigoNoEncontrado'), tCatalogo('codigoNoEncontradoDescripcion', { codigo: code }));
        return;
      }
      if (decision.tipo === 'agotado') {
        avisar(tCatalogo('agotadoTitulo'), tCatalogo('agotadoDescripcion', { producto: decision.producto.name }));
        return;
      }
      if (decision.tipo === 'dialogo_padre') {
        setVarianteEscaneada(decision.varianteId);
        variantDialogOpeningRef.current = true;
        setSelectedParentProduct(decision.padre as unknown as ProductoCatalogo);
        setShowVariantDialog(true);
        return;
      }
      if (decision.tipo === 'agregar_variante') {
        // La variante exacta va directo a la mesa (ya enriquecida con categoría y estación del padre).
        const variante = await conPrecio(decision.producto as unknown as ProductoCatalogo);
        if (!variante) {
          avisar(tCatalogo('sinPrecioTitulo'), tCatalogo('sinPrecioDescripcion', { producto: decision.producto.name }));
          return;
        }
        addToCart(variante);
        return;
      }
      handleProductClick(decision.producto as unknown as ProductoCatalogo);
    } catch (error) {
      console.error('Error al resolver el código escaneado en la mesa:', error);
      avisar(tCatalogo('errorEscaneo'));
    }
  };

  useHardwareBarcodeScanner({
    onScan: (code) => void manejarCodigo(code),
    // «Pesar» acepta escaneos (ver `seguirTrasPesarAbierto`); con el selector de
    // variantes abierto el lector no agrega de fondo.
    enabled: open && !showVariantDialog,
  });

  // Manejar selección de variante (y sus modificadores) desde el diálogo
  const handleVariantSelect = (variant: VarianteCatalogo, modifiers: SelectedProductModifier[] = []) => {
    // Propia de la variante → propia del padre → la de la categoría (fn_estacion_efectiva).
    const inheritedStation = estacionEfectiva({
      propia: variant.station,
      propiaPadre: selectedParentProduct?.station,
      categoria: variant.categories?.station ?? selectedParentProduct?.categories?.station,
    });
    const inheritedRequiresPreparation = selectedParentProduct?.categories?.requires_preparation ?? false;
    addToCart({
      ...variant,
      station: inheritedStation,
      requires_preparation: inheritedRequiresPreparation,
      categories: selectedParentProduct?.categories,
      // Promociones por categoría o sobre el padre (igual que en el mostrador).
      category_id: variant.category_id ?? selectedParentProduct?.category_id ?? null,
      parent_product_id: variant.parent_product_id
        ?? (selectedParentProduct && selectedParentProduct.id !== variant.id ? selectedParentProduct.id : null),
    } as ProductoCatalogo, modifiers);
    setShowVariantDialog(false);
    setSelectedParentProduct(null);
    // Retrasar reset del ref para prevenir race condition en móvil
    setTimeout(() => {
      variantDialogOpeningRef.current = false;
    }, 100);
  };

  // Ver la receta vinculada a un producto (abre un diálogo con ingredientes y rendimiento).
  // No agrega el producto al carrito: es solo consulta desde el grid de productos.
  const handleViewRecipe = async (product: ProductoCatalogo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!product.recipe_id) return;
    try {
      setRecipeViewLoading(true);
      setRecipeView(null);
      const recipe = await recipeService.getRecipeById(product.recipe_id);
      setRecipeView(recipe);
    } catch (error) {
      console.error('Error cargando receta:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la receta del producto',
        variant: 'destructive',
      });
    } finally {
      setRecipeViewLoading(false);
    }
  };

  // Toggle de favorito: marca/desmarca el producto como favorito de la organización.
  // Optimistic update en el estado local; si falla, revierte. No agrega el producto
  // al carrito (el clic en la card se detiene con stopPropagation).
  const handleToggleFavorite = async (productId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (togglingFavorites.has(productId)) return;

    const prevProducts = products;
    const product = prevProducts.find((p) => p.id === productId);
    const wasFavorite = product?.is_favorite ?? false;
    setProducts(prev => prev.map((p) =>
      p.id === productId ? { ...p, is_favorite: !wasFavorite } : p
    ));
    setTogglingFavorites(prev => new Set(prev).add(productId));

    try {
      const isNowFavorite = await POSService.toggleProductFavorite(productId);
      setProducts(prev => prev.map((p) =>
        p.id === productId ? { ...p, is_favorite: isNowFavorite } : p
      ));
      toast({
        title: isNowFavorite ? 'Agregado a favoritos' : 'Quitado de favoritos',
        description: isNowFavorite
          ? 'El producto aparecerá primero en el POS.'
          : 'El producto ya no se priorizará.',
        duration: 1800,
      });
    } catch {
      setProducts(prev => prev.map((p) =>
        p.id === productId ? { ...p, is_favorite: wasFavorite } : p
      ));
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el favorito.',
        variant: 'destructive',
      });
    } finally {
      setTogglingFavorites(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  // Agregar producto al carrito
  const addToCart = (product: ProductoCatalogo, modifiers: SelectedProductModifier[] = []) => {
    const basePrice = product.price || 0;
    if (basePrice === 0) {
      toast({
        title: 'Producto sin precio',
        description: 'Este producto no tiene precio configurado',
        variant: 'destructive',
      });
      return;
    }
    const extraTotal = modifiers.reduce((sum, m) => sum + (m.extraPrice || 0), 0);
    const unitPrice = basePrice + extraTotal;

    // Por peso o medida: con báscula estable entra de una (venta en un paso);
    // si no, «Pesar» (se agrega al estabilizar o con Enter). Una línea por pesada.
    if (esMedido(product)) {
      void pesar.abrirAgregar(product as unknown as ProductoPos, { modifiers, precio: Number(unitPrice) });
      return;
    }

    setCart((actual) => agregarLinea(actual, lineaDesdeProducto(product, modifiers, Number(unitPrice), 1), claveUnidad(product.id)));
  };

  // Línea nueva del carrito a partir del producto (por unidad o una pesada).
  const lineaDesdeProducto = (
    product: ProductoCatalogo,
    modifiers: SelectedProductModifier[],
    unitPrice: number,
    quantity: number,
    pesaje?: Pesaje,
  ): ProductToAdd => {
    // En variantes `station` ya llega resuelta (handleVariantSelect).
    const station = estacionEfectiva({ propia: product.station, categoria: product.categories?.station }) ?? '';
    const requires_preparation = product.categories?.requires_preparation ?? false;
    return {
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price: unitPrice,
      notes: '',
      station,
      requires_preparation,
      guest_number: comensales > 1 ? 1 : undefined,
      variant_data: product.variant_data || null,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      category_id: product.category_id ?? product.categories?.id ?? null,
      parent_product_id: product.parent_product_id ?? null,
      ...(esMedido(product)
        ? { sale_mode: product.sale_mode, qty_decimals: product.qty_decimals ?? null, unit_code: product.unit_code ?? null }
        : {}),
      ...(pesaje ? { pesaje } : {}),
    };
  };

  // Reabrir «Pesar» para cambiar el peso de una línea ya pesada.
  const cambiarPeso = (clave: string, item: ProductToAdd) => {
    // Fuera de la página actual del catálogo: basta con lo que guarda la línea.
    const producto = products.find((p) => p.id === item.product_id) ?? ({
      id: item.product_id,
      name: item.product_name,
      sale_mode: item.sale_mode,
      qty_decimals: item.qty_decimals,
      unit_code: item.unit_code,
    } as unknown as ProductoCatalogo);
    pesar.abrirCambiar({ id: clave, producto: producto as unknown as ProductoPos, precio: item.unit_price, cantidad: item.quantity });
  };

  // Actualizar cantidad en carrito
  const updateCartQuantity = (clave: string, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(clave);
      return;
    }

    const newCart = new Map(cart);
    const item = newCart.get(clave);
    if (item) {
      newCart.set(clave, { ...item, quantity });
      setCart(newCart);
    }
  };

  // Eliminar del carrito
  const removeFromCart = (clave: string) => {
    const newCart = new Map(cart);
    newCart.delete(clave);
    setCart(newCart);
  };

  // Actualizar notas de un item
  const updateCartNotes = (clave: string, notes: string) => {
    const newCart = new Map(cart);
    const item = newCart.get(clave);
    if (item) {
      newCart.set(clave, { ...item, notes });
      setCart(newCart);
    }
  };

  // Marcar la nota del item como alergia (la cocina debe confirmarla antes de empezar)
  const updateCartAllergy = (clave: string, isAllergy: boolean) => {
    const newCart = new Map(cart);
    const item = newCart.get(clave);
    if (item) {
      newCart.set(clave, { ...item, is_allergy: isAllergy });
      setCart(newCart);
    }
  };

  // Actualizar comensal asignado a un item
  const updateCartGuestNumber = (clave: string, guestNumber: number | undefined) => {
    const newCart = new Map(cart);
    const item = newCart.get(clave);
    if (item) {
      newCart.set(clave, { ...item, guest_number: guestNumber });
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
      toast({
        title: 'Error',
        description: 'No se pudieron agregar los productos. Por favor intente nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resetear estado al cerrar
  const handleClose = (open: boolean) => {
    // Evitar que Radix cierre este diálogo cuando se abre el VariantSelectorDialog
    // (conflicto de diálogos anidados en móvil). Usar ref además del state para
    // evitar race conditions (el state puede no haberse actualizado aún).
    if (!open && (showVariantDialog || variantDialogOpeningRef.current || pesar.pendiente)) return;
    if (!open) {
      setCart(new Map());
      setSearchTerm('');
      setSelectedCategory('all');
    }
    onOpenChange(open);
  };

  // Obtener imagen del producto
  const getProductImage = (product: ProductoCatalogo) => {
    const images = product.product_images;
    
    if (!images || images.length === 0) {
      console.log('🖼️ No images for product:', product.name);
      return null;
    }
    
    const primaryImage = images.find((img) => img.is_primary) || images[0];
    
    if (!primaryImage?.storage_path) {
      console.log('🖼️ No storage_path for product:', product.name);
      return null;
    }
    
    const imageUrl = getPublicUrl(primaryImage.storage_path);
    console.log('🖼️ Image URL for', product.name, ':', imageUrl);
    
    return imageUrl;
  };

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      // `defaultPrevented`: el buscador ya usó el Esc para borrar el texto.
      // Con «Pesar» abierto, Esc cierra solo «Pesar».
      if (e.key === 'Escape' && !e.defaultPrevented && !showVariantDialog && !variantDialogOpeningRef.current && !pesar.pendiente) {
        handleClose(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, showVariantDialog, pesar.pendiente]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) handleClose(false); }}>
      <div className="min-h-screen px-0 sm:px-4 py-0 sm:py-8 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[100vw] sm:max-w-[95vw] sm:w-[1400px] h-[100dvh] sm:h-[85vh] max-h-[100dvh] sm:max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col relative animate-in fade-in-0 zoom-in-95 duration-300 dark:bg-gray-800">
          <div className="flex flex-col sm:flex-row flex-1 min-h-0">
            {/* Panel izquierdo - Productos */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="px-3 sm:px-6 py-3 border-b shrink-0 space-y-3 relative">
                <button
                  type="button"
                  aria-label={tAgregar('cerrar')}
                  className="absolute right-2 top-2 z-10 flex size-9 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  onClick={() => handleClose(false)}
                >
                  <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
                </button>
                <div className="flex items-center justify-between gap-2 pr-10">
                  <h2 className="text-base sm:text-xl shrink-0 font-semibold text-fg">{title}</h2>
                  {subtitle && (
                    <p className="hidden text-sm text-fg-secondary sm:block">{subtitle}</p>
                  )}
                <div className="w-full sm:w-80">
                  <SearchInput
                    value={searchTerm}
                    onChange={setSearchTerm}
                    onValueChange={setSearchTerm}
                    onEnter={(texto) => {
                      // Código escrito a mano + Enter: como un escaneo (directo a la mesa).
                      if (!pareceCodigoDeBarras(texto)) return false;
                      setSearchTerm('');
                      void manejarCodigo(texto.trim());
                      return true;
                    }}
                    placeholder={tAgregar('buscar')}
                    atajo={false}
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
            </div>

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
                searchTerm.trim() || selectedCategory !== 'all' ? (
                  <EmptyState
                    compacto
                    variante="search"
                    termino={searchTerm.trim() || undefined}
                    icono={Package}
                    onLimpiarFiltros={() => {
                      setSearchTerm('');
                      setSelectedCategory('all');
                    }}
                  />
                ) : (
                  <EmptyState compacto variante="empty" icono={Package} titulo={tAgregar('vacioTitulo')} descripcion={tAgregar('vacioDescripcion')} />
                )
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {filteredProducts.map((product) => {
                    const productImage = getProductImage(product);
                    const price = product.price || 0;
                    const comparePrice = product.compare_price || 0;
                    const inCart = productoEnCarrito(cart, product.id);
                    const porPeso = esMedido(product);
                    const hasVariants = product.has_variants && (product.variant_count ?? 0) > 0;
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
                            <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full min-w-6 h-6 px-1.5 flex items-center justify-center text-sm font-bold z-10 tabular-nums">
                              {resumenProductoEnCarrito(cart, product.id, locale)}
                            </div>
                          )}
                          {isIncluded && !inCart && (
                            <div className="absolute top-2 right-2 bg-green-600 text-white rounded-full px-2 py-0.5 text-[0.6rem] font-bold z-10 flex items-center gap-0.5">
                              <Check className="h-2.5 w-2.5" /> Incluido
                            </div>
                          )}
                          {/* Badge Top: más vendidos en los últimos 90 días (bottom-left) */}
                          {Number(product.sales_count_90d) > 0 && (
                            <div
                              className="absolute bottom-2 left-2 bg-orange-500 text-white rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold z-10 flex items-center gap-0.5"
                              title={`${Math.round(Number(product.sales_count_90d))} unidades vendidas en los últimos 90 días`}
                            >
                              <Flame className="h-2.5 w-2.5" />
                              Top
                            </div>
                          )}
                          {/* Botón estrella favorito (bottom-right) */}
                          <button
                            type="button"
                            onClick={(e) => handleToggleFavorite(product.id, e)}
                            disabled={togglingFavorites.has(product.id)}
                            aria-label={product.is_favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                            title={product.is_favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                            className={cn(
                              'absolute bottom-2 right-2 z-20 rounded-full p-1 transition-all duration-150 shadow-md disabled:opacity-50 disabled:cursor-not-allowed',
                              product.is_favorite
                                ? 'bg-amber-400 text-white hover:bg-amber-500'
                                : 'bg-white/90 text-gray-400 hover:text-amber-500 hover:bg-white'
                            )}
                          >
                            <Star className={cn('h-3.5 w-3.5', product.is_favorite && 'fill-current')} />
                          </button>
                        </div>

                        {/* Información */}
                        <div className="p-2 sm:p-3 space-y-1">
                          <h3 className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-gray-100 line-clamp-1 leading-tight">
                            {product.name}
                          </h3>
                          {product.description && (
                            <p className="text-[0.6rem] sm:text-[0.65rem] text-gray-500 dark:text-gray-400 line-clamp-1 leading-tight">
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
                              {porPeso && simboloUnidad(product.unit_code) ? ` / ${simboloUnidad(product.unit_code)}` : ''}
                            </span>
                            {porPeso && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-subtle px-1 py-0.5 text-[0.6rem] font-medium text-fg-secondary">
                                <Scale aria-hidden="true" className="h-2.5 w-2.5" strokeWidth={1.5} />
                                {tPeso('porUnidad', { unidad: simboloUnidad(product.unit_code) || (product.unit_code ?? '').trim() })}
                              </span>
                            )}
                          </div>
                          {product.sku && (
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[0.6rem] text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded truncate flex-1 text-center">
                                {product.sku}
                              </span>
                              {product.has_recipe && product.recipe_id && (
                                <button
                                  type="button"
                                  onClick={(e) => handleViewRecipe(product, e)}
                                  aria-label="Ver receta de producción"
                                  title="Ver receta de producción"
                                  className="shrink-0 rounded-full p-1 text-orange-600 hover:bg-orange-100 dark:text-orange-400 dark:hover:bg-orange-900/40 transition-colors"
                                >
                                  <ChefHat className="h-3.5 w-3.5" />
                                </button>
                              )}
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
                  {Array.from(cart.entries()).map(([clave, item]) => (
                    <div
                      key={clave}
                      className="bg-white dark:bg-gray-800 rounded-lg p-3 border"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="font-semibold text-sm flex-1 pr-2">
                          {item.product_name}
                        </h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFromCart(clave)}
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
                        {lineaMedida(item) ? (
                          // Por peso o medida: el chip reabre «Pesar» (sin ±1).
                          <button
                            type="button"
                            onClick={() => cambiarPeso(clave, item)}
                            aria-label={tPeso('cambiarPeso', { producto: item.product_name })}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-line-strong bg-surface px-2 text-sm font-medium tabular-nums text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <Scale aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.5} />
                            {formatoCantidadCarrito(item, locale)}
                          </button>
                        ) : (
                        <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateCartQuantity(clave, item.quantity - 1)
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
                              clave,
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="w-14 h-7 text-center text-sm"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateCartQuantity(clave, item.quantity + 1)
                          }
                          className="h-7 w-7 p-0"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        </>
                        )}
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
                              onClick={() => updateCartGuestNumber(clave, num)}
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
                            onClick={() => updateCartGuestNumber(clave, undefined)}
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

                      <RichTextEditor
                        placeholder="Notas..."
                        value={item.notes}
                        onChange={(html) =>
                          updateCartNotes(clave, html)
                        }
                        minHeight={60}
                        className="text-xs"
                      />
                      <label className="flex items-center gap-1 mt-1 text-xs text-red-700 dark:text-red-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.is_allergy === true}
                          onChange={(e) => updateCartAllergy(clave, e.target.checked)}
                          className="h-3 w-3 rounded border-gray-300 dark:border-gray-600"
                        />
                        {tNotas('alergiaMesa')}
                      </label>
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
        </div>
      </div>
    </div>

    {/* Selector de variantes: fuera del Dialog padre para evitar el conflicto de Radix con Dialogs anidados */}
    {selectedParentProduct && (
      <VariantSelectorDialog
        open={showVariantDialog}
        onOpenChange={(open) => {
          setShowVariantDialog(open);
          if (!open) {
            setSelectedParentProduct(null);
            setVarianteEscaneada(null);
            // Retrasar el reset del ref para que el handleClose del padre
            // aún vea variantDialogOpeningRef=true y no se cierre en móvil
            setTimeout(() => {
              variantDialogOpeningRef.current = false;
            }, 100);
          }
        }}
        product={selectedParentProduct}
        onSelectVariant={handleVariantSelect}
        // Stock por variante en la sucursal que vende (misma regla que la tarjeta del POS).
        // Sin `conCantidad`: `addToCart` suma de a una unidad y la cantidad se ajusta en el carrito.
        sucursal={{ filtro: branchFilter, nombre: nombreSucursal }}
        varianteInicialId={varianteEscaneada}
      />
    )}

    {/* «Pesar»: el mismo diálogo del POS (PRODUCTOS-POR-PESO-BASCULA.md §2.6, mesas) */}
    {pesar.dialogo}

    {/* Diálogo de detalle de receta vinculada */}
    {(!!recipeView || recipeViewLoading) && (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) { setRecipeView(null); setRecipeViewLoading(false); } }}>
      <div className="min-h-screen px-1 sm:px-4 py-2 sm:py-8 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90dvh] overflow-hidden relative animate-in fade-in-0 zoom-in-95 duration-300 dark:bg-gray-900 dark:border-gray-700">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between dark:bg-gray-900 dark:border-gray-700">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ChefHat className="h-5 w-5 text-orange-600" />
                Receta de producción
              </h2>
              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                {recipeView?.product?.name ?? recipeView?.name ?? ''}
              </p>
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-700" onClick={() => { setRecipeView(null); setRecipeViewLoading(false); }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto max-h-[calc(90dvh-80px)] bg-white dark:bg-gray-900">
            <div className="p-4 sm:p-6">

        {recipeViewLoading ? (
          <div className="flex items-center justify-center py-8">
            <Skeleton className="h-6 w-8" />
          </div>
        ) : recipeView ? (
          <div className="space-y-4">
            {/* Info general */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Producto</p>
                <p className="font-medium dark:text-white">
                  {recipeView.product?.name ?? `#${recipeView.product_id}`}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  SKU: {recipeView.product?.sku ?? 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Rendimiento</p>
                <p className="font-medium dark:text-white font-mono">
                  {recipeView.yield_qty} {recipeView.yield_unit_code ?? ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Estado</p>
                <Badge
                  className={
                    recipeView.is_active
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : ''
                  }
                  variant={recipeView.is_active ? 'default' : 'secondary'}
                >
                  {recipeView.is_active ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Versión</p>
                <p className="font-medium dark:text-white font-mono">v{recipeView.version}</p>
              </div>
            </div>

            {/* Notas */}
            {recipeView.notes && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</p>
                <p className="text-sm dark:text-gray-300 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-lg whitespace-pre-wrap">
                  {recipeView.notes}
                </p>
              </div>
            )}

            {/* Ingredientes */}
            <div>
              <p className="text-sm font-medium dark:text-gray-300 mb-2">
                Ingredientes ({recipeView.ingredients?.length ?? 0})
              </p>
              <div className="space-y-2">
                {recipeView.ingredients?.length ? (
                  recipeView.ingredients.map((ing, i) => (
                    <div
                      key={ing.id}
                      className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
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
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm dark:text-gray-200">
                          {ing.quantity} {ing.unit_code}
                        </span>
                        {ing.is_optional && (
                          <Badge variant="secondary" className="text-[0.6rem]">Opcional</Badge>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Esta receta no tiene ingredientes definidos.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
    )}
    </>
  , document.body);
}
