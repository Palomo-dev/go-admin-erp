'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Product, Category } from './types';
import { POSService } from '@/lib/services/posService';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { BarcodeScanner } from '@/components/ui/barcode-scanner';
import { VariantSelectorDialog, type SelectedModifier } from './VariantSelectorDialog';
import {
  alternarFavorito,
  conFavorito,
  decidirAccionProducto,
  enriquecerVariante,
  resolverCodigo,
  type PosGridProduct,
  type SelectedVariant,
} from '@/lib/pos/venta/catalogo';
import {
  categoriasParaBarra,
  guardarVista,
  interpretarBuscador,
  leerVista,
  modoBarraCategorias,
  TAMANO_PAGINA,
  type VistaCatalogo,
} from '@/lib/pos/venta/catalogoGrilla';
import { ConfiguracionService, PosCategoriesDisplayConfig, defaultCategoriesDisplayConfig } from './configuracion/configuracionService';
import { recipeService, type ProductRecipe } from '@/lib/services/recipeService';
import { useBranch } from '@/lib/context/BranchContext';
import { hayRafagaDelLector, useHardwareBarcodeScanner } from '@/hooks/useHardwareBarcodeScanner';
import { ScanBarcode } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { useAtajos } from '@/components/kit/useAtajos';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { GrillaProductos } from './venta/GrillaProductos';
import { RecetaDialogo } from './venta/catalogo/RecetaDialogo';
import { useCatalogoGrilla, type ErrorCatalogo } from './venta/catalogo/useCatalogoGrilla';

interface ProductSearchProps {
  /**
   * Producto elegido (tarjeta, lista, lector o variante del diálogo). `cantidad`
   * llega con la cantidad rápida «3*» (aditivo: quien no la use recibe una
   * unidad como siempre).
   */
  onProductSelect: (product: Product, modifiers?: SelectedModifier[], cantidad?: number) => void;
  selectedProducts?: Product[];
  /**
   * La pantalla tiene abierto algo que no es un diálogo Radix (el cobro de
   * hoy): el escaneo no se agrega y se avisa (D10). Con el cobro sobre
   * `PanelAdaptable` el lector ya lo descarta solo (`onDescartado`).
   */
  bloqueado?: boolean;
}

// `PosGridProduct`, `SelectedVariant` y las decisiones del catálogo (tarjeta,
// variante, escáner, insignias, espera de la búsqueda, favorito) viven en
// src/lib/pos/venta/catalogo.ts (L14-L23 de docs/implementacion/POS-PLAN.md);
// la grilla (vista, «3*», foco, páginas) en src/lib/pos/venta/catalogoGrilla.ts.
// Aquí: estado y efectos; el dibujo es `venta/GrillaProductos`.

function almacenLocal(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function ProductSearch({ onProductSelect, bloqueado = false }: ProductSearchProps) {
  const t = useTranslations('posVenta.catalogo');
  const { branchFilter, branches } = useBranch();
  const moneda = useMonedaOrganizacion();

  // Estado para selector de variantes
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [selectedParentProduct, setSelectedParentProduct] = useState<Product | null>(null);
  // Variante que leyó el lector cuando el producto lleva modificadores: el
  // selector abre con ella elegida (antes se perdía, B-06).
  const [varianteEscaneada, setVarianteEscaneada] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesDisplay, setCategoriesDisplay] = useState<PosCategoriesDisplayConfig>(defaultCategoriesDisplayConfig);
  // Vista recordada por dispositivo (`pos_vista_productos`); se lee al montar para no romper la hidratación.
  const [vista, setVista] = useState<VistaCatalogo>('tarjetas');
  const [showScanner, setShowScanner] = useState(false);
  // Productos cuyo toggle de favorito está en curso (para deshabilitar el botón)
  const [togglingFavorites, setTogglingFavorites] = useState<Set<number>>(new Set());
  // Diálogo de detalle de receta vinculada a un producto
  const [recipeView, setRecipeView] = useState<ProductRecipe | null>(null);
  const [recipeViewLoading, setRecipeViewLoading] = useState(false);

  useEffect(() => {
    setVista(leerVista(almacenLocal()));
  }, []);
  const cambiarVista = (v: VistaCatalogo) => {
    setVista(v);
    guardarVista(almacenLocal(), v);
  };

  // «3*coca»: 3 unidades de lo que se elija; se busca «coca».
  const { cantidad: cantidadRapida, termino } = interpretarBuscador(searchTerm);

  const avisarErrorCarga = useCallback(
    (e: ErrorCatalogo) => {
      // Desktop sin red y sin catálogo replicado: el mensaje útil, no el genérico.
      if (e.sinCatalogo) toast.error(t('sinCatalogoTitulo'), { description: (e.error as Error)?.message });
      else toast.error(t('errorTitulo'), { description: t('errorDescripcion') });
    },
    [t],
  );

  const catalogo = useCatalogoGrilla({
    busqueda: termino,
    categoria: selectedCategory,
    branchFilter,
    limite: TAMANO_PAGINA[vista],
    onError: avisarErrorCarga,
  });

  const loadCategories = useCallback(async () => {
    try {
      // Categorías + ranking (favorita, ventas 90 días) en paralelo, igual que
      // los productos. El ranking es opcional: si falla, se muestran sin él.
      const [result, ranking] = await Promise.all([
        POSService.getCategories(),
        POSService.getCategoryRanking(),
      ]);
      setCategories(
        result.map((c: Category) => ({
          ...c,
          is_favorite: ranking[c.id]?.is_favorite ?? false,
          sales_count_90d: ranking[c.id]?.sales_count_90d ?? 0,
        }))
      );
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }, []);

  // Marca/desmarca una categoría como favorita. Optimista: se refleja al
  // instante y se revierte si la escritura falla.
  const handleToggleCategoryFavorite = useCallback(async (categoryId: number) => {
    const antes = categories.find((c) => c.id === categoryId)?.is_favorite ?? false;
    const resultado = await alternarFavorito({
      antes,
      aplicar: (valor) => setCategories((prev) => conFavorito(prev, categoryId, valor)),
      alternar: () => POSService.toggleCategoryFavorite(categoryId),
    });
    if (!resultado.ok) {
      console.error('Error al cambiar favorita de categoría:', resultado.error);
    }
  }, [categories]);

  useEffect(() => {
    loadCategories();
    ConfiguracionService.getCategoriesDisplayConfig()
      .then(setCategoriesDisplay)
      .catch((error) => console.error('Error loading categories display config:', error));
  }, [loadCategories]);

  const categoriasBarra = useMemo(
    () => categoriasParaBarra(categories, categoriesDisplay.orderBy),
    [categories, categoriesDisplay.orderBy],
  );

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory(null);
  };

  // Entrega al carrito con la cantidad rápida (si la hay) y la consume. El
  // selector de variantes trae su propia cantidad (`− n +`, que abre con la rápida).
  const entregar = (product: Product, modifiers?: SelectedModifier[], cantidadElegida?: number) => {
    const cantidad = cantidadElegida ?? cantidadRapida;
    if (cantidad && cantidad > 1) {
      onProductSelect(product, modifiers, cantidad);
    } else if (modifiers !== undefined) {
      onProductSelect(product, modifiers);
    } else {
      onProductSelect(product);
    }
    if (cantidadRapida !== null) setSearchTerm(termino);
  };

  // Función para manejar el escaneo de código de barras (cámara)
  const handleBarcodeScan = (barcode: string) => {
    setSearchTerm(barcode);
    setShowScanner(false);
    toast.info(t('codigoEscaneado'), { description: t('buscandoCodigo', { codigo: barcode }), duration: 2000 });
  };

  // Función para cerrar el scanner
  const handleCloseScanner = () => {
    setShowScanner(false);
  };

  // Manejar selección de producto (con o sin variantes)
  const handleProductClick = (product: PosGridProduct) => {
    const accion = decidirAccionProducto(product);
    // Si el producto está agotado, no permitir agregarlo
    if (accion === 'agotado') {
      toast.error(t('agotadoTitulo'), { description: t('agotadoDescripcion', { producto: product.name }) });
      return;
    }
    // Si el producto tiene variantes o modificadores configurados, abrir el selector
    if (accion === 'dialogo') {
      setVarianteEscaneada(null);
      setSelectedParentProduct(product);
      setShowVariantDialog(true);
    } else {
      // Producto simple sin modificadores, agregar directamente
      entregar(product);
    }
  };

  // Toque sobre una tarjeta que no se puede elegir: se dice por qué.
  const handleNoDisponible = (product: PosGridProduct, motivo: 'agotado' | 'sinPrecio') => {
    if (motivo === 'agotado') toast.error(t('agotadoTitulo'), { description: t('agotadoDescripcion', { producto: product.name }) });
    else toast.error(t('sinPrecioTitulo'), { description: t('sinPrecioDescripcion', { producto: product.name }) });
  };

  // Manejar selección de variante (y sus modificadores) desde el diálogo
  const handleVariantSelect = (variant: SelectedVariant, modifiers: SelectedModifier[] = [], cantidad = 1) => {
    // Hereda categoría y estación del padre y toma su nombre legible (L17).
    const enrichedVariant = enriquecerVariante(variant, selectedParentProduct as PosGridProduct | null);
    // La variante lleva la fila completa del producto (ver SelectedVariant).
    entregar(enrichedVariant as unknown as Product, modifiers, cantidad);
    setShowVariantDialog(false);
    setSelectedParentProduct(null);
  };

  // Lector físico de códigos de barras (USB/Bluetooth como teclado): el
  // código va directo al carrito, sin pasar por la búsqueda ni hacer clic.
  // Resuelve con las mismas piezas que el grid: `getProductByBarcode` da la
  // fila exacta (puede ser una variante) y `getProductsPaginated` con el
  // código como término devuelve al padre/simple con stock, variantes y
  // modificadores ya calculados (la RPC empareja `barcode` exacto, también
  // el de las variantes). Así la decisión —agregar, pedir variante o avisar
  // de agotado— es la misma que al tocar la tarjeta.
  const handleHardwareScan = useCallback(async (code: string) => {
    // Con el cobro abierto el escaneo no va al carrito de fondo (D10).
    if (bloqueado) {
      toast.info(t('cierraElCobro'));
      return;
    }
    try {
      const [row, page] = await Promise.all([
        POSService.getProductByBarcode(code).catch(() => null),
        POSService.getProductsPaginated({
          page: 1,
          limit: 5,
          search: code,
          category_id: null,
          status: 'active',
          branchFilter,
        }),
      ]);
      // El código EXACTO manda (`getProductByBarcode`): el generador interno usa
      // el prefijo 20 en 744 productos y los códigos de balanza también empiezan
      // por 20–29 (PRODUCTOS-POR-PESO-BASCULA.md §2.7). Si la fila exacta existe
      // pero su producto no vino en la primera página buscada con el código
      // (coincidencias por SKU o nombre), se busca en una página más amplia
      // antes de decir «no encontrado».
      let grilla = page.data as PosGridProduct[];
      const idExacto = row ? (row.parent_product_id ?? row.id) : null;
      if (idExacto !== null && !grilla.some((p) => p.id === idExacto)) {
        const amplia = await POSService.getProductsPaginated({
          page: 1,
          limit: 100,
          search: code,
          category_id: null,
          status: 'active',
          branchFilter,
        });
        grilla = amplia.data as PosGridProduct[];
      }
      // L18: la decisión vive en src/lib/pos/venta/catalogo.ts (resolverCodigo).
      const decision = resolverCodigo(row, grilla);
      if (decision.tipo === 'no_encontrado') {
        toast.error(t('codigoNoEncontrado'), { description: t('codigoNoEncontradoDescripcion', { codigo: code }), duration: 3000 });
        return;
      }
      if (decision.tipo === 'agotado') {
        toast.error(t('agotadoTitulo'), { description: t('agotadoDescripcion', { producto: decision.producto.name }), duration: 3000 });
        return;
      }
      if (decision.tipo === 'dialogo_padre') {
        // El código identifica una variante concreta, pero el producto lleva
        // modificadores: se eligen en el diálogo del padre con esa variante ya elegida.
        setVarianteEscaneada(decision.varianteId ?? null);
        setSelectedParentProduct(decision.padre);
        setShowVariantDialog(true);
        return;
      }
      if (decision.tipo === 'agregar_variante') {
        entregar(decision.producto);
        return;
      }
      // Simple: al carrito. Padre con variantes o modificadores: el diálogo.
      handleProductClick(decision.producto);
    } catch (error) {
      console.error('Error al resolver el código escaneado:', error);
      toast.error(t('errorEscaneo'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter, onProductSelect, bloqueado, t]);

  useHardwareBarcodeScanner({
    onScan: handleHardwareScan,
    // Un diálogo abierto (cobro, variantes, caja) se tragó el escaneo: se avisa.
    onDescartado: () => toast.info(t('cierraElDialogo')),
  });

  // Ctrl+B: código de barras escrito a mano (lector dañado, etiqueta ilegible);
  // se resuelve igual que un escaneo (paso 14, mapa de POS-UX-V2 §3).
  const [codigoManualAbierto, setCodigoManualAbierto] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const tAtajos = useTranslations('posVenta.atajos');
  useAtajos(
    [
      {
        tecla: teclaAtajo('codigoManual'),
        descripcion: tAtajos('codigoManual'),
        permitirEnCampo: true,
        accion: () => {
          setCodigoManual('');
          setCodigoManualAbierto(true);
        },
      },
    ],
    { activo: !bloqueado, hayRafaga: hayRafagaDelLector },
  );
  const enviarCodigoManual = () => {
    const codigo = codigoManual.trim();
    if (!codigo) return;
    setCodigoManualAbierto(false);
    void handleHardwareScan(codigo);
  };

  // Ver la receta vinculada a un producto (abre un diálogo con ingredientes y rendimiento).
  // No agrega el producto al carrito: es solo consulta desde el grid del POS.
  const handleViewRecipe = async (product: PosGridProduct) => {
    if (!product.recipe_id) return;
    try {
      setRecipeViewLoading(true);
      setRecipeView(null);
      const recipe = await recipeService.getRecipeById(product.recipe_id);
      setRecipeView(recipe);
    } catch (error) {
      console.error('Error cargando receta:', error);
      toast.error(t('errorReceta'));
    } finally {
      setRecipeViewLoading(false);
    }
  };

  // Toggle de favorito: marca/desmarca el producto como favorito de la organización.
  // Optimistic update en el estado local para feedback inmediato; si falla, revierte.
  const handleToggleFavorite = async (productId: number) => {
    if (togglingFavorites.has(productId)) return;

    // Optimistic: invertir is_favorite en el estado local; se sincroniza con
    // el valor real del servicio o se revierte si falla (L21, alternarFavorito).
    const product = catalogo.productos.find((p) => p.id === productId);
    const wasFavorite = product?.is_favorite ?? false;
    setTogglingFavorites(prev => new Set(prev).add(productId));

    try {
      const resultado = await alternarFavorito({
        antes: wasFavorite,
        aplicar: (valor) => catalogo.actualizarProductos((prev) => conFavorito(prev, productId, valor)),
        alternar: () => POSService.toggleProductFavorite(productId),
      });
      if (resultado.ok) {
        const isNowFavorite = resultado.valor;
        toast.success(isNowFavorite ? t('favoritoAgregado') : t('favoritoQuitado'), {
          description: isNowFavorite ? t('favoritoAgregadoDescripcion') : t('favoritoQuitadoDescripcion'),
          duration: 1800,
        });
      } else {
        toast.error(t('errorFavorito'));
      }
    } finally {
      setTogglingFavorites(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const nombreSucursal = branchFilter === null ? null : branches?.find((b) => b.id === branchFilter)?.name ?? undefined;

  const mensajeError = catalogo.error?.sinCatalogo ? (catalogo.error.error as Error)?.message ?? null : null;

  return (
    <>
      <GrillaProductos
        busqueda={searchTerm}
        onBusqueda={setSearchTerm}
        cantidadRapida={cantidadRapida}
        vista={vista}
        onVista={cambiarVista}
        categorias={categoriasBarra}
        categoria={selectedCategory}
        onCategoria={setSelectedCategory}
        modoCategorias={modoBarraCategorias(categoriesDisplay.mode)}
        onFavoritaCategoria={handleToggleCategoryFavorite}
        catalogo={catalogo}
        moneda={moneda}
        onElegir={handleProductClick}
        onNoDisponible={handleNoDisponible}
        onFavorito={(p) => void handleToggleFavorite(Number(p.id))}
        favoritosEnCurso={togglingFavorites}
        onReceta={(p) => void handleViewRecipe(p)}
        onEscanerCamara={() => setShowScanner(true)}
        onLimpiarFiltros={clearFilters}
        mensajeError={mensajeError}
      />

      {/* Scanner de código de barras */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={handleCloseScanner}
        />
      )}

      {/* Selector de variantes */}
      {selectedParentProduct && (
        <VariantSelectorDialog
          open={showVariantDialog}
          onOpenChange={setShowVariantDialog}
          product={selectedParentProduct}
          onSelectVariant={handleVariantSelect}
          sucursal={{ filtro: branchFilter, nombre: nombreSucursal }}
          conCantidad
          cantidadInicial={cantidadRapida ?? 1}
          varianteInicialId={varianteEscaneada}
        />
      )}

      {/* Ctrl+B: código de barras manual */}
      <Dialogo
        abierto={codigoManualAbierto}
        onAbiertoChange={setCodigoManualAbierto}
        titulo={t('codigoManualTitulo')}
        icono={ScanBarcode}
        ancho={440}
        primario={{ etiqueta: t('codigoManualBuscar'), onClick: enviarCodigoManual, deshabilitada: !codigoManual.trim() }}
      >
        <FormField etiqueta={t('codigoManualEtiqueta')}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={codigoManual}
            onChange={(e) => setCodigoManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                enviarCodigoManual();
              }
            }}
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm tabular-nums text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </FormField>
      </Dialogo>

      {/* Receta vinculada (solo lectura) */}
      <RecetaDialogo
        receta={recipeView}
        cargando={recipeViewLoading}
        onCerrar={() => {
          setRecipeView(null);
          setRecipeViewLoading(false);
        }}
      />
    </>
  );
}
