"use client";

import React, { useState, useRef, useEffect } from 'react';
import {
  Globe,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  ImageIcon,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { formatCurrency } from '@/utils/Utils';

interface ScrapedProduct {
  name: string;
  description?: string;
  price?: number;
  compare_price?: number;
  cost?: number;
  sku?: string;
  barcode?: string;
  brand?: string;
  category?: string;
  tags?: string[];
  images?: string[];
  stock?: number;
  url?: string;
  variants?: { name: string; values: string[] }[];
}

// Respuestas tipadas de la Edge Function product-scraper
interface ProductScraperPreviewResponse {
  products?: ScrapedProduct[];
  error?: string;
}

interface ProductScraperEnrichResponse {
  product?: ScrapedProduct;
  error?: string;
}

interface ProductScraperImportResponse {
  exitosos?: number;
  fallidos?: number;
  errores?: { name: string; error?: string }[];
  results?: { ok: boolean; name: string; action?: string; error?: string }[];
  error?: string;
}

// Tokeniza un nombre de producto a palabras significativas (sin tildes ni signos)
const tokenizarNombre = (s: string): Set<string> =>
  new Set(
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

// Garantiza que el precio de comparación sea el mayor (precio anterior/tachado).
// Si quedaron invertidos al combinar listado + detalle, los corrige.
const normalizarPrecios = (p: ScrapedProduct): ScrapedProduct => {
  const venta = p.price;
  const comparacion = p.compare_price;
  if (venta && comparacion && venta > 0 && comparacion > 0) {
    if (comparacion < venta) {
      return { ...p, price: comparacion, compare_price: venta };
    }
    if (comparacion === venta) {
      return { ...p, compare_price: undefined };
    }
  }
  return p;
};

// Determina si dos nombres corresponden al mismo producto (solape de palabras clave)
const nombresCorresponden = (a: string, b: string): boolean => {
  const A = tokenizarNombre(a);
  const B = tokenizarNombre(b);
  if (A.size === 0 || B.size === 0) return true; // sin datos suficientes, no bloquear
  let comunes = 0;
  A.forEach((w) => {
    if (B.has(w)) comunes += 1;
  });
  return comunes / Math.min(A.size, B.size) >= 0.3;
};

interface ScrapingProductosProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

type Paso = 'url' | 'preview' | 'resultado';

const ScrapingProductos: React.FC<ScrapingProductosProps> = ({
  open,
  onOpenChange,
  onImportComplete,
}) => {
  const { organization, branch_id } = useOrganization();
  const [paso, setPaso] = useState<Paso>('url');
  const [url, setUrl] = useState('');
  const [analizando, setAnalizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [productos, setProductos] = useState<ScrapedProduct[]>([]);
  const [seleccionados, setSeleccionados] = useState<number[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update' | 'create'>('skip');
  const [enriqueciendo, setEnriqueciendo] = useState<Set<number>>(new Set());
  const [enriqueciendoTodo, setEnriqueciendoTodo] = useState(false);
  const [enrichProgreso, setEnrichProgreso] = useState<{ actual: number; total: number } | null>(null);
  const cancelarEnrichRef = useRef(false);
  // Paginación progresiva: cargar más productos a medida que se hace scroll
  const [visibleCount, setVisibleCount] = useState(50);
  const PAGE_INCREMENT = 50;
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // IntersectionObserver para cargar más productos cuando el sentinel es visible
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < productos.length) {
          setVisibleCount((prev) => Math.min(prev + PAGE_INCREMENT, productos.length));
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => { if (observerRef.current) observerRef.current.disconnect(); };
  }, [visibleCount, productos.length]);
  const [resultado, setResultado] = useState<{
    exitosos: number;
    fallidos: number;
    errores: { name: string; error?: string }[];
  } | null>(null);
  const [progresoImport, setProgresoImport] = useState<{
    loteActual: number;
    totalLotes: number;
    importados: number;
    total: number;
  } | null>(null);

  const reset = () => {
    cancelarEnrichRef.current = false;
    setVisibleCount(50);
    setPaso('url');
    setUrl('');
    setProductos([]);
    setSeleccionados([]);
    setEnriqueciendo(new Set());
    setEnriqueciendoTodo(false);
    setEnrichProgreso(null);
    setResultado(null);
    setProgresoImport(null);
  };

  // Enriquecer un producto con los datos completos de su página de detalle
  const enrichOne = async (index: number, productUrl: string) => {
    setEnriqueciendo((prev) => new Set(prev).add(index));
    try {
      const { data, error } = await supabase.functions.invoke<ProductScraperEnrichResponse>('product-scraper', {
        body: { action: 'enrich', url: productUrl },
      });
      if (!error && data?.product) {
        const e = data.product;
        setProductos((prev) =>
          prev.map((p, i) => {
            if (i !== index) return p;
            // Si el detalle no corresponde al producto del listado (URL equivocada),
            // descartar el enriquecimiento para no contaminar con datos de otro producto.
            if (e.name && !nombresCorresponden(p.name, e.name)) return p;
            const combinado: ScrapedProduct = {
              ...p,
              description:
                e.description && e.description.length > (p.description?.length || 0)
                  ? e.description
                  : p.description,
              images:
                e.images && e.images.length > (p.images?.length || 0) ? e.images : p.images,
              variants:
                e.variants && e.variants.length > (p.variants?.length || 0)
                  ? e.variants
                  : p.variants,
              brand: e.brand || p.brand,
              sku: e.sku || p.sku,
              barcode: e.barcode || p.barcode,
              // El enriquecimiento trae el precio DETERMINISTA del detalle (JSON-LD/meta): tiene prioridad
              price: e.price && e.price > 0 ? e.price : p.price,
              compare_price: e.compare_price && e.compare_price > 0 ? e.compare_price : p.compare_price,
              tags: e.tags && e.tags.length > (p.tags?.length || 0) ? e.tags : p.tags,
            };
            // Al combinar listado + detalle el precio de venta/comparación puede quedar
            // invertido; se re-normaliza para garantizar que comparación sea el mayor.
            return normalizarPrecios(combinado);
          })
        );
      }
    } catch (_) {
      // Si falla el enriquecimiento se mantienen los datos del listado
    } finally {
      setEnriqueciendo((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  // Enriquecer SOLO productos incompletos (sin precio o sin imágenes) con URL de detalle.
  // Para catálogos grandes (4000+ productos) el enriquecimiento individual es muy lento,
  // así que se limita a MAX_ENRICH productos y solo los que no tienen datos básicos.
  // Los productos de Shopify ya vienen con imágenes y precio desde el endpoint público.
  const MAX_ENRICH = 100;
  const enrichAll = async (prods: ScrapedProduct[]) => {
    const incompleto = (p: ScrapedProduct) =>
      !p.price || p.price <= 0 || !(p.images && p.images.length > 0);
    const pendientes = prods
      .map((p, i) => ({ i, url: p.url, p }))
      .filter((x): x is { i: number; url: string; p: ScrapedProduct } => !!x.url && incompleto(x.p))
      .map(({ i, url }) => ({ i, url }))
      .slice(0, MAX_ENRICH);
    if (pendientes.length === 0) return;
    cancelarEnrichRef.current = false;
    setEnriqueciendoTodo(true);
    setEnrichProgreso({ actual: 0, total: pendientes.length });
    try {
      const CONCURRENCIA = 5;
      let completados = 0;
      for (let b = 0; b < pendientes.length; b += CONCURRENCIA) {
        if (cancelarEnrichRef.current) break;
        const lote = pendientes.slice(b, b + CONCURRENCIA);
        await Promise.all(lote.map(({ i, url: u }) => enrichOne(i, u)));
        completados += lote.length;
        setEnrichProgreso({ actual: completados, total: pendientes.length });
      }
    } finally {
      setEnriqueciendoTodo(false);
      setEnrichProgreso(null);
    }
  };

  const handleClose = (o: boolean) => {
    if (!o && !analizando && !importando) {
      reset();
    }
    onOpenChange(o);
  };

  const handleAnalizar = async () => {
    if (!url || !/^https?:\/\//.test(url)) {
      toast({
        variant: 'destructive',
        title: 'URL inválida',
        description: 'Ingrese una URL válida que comience con http:// o https://',
      });
      return;
    }

    setAnalizando(true);
    try {
      // Timeout de seguridad: si el sitio es muy pesado/bloqueado, no dejar la UI colgada
      // 180s para dar tiempo a descargar catálogos grandes (4000+ productos con paginación paralela)
      const TIMEOUT_MS = 180000;
      const { data, error } = await Promise.race([
        supabase.functions.invoke<ProductScraperPreviewResponse>('product-scraper', {
          body: { action: 'preview', url },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('El análisis tardó demasiado. El sitio puede ser muy pesado o bloquear el acceso. Intente con una categoría más específica.')),
            TIMEOUT_MS,
          ),
        ),
      ]);

      if (error) {
        let msg = error.message || 'Error al analizar la página';
        try {
          const errBody = await (error as any).context?.json?.();
          if (errBody?.error) msg = errBody.error;
        } catch (_) { /* usar mensaje genérico */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      const prods: ScrapedProduct[] = data?.products || [];
      if (prods.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Sin productos',
          description: 'No se encontraron productos en esa página. Intente con otra URL.',
        });
        return;
      }

      setProductos(prods);
      setSeleccionados(prods.map((_, i) => i));
      setVisibleCount(PAGE_INCREMENT);
      setPaso('preview');
      // Enriquecer en segundo plano con datos de cada página de detalle
      enrichAll(prods);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Error al analizar',
        description: e.message || 'No se pudo analizar la página.',
      });
    } finally {
      setAnalizando(false);
    }
  };

  // Tamaño de lote reducido para evitar 504 Gateway Timeout de la Edge Function.
  // Cada producto requiere descarga+upload de imágenes, que toma tiempo.
  // 50 productos por lote = ~30-60s por request, dentro del timeout de 150s.
  const BATCH_SIZE = 50;
  // Concurrencia reducida a 2 para no sobrecargar la Edge Function
  const PARALLEL_LOTS = 2;

  const handleImportar = async () => {
    if (!organization?.id || seleccionados.length === 0) return;

    setImportando(true);
    const productosAImportar = seleccionados.map((i) => productos[i]);
    const totalLotes = Math.ceil(productosAImportar.length / BATCH_SIZE);
    let exitososAcum = 0;
    let fallidosAcum = 0;
    const erroresAcum: { name: string; error?: string }[] = [];
    let lotesCompletados = 0;

    // Procesa un lote individual y acumula resultados
    const procesarLote = async (loteIndex: number): Promise<void> => {
      const inicio = loteIndex * BATCH_SIZE;
      const fin = Math.min(inicio + BATCH_SIZE, productosAImportar.length);
      const loteProductos = productosAImportar.slice(inicio, fin);

      const { data, error } = await supabase.functions.invoke<ProductScraperImportResponse>('product-scraper', {
        body: {
          action: 'import',
          products: loteProductos,
          organization_id: organization.id,
          branch_id: branch_id || null,
          source_url: url,
          duplicate_mode: duplicateMode,
        },
      });

      if (error) {
        let msg = error.message || 'Error al importar lote';
        try {
          const errBody = await (error as any).context?.json?.();
          if (errBody?.error) msg = errBody.error;
        } catch (_) { /* usar mensaje genérico */ }
        throw new Error(`Lote ${loteIndex + 1}/${totalLotes}: ${msg}`);
      }
      if (data?.error) throw new Error(`Lote ${loteIndex + 1}/${totalLotes}: ${data.error}`);

      exitososAcum += data?.exitosos || 0;
      fallidosAcum += data?.fallidos || 0;
      if (data?.errores) erroresAcum.push(...data.errores);

      lotesCompletados += 1;
      setProgresoImport({
        loteActual: lotesCompletados,
        totalLotes,
        importados: exitososAcum,
        total: productosAImportar.length,
      });
    };

    try {
      // Procesar lotes en paralelo (PARALLEL_LOTS concurrentes)
      for (let lote = 0; lote < totalLotes; lote += PARALLEL_LOTS) {
        const lotesEnParalelo: number[] = [];
        for (let i = lote; i < Math.min(lote + PARALLEL_LOTS, totalLotes); i++) {
          lotesEnParalelo.push(i);
        }
        setProgresoImport({
          loteActual: lotesCompletados,
          totalLotes,
          importados: exitososAcum,
          total: productosAImportar.length,
        });
        await Promise.all(lotesEnParalelo.map((idx) => procesarLote(idx)));
      }

      setResultado({
        exitosos: exitososAcum,
        fallidos: fallidosAcum,
        errores: erroresAcum,
      });
      setProgresoImport(null);
      setPaso('resultado');
      onImportComplete();
    } catch (e: any) {
      setProgresoImport(null);
      setResultado({
        exitosos: exitososAcum,
        fallidos: fallidosAcum,
        errores: erroresAcum,
      });
      setPaso('resultado');
      toast({
        variant: 'destructive',
        title: 'Error en importación',
        description: e.message || 'No se pudieron importar todos los productos.',
      });
      onImportComplete();
    } finally {
      setImportando(false);
    }
  };

  const toggleSeleccion = (index: number) => {
    setSeleccionados((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const updateProducto = (index: number, campo: keyof ScrapedProduct, valor: any) => {
    setProductos((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [campo]: valor } : p))
    );
  };

  const toggleTodos = () => {
    setSeleccionados(
      seleccionados.length === productos.length ? [] : productos.map((_, i) => i)
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-gray-100">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Importar productos con IA
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {paso === 'url' && 'Pegue la URL de una página de productos y la IA extraerá toda la información.'}
            {paso === 'preview' && `Se encontraron ${productos.length} productos. Revise y seleccione cuáles importar.`}
            {paso === 'resultado' && 'Resultado de la importación.'}
          </DialogDescription>
        </DialogHeader>

        {/* Barra de progreso durante importación por lotes */}
        {importando && progresoImport && (
          <div className="px-6 py-2 border-b dark:border-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Lote {progresoImport.loteActual} de {progresoImport.totalLotes}</span>
              <span>{progresoImport.importados} / {progresoImport.total} productos</span>
            </div>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300 ease-out"
                style={{ width: `${Math.round((progresoImport.importados / progresoImport.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Paso 1: URL */}
        {paso === 'url' && (
          <div className="space-y-4 py-4">
            <div>
              <Label className="dark:text-gray-300">URL de la página</Label>
              <div className="relative mt-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://ejemplo.com/categoria/televisores"
                  className="pl-10 dark:bg-gray-900 dark:border-gray-600"
                  disabled={analizando}
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalizar()}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Funciona con páginas de listados de productos o de un producto individual.
                La IA detectará nombre, precio, descripción, imágenes, marca, categoría y variantes.
              </p>
            </div>
          </div>
        )}

        {/* Paso 2: Preview */}
        {paso === 'preview' && (
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pb-2 border-b dark:border-gray-700">
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="checkbox"
                  checked={seleccionados.length === productos.length}
                  onChange={toggleTodos}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                />
                <span className="text-sm font-medium dark:text-gray-300">
                  Seleccionar todos ({seleccionados.length}/{productos.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Si ya existe:</span>
                <Select value={duplicateMode} onValueChange={(v) => setDuplicateMode(v as any)}>
                  <SelectTrigger className="h-8 w-[180px] text-xs dark:bg-gray-900 dark:border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                    <SelectItem value="skip" className="text-xs">Omitir (no duplicar)</SelectItem>
                    <SelectItem value="update" className="text-xs">Actualizar existente</SelectItem>
                    <SelectItem value="create" className="text-xs">Crear como nuevo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {productos.slice(0, visibleCount).map((p, i) => (
              <div
                key={i}
                className={`flex gap-3 p-3 rounded-lg border transition-colors ${
                  seleccionados.includes(i)
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={seleccionados.includes(i)}
                  onChange={() => toggleSeleccion(i)}
                  className="h-4 w-4 mt-1 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
                />
                {p.images && p.images.length > 0 ? (
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    className="h-16 w-16 object-cover rounded-md border dark:border-gray-600 flex-shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="h-16 w-16 rounded-md border dark:border-gray-600 bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <ImageIcon className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Nombre editable */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={p.name}
                      onChange={(e) => updateProducto(i, 'name', e.target.value)}
                      className="h-8 text-sm font-medium dark:bg-gray-900 dark:border-gray-600"
                      placeholder="Nombre del producto"
                    />
                    {enriqueciendo.has(i) && (
                      <span className="flex items-center gap-1 text-[10px] text-purple-500 whitespace-nowrap">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Obteniendo detalles...
                      </span>
                    )}
                  </div>
                  {/* Campos editables: precio, comparación, categoría, stock */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">Precio venta</span>
                      <Input
                        type="number"
                        value={p.price ?? ''}
                        onChange={(e) => updateProducto(i, 'price', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                        className="h-7 text-xs dark:bg-gray-900 dark:border-gray-600"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">Precio compar.</span>
                      <Input
                        type="number"
                        value={p.compare_price ?? ''}
                        onChange={(e) => updateProducto(i, 'compare_price', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                        className="h-7 text-xs dark:bg-gray-900 dark:border-gray-600"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">Categoría</span>
                      <Input
                        value={p.category ?? ''}
                        onChange={(e) => updateProducto(i, 'category', e.target.value)}
                        className="h-7 text-xs dark:bg-gray-900 dark:border-gray-600"
                        placeholder="Categoría"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">Stock inicial</span>
                      <Input
                        type="number"
                        value={p.stock ?? ''}
                        onChange={(e) => updateProducto(i, 'stock', e.target.value === '' ? undefined : parseInt(e.target.value))}
                        className="h-7 text-xs dark:bg-gray-900 dark:border-gray-600"
                        placeholder="0"
                      />
                    </div>
                  </div>
                  {/* Badges informativos */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {!enriqueciendo.has(i) && !enriqueciendoTodo &&
                      ((!p.price || p.price <= 0) || !(p.images && p.images.length > 0)) && (
                      <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600 dark:text-amber-400">
                        Datos incompletos
                      </Badge>
                    )}
                    {p.brand && (
                      <Badge variant="outline" className="text-[10px]">
                        {p.brand}
                      </Badge>
                    )}
                    {p.variants && p.variants.length > 0 && (
                      <Badge variant="outline" className="text-[10px] text-purple-600 dark:text-purple-400">
                        {p.variants.map((v) => v.name).join(', ')}
                      </Badge>
                    )}
                    {p.images && p.images.length > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {p.images.length} imágenes
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                      {p.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {/* Sentinel para infinite scroll - carga más productos al hacer scroll */}
            {visibleCount < productos.length && (
              <div ref={loadMoreRef} className="flex justify-center items-center py-4">
                <div className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">
                  Cargando más productos... ({visibleCount}/{productos.length})
                </div>
              </div>
            )}
            {visibleCount >= productos.length && productos.length > PAGE_INCREMENT && (
              <div className="text-center py-3 text-xs text-gray-400 dark:text-gray-500">
                Todos los productos cargados ({productos.length})
              </div>
            )}
          </div>
        )}

        {/* Paso 3: Resultado */}
        {paso === 'resultado' && resultado && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                <p className="text-2xl font-bold dark:text-gray-100 mt-2">{resultado.exitosos}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Importados</p>
              </div>
              {resultado.fallidos > 0 && (
                <div className="text-center">
                  <XCircle className="h-10 w-10 text-red-500 mx-auto" />
                  <p className="text-2xl font-bold dark:text-gray-100 mt-2">{resultado.fallidos}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fallidos</p>
                </div>
              )}
            </div>
            {resultado.errores.length > 0 && (
              <div className="max-h-32 overflow-y-auto text-xs text-red-600 dark:text-red-400 space-y-1 border rounded-lg p-3 dark:border-gray-700">
                {resultado.errores.map((e, i) => (
                  <p key={i}>
                    <strong>{e.name}</strong>: {e.error || 'error desconocido'}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-shrink-0">
          {paso === 'url' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={analizando}>
                Cancelar
              </Button>
              <Button
                onClick={handleAnalizar}
                disabled={analizando || !url}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {analizando ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analizando con IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Analizar página
                  </>
                )}
              </Button>
            </>
          )}
          {paso === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setPaso('url')} disabled={importando}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Atrás
              </Button>
              {enriqueciendoTodo ? (
                <Button
                  variant="destructive"
                  onClick={() => { cancelarEnrichRef.current = true; }}
                  className="ml-auto"
                >
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {enrichProgreso
                    ? `Enriqueciendo ${enrichProgreso.actual}/${enrichProgreso.total}... (Cancelar)`
                    : 'Obteniendo detalles... (Cancelar)'}
                </Button>
              ) : (
                <Button
                  onClick={handleImportar}
                  disabled={importando || seleccionados.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {importando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importando {seleccionados.length} productos...
                    </>
                  ) : (
                    <>Importar {seleccionados.length} seleccionados</>
                  )}
                </Button>
              )}
            </>
          )}
          {paso === 'resultado' && (
            <>
              <Button variant="outline" onClick={reset}>
                Importar otra página
              </Button>
              <Button onClick={() => handleClose(false)} className="bg-blue-600 hover:bg-blue-700">
                Finalizar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScrapingProductos;
