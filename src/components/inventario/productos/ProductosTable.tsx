"use client";

import React, { useState, useEffect } from 'react';
import {
  useRouter } from 'next/navigation';
import Link from 'next/link';

import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from '@/components/ui/skeleton';
import {
  BadgeCheck,
  MoreHorizontal,
  Pencil,
  Eye,
  Trash2,
  Copy,
  PackageIcon,
  ExternalLink,
  ChevronDown,
  CheckCheck,
  X,
  Layers,
  SlidersHorizontal,
  Wrench,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ImageIcon,
  Filter,
  Search
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { formatCurrency } from '@/utils/Utils';
import { Producto } from './types';
import Image from 'next/image';
import { supabase } from '@/lib/supabase/config';
import { useOrgCurrency, formatMonedaSinDecimales } from '@/lib/hooks/useOrgCurrency';
// Using direct Supabase storage calls for URL generation


interface ProductosTableProps {
  productos: Producto[];
  loading: boolean;
  onEdit: (producto: Producto) => void;
  onView: (producto: Producto) => void;
  onDelete: (id: string | number) => void;
  onDuplicate: (producto: Producto) => void;
  selectedIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
}

// Interfaz para las imágenes de productos (usada en extracción desde datos ya cargados)
interface ProductImage {
  storage_path: string;
  is_primary: boolean;
}

/**
 * Tabla para mostrar el listado de productos con sus acciones
 */
const ProductosTable: React.FC<ProductosTableProps> = ({
  productos,
  loading,
  onEdit,
  onView,
  onDelete,
  onDuplicate,
  selectedIds = [],
  onSelectionChange
}) => {

  const orgCurrency = useOrgCurrency();
  // Formato sin decimales para la tabla usando la moneda de la organización
  const formatPrecioTabla = (value: number): string =>
    formatMonedaSinDecimales(value, orgCurrency);
  
  // Estado para la paginación
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Estado para ordenamiento de columnas
  type SortField = 'name' | 'price' | 'stock' | 'category' | 'status' | 'sku';
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Estado para filtros rápidos
  const [filterHasImage, setFilterHasImage] = useState<'all' | 'with' | 'without'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'discontinued'>('all');

  // Búsqueda instantánea en cliente: filtra sobre los productos ya cargados
  // sin ir al servidor. Da feedback inmediato mientras el debounce del
  // buscador principal (FiltrosProductos) espera para refinar en servidor.
  const [quickSearch, setQuickSearch] = useState<string>('');

  // Estado para almacenar las imágenes principales de los productos
  const [productImages, setProductImages] = useState<Record<string | number, string>>({});

  // Función para alternar ordenamiento al hacer click en un header
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Icono de ordenamiento para un campo
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="inline ml-1 h-3 w-3 text-gray-400 cursor-pointer" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="inline ml-1 h-3 w-3 text-blue-600 cursor-pointer" />
      : <ArrowDown className="inline ml-1 h-3 w-3 text-blue-600 cursor-pointer" />;
  };
  const processedProductos = React.useMemo(() => {
    let result = [...productos];

    // Búsqueda instantánea en cliente (nombre, sku, barcode, marca, referencia)
    if (quickSearch.trim()) {
      const term = quickSearch.trim().toLowerCase();
      result = result.filter(p => {
        const name = (p.name || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const barcode = (p.barcode || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        const reference = (p.reference || '').toLowerCase();
        return name.includes(term) || sku.includes(term) || barcode.includes(term) || brand.includes(term) || reference.includes(term);
      });
    }

    // Filtro por imágenes
    if (filterHasImage === 'with') {
      result = result.filter(p => productImages[String(p.id)] || (p.product_images && p.product_images.length > 0));
    } else if (filterHasImage === 'without') {
      result = result.filter(p => !productImages[String(p.id)] && !(p.product_images && p.product_images.length > 0));
    }

    // Filtro por estado
    if (filterStatus !== 'all') {
      result = result.filter(p => p.status?.toLowerCase() === filterStatus);
    }

    // Ordenamiento
    if (sortField) {
      result.sort((a, b) => {
        let valA: string | number, valB: string | number;
        switch (sortField) {
          case 'name':
            valA = a.name?.toLowerCase() || '';
            valB = b.name?.toLowerCase() || '';
            break;
          case 'price':
            valA = a.price ?? 0;
            valB = b.price ?? 0;
            break;
          case 'stock':
            valA = a.stock ?? -1;
            valB = b.stock ?? -1;
            break;
          case 'category':
            valA = a.category?.name?.toLowerCase() || '';
            valB = b.category?.name?.toLowerCase() || '';
            break;
          case 'status':
            valA = a.status?.toLowerCase() || '';
            valB = b.status?.toLowerCase() || '';
            break;
          case 'sku':
            valA = a.sku?.toLowerCase() || '';
            valB = b.sku?.toLowerCase() || '';
            break;
          default:
            return 0;
        }
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [productos, sortField, sortDirection, filterHasImage, filterStatus, productImages, quickSearch]);

  // Reiniciar a página 1 cuando cambia la lista de productos, filtros u ordenamiento
  useEffect(() => {
    setCurrentPage(1);
  }, [productos, filterHasImage, filterStatus, sortField, sortDirection, quickSearch]);

  // Cálculo de productos por página (usa processedProductos con filtros y ordenamiento)
  const indexOfLastProduct = currentPage * pageSize;
  const indexOfFirstProduct = indexOfLastProduct - pageSize;
  const currentProductos = processedProductos.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(processedProductos.length / pageSize);

  // Lógica de selección múltiple
  const numericIds = currentProductos
    .map(p => typeof p.id === 'number' ? p.id : parseInt(String(p.id), 10))
    .filter(id => !isNaN(id));
  const allPageSelected = numericIds.length > 0 && numericIds.every(id => selectedIds.includes(id));

  // IDs de TODOS los productos (todas las páginas)
  const allProductIds = productos
    .map(p => typeof p.id === 'number' ? p.id : parseInt(String(p.id), 10))
    .filter(id => !isNaN(id));
  const allProductsSelected = allProductIds.length > 0 && allProductIds.every(id => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allPageSelected) {
      onSelectionChange(selectedIds.filter(id => !numericIds.includes(id)));
    } else {
      onSelectionChange([...new Set([...selectedIds, ...numericIds])]);
    }
  };

  const selectAllProducts = () => {
    if (!onSelectionChange) return;
    onSelectionChange([...new Set(allProductIds)]);
  };

  const clearSelection = () => {
    if (!onSelectionChange) return;
    onSelectionChange([]);
  };

  const toggleSelect = (productoId: number | string) => {
    if (!onSelectionChange) return;
    const id = typeof productoId === 'number' ? productoId : parseInt(String(productoId), 10);
    if (isNaN(id)) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(sid => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };
  
  // Extraer imágenes principales de los datos ya cargados (sin query adicional)
  useEffect(() => {
    if (!productos?.length) {
      setProductImages({});
      return;
    }

    const imageMap: Record<string | number, string> = {};
    for (const p of productos) {
      const images = (p as any).product_images;
      if (!images || !Array.isArray(images) || images.length === 0) continue;

      const primary = images.find((img: any) => img.is_primary) || images[0];
      if (!primary?.storage_path) continue;

      if (primary.storage_path.startsWith('http://') || primary.storage_path.startsWith('https://')) {
        imageMap[p.id] = primary.storage_path;
      } else {
        const bucket = (primary.storage_path.startsWith('products/') || primary.storage_path.startsWith('productos/'))
          ? 'product-images'
          : 'organization_images';
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(primary.storage_path);
        if (urlData?.publicUrl) imageMap[p.id] = urlData.publicUrl;
      }
    }
    setProductImages(imageMap);
  }, [productos]);
  
  // Función para renderizar estado del producto
  const renderEstado = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'active':
        return (
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full mr-2 bg-green-500 dark:bg-green-400"></span>
            <span className="text-sm dark:text-gray-200">Activo</span>
          </div>
        );
      case 'inactive':
        return (
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full mr-2 bg-gray-400 dark:bg-gray-500"></span>
            <span className="text-sm dark:text-gray-200">Inactivo</span>
          </div>
        );
      case 'discontinued':
        return (
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full mr-2 bg-red-500"></span>
            <span className="text-sm dark:text-gray-200">Descontinuado</span>
          </div>
        );
      case 'deleted':
        return (
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full mr-2 bg-purple-500"></span>
            <span className="text-sm dark:text-gray-200">Eliminado</span>
          </div>
        );
      default:
        return <span>{estado || 'No definido'}</span>;
    }
  };
  
  // Función para determinar el color de fondo según stock
  const getBgColorByStock = (stock: number | undefined, trackStock?: boolean) => {
    // Si no rastrea inventario o no hay stock definido, color predeterminado
    if (trackStock === false || stock === undefined) return '';
    
    if (stock <= 0) {
      return 'bg-red-50 dark:bg-red-950/30';
    } else if (stock < 5) {
      return 'bg-amber-50 dark:bg-amber-950/30';
    }
    
    return '';
  };

  if (loading) {
    return (
      <div className="rounded-lg border shadow-sm overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        {/* Skeleton header */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20 hidden md:block" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24 hidden lg:block" />
            <Skeleton className="h-4 w-16 ml-auto" />
            <Skeleton className="h-4 w-16 hidden xl:block" />
            <Skeleton className="h-4 w-16 hidden xl:block" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20 hidden sm:block" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        {/* Skeleton rows */}
        {[...Array(8)].map((_, i) => (
          <div key={i} className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-4 shrink-0" />
              <Skeleton className="h-12 w-12 sm:h-14 sm:w-14 rounded-md shrink-0" />
              <Skeleton className="h-4 w-20 hidden md:block" />
              <Skeleton className="h-4 w-40 sm:w-48" />
              <Skeleton className="h-4 w-24 hidden lg:block" />
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-4 w-16 hidden xl:block" />
              <Skeleton className="h-4 w-16 hidden xl:block" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-4 w-20 hidden sm:block" />
              <Skeleton className="h-8 w-8 rounded-md shrink-0" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (productos.length === 0) {
    return (
      <div className="rounded-lg border p-6 sm:p-8 text-center bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <PackageIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
        <p className="text-base sm:text-lg font-semibold text-gray-700 dark:text-gray-300">
          No se encontraron productos
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Intente con otros filtros o cree un nuevo producto.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-sm overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      {/* Barra de filtros rápidos */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        {/* Búsqueda instantánea en cliente */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
          <Input
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            placeholder="Filtrar rápido en lista..."
            aria-label="Búsqueda rápida en la lista cargada"
            className="h-7 pl-7 text-xs dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
          />
          {quickSearch && (
            <button
              onClick={() => setQuickSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Limpiar búsqueda rápida"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Filter className="h-3.5 w-3.5" />
          <span>Filtros:</span>
        </div>
        {/* Filtro por imágenes */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200">
              <ImageIcon className="h-3 w-3" />
              {filterHasImage === 'all' ? 'Todas las imágenes' : filterHasImage === 'with' ? 'Con imagen' : 'Sin imagen'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="dark:bg-gray-800 dark:border-gray-700">
            <DropdownMenuItem onClick={() => setFilterHasImage('all')} className="cursor-pointer dark:text-gray-200">
              Todas las imágenes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterHasImage('with')} className="cursor-pointer dark:text-gray-200">
              Con imagen
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterHasImage('without')} className="cursor-pointer dark:text-gray-200">
              Sin imagen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Filtro por estado */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200">
              {filterStatus === 'all' ? 'Todos los estados' : filterStatus === 'active' ? 'Activos' : filterStatus === 'inactive' ? 'Inactivos' : 'Descontinuados'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="dark:bg-gray-800 dark:border-gray-700">
            <DropdownMenuItem onClick={() => setFilterStatus('all')} className="cursor-pointer dark:text-gray-200">Todos los estados</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus('active')} className="cursor-pointer dark:text-gray-200">Activos</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus('inactive')} className="cursor-pointer dark:text-gray-200">Inactivos</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterStatus('discontinued')} className="cursor-pointer dark:text-gray-200">Descontinuados</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Contador de resultados */}
        <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
          {processedProductos.length} de {productos.length} productos
        </span>
        {/* Limpiar filtros */}
        {(filterHasImage !== 'all' || filterStatus !== 'all' || sortField || quickSearch) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-red-500 hover:text-red-600"
            onClick={() => { setFilterHasImage('all'); setFilterStatus('all'); setSortField(null); setQuickSearch(''); }}
          >
            <X className="h-3 w-3 mr-1" /> Limpiar
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50 dark:bg-gray-800">
            <TableRow className="dark:border-gray-700">
              {onSelectionChange && (
                <TableHead className="w-[60px]">
                  <div className="flex items-center gap-0.5">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      title="Seleccionar todos en esta página"
                      aria-label="Seleccionar todos los productos en esta página"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
                          title="Opciones de selección"
                          aria-label="Opciones de selección de productos"
                          aria-haspopup="menu"
                        >
                          <ChevronDown className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="dark:bg-gray-800 dark:border-gray-700 w-56">
                        <DropdownMenuItem
                          onClick={toggleSelectAll}
                          className="cursor-pointer dark:text-gray-200 dark:focus:bg-gray-700"
                        >
                          <CheckCheck className="mr-2 h-4 w-4" />
                          <span>Seleccionar esta página ({numericIds.length})</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={selectAllProducts}
                          className="cursor-pointer dark:text-gray-200 dark:focus:bg-gray-700"
                        >
                          <PackageIcon className="mr-2 h-4 w-4" />
                          <span>Seleccionar todos ({allProductIds.length})</span>
                        </DropdownMenuItem>
                        {selectedIds.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={clearSelection}
                              className="cursor-pointer text-red-600 dark:text-red-400 dark:focus:bg-gray-700"
                            >
                              <X className="mr-2 h-4 w-4" />
                              <span>Limpiar selección ({selectedIds.length})</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
              )}
              <TableHead className="w-[60px] sm:w-[80px] text-xs sm:text-sm dark:text-gray-300">Imagen</TableHead>
              <TableHead
                className="hidden md:table-cell w-[80px] sm:w-[100px] text-xs sm:text-sm dark:text-gray-300 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700/50"
                onClick={() => toggleSort('sku')}
              >
                Código<SortIcon field="sku" />
              </TableHead>
              <TableHead
                className="text-xs sm:text-sm dark:text-gray-300 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700/50"
                onClick={() => toggleSort('name')}
              >
                Nombre<SortIcon field="name" />
              </TableHead>
              <TableHead className="hidden md:table-cell text-xs sm:text-sm dark:text-gray-300">Atributos</TableHead>
              <TableHead
                className="hidden lg:table-cell text-xs sm:text-sm dark:text-gray-300 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700/50"
                onClick={() => toggleSort('category')}
              >
                Categoría<SortIcon field="category" />
              </TableHead>
              <TableHead
                className="text-right text-xs sm:text-sm dark:text-gray-300 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700/50"
                onClick={() => toggleSort('price')}
              >
                Precio<SortIcon field="price" />
              </TableHead>
              <TableHead className="hidden xl:table-cell text-right text-xs sm:text-sm dark:text-gray-300">Margen</TableHead>
              <TableHead className="hidden xl:table-cell text-right text-xs sm:text-sm dark:text-gray-300">Costo</TableHead>
              <TableHead
                className="text-center text-xs sm:text-sm dark:text-gray-300 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700/50"
                onClick={() => toggleSort('stock')}
              >
                Stock<SortIcon field="stock" />
              </TableHead>
              <TableHead
                className="hidden sm:table-cell text-xs sm:text-sm dark:text-gray-300 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700/50"
                onClick={() => toggleSort('status')}
              >
                Estado<SortIcon field="status" />
              </TableHead>
              <TableHead className="w-[60px] sm:w-[80px] text-right text-xs sm:text-sm dark:text-gray-300">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentProductos.map((producto) => (
              <TableRow 
                key={typeof producto.id === 'number' ? producto.id : String(producto.id)}
                className={`dark:border-gray-700 ${getBgColorByStock(producto.stock, producto.track_stock)} cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${selectedIds.includes(typeof producto.id === 'number' ? producto.id : parseInt(String(producto.id), 10)) ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                onClick={() => onView(producto)}
              >
                {onSelectionChange && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(typeof producto.id === 'number' ? producto.id : parseInt(String(producto.id), 10))}
                      onChange={() => toggleSelect(producto.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      aria-label={`Seleccionar producto ${producto.name}`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link
                    href={`/app/inventario/productos/${producto.uuid || producto.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block relative h-12 w-12 sm:h-14 sm:w-14 rounded-md overflow-hidden border dark:border-gray-600 bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:ring-2 hover:ring-blue-500 transition-all"
                    title={`Ver detalle de ${producto.name}`}
                  >
                    {productImages[String(producto.id)] ? (
                      <img
                        src={productImages[String(producto.id)]}
                        alt={producto.name}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          // Evitar bucles infinitos verificando si ya intentamos cargar la imagen de respaldo
                          const target = e.target as HTMLImageElement;
                          if (!target.dataset.usedFallback) {
                            target.dataset.usedFallback = 'true';
                            target.src = '/placeholder-image.png';
                          } else {
                            // Si ya intentamos cargar la imagen de respaldo y también falló,
                            // mostrar un elemento alternativo en lugar de intentar cargar otra imagen
                            target.style.display = 'none';
                            target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                            const placeholder = document.createElement('div');
                            placeholder.className = 'text-gray-400 text-xs';
                            placeholder.textContent = 'Sin imagen';
                            target.parentElement?.appendChild(placeholder);
                          }
                        }}
                      />
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-xs">Sin imagen</span>
                    )}
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell font-mono text-xs sm:text-sm dark:text-gray-300">{producto.sku}</TableCell>
                <TableCell className="font-medium text-xs sm:text-sm dark:text-gray-200">
                  <Link
                    href={`/app/inventario/productos/${producto.uuid || producto.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="max-w-[150px] sm:max-w-none break-words whitespace-normal hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                    title={`Ver detalle de ${producto.name}`}
                  >
                    {producto.name}
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs sm:text-sm">
                  <div className="flex flex-wrap gap-1">
                    {producto.product_type === 'service' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        <Wrench className="h-2.5 w-2.5" />
                        Servicio
                      </span>
                    )}
                    {producto.is_parent && producto.children && producto.children.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        <Layers className="h-2.5 w-2.5" />
                        {producto.children.length} {producto.children.length === 1 ? 'variante' : 'variantes'}
                      </span>
                    )}
                    {(producto.modifier_groups_count ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        <SlidersHorizontal className="h-2.5 w-2.5" />
                        {producto.modifier_groups_count} {producto.modifier_groups_count === 1 ? 'modificador' : 'modificadores'}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs sm:text-sm dark:text-gray-300">{producto.category?.name || '-'}</TableCell>
                <TableCell className="text-right text-xs sm:text-sm dark:text-gray-300">
                  {typeof producto.price === 'number' && producto.price > 0 ? (
                    <div>
                      <span className="font-semibold">{formatPrecioTabla(producto.price)}</span>
                      {typeof producto.compare_price === 'number' && producto.compare_price > producto.price && (
                        <>
                          <span className="block text-xs text-gray-400 line-through">{formatPrecioTabla(producto.compare_price)}</span>
                          <span className="text-xs text-red-500 font-medium">-{Math.round((1 - producto.price / producto.compare_price) * 100)}%</span>
                        </>
                      )}
                    </div>
                  ) : '-'}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-right text-xs sm:text-sm dark:text-gray-300">
                  {typeof producto.price === 'number' && typeof producto.cost === 'number' && producto.price > 0 ? (
                    (() => {
                      const margen = ((producto.price - producto.cost) / producto.price) * 100;
                      const color = margen >= 30 ? 'text-green-600 dark:text-green-400' : margen >= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
                      return <span className={`font-medium ${color}`}>{margen.toFixed(0)}%</span>;
                    })()
                  ) : '-'}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-right text-xs sm:text-sm dark:text-gray-300">{typeof producto.cost === 'number' ? formatPrecioTabla(producto.cost) : '-'}</TableCell>
                <TableCell className="text-center text-xs sm:text-sm">
                  {producto.track_stock === false ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                      Sin seguimiento
                    </span>
                  ) : (
                    <span className={`font-semibold ${producto.stock !== undefined && producto.stock <= 0 ? 'text-red-500' : 'dark:text-gray-200'}`}>{producto.stock ?? 0}</span>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{renderEstado(producto.status)}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label={`Acciones para producto ${producto.name}`}
                      >
                        <span className="sr-only">Abrir menú</span>
                        <MoreHorizontal className="h-4 w-4 dark:text-gray-300" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end"
                      className="dark:bg-gray-800 dark:border-gray-700 w-48"
                    >
                      <DropdownMenuItem 
                        onClick={() => onView(producto)}
                        className="cursor-pointer"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        <span>Ver detalle</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onEdit(producto)}
                        className="cursor-pointer"
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        <span>Editar</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => onDuplicate(producto)}
                        className="cursor-pointer"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        <span>Duplicar</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onDelete(producto.id)}
                        className="text-red-600 dark:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        <span>Eliminar</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Paginación */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-3 sm:px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Mostrar</span>
          <select
            className="border rounded-md px-2 py-1 text-xs sm:text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            de {productos.length}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev: number) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <span className="hidden sm:inline">Anterior</span>
            <span className="sm:hidden">«</span>
          </Button>
          
          <span className="flex items-center px-2 sm:px-3 text-xs sm:text-sm text-gray-700 dark:text-gray-300">
            {currentPage} / {totalPages || 1}
          </span>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev: number) => Math.min(prev + 1, totalPages))}
            disabled={currentPage >= totalPages}
            className="text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <span className="sm:hidden">»</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProductosTable;
