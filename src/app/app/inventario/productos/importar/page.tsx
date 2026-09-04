'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { 
  ArrowLeft, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  X,
  FileWarning,
  Package
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ImportRow {
  row: number;
  sku: string;
  name: string;
  type?: string;
  category?: string;
  unit?: string;
  barcode?: string;
  description?: string;
  price?: number;
  comparePrice?: number;
  cost?: number;
  stock?: number;
  minLevel?: number;
  taxName?: string;
  brand?: string;
  reference?: string;
  supplier?: string;
  trackStock?: boolean;
  tags?: string;
  notes?: string;
  imageUrls?: string;
  parentSku?: string;
  variantData?: string;
  isParent?: boolean;
  station?: string;
  statusValue?: string;
  modifiers?: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
  warnings?: string[];
}

interface ImportStats {
  total: number;
  success: number;
  errors: number;
  pending: number;
}

interface StockRow {
  sku: string;
  name: string;
  stock: number;
  unitCost?: number;
}

// Mapea nombres de unidad del archivo a códigos válidos de la tabla units
// (products.unit_code tiene FK a units.code — códigos válidos: UN, KG, GR, ML, LT, PAQ, CAJ, PR, SV, CM, MT, M2, M3)
function mapUnitCode(unit?: string): string {
  if (!unit) return 'UN';
  const u = unit.toLowerCase().trim();
  const mapping: Record<string, string> = {
    'unidad': 'UN', 'und': 'UN', 'un': 'UN', 'u': 'UN',
    'kilogramo': 'KG', 'kg': 'KG', 'kilo': 'KG',
    'gramo': 'GR', 'gr': 'GR', 'g': 'GR',
    'litro': 'LT', 'lt': 'LT', 'l': 'LT',
    'mililitro': 'ML', 'ml': 'ML',
    'servicio': 'SV', 'sv': 'SV',
    'caja': 'CAJ', 'caj': 'CAJ',
    'paquete': 'PAQ', 'paq': 'PAQ',
    'par': 'PR', 'pr': 'PR',
    'metro': 'MT', 'mt': 'MT', 'm': 'MT',
    'centimetro': 'CM', 'centímetro': 'CM', 'cm': 'CM',
    'metro cuadrado': 'M2', 'm2': 'M2',
    'metro cubico': 'M3', 'metro cúbico': 'M3', 'm3': 'M3',
  };
  return mapping[u] || 'UN';
}

/**
 * Normaliza un nombre para comparación robusta:
 * - lowercase
 * - trim
 * - colapsa espacios múltiples internos
 * - elimina acentos/diacríticos (á→a, é→e, ñ→n, ü→u, etc.)
 * - elimina caracteres no alfanuméricos excepto espacios
 * Uso: construir claves de Map y buscar coincidencias tolerantes.
 */
function normalizeName(name?: string | null): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita diacríticos
    .replace(/[^a-z0-9\s]/g, ' ')    // no alfanuméricos → espacio
    .replace(/\s+/g, ' ')            // colapsa espacios
    .trim();
}

/**
 * Genera un slug a partir de un nombre (sin acentos, espacios→guiones).
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

export default function ImportarProductosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [stockFile, setStockFile] = useState<File | null>(null);
  const [stockData, setStockData] = useState<StockRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState<ImportRow[]>([]);
  const [stats, setStats] = useState<ImportStats>({ total: 0, success: 0, errors: 0, pending: 0 });
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [importMode, setImportMode] = useState<'create_only' | 'update_only' | 'create_and_update'>('create_and_update');
  const [isExporting, setIsExporting] = useState(false);
  const stockFileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      toast({
        title: 'Formato no válido',
        description: 'Por favor seleccione un archivo CSV o Excel (.xlsx, .xls)',
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);
    parseFile(selectedFile);
  };

  const handleStockFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    setStockFile(selectedFile);
    parseStockFile(selectedFile);
  };

  /**
   * Detecta si el archivo tiene el formato "Space" (listado simple sin SKU):
   * Columnas: Producto, Categoría, P. Venta, [Descuento], [Promoción 2x]
   * No tiene columna Código/SKU. Retorna la fila de encabezado o -1 si no coincide.
   */
  const detectSpaceFormat = (rawData: Array<Array<string | number | null>>): number => {
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      if (!row) continue;
      const cells = row.map(c => String(c || '').toLowerCase().trim());
      const hasProducto = cells.some(c => c === 'producto');
      const hasCategoria = cells.some(c => c === 'categoría' || c === 'categoria');
      const hasPVenta = cells.some(c => c === 'p. venta' || c === 'p venta' || c === 'precio' || c === 'precio de venta');
      const hasCodigo = cells.some(c => c === 'código' || c === 'codigo' || c === 'sku');
      // Formato Space: tiene Producto + Categoría + P. Venta pero NO tiene Código/SKU
      if (hasProducto && hasCategoria && hasPVenta && !hasCodigo) {
        return i;
      }
    }
    return -1;
  };

  /**
   * Tamaños conocidos para detección automática de variantes.
   * Si el nombre empieza con uno de estos prefijos, se considera variante de tamaño
   * del producto cuyo nombre es el resto. Ej: "PEQUEÑO GRANI CON LICOR" →
   * variante "Tamaño=Pequeño" del producto padre "GRANI CON LICOR".
   */
  const SIZE_PREFIXES = [
    'EXTRAGRANDE', 'EXTRA GRANDE', 'EXTRA',
    'GRANDE', 'GRAN',
    'MEDIANO', 'MED',
    'PEQUEÑO', 'PEQUE', 'PEQUEO',
    '1LT', '1 LT', 'LITRO', '1L',
    'MEDIA', 'MEDIA DE',
  ];

  /**
   * Detecta si un nombre de producto empieza con un tamaño conocido.
   * Retorna { size, baseName } o null si no coincide.
   */
  const detectSizeVariant = (name: string): { size: string; baseName: string } | undefined => {
    const upper = name.toUpperCase().trim();
    for (const prefix of SIZE_PREFIXES) {
      if (upper.startsWith(prefix + ' ')) {
        const baseName = name.substring(prefix.length).trim();
        if (baseName.length > 0) {
          // Normalizar el tamaño para mostrarlo limpio
          let size = prefix;
          if (prefix === 'EXTRAGRANDE' || prefix === 'EXTRA GRANDE') size = 'Extragrande';
          else if (prefix === 'GRANDE' || prefix === 'GRAN') size = 'Grande';
          else if (prefix === 'MEDIANO' || prefix === 'MED') size = 'Mediano';
          else if (prefix === 'PEQUEÑO' || prefix === 'PEQUE' || prefix === 'PEQUEO') size = 'Pequeño';
          else if (prefix === '1LT' || prefix === '1 LT' || prefix === '1L') size = '1 Litro';
          else if (prefix === 'LITRO') size = '1 Litro';
          else if (prefix === 'MEDIA' || prefix === 'MEDIA DE') size = 'Media';
          else size = prefix.charAt(0) + prefix.slice(1).toLowerCase();
          return { size, baseName };
        }
      }
    }
    return undefined;
  };

  /**
   * Parsea archivo con formato "Space" (listado simple sin SKU).
   * - Autogenera SKUs con prefijo SP- + slug del nombre
   * - Detecta tamaños (PEQUEÑO/MEDIANO/GRANDE/EXTRAGRANDE/1LT) y agrupa como variantes
   *   de un producto padre, usando la lógica de variantes que ya soporta el importador
   *   (isParent, parentSku, variantData)
   * - La promo 2x NO se mapea a compare_price (eso es para descuentos de producto).
   *   Se deja indicada en notas para configurar después en /app/pos/promociones
   *   con tipo buy_x_get_y.
   */
  const parseSpaceFormat = (rawData: Array<Array<string | number | null>>, headerRow: number): ImportRow[] => {
    const headers = rawData[headerRow].map((h: string | number | null) => String(h || '').toLowerCase().trim());
    const nameIdx = headers.findIndex(h => h === 'producto' || h === 'nombre' || h === 'name');
    const categoryIdx = headers.findIndex(h => h === 'categoría' || h === 'categoria' || h === 'category');
    const priceIdx = headers.findIndex(h => h === 'p. venta' || h === 'p venta' || h === 'precio' || h === 'precio de venta' || h === 'price');
    const discountIdx = headers.findIndex(h => h === 'descuento' || h === 'descuento ' || h === 'discount');
    const promoTotalIdx = headers.findIndex(h => h.includes('promoción') || h.includes('promocion') || h.includes('promo'));

    if (nameIdx === -1 || priceIdx === -1) return [];

    // Primera pasada: leer todos los productos crudos
    interface RawProduct {
      row: number;
      name: string;
      category?: string;
      price?: number;
      discountPrice?: number;
      promoTotal?: number;
      sizeVariant?: { size: string; baseName: string };
    }
    const rawProducts: RawProduct[] = [];

    for (let i = headerRow + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || !row[nameIdx]) continue;
      const name = String(row[nameIdx]).trim();
      if (!name) continue;

      const category = categoryIdx !== -1 ? String(row[categoryIdx] || '').trim() : undefined;
      const normalPrice = priceIdx !== -1 ? Number(row[priceIdx]) || undefined : undefined;
      const discountPrice = discountIdx !== -1 ? Number(row[discountIdx]) || undefined : undefined;
      const promoTotal = promoTotalIdx !== -1 ? Number(row[promoTotalIdx]) || undefined : undefined;
      const sizeVariant = detectSizeVariant(name);

      rawProducts.push({ row: i + 1, name, category, price: normalPrice, discountPrice, promoTotal, sizeVariant });
    }

    // Agrupar variantes por (baseName + category) para detectar productos padre
    // Si hay 2+ productos con el mismo baseName en la misma categoría, son variantes
    const variantGroups = new Map<string, RawProduct[]>();
    const standaloneProducts: RawProduct[] = [];

    for (const prod of rawProducts) {
      if (prod.sizeVariant) {
        const groupKey = `${prod.sizeVariant.baseName.toLowerCase()}|${(prod.category || '').toLowerCase()}`;
        const existing = variantGroups.get(groupKey) || [];
        existing.push(prod);
        variantGroups.set(groupKey, existing);
      } else {
        standaloneProducts.push(prod);
      }
    }

    // Si un grupo tiene solo 1 elemento, no es variante → tratarlo como standalone
    for (const [, prods] of variantGroups) {
      if (prods.length < 2) {
        standaloneProducts.push(...prods);
      }
    }
    // Filtrar grupos con 2+ elementos
    const realVariantGroups = new Map<string, RawProduct[]>();
    for (const [key, prods] of variantGroups) {
      if (prods.length >= 2) realVariantGroups.set(key, prods);
    }

    const rows: ImportRow[] = [];
    const seenSkus = new Set<string>();

    // Generar SKU único con prefijo SP-
    const generateSku = (name: string, rowNum: number): string => {
      let baseSku = `SP-${slugify(name).substring(0, 40)}`;
      if (!baseSku || baseSku === 'SP-') {
        baseSku = `SP-${String(rowNum).padStart(3, '0')}`;
      }
      let sku = baseSku;
      let suffix = 1;
      while (seenSkus.has(sku)) {
        suffix++;
        sku = `${baseSku}-${suffix}`;
      }
      seenSkus.add(sku);
      return sku;
    };

    // Construir nota de promo 2x para configurar después en /app/pos/promociones
    const buildPromoNote = (normalPrice?: number, discountPrice?: number, promoTotal?: number): string | undefined => {
      if (!discountPrice || discountPrice <= 0 || !normalPrice || normalPrice <= discountPrice) return undefined;
      if (promoTotal && promoTotal > 0) {
        return `Configurar promo 2x1 en /app/pos/promociones (buy_x_get_y): 2 por $${promoTotal.toLocaleString('es-CO')} (c/u $${discountPrice.toLocaleString('es-CO')}, normal $${normalPrice.toLocaleString('es-CO')})`;
      }
      return `Configurar promo 2x1 en /app/pos/promociones (buy_x_get_y): c/u $${discountPrice.toLocaleString('es-CO')} (normal $${normalPrice.toLocaleString('es-CO')})`;
    };

    // Procesar grupos de variantes: crear producto padre + variantes hijas
    for (const [, prods] of realVariantGroups) {
      const firstProd = prods[0];
      const baseName = firstProd.sizeVariant!.baseName;
      const category = firstProd.category;

      // Producto padre
      const parentSku = generateSku(baseName, firstProd.row);
      // Precio del padre: el precio más bajo entre las variantes (o el primero)
      const parentPrice = Math.min(...prods.map(p => p.price || Infinity).filter(p => p !== Infinity));
      const parentPromoNote = buildPromoNote(
        parentPrice,
        prods.find(p => p.discountPrice && p.discountPrice > 0)?.discountPrice,
        prods.find(p => p.promoTotal && p.promoTotal > 0)?.promoTotal,
      );

      rows.push({
        row: firstProd.row,
        sku: parentSku,
        name: baseName,
        type: 'Producto',
        category: category || undefined,
        unit: 'Unidad',
        price: parentPrice !== Infinity ? parentPrice : undefined,
        stock: 0,
        isParent: true,
        status: 'pending',
        notes: parentPromoNote,
      });

      // Variantes hijas
      for (const prod of prods) {
        const variantSku = generateSku(prod.name, prod.row);
        const variantNote = buildPromoNote(prod.price, prod.discountPrice, prod.promoTotal);
        const variantData = JSON.stringify({ Tamaño: prod.sizeVariant!.size });

        rows.push({
          row: prod.row,
          sku: variantSku,
          name: prod.name,
          type: 'Producto',
          category: prod.category || undefined,
          unit: 'Unidad',
          price: prod.price,
          stock: 0,
          parentSku,
          isParent: false,
          variantData,
          status: 'pending',
          notes: variantNote,
        });
      }
    }

    // Procesar productos standalone (sin variantes)
    for (const prod of standaloneProducts) {
      const sku = generateSku(prod.name, prod.row);
      const note = buildPromoNote(prod.price, prod.discountPrice, prod.promoTotal);

      rows.push({
        row: prod.row,
        sku,
        name: prod.name,
        type: 'Producto',
        category: prod.category || undefined,
        unit: 'Unidad',
        price: prod.price,
        stock: 0,
        status: 'pending',
        notes: note,
      });
    }

    // Ordenar por fila original para preview ordenado
    rows.sort((a, b) => a.row - b.row);

    return rows;
  };

  /**
   * Detecta si el archivo tiene el formato "Sistema/Vivor":
   * 3 columnas (Nombre | Valor Compra | Valor Venta), sin SKU, sin columna
   * de categoría explícita. Las categorías son filas separadoras de 1 sola
   * columna (ej: "SUPLEMENTOS", "VITAMINAS", "BEBIDAS") que rigen hasta la
   * siguiente separadora.
   *
   * Encabezado típico (fila 0): ["SUPLEMENTOS", "VALOR COMPRA", "VALOR VENTA"]
   * Retorna la fila de encabezado o -1 si no coincide.
   */
  const detectSistemaFormat = (rawData: Array<Array<string | number | null>>): number => {
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      if (!row) continue;
      const cells = row.map(c => String(c || '').toLowerCase().trim());
      // Necesita al menos 3 columnas
      if (row.length < 3) continue;
      const hasCompra = cells.some(c => c.includes('compra'));
      const hasVenta = cells.some(c => c.includes('venta'));
      // La primera celda NO debe ser 'código'/'sku'/'producto'/'nombre'
      // (es el nombre de la primera sección, ej: "SUPLEMENTOS")
      const first = cells[0];
      const isGenericHeader = ['código', 'codigo', 'sku', 'producto', 'nombre', 'name', 'tipo', 'type']
        .includes(first);
      if (hasCompra && hasVenta && !isGenericHeader) {
        return i;
      }
    }
    return -1;
  };

  /**
   * Normaliza un valor numérico del archivo Sistema/Vivor.
   * - Coma = separador de miles (se elimina): "1,191" → 1191
   * - Punto = separador decimal (se mantiene): "143.5" → 143.5
   * Retorna undefined si no es un número válido.
   */
  const parseSistemaNumber = (val: string | number | null | undefined): number | undefined => {
    if (val === null || val === undefined || val === '') return undefined;
    const s = String(val).trim().replace(/,/g, '');
    const n = Number(s);
    return isNaN(n) ? undefined : n;
  };

  /**
   * Parsea archivo con formato "Sistema/Vivor".
   * - Autogenera SKUs con prefijo VE- + slug del nombre
   * - Asigna la categoría vigente (última fila separadora de 1 columna vista)
   * - Mapea Valor Compra → cost, Valor Venta → price
   * - Si cost > price (presunto error de tipeo) → intercambia los valores y
   *   deja un warning en la fila para revisión posterior
   * - Omite secciones vacías (separadoras sin productos debajo)
   * - Omite filas vacías
   */
  const parseSistemaFormat = (rawData: Array<Array<string | number | null>>, headerRow: number): ImportRow[] => {
    const rows: ImportRow[] = [];
    const seenSkus = new Set<string>();

    // Generar SKU único con prefijo VE-
    const generateSku = (name: string, rowNum: number): string => {
      let baseSku = `VE-${slugify(name).substring(0, 40)}`;
      if (!baseSku || baseSku === 'VE-') {
        baseSku = `VE-${String(rowNum).padStart(3, '0')}`;
      }
      let sku = baseSku;
      let suffix = 1;
      while (seenSkus.has(sku)) {
        suffix++;
        sku = `${baseSku}-${suffix}`;
      }
      seenSkus.add(sku);
      return sku;
    };

    // La primera categoría vigente es el encabezado mismo (col 0 del headerRow)
    let currentCategory: string | undefined = String(rawData[headerRow][0] || '').trim() || undefined;

    let swappedCount = 0;

    for (let i = headerRow + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row) continue;

      // Contar celdas no vacías
      const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
      if (nonEmpty.length === 0) continue; // fila vacía → skip

      // Fila separadora de sección: 1 sola celda con contenido → actualiza categoría
      if (nonEmpty.length === 1) {
        const sectionName = String(nonEmpty[0]).trim();
        if (sectionName) currentCategory = sectionName;
        continue;
      }

      // Fila de producto: 2-3 columnas (nombre, [compra], venta)
      const name = String(row[0] || '').trim();
      if (!name) continue;

      const rawCost = parseSistemaNumber(row[1]);
      const rawPrice = parseSistemaNumber(row[2]);

      // Si solo hay 2 columnas, la 2da podría ser precio (compra ausente)
      let cost = rawCost;
      let price = rawPrice;
      if (rawPrice === undefined && rawCost !== undefined && row[2] === undefined) {
        // Caso: [nombre, precio] sin columna de compra → precio en col 1
        price = rawCost;
        cost = undefined;
      }

      // Intercambiar si costo > precio (presunto error de tipeo)
      const warnings: string[] = [];
      if (cost !== undefined && price !== undefined && cost > price) {
        const tmp = cost;
        cost = price;
        price = tmp;
        warnings.push(`Costo > precio intercambiados automáticamente (revisar)`);
        swappedCount++;
      }

      const sku = generateSku(name, i + 1);

      rows.push({
        row: i + 1,
        sku,
        name,
        type: 'Producto',
        category: currentCategory || undefined,
        unit: 'Unidad',
        cost,
        price,
        stock: 0,
        status: 'pending',
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    }

    // Ordenar por fila original para preview ordenado
    rows.sort((a, b) => a.row - b.row);

    if (swappedCount > 0) {
      toast({
        title: 'Costo > precio detectado',
        description: `Se intercambiaron automáticamente ${swappedCount} productos donde el costo era mayor al precio de venta. Revisa las advertencias en la preview.`,
      });
    }

    return rows;
  };

  /**
   * Parsea archivo XLSX/CSV de "Gestión de productos y servicios" (Siigo)
   * Columnas: Tipo, Código, Nombre, Unidad, Precios, Impuestos, Stock, Estado
   * Header en fila 4 (0-indexed), datos desde fila 5
   */
  const parseFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Detectar formato "Sistema/Vivor" (Nombre | Valor Compra | Valor Venta,
      // sin SKU, con secciones como filas separadoras de 1 columna)
      const sistemaHeaderRow = detectSistemaFormat(rawData);
      if (sistemaHeaderRow !== -1) {
        const rows = parseSistemaFormat(rawData, sistemaHeaderRow);
        if (rows.length === 0) {
          toast({
            title: 'Sin datos',
            description: 'No se encontraron productos válidos en el archivo',
            variant: 'destructive',
          });
          return;
        }
        const categoryCount = new Set(rows.map(r => r.category).filter(Boolean)).size;
        const swappedCount = rows.filter(r => r.warnings && r.warnings.some(w => w.includes('intercambiados'))).length;
        setPreviewData(rows);
        setStats({ total: rows.length, success: 0, errors: 0, pending: rows.length });
        toast({
          title: 'Formato Sistema/Vivor detectado',
          description: `${rows.length} productos cargados en ${categoryCount} categorías${swappedCount > 0 ? `, ${swappedCount} con costo/precio intercambiados (revisar advertencias)` : ''}. SKUs autogenerados con prefijo VE-.`,
        });
        setStep('preview');
        return;
      }

      // Detectar formato "Space" (listado simple sin SKU, con promo 2x)
      const spaceHeaderRow = detectSpaceFormat(rawData);
      if (spaceHeaderRow !== -1) {
        const rows = parseSpaceFormat(rawData, spaceHeaderRow);
        if (rows.length === 0) {
          toast({
            title: 'Sin datos',
            description: 'No se encontraron productos válidos en el archivo',
            variant: 'destructive',
          });
          return;
        }
        const variantCount = rows.filter(r => r.isParent === true).length;
        const variantChildCount = rows.filter(r => r.parentSku).length;
        const promoCount = rows.filter(r => r.notes && r.notes.includes('promo 2x1')).length;
        setPreviewData(rows);
        setStats({ total: rows.length, success: 0, errors: 0, pending: rows.length });
        toast({
          title: 'Formato Space detectado',
          description: `${rows.length} productos cargados${variantCount > 0 ? `, ${variantCount} productos padre con ${variantChildCount} variantes de tamaño` : ''}${promoCount > 0 ? `, ${promoCount} con promo 2x1 (configurar en /app/pos/promociones)` : ''}. SKUs autogenerados con prefijo SP-.`,
        });
        setStep('preview');
        return;
      }

      // Buscar fila de encabezados (contiene "Código", "SKU" o "Nombre")
      let headerRow = -1;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (row && row.some(cell => {
          const c = String(cell || '').toLowerCase().trim();
          return c === 'código' || c === 'codigo' || c === 'sku' || c === 'nombre' || c === 'name';
        })) {
          headerRow = i;
          break;
        }
      }

      if (headerRow === -1) {
        toast({
          title: 'Estructura no reconocida',
          description: 'No se encontró la fila de encabezados (debe contener "Código", "SKU" o "Nombre")',
          variant: 'destructive',
        });
        return;
      }

      const headers = rawData[headerRow].map((h: any) => String(h || '').toLowerCase().trim());
      const typeIdx = headers.findIndex((h: string) => h === 'tipo' || h === 'type');
      const codeIdx = headers.findIndex((h: string) => h === 'código' || h === 'codigo' || h === 'sku');
      const nameIdx = headers.findIndex((h: string) => h === 'nombre' || h === 'name' || h === 'producto');
      const unitIdx = headers.findIndex((h: string) => h === 'unidad' || h === 'unit' || h === 'unidad de medida');
      const priceIdx = headers.findIndex((h: string) => h === 'precios' || h === 'precio' || h === 'price' || h === 'precio de venta');
      const taxIdx = headers.findIndex((h: string) => h === 'impuestos' || h === 'impuesto' || h === 'tax');
      const stockIdx = headers.findIndex((h: string) => h === 'stock' || h === 'cantidad' || h === 'inventario' || h === 'stock total');
      const stateIdx = headers.findIndex((h: string) => h === 'estado' || h === 'state' || h === 'status');
      const brandIdx = headers.findIndex((h: string) => h === 'marca' || h === 'brand');
      const referenceIdx = headers.findIndex((h: string) => h === 'referencia' || h === 'reference' || h === 'ref');
      const categoryIdx = headers.findIndex((h: string) => h === 'categoría' || h === 'categoria' || h === 'category' || h === 'categoría' || h === 'categoria');
      const barcodeIdx = headers.findIndex((h: string) => h === 'código de barras' || h === 'codigo de barras' || h === 'barcode');
      const descriptionIdx = headers.findIndex((h: string) => h === 'descripción' || h === 'descripcion' || h === 'description' || h === 'descripción');
      const comparePriceIdx = headers.findIndex((h: string) => h === 'precio de comparación' || h === 'precio comparacion' || h === 'compare price' || h === 'compare_price');
      const costIdx = headers.findIndex((h: string) => h === 'costo' || h === 'cost' || h === 'costo de adquisición' || h === 'costo de adquisicion');
      const minLevelIdx = headers.findIndex((h: string) => h === 'stock mínimo' || h === 'stock minimo' || h === 'min level' || h === 'min_level');
      const supplierIdx = headers.findIndex((h: string) => h === 'proveedor' || h === 'supplier' || h === 'proveedor principal');
      const trackStockIdx = headers.findIndex((h: string) => h === 'rastrear inventario' || h === 'track stock' || h === 'track_stock' || h === 'rastrear stock');
      const tagsIdx = headers.findIndex((h: string) => h === 'etiquetas' || h === 'tags' || h === 'etiqueta');
      const notesIdx = headers.findIndex((h: string) => h === 'notas' || h === 'notes' || h === 'nota');
      const imagesIdx = headers.findIndex((h: string) => h === 'urls de imágenes' || h === 'urls de imagenes' || h === 'images' || h === 'imágenes' || h === 'imagenes' || h === 'url de imágenes');
      const parentSkuIdx = headers.findIndex((h: string) => h === 'sku padre' || h === 'parent sku' || h === 'parent_sku' || h === 'producto padre');
      const variantDataIdx = headers.findIndex((h: string) => h === 'datos de variante' || h === 'variant data' || h === 'variant_data' || h === 'variante');
      const isParentIdx = headers.findIndex((h: string) => h === 'es producto padre' || h === 'is parent' || h === 'is_parent' || h === 'producto padre');
      const stationIdx = headers.findIndex((h: string) => h === 'estación' || h === 'estacion' || h === 'station');
      const modifiersIdx = headers.findIndex((h: string) => h === 'modificadores' || h === 'modifiers' || h === 'modificador');

      if (codeIdx === -1 || nameIdx === -1) {
        toast({
          title: 'Columnas requeridas',
          description: 'El archivo debe contener las columnas "Código/SKU" y "Nombre"',
          variant: 'destructive',
        });
        return;
      }

      const rows: ImportRow[] = [];
      const seenSkus = new Set<string>();
      let duplicateCount = 0;
      for (let i = headerRow + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || !row[codeIdx] || !row[nameIdx]) continue;

        // Saltar filas con estado "Inactive" si existe la columna
        if (stateIdx !== -1 && String(row[stateIdx] || '').toLowerCase() === 'inactive') continue;

        const sku = String(row[codeIdx]).trim();
        const name = String(row[nameIdx]).trim();

        // Deduplicar SKUs dentro del mismo archivo
        if (seenSkus.has(sku)) {
          duplicateCount++;
          continue;
        }
        seenSkus.add(sku);

        const type = typeIdx !== -1 ? String(row[typeIdx] || '').trim() : undefined;
        const unit = unitIdx !== -1 ? String(row[unitIdx] || '').trim() : undefined;
        const price = priceIdx !== -1 ? Number(row[priceIdx]) || undefined : undefined;
        const stock = stockIdx !== -1 ? Number(row[stockIdx]) || 0 : 0;
        const taxName = taxIdx !== -1 ? String(row[taxIdx] || '').trim() : undefined;
        const brand = brandIdx !== -1 ? String(row[brandIdx] || '').trim() : undefined;
        const reference = referenceIdx !== -1 ? String(row[referenceIdx] || '').trim() : undefined;
        const category = categoryIdx !== -1 ? String(row[categoryIdx] || '').trim() : undefined;
        const barcode = barcodeIdx !== -1 ? String(row[barcodeIdx] || '').trim() : undefined;
        const description = descriptionIdx !== -1 ? String(row[descriptionIdx] || '').trim() : undefined;
        const comparePrice = comparePriceIdx !== -1 ? Number(row[comparePriceIdx]) || undefined : undefined;
        const cost = costIdx !== -1 ? Number(row[costIdx]) || undefined : undefined;
        const minLevel = minLevelIdx !== -1 ? Number(row[minLevelIdx]) || 0 : 0;
        const supplier = supplierIdx !== -1 ? String(row[supplierIdx] || '').trim() : undefined;
        const trackStockRaw = trackStockIdx !== -1 ? String(row[trackStockIdx] || '').trim().toLowerCase() : '';
        const trackStock = trackStockIdx !== -1 ? (trackStockRaw === 'true' || trackStockRaw === 'si' || trackStockRaw === '1' || trackStockRaw === 'verdadero') : undefined;
        const tags = tagsIdx !== -1 ? String(row[tagsIdx] || '').trim() : undefined;
        const notes = notesIdx !== -1 ? String(row[notesIdx] || '').trim() : undefined;
        const imageUrls = imagesIdx !== -1 ? String(row[imagesIdx] || '').trim() : undefined;
        const parentSku = parentSkuIdx !== -1 ? String(row[parentSkuIdx] || '').trim() : undefined;
        const variantData = variantDataIdx !== -1 ? String(row[variantDataIdx] || '').trim() : undefined;
        const isParentRaw = isParentIdx !== -1 ? String(row[isParentIdx] || '').trim().toLowerCase() : '';
        const isParent = isParentIdx !== -1 ? (isParentRaw === 'true' || isParentRaw === 'si' || isParentRaw === '1') : undefined;
        const station = stationIdx !== -1 ? String(row[stationIdx] || '').trim() : undefined;
        const modifiers = modifiersIdx !== -1 ? String(row[modifiersIdx] || '').trim() : undefined;
        const statusValue = stateIdx !== -1 ? String(row[stateIdx] || '').trim().toLowerCase() : undefined;

        rows.push({
          row: i + 1,
          sku,
          name,
          type,
          category,
          unit: unit || 'unidad',
          barcode: barcode || undefined,
          description: description || undefined,
          price,
          comparePrice,
          cost,
          stock,
          minLevel,
          taxName,
          brand: brand || undefined,
          reference: reference || undefined,
          supplier: supplier || undefined,
          trackStock,
          tags: tags || undefined,
          notes: notes || undefined,
          imageUrls: imageUrls || undefined,
          parentSku: parentSku || undefined,
          variantData: variantData || undefined,
          isParent,
          station: station || undefined,
          modifiers: modifiers || undefined,
          statusValue: statusValue || undefined,
          status: 'pending',
        });
      }

      // Auto-detectar variantes por prefijo de SKU
      // Si PROD-134-KMR-V1 empieza con PROD-134-KMR + separador, es variante hija
      const allSkus = new Set(rows.map(r => r.sku));
      let autoVariantCount = 0;
      for (const row of rows) {
        if (row.parentSku || row.isParent !== undefined) continue;

        // Buscar si este SKU es variante de otro (empieza con otro SKU + separador)
        const parts = row.sku.split(/[-_]/);
        for (let i = parts.length - 1; i > 0; i--) {
          const candidateParent = parts.slice(0, i).join('-');
          if (allSkus.has(candidateParent) && candidateParent !== row.sku) {
            row.parentSku = candidateParent;
            row.isParent = false;
            autoVariantCount++;
            break;
          }
          const candidateParentUnderscore = parts.slice(0, i).join('_');
          if (allSkus.has(candidateParentUnderscore) && candidateParentUnderscore !== row.sku) {
            row.parentSku = candidateParentUnderscore;
            row.isParent = false;
            autoVariantCount++;
            break;
          }
        }
      }

      // Marcar padres: si algun producto tiene variantes hijas, marcarlo como is_parent
      const parentSkus = new Set(rows.filter(r => r.parentSku).map(r => r.parentSku!));
      for (const row of rows) {
        if (parentSkus.has(row.sku) && row.isParent === undefined) {
          row.isParent = true;
        }
      }

      setPreviewData(rows);
      setStats({ total: rows.length, success: 0, errors: 0, pending: rows.length });
      if (duplicateCount > 0) {
        toast({
          title: 'SKUs duplicados detectados',
          description: `Se omitieron ${duplicateCount} filas con SKU duplicado. Solo se importa la primera ocurrencia de cada SKU.`,
        });
      }
      if (autoVariantCount > 0) {
        toast({
          title: 'Variantes detectadas automáticamente',
          description: `Se detectaron ${autoVariantCount} variantes por prefijo de SKU y se vincularon a sus productos padre.`,
        });
      }
      setStep('preview');
    } catch (error) {
      console.error('Error parsing file:', error);
      toast({
        title: 'Error al leer archivo',
        description: 'No se pudo procesar el archivo seleccionado',
        variant: 'destructive',
      });
    }
  };

  /**
   * Parsea archivo XLSX de "Saldos de inventario" (Siigo)
   * Columnas: Código producto, Nombre producto, Referencia, Unidad, Total, Valor unitario, Valor total
   */
  const parseStockFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Buscar fila de encabezados
      let headerRow = -1;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (row && row.some(cell => String(cell || '').toLowerCase().includes('código producto'))) {
          headerRow = i;
          break;
        }
      }

      if (headerRow === -1) {
        toast({
          title: 'Estructura no reconocida',
          description: 'No se encontró la fila de encabezados en el archivo de saldos',
          variant: 'destructive',
        });
        return;
      }

      const headers = rawData[headerRow].map((h: any) => String(h || '').toLowerCase().trim());
      const codeIdx = headers.findIndex((h: string) => h.includes('código producto') || h.includes('codigo producto'));
      const nameIdx = headers.findIndex((h: string) => h.includes('nombre producto'));
      const totalIdx = headers.findIndex((h: string) => h.includes('total en productos') || h.includes('total'));
      const unitCostIdx = headers.findIndex((h: string) => h.includes('valor unitario'));

      if (codeIdx === -1) {
        toast({
          title: 'Columnas requeridas',
          description: 'El archivo de saldos debe contener "Código producto"',
          variant: 'destructive',
        });
        return;
      }

      const rows: StockRow[] = [];
      for (let i = headerRow + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || !row[codeIdx]) continue;

        rows.push({
          sku: String(row[codeIdx]).trim(),
          name: nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '',
          stock: totalIdx !== -1 ? Number(row[totalIdx]) || 0 : 0,
          unitCost: unitCostIdx !== -1 ? Number(row[unitCostIdx]) || undefined : undefined,
        });
      }

      setStockData(rows);
      toast({
        title: 'Saldos cargados',
        description: `${rows.length} registros de inventario cargados`,
      });
    } catch (error) {
      console.error('Error parsing stock file:', error);
      toast({
        title: 'Error al leer archivo de saldos',
        description: 'No se pudo procesar el archivo de inventario',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    if (!organization?.id || previewData.length === 0) return;

    setImporting(true);
    setStep('importing');

    const orgId = organization.id;

    // Obtener el usuario autenticado para registros de auditoría (product_notes.user_id es NOT NULL)
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    // Obtener branch_id principal de la organización
    const { data: branches } = await supabase
      .from('branches')
      .select('id, is_main')
      .eq('organization_id', orgId)
      .order('is_main', { ascending: false })
      .limit(1);

    const branchId = branches?.[0]?.id;
    if (!branchId) {
      toast({
        title: 'Sin sucursal',
        description: 'La organización no tiene sucursales. Crea una sucursal primero.',
        variant: 'destructive',
      });
      setImporting(false);
      setStep('preview');
      return;
    }

    // Mapear stock del archivo de saldos por SKU
    const stockMap = new Map<string, StockRow>();
    for (const s of stockData) {
      stockMap.set(s.sku, s);
    }

    // Obtener impuestos de la organización para mapear "IVA 19%" etc
    // Los IDs de organization_taxes son UUIDs (string), NO integers
    const { data: orgTaxes } = await supabase
      .from('organization_taxes')
      .select('id, name')
      .eq('organization_id', orgId);

    const taxMap = new Map<string, string>();
    for (const t of orgTaxes || []) {
      taxMap.set(t.name.toLowerCase(), t.id);
      // Mapear variantes comunes
      if (t.name.toLowerCase().includes('19')) taxMap.set('iva 19%', t.id);
      if (t.name.toLowerCase().includes('5%')) taxMap.set('iva 5%', t.id);
      if (t.name.toLowerCase().includes('0%')) taxMap.set('iva 0%', t.id);
    }

    // Obtener categorías de la organización para mapear por nombre (y slug)
    // Se indexa con normalizeName() para matching tolerante a acentos/espacios/mayúsculas
    const { data: orgCategories } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('organization_id', orgId);

    const categoryMap = new Map<string, number>();
    for (const c of orgCategories || []) {
      const key = normalizeName(c.name);
      if (key) categoryMap.set(key, c.id);
      const slugKey = normalizeName(c.slug);
      if (slugKey && !categoryMap.has(slugKey)) categoryMap.set(slugKey, c.id);
    }

    // Obtener proveedores de la organización para mapear por nombre
    const { data: orgSuppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('organization_id', orgId);

    const supplierMap = new Map<string, number>();
    for (const s of orgSuppliers || []) {
      const key = normalizeName(s.name);
      if (key) supplierMap.set(key, s.id);
    }

    // Obtener etiquetas existentes de la organización
    const { data: orgTags } = await supabase
      .from('product_tags')
      .select('id, name')
      .eq('organization_id', orgId);

    const tagMap = new Map<string, number>();
    for (const t of orgTags || []) {
      tagMap.set(t.name.toLowerCase().trim(), t.id);
    }

    const updatedRows = [...previewData];
    let successCount = 0;
    let errorCount = 0;

    // Obtener productos existentes en bloque (SKU + id) para hacer upsert
    const existingProductsMap = new Map<string, number>();
    const { data: existingProducts } = await supabase
      .from('products')
      .select('id, sku')
      .eq('organization_id', orgId);
    for (const p of existingProducts || []) {
      existingProductsMap.set(p.sku, p.id);
    }

    let skippedCount = 0;

    // Ordenar filas: productos padre primero, luego variantes, luego el resto
    // Esto asegura que los productos padre existan antes de que se procesen sus variantes
    const sortedIndices = updatedRows
      .map((row, idx) => ({ row, idx }))
      .sort((a, b) => {
        const aIsParent = a.row.isParent === true ? 0 : 1;
        const bIsParent = b.row.isParent === true ? 0 : 1;
        if (aIsParent !== bIsParent) return aIsParent - bIsParent;
        const aHasParentSku = a.row.parentSku ? 1 : 0;
        const bHasParentSku = b.row.parentSku ? 1 : 0;
        return aHasParentSku - bHasParentSku;
      });

    for (let s = 0; s < sortedIndices.length; s++) {
      const { row, idx: i } = sortedIndices[s];

      try {
        const existingProductId = existingProductsMap.get(row.sku);

        // Aplicar modo de importación
        if (existingProductId && importMode === 'create_only') {
          // Modo: solo crear → omitir existentes
          updatedRows[i] = { ...row, status: 'error', error: 'SKU ya existe (modo: solo crear)' };
          skippedCount++;
          errorCount++;
          setPreviewData([...updatedRows]);
          setStats({
            total: updatedRows.length,
            success: successCount,
            errors: errorCount,
            pending: updatedRows.length - successCount - errorCount,
          });
          continue;
        }

        if (!existingProductId && importMode === 'update_only') {
          // Modo: solo actualizar → omitir nuevos
          updatedRows[i] = { ...row, status: 'error', error: 'SKU no existe (modo: solo actualizar)' };
          skippedCount++;
          errorCount++;
          setPreviewData([...updatedRows]);
          setStats({
            total: updatedRows.length,
            success: successCount,
            errors: errorCount,
            pending: updatedRows.length - successCount - errorCount,
          });
          continue;
        }

        // Mapear impuesto si existe (UUID de organization_taxes)
        let taxId: string | null = null;
        if (row.taxName) {
          const taxKey = row.taxName.toLowerCase();
          taxId = taxMap.get(taxKey) || null;
        }

        // Mapear tipo de producto: Siigo usa "Producto" o "Servicio"
        let productType = 'product';
        if (row.type) {
          const typeLower = row.type.toLowerCase();
          if (typeLower.includes('serv') || typeLower === 'servicio') {
            productType = 'service';
          }
        }

        // Mapear categoría por nombre (normalizado) con fallback por slug.
        // Si no existe → crearla automáticamente dentro de la organización.
        const rowWarnings: string[] = [];
        let categoryId: number | null = null;
        if (row.category) {
          const catKey = normalizeName(row.category);
          if (catKey) {
            categoryId = categoryMap.get(catKey) || null;
            // Si no se encontró, crear la categoría automáticamente
            if (!categoryId) {
              const newSlug = slugify(row.category);
              const { data: newCat, error: catErr } = await supabase
                .from('categories')
                .insert({
                  organization_id: orgId,
                  name: row.category.trim(),
                  slug: newSlug,
                })
                .select('id')
                .single();
              if (catErr) {
                // Posible conflicto de slug duplicado: reintentar con sufijo
                const { data: newCat2, error: catErr2 } = await supabase
                  .from('categories')
                  .insert({
                    organization_id: orgId,
                    name: row.category.trim(),
                    slug: `${newSlug}-${Date.now()}`,
                  })
                  .select('id')
                  .single();
                if (!catErr2 && newCat2) {
                  categoryId = newCat2.id;
                  categoryMap.set(catKey, newCat2.id);
                } else {
                  rowWarnings.push(`No se pudo crear la categoría "${row.category}"`);
                }
              } else if (newCat) {
                categoryId = newCat.id;
                categoryMap.set(catKey, newCat.id);
                rowWarnings.push(`Categoría "${row.category}" creada automáticamente`);
              }
            }
          }
        }

        // Mapear proveedor(es) por nombre (normalizado).
        // Soporta múltiples proveedores separados por ';'.
        // Si no existe → crearlo automáticamente dentro de la organización.
        const supplierIds: number[] = [];
        if (row.supplier) {
          const supplierNames = row.supplier.split(';').map(s => s.trim()).filter(Boolean);
          for (const supName of supplierNames) {
            const supKey = normalizeName(supName);
            if (!supKey) continue;
            let sid = supplierMap.get(supKey) || null;
            if (!sid) {
              const { data: newSup, error: supErr } = await supabase
                .from('suppliers')
                .insert({
                  organization_id: orgId,
                  name: supName,
                })
                .select('id')
                .single();
              if (!supErr && newSup) {
                sid = newSup.id;
                supplierMap.set(supKey, newSup.id);
                rowWarnings.push(`Proveedor "${supName}" creado automáticamente`);
              } else {
                rowWarnings.push(`No se pudo crear el proveedor "${supName}"`);
              }
            }
            if (sid) supplierIds.push(sid);
          }
        }

        // Mapear SKU del producto padre a ID
        let parentProductId: number | null = null;
        if (row.parentSku) {
          parentProductId = existingProductsMap.get(row.parentSku) || null;
          // Si no se encuentra en el mapa, intentar buscarlo en la BD
          if (!parentProductId) {
            const { data: parentProduct } = await supabase
              .from('products')
              .select('id')
              .eq('organization_id', orgId)
              .eq('sku', row.parentSku)
              .maybeSingle();
            if (parentProduct) {
              parentProductId = parentProduct.id;
              existingProductsMap.set(row.parentSku, parentProduct.id);
            }
          }
        }

        // Parsear datos de variante (JSON)
        let variantDataParsed: Record<string, any> | null = null;
        if (row.variantData) {
          try {
            variantDataParsed = JSON.parse(row.variantData);
          } catch {
            // Si no es JSON válido, intentar formato simple "color:azul,talla:M"
            const attributes: Record<string, string> = {};
            const pairs = row.variantData.split(',');
            for (const pair of pairs) {
              const [key, value] = pair.split(':').map(s => s.trim());
              if (key && value) attributes[key] = value;
            }
            if (Object.keys(attributes).length > 0) {
              variantDataParsed = attributes;
            }
          }
        }

        // Determinar track_stock
        const shouldTrackStock = row.trackStock !== undefined
          ? row.trackStock
          : (productType === 'product');

        // Determinar estado
        const productStatus = row.statusValue === 'inactive' || row.statusValue === 'inactivo' ? 'inactive' : 'active';

        let productId: number;

        // Usar upsert nativo de Supabase: INSERT si no existe, UPDATE si ya existe
        const { data: upsertedProduct, error: upsertError } = await supabase
          .from('products')
          .upsert({
            organization_id: orgId,
            sku: row.sku,
            name: row.name,
            description: row.description || null,
            category_id: categoryId,
            unit_code: mapUnitCode(row.unit),
            barcode: row.barcode || null,
            status: productStatus,
            is_parent: row.isParent ?? false,
            parent_product_id: parentProductId,
            variant_data: variantDataParsed || {},
            track_stock: shouldTrackStock,
            product_type: productType,
            brand: row.brand || null,
            reference: row.reference || null,
            station: row.station && row.station.toLowerCase() !== 'none' ? row.station : null,
          }, { onConflict: 'organization_id,sku' })
          .select()
          .single();

        if (upsertError) throw upsertError;
        if (!upsertedProduct) throw new Error('No se pudo crear ni actualizar el producto');
        productId = upsertedProduct.id;

        // Determinar si fue INSERT o UPDATE para manejar stock_levels
        const wasInsert = !existingProductId;
        if (wasInsert) {
          existingProductsMap.set(row.sku, productId);
        }

        // Insertar/actualizar relación de impuesto en product_tax_relations
        if (taxId) {
          // Verificar si ya existe la relación para no duplicar
          const { data: existingTaxRel } = await supabase
            .from('product_tax_relations')
            .select('product_id')
            .eq('product_id', productId)
            .eq('tax_id', taxId)
            .maybeSingle();

          if (!existingTaxRel) {
            await supabase.from('product_tax_relations').insert({
              product_id: productId,
              tax_id: taxId,
            });
          }
        }

        // Insertar precio si existe (solo para productos nuevos o si no hay precio vigente)
        if (row.price && row.price > 0) {
          if (wasInsert) {
            // Producto nuevo: insertar precio
            const priceData: any = {
              product_id: productId,
              price: row.price,
              effective_from: new Date().toISOString(),
            };
            if (row.comparePrice && row.comparePrice > 0) {
              priceData.compare_price = row.comparePrice;
            }
            await supabase.from('product_prices').insert(priceData);
          } else {
            // Producto existente: verificar si hay precio vigente
            const { data: existingPrice } = await supabase
              .from('product_prices')
              .select('id, price')
              .eq('product_id', productId)
              .is('effective_to', null)
              .order('effective_from', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!existingPrice) {
              const priceData: any = {
                product_id: productId,
                price: row.price,
                effective_from: new Date().toISOString(),
              };
              if (row.comparePrice && row.comparePrice > 0) {
                priceData.compare_price = row.comparePrice;
              }
              await supabase.from('product_prices').insert(priceData);
            } else if (existingPrice.price !== row.price) {
              // Precio diferente → cerrar TODOS los vigentes y crear uno nuevo
              await supabase.from('product_prices')
                .update({ effective_to: new Date().toISOString() })
                .eq('product_id', productId)
                .is('effective_to', null);
              const priceData: any = {
                product_id: productId,
                price: row.price,
                effective_from: new Date().toISOString(),
              };
              if (row.comparePrice && row.comparePrice > 0) {
                priceData.compare_price = row.comparePrice;
              }
              await supabase.from('product_prices').insert(priceData);
            }
          }
        }

        // Determinar stock: priorizar archivo de saldos, luego columna Stock del archivo principal
        const stockRow = stockMap.get(row.sku);
        const finalStock = stockRow ? stockRow.stock : (row.stock || 0);
        const finalCost = stockRow?.unitCost || row.cost;

        // Insertar costo si existe (solo si no hay costo vigente o es diferente)
        if (finalCost && finalCost > 0) {
          if (wasInsert) {
            await supabase.from('product_costs').insert({
              product_id: productId,
              cost: finalCost,
              effective_from: new Date().toISOString(),
            });
          } else {
            const { data: existingCost } = await supabase
              .from('product_costs')
              .select('id, cost')
              .eq('product_id', productId)
              .is('effective_to', null)
              .order('effective_from', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!existingCost) {
              await supabase.from('product_costs').insert({
                product_id: productId,
                cost: finalCost,
                effective_from: new Date().toISOString(),
              });
            } else if (existingCost.cost !== finalCost) {
              // Cerrar TODOS los costos vigentes (no solo uno)
              await supabase.from('product_costs')
                .update({ effective_to: new Date().toISOString() })
                .eq('product_id', productId)
                .is('effective_to', null);
              await supabase.from('product_costs').insert({
                product_id: productId,
                cost: finalCost,
                effective_from: new Date().toISOString(),
              });
            }
          }
        }

        // Insertar stock_level si hay stock (solo para productos nuevos)
        if (finalStock > 0 && wasInsert) {
          await supabase.from('stock_levels').insert({
            product_id: productId,
            branch_id: branchId,
            qty_on_hand: finalStock,
            min_level: row.minLevel || 0,
            avg_cost: finalCost || 0,
          });
        }

        // Insertar/actualizar relaciones con proveedores (productos nuevos y existentes).
        // Soporta múltiples proveedores (separados por ';' en el CSV).
        // El primer proveedor se marca como is_preferred.
        // En UPDATE se verifica existencia previa para evitar duplicados (constraint unique product_id+supplier_id).
        if (supplierIds.length > 0) {
          // En UPDATE, obtener relaciones existentes para no duplicar
          const existingSupplierIds = new Set<number>();
          if (!wasInsert) {
            const { data: existingRels } = await supabase
              .from('product_suppliers')
              .select('supplier_id')
              .eq('product_id', productId);
            for (const r of existingRels || []) {
              existingSupplierIds.add(r.supplier_id);
            }
          }
          for (let si = 0; si < supplierIds.length; si++) {
            const sid = supplierIds[si];
            if (existingSupplierIds.has(sid)) continue; // ya existe la relación
            await supabase.from('product_suppliers').insert({
              product_id: productId,
              supplier_id: sid,
              cost: finalCost || 0,
              is_preferred: si === 0, // el primero es el preferido
            });
          }
        }

        // Insertar notas (solo para productos nuevos)
        if (row.notes && wasInsert) {
          await supabase.from('product_notes').insert({
            product_id: productId,
            content: row.notes,
            organization_id: orgId,
            user_id: userId,
          });
        }

        // Procesar etiquetas (solo para productos nuevos)
        if (row.tags && wasInsert) {
          const tagNames = row.tags.split(';').map(t => t.trim()).filter(Boolean);
          for (const tagName of tagNames) {
            const tagKey = tagName.toLowerCase().trim();
            let tagId = tagMap.get(tagKey);

            // Si la etiqueta no existe, crearla
            if (!tagId) {
              const { data: newTag, error: tagError } = await supabase
                .from('product_tags')
                .insert({
                  organization_id: orgId,
                  name: tagName,
                })
                .select('id')
                .single();

              if (!tagError && newTag) {
                tagId = newTag.id;
                tagMap.set(tagKey, newTag.id);
              }
            }

            if (tagId) {
              await supabase.from('product_tag_relations').insert({
                product_id: productId,
                tag_id: tagId,
              });
            }
          }
        }

        // Procesar URLs de imágenes
        if (row.imageUrls) {
          const urls = row.imageUrls.split(';').map(u => u.trim()).filter(Boolean);
          
          // Si el producto ya existia, eliminar imagenes anteriores
          if (!wasInsert) {
            const { data: existingImages } = await supabase
              .from('product_images')
              .select('id, storage_path')
              .eq('product_id', productId);
            if (existingImages && existingImages.length > 0) {
              for (const ei of existingImages) {
                if (ei.storage_path) {
                  await supabase.storage.from('product-images').remove([ei.storage_path]);
                }
              }
              await supabase.from('product_images').delete().eq('product_id', productId);
            }
          }

          for (let imgIdx = 0; imgIdx < urls.length; imgIdx++) {
            const url = urls[imgIdx];
            // Descargar la imagen y subirla al storage de Supabase
            try {
              const response = await fetch(url);
              if (!response.ok) continue;
              const blob = await response.blob();
              const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
              const fileName = `${productId}_${Date.now()}_${imgIdx}.${ext}`;
              const storagePath = `products/${orgId}/${fileName}`;

              const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(storagePath, blob);

              if (!uploadError) {
                await supabase.from('product_images').insert({
                  product_id: productId,
                  storage_path: storagePath,
                  display_order: imgIdx,
                  is_primary: imgIdx === 0,
                });
              }
            } catch {
              // Si falla la descarga de una imagen, continuar con la siguiente
            }
          }
        }

        // Procesar modificadores (solo para productos nuevos o si ya existen, limpiar y recrear)
        if (row.modifiers) {
          // Parsear formato: Grupo|modo|min|max|requerido|opcion1=precio,opcion2=precio; Grupo2|...
          const groups = row.modifiers.split(';').map(g => g.trim()).filter(Boolean);
          for (const groupStr of groups) {
            const parts = groupStr.split('|');
            if (parts.length < 2) continue;
            const groupName = parts[0].trim();
            const selectionMode = parts[1]?.trim() || 'single';
            const minSelections = parseInt(parts[2]?.trim() || '0', 10) || 0;
            const maxSelections = parts[3]?.trim() ? parseInt(parts[3].trim(), 10) : null;
            const required = parts[4]?.trim().toLowerCase() === 'true' || parts[4]?.trim().toLowerCase() === 'si';
            const optionsStr = parts.slice(5).join('|').trim();
            const options = optionsStr.split(',').map(o => o.trim()).filter(Boolean);

            if (!groupName || options.length === 0) continue;

            // Si el producto ya existia, eliminar grupos anteriores con sus modificadores
            if (!wasInsert) {
              const { data: existingGroups } = await supabase
                .from('product_modifier_groups')
                .select('id')
                .eq('product_id', productId);
              if (existingGroups && existingGroups.length > 0) {
                for (const eg of existingGroups) {
                  await supabase.from('product_modifiers').delete().eq('group_id', eg.id);
                }
                await supabase.from('product_modifier_groups').delete().in('id', existingGroups.map(g => g.id));
              }
            }

            // Crear grupo de modificador
            const { data: modGroup, error: modGroupError } = await supabase
              .from('product_modifier_groups')
              .insert({
                organization_id: orgId,
                product_id: productId,
                name: groupName,
                selection_mode: selectionMode,
                min_selections: minSelections,
                max_selections: maxSelections,
                required,
                display_order: 0,
              })
              .select('id')
              .single();

            if (modGroupError || !modGroup) continue;

            // Crear opciones del modificador
            for (let optIdx = 0; optIdx < options.length; optIdx++) {
              const optStr = options[optIdx];
              const eqIdx = optStr.indexOf('=');
              let optName = optStr;
              let optPrice = 0;
              if (eqIdx !== -1) {
                optName = optStr.substring(0, eqIdx).trim();
                optPrice = parseFloat(optStr.substring(eqIdx + 1).trim()) || 0;
              }
              if (!optName) continue;

              await supabase.from('product_modifiers').insert({
                group_id: modGroup.id,
                name: optName,
                extra_price: optPrice,
                is_active: true,
                display_order: optIdx,
              });
            }
          }
        }

        updatedRows[i] = { ...row, status: 'success', warnings: rowWarnings.length > 0 ? rowWarnings : undefined };
        successCount++;
      } catch (error: any) {
        updatedRows[i] = { 
          ...row, 
          status: 'error', 
          error: error.message || 'Error desconocido' 
        };
        errorCount++;
      }

      setPreviewData([...updatedRows]);
      setStats({
        total: updatedRows.length,
        success: successCount,
        errors: errorCount,
        pending: updatedRows.length - successCount - errorCount,
      });
    }

    setImporting(false);
    setStep('complete');

    toast({
      title: 'Importación completada',
      description: `${successCount} productos importados, ${errorCount} errores${skippedCount > 0 ? `, ${skippedCount} omitidos` : ''}`,
    });
  };

  const exportProducts = async () => {
    if (!organization?.id) {
      toast({ title: 'Error', description: 'No hay organización seleccionada', variant: 'destructive' });
      return;
    }

    setIsExporting(true);
    try {
      const orgId = organization.id;
      const headers = ['SKU', 'Nombre', 'Tipo', 'Descripción', 'Categoría', 'Unidad', 'Código de Barras', 'Marca', 'Referencia', 'Proveedor', 'Precio de Venta', 'Precio de Comparación', 'Costo', 'Impuesto', 'Rastrear Inventario', 'Stock Total', 'Stock Mínimo', 'Etiquetas', 'Notas', 'URLs de Imágenes', 'SKU Padre', 'Datos de Variante', 'Es Producto Padre', 'Estación', 'Modificadores', 'Estado'];

      // Paginar para traer todos los productos
      const PAGE_SIZE = 1000;
      let allProducts: any[] = [];

      for (let page = 0; ; page++) {
        const desde = page * PAGE_SIZE;
        const hasta = desde + PAGE_SIZE - 1;
        const { data: pageData, error } = await supabase
          .from('products')
          .select(`
            *,
            categories(id, name),
            parent:products!parent_product_id(sku),
            product_prices(id, price, compare_price, effective_from, effective_to),
            product_costs(id, cost, effective_from, effective_to),
            stock_levels(branch_id, qty_on_hand, qty_reserved),
            product_images(id, storage_path, is_primary),
            product_suppliers(suppliers(id, name)),
            product_modifier_groups(id, name, selection_mode, min_selections, max_selections, required, display_order, product_modifiers(id, name, extra_price, is_active, display_order))
          `)
          .eq('organization_id', orgId)
          .range(desde, hasta)
          .order('id', { ascending: true });

        if (error) throw error;
        if (!pageData || pageData.length === 0) break;
        allProducts = allProducts.concat(pageData);
        if (pageData.length < PAGE_SIZE) break;
      }

      if (allProducts.length === 0) {
        toast({ title: 'Sin productos', description: 'No hay productos para exportar' });
        setIsExporting(false);
        return;
      }

      const escapeCsv = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = allProducts.map((p: any) => {
        // Precio vigente
        let price = '';
        let comparePrice = '';
        if (p.product_prices && p.product_prices.length > 0) {
          const valid = p.product_prices
            .filter((pp: any) => !pp.effective_to || new Date(pp.effective_to) > new Date())
            .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
          if (valid.length > 0) {
            price = valid[0].price ?? '';
            comparePrice = valid[0].compare_price ?? '';
          }
        }

        // Costo vigente
        let cost = '';
        if (p.product_costs && p.product_costs.length > 0) {
          const validCosts = p.product_costs
            .filter((pc: any) => !pc.effective_to || new Date(pc.effective_to) > new Date())
            .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
          if (validCosts.length > 0) {
            cost = validCosts[0].cost ?? '';
          }
        }

        // Stock total
        let stockTotal = '0';
        if (p.track_stock !== false && p.stock_levels && p.stock_levels.length > 0) {
          stockTotal = String(p.stock_levels.reduce((sum: number, sl: any) => sum + (sl.qty_on_hand || 0) - (sl.qty_reserved || 0), 0));
        }

        // Imágenes - exportar URLs públicas completas
        let imageUrls = '';
        if (p.product_images && p.product_images.length > 0) {
          imageUrls = p.product_images.map((img: any) => {
            const path = img.storage_path || '';
            if (!path) return '';
            const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
            return urlData?.publicUrl || '';
          }).filter(Boolean).join(';');
        }

        // Proveedor
        let supplier = '';
        if (p.product_suppliers && p.product_suppliers.length > 0) {
          supplier = p.product_suppliers.map((ps: any) => ps.suppliers?.name || '').filter(Boolean).join(';');
        }

        // Etiquetas
        let tags = '';
        if (p.tags && Array.isArray(p.tags)) {
          tags = p.tags.join(';');
        }

        // Datos de variante
        let variantData = '';
        if (p.variant_data) {
          variantData = typeof p.variant_data === 'string' ? p.variant_data : JSON.stringify(p.variant_data);
        }

        // SKU padre
        let parentSku = '';
        if (p.parent && p.parent.sku) {
          parentSku = p.parent.sku;
        }

        // Modificadores
        let modifiersStr = '';
        if (p.product_modifier_groups && p.product_modifier_groups.length > 0) {
          const groups = p.product_modifier_groups.map((mg: any) => {
            const opts = (mg.product_modifiers || [])
              .filter((m: any) => m.is_active)
              .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
              .map((m: any) => `${m.name}=${m.extra_price ?? 0}`);
            return `${mg.name}|${mg.selection_mode || 'single'}|${mg.min_selections ?? 0}|${mg.max_selections ?? ''}|${mg.required ? 'true' : 'false'}|${opts.join(',')}`;
          });
          modifiersStr = groups.join('; ');
        }

        return [
          escapeCsv(p.sku),
          escapeCsv(p.name),
          escapeCsv(p.type || 'Producto'),
          escapeCsv(p.description),
          escapeCsv(p.categories?.name),
          escapeCsv(p.unit_code || 'UND'),
          escapeCsv(p.barcode),
          escapeCsv(p.brand),
          escapeCsv(p.reference),
          escapeCsv(supplier),
          escapeCsv(price),
          escapeCsv(comparePrice),
          escapeCsv(cost),
          escapeCsv(p.tax_name || ''),
          escapeCsv(p.track_stock !== false ? 'true' : 'false'),
          escapeCsv(stockTotal),
          escapeCsv(p.min_stock_level ?? '0'),
          escapeCsv(tags),
          escapeCsv(p.notes),
          escapeCsv(imageUrls),
          escapeCsv(parentSku),
          escapeCsv(variantData),
          escapeCsv(p.is_parent ? 'true' : 'false'),
          escapeCsv(p.station || 'none'),
          escapeCsv(modifiersStr),
          escapeCsv(p.status || 'active'),
        ].join(',');
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `export_productos_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();

      toast({ title: 'Exportación completada', description: `${allProducts.length} productos exportados` });
    } catch (error: any) {
      console.error('Error exportando productos:', error);
      toast({ title: 'Error', description: error.message || 'Error al exportar productos', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = 'SKU,Nombre,Tipo,Descripción,Categoría,Unidad,Código de Barras,Marca,Referencia,Proveedor,Precio de Venta,Precio de Comparación,Costo,Impuesto,Rastrear Inventario,Stock Total,Stock Mínimo,Etiquetas,Notas,URLs de Imágenes,SKU Padre,Datos de Variante,Es Producto Padre,Estación,Modificadores,Estado';

    const example1 = 'PROD-001,Camiseta Polo,Producto,Camiseta de algodón premium,Ropa,UND,7501234567890,Nike,REF-001,Distribuidor SA,100.00,150.00,50.00,IVA 19%,true,0,5,nuevo;oferta,Producto de temporada,,,true,none,,active';
    const example2 = 'PROD-001-AZUL-M,Camiseta Polo Azul M,Producto,,Ropa,UND,,Nike,REF-001,,120.00,,60.00,IVA 19%,true,50,5,,,,PROD-001,"{""color"":""azul"",""talla"":""M""}",false,none,,active';
    const example3 = 'PROD-001-ROJO-L,Camiseta Polo Rojo L,Producto,,Ropa,UND,,Nike,REF-001,,120.00,,60.00,IVA 19%,true,30,5,,,,PROD-001,"{""color"":""rojo"",""talla"":""L""}",false,none,,active';
    const example4 = 'SERV-001,Instalación Profesional,Servicio,Servicio de instalación a domicilio,,SV,,,,,,,,,IVA 19%,false,0,0,,,,,,,false,none,,active';
    const example5 = 'PROD-002,Café Premium 500g,Producto,Café 100% arábica,Bebidas,GR,7701234567890,Café del Valle,CAFE-500,Distribuidor Café,35.00,45.00,20.00,IVA 5%,true,100,10,orgánico;premium,Café de origen,,https://ejemplo.com/cafe1.jpg;https://ejemplo.com/cafe2.jpg,,false,kitchen,Tamaños|single|1|1|true|Pequeño=0,Mediano=5,Grande=10; Leche|multiple|0|2|false|Entera=0,Deslactosada=0,Almendras=1,active';

    const csvContent = `${headers}\n${example1}\n${example2}\n${example3}\n${example4}\n${example5}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_productos.csv';
    link.click();
  };

  const resetImport = () => {
    setFile(null);
    setStockFile(null);
    setStockData([]);
    setPreviewData([]);
    setStats({ total: 0, success: 0, errors: 0, pending: 0 });
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (stockFileRef.current) {
      stockFileRef.current.value = '';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/app/inventario/productos">
              <Button variant="ghost" size="sm" className="text-gray-600 dark:text-gray-400">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a productos
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" />
            Importar Productos
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Carga masiva de productos desde archivo CSV o Excel
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={exportProducts} disabled={isExporting}>
            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {isExporting ? 'Exportando...' : 'Exportar Productos'}
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Descargar Plantilla
          </Button>
        </div>
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-6">
          {/* Archivo principal: Gestión de productos */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                Archivo de Productos
              </CardTitle>
              <CardDescription>
                Selecciona el archivo XLSX/CSV de "Gestión de productos y servicios" (Siigo)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {file ? file.name : 'Arrastra un archivo aquí o haz clic para seleccionar'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Formatos soportados: CSV, XLS, XLSX
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">
                  Columnas soportadas:
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                  <li>• <strong>SKU</strong> - Código único del producto (requerido)</li>
                  <li>• <strong>Nombre</strong> - Nombre del producto (requerido)</li>
                  <li>• <strong>Tipo</strong> - Producto o Servicio</li>
                  <li>• <strong>Descripción</strong> - Descripción del producto</li>
                  <li>• <strong>Categoría</strong> - Nombre de la categoría</li>
                  <li>• <strong>Unidad</strong> - Unidad de medida (UND, KG, LT, etc.)</li>
                  <li>• <strong>Código de Barras</strong> - EAN/UPC</li>
                  <li>• <strong>Marca</strong> - Marca del producto</li>
                  <li>• <strong>Referencia</strong> - Referencia del proveedor</li>
                  <li>• <strong>Proveedor</strong> - Nombre del proveedor</li>
                  <li>• <strong>Precio de Venta</strong> - Precio actual</li>
                  <li>• <strong>Precio de Comparación</strong> - Precio anterior (para descuentos)</li>
                  <li>• <strong>Costo</strong> - Costo de adquisición</li>
                  <li>• <strong>Impuesto</strong> - Ej: "IVA 19%"</li>
                  <li>• <strong>Rastrear Inventario</strong> - true/false</li>
                  <li>• <strong>Stock Total</strong> - Cantidad para sucursal principal</li>
                  <li>• <strong>Stock Mínimo</strong> - Nivel mínimo de stock</li>
                  <li>• <strong>Etiquetas</strong> - Separadas por punto y coma (;)</li>
                  <li>• <strong>Notas</strong> - Notas internas del producto</li>
                  <li>• <strong>URLs de Imágenes</strong> - Separadas por punto y coma (;)</li>
                  <li>• <strong>SKU Padre</strong> - SKU del producto padre (para variantes)</li>
                  <li>• <strong>Datos de Variante</strong> - JSON o formato "color:azul,talla:M"</li>
                  <li>• <strong>Es Producto Padre</strong> - true/false</li>
                  <li>• <strong>Estación</strong> - kitchen, bar, none</li>
                  <li>• <strong>Modificadores</strong> - Formato: Grupo|modo|min|max|requerido|opcion1=precio,opcion2=precio; Grupo2|... (separar grupos con ;)</li>
                  <li>• <strong>Estado</strong> - active/inactive</li>
                </ul>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  Compatible con archivos de Siigo ("Gestión de productos y servicios") y
                  formato Space (Producto, Categoría, P. Venta, Descuento, Promoción 2x).
                  El formato Space autogenera SKUs, detecta tamaños (Pequeño/Mediano/Grande/Extragrande)
                  como variantes, y marca la promo 2x1 en notas para configurar después
                  en /app/pos/promociones (tipo buy_x_get_y).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Archivo opcional: Saldos de inventario */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
                <Package className="h-5 w-5 text-green-600" />
                Archivo de Saldos de Inventario (Opcional)
              </CardTitle>
              <CardDescription>
                Selecciona el archivo XLSX de "Saldos de inventario" para importar cantidades y costos reales
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-green-500 dark:hover:border-green-400 transition-colors cursor-pointer"
                onClick={() => stockFileRef.current?.click()}
              >
                <Package className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                <p className="text-base font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {stockFile ? stockFile.name : 'Seleccionar archivo de saldos'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {stockData.length > 0 ? `${stockData.length} registros cargados` : 'Opcional - mejora la precisión del inventario'}
                </p>
                <input
                  ref={stockFileRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleStockFileSelect}
                  className="hidden"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Preview */}
      {(step === 'preview' || step === 'importing' || step === 'complete') && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total filas</p>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{stats.success}</div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Importados</p>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Errores</p>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Pendientes</p>
              </CardContent>
            </Card>
          </div>

          {/* Preview Table */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-gray-900 dark:text-white">
                  {file?.name}
                </CardTitle>
                <CardDescription>
                  {step === 'preview' && 'Revisa los datos antes de importar'}
                  {step === 'importing' && 'Importando productos...'}
                  {step === 'complete' && 'Importación completada'}
                </CardDescription>
              </div>
              {step !== 'importing' && (
                <Button variant="ghost" size="sm" onClick={resetImport}>
                  <X className="h-4 w-4 mr-2" />
                  Cancelar
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Costo</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Track Stock</TableHead>
                      <TableHead>Imp.</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Ref.</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Etiquetas</TableHead>
                      <TableHead>Es Padre</TableHead>
                      <TableHead>Variante de</TableHead>
                      <TableHead>Modificadores</TableHead>
                      <TableHead className="w-24">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(0, 100).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.row}</TableCell>
                        <TableCell className="font-mono text-sm">{row.sku}</TableCell>
                        <TableCell className="max-w-[200px] break-words whitespace-normal" title={row.name}>{row.name}</TableCell>
                        <TableCell>{row.type || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500">{row.category || '-'}</TableCell>
                        <TableCell>{row.price ? `$${row.price.toLocaleString('es-CO')}` : '-'}</TableCell>
                        <TableCell>{row.cost ? `$${row.cost.toLocaleString('es-CO')}` : '-'}</TableCell>
                        <TableCell>{row.stock || 0}</TableCell>
                        <TableCell className="text-sm">
                          {row.trackStock === true ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">Sí</Badge>
                          ) : row.trackStock === false ? (
                            <span className="text-gray-400">No</span>
                          ) : (
                            <span className="text-gray-400">Auto</span>
                          )}
                        </TableCell>
                        <TableCell>{row.taxName || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500">{row.brand || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500">{row.reference || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500">{row.supplier || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500 max-w-[120px] truncate" title={row.tags}>{row.tags || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {row.isParent ? (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Sí</Badge>
                          ) : row.isParent === false ? (
                            <span className="text-gray-400">No</span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 font-mono">{row.parentSku || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500 max-w-[200px] truncate" title={row.modifiers}>{row.modifiers || '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {row.status === 'pending' && (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                Pendiente
                              </Badge>
                            )}
                            {row.status === 'success' && (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                OK
                              </Badge>
                            )}
                            {row.status === 'error' && (
                              <Badge variant="destructive" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Error
                              </Badge>
                            )}
                            {row.warnings && row.warnings.length > 0 && (
                              <span className="text-xs text-amber-600 dark:text-amber-400" title={row.warnings.join('\n')}>
                                <FileWarning className="h-3 w-3 inline mr-1" />
                                {row.warnings.length} aviso{row.warnings.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {previewData.length > 100 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
                  Mostrando 100 de {previewData.length} filas
                </p>
              )}
            </CardContent>
          </Card>

          {/* Import Mode Selector */}
          {step === 'preview' && (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Modo de importación:
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setImportMode('create_and_update')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        importMode === 'create_and_update'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      Crear y actualizar
                    </button>
                    <button
                      onClick={() => setImportMode('create_only')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        importMode === 'create_only'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      Solo crear nuevos
                    </button>
                    <button
                      onClick={() => setImportMode('update_only')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        importMode === 'update_only'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      Solo actualizar existentes
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {importMode === 'create_and_update' && 'Los productos nuevos se crearán y los existentes se actualizarán.'}
                  {importMode === 'create_only' && 'Solo se crearán productos con SKU nuevo. Los existentes se omitirán.'}
                  {importMode === 'update_only' && 'Solo se actualizarán productos que ya existan. Los nuevos se omitirán.'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            {step === 'preview' && (
              <>
                <Button variant="outline" onClick={resetImport}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleImport}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Importar {stats.total} Productos
                </Button>
              </>
            )}
            {step === 'importing' && (
              <Button disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </Button>
            )}
            {step === 'complete' && (
              <>
                <Button variant="outline" onClick={resetImport}>
                  Importar Otro Archivo
                </Button>
                <Link href="/app/inventario/productos">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                    Ver Productos
                  </Button>
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
