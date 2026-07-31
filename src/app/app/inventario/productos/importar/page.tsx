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
  cost?: number;
  stock?: number;
  taxName?: string;
  brand?: string;
  reference?: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
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

      // Buscar fila de encabezados (contiene "Código" o "Tipo")
      let headerRow = -1;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (row && row.some(cell => String(cell || '').toLowerCase().includes('código') || String(cell || '').toLowerCase().includes('codigo'))) {
          headerRow = i;
          break;
        }
      }

      if (headerRow === -1) {
        toast({
          title: 'Estructura no reconocida',
          description: 'No se encontró la fila de encabezados con "Código"',
          variant: 'destructive',
        });
        return;
      }

      const headers = rawData[headerRow].map((h: any) => String(h || '').toLowerCase().trim());
      const typeIdx = headers.findIndex((h: string) => h === 'tipo' || h === 'type');
      const codeIdx = headers.findIndex((h: string) => h === 'código' || h === 'codigo' || h === 'sku');
      const nameIdx = headers.findIndex((h: string) => h === 'nombre' || h === 'name' || h === 'producto');
      const unitIdx = headers.findIndex((h: string) => h === 'unidad' || h === 'unit' || h === 'unidad de medida');
      const priceIdx = headers.findIndex((h: string) => h === 'precios' || h === 'precio' || h === 'price');
      const taxIdx = headers.findIndex((h: string) => h === 'impuestos' || h === 'impuesto' || h === 'tax');
      const stockIdx = headers.findIndex((h: string) => h === 'stock' || h === 'cantidad' || h === 'inventario');
      const stateIdx = headers.findIndex((h: string) => h === 'estado' || h === 'state' || h === 'status');
      const brandIdx = headers.findIndex((h: string) => h === 'marca' || h === 'brand');
      const referenceIdx = headers.findIndex((h: string) => h === 'referencia' || h === 'reference' || h === 'ref');

      if (codeIdx === -1 || nameIdx === -1) {
        toast({
          title: 'Columnas requeridas',
          description: 'El archivo debe contener las columnas "Código" y "Nombre"',
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

        rows.push({
          row: i + 1,
          sku,
          name,
          type,
          unit: unit || 'unidad',
          price,
          stock,
          taxName,
          brand: brand || undefined,
          reference: reference || undefined,
          status: 'pending',
        });
      }

      setPreviewData(rows);
      setStats({ total: rows.length, success: 0, errors: 0, pending: rows.length });
      if (duplicateCount > 0) {
        toast({
          title: 'SKUs duplicados detectados',
          description: `Se omitieron ${duplicateCount} filas con SKU duplicado. Solo se importa la primera ocurrencia de cada SKU.`,
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

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];

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

        let productId: number;

        // Usar upsert nativo de Supabase: INSERT si no existe, UPDATE si ya existe
        const { data: upsertedProduct, error: upsertError } = await supabase
          .from('products')
          .upsert({
            organization_id: orgId,
            sku: row.sku,
            name: row.name,
            unit_code: mapUnitCode(row.unit),
            status: 'active',
            is_parent: false,
            track_stock: productType === 'product',
            product_type: productType,
            brand: row.brand || null,
            reference: row.reference || null,
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
            await supabase.from('product_prices').insert({
              product_id: productId,
              price: row.price,
              effective_from: new Date().toISOString(),
            });
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
              // No hay precio vigente → insertar
              await supabase.from('product_prices').insert({
                product_id: productId,
                price: row.price,
                effective_from: new Date().toISOString(),
              });
            } else if (existingPrice.price !== row.price) {
              // Precio diferente → cerrar el anterior y crear uno nuevo
              await supabase.from('product_prices')
                .update({ effective_to: new Date().toISOString() })
                .eq('id', existingPrice.id);
              await supabase.from('product_prices').insert({
                product_id: productId,
                price: row.price,
                effective_from: new Date().toISOString(),
              });
            }
          }
        }

        // Determinar stock: priorizar archivo de saldos, luego columna Stock del archivo principal
        const stockRow = stockMap.get(row.sku);
        const finalStock = stockRow ? stockRow.stock : (row.stock || 0);
        const finalCost = stockRow?.unitCost;

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
              await supabase.from('product_costs')
                .update({ effective_to: new Date().toISOString() })
                .eq('id', existingCost.id);
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
            avg_cost: finalCost || 0,
          });
        }

        updatedRows[i] = { ...row, status: 'success' };
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

  const downloadTemplate = () => {
    const csvContent = 'SKU,Nombre,Categoría,Unidad,Código de Barras,Descripción,Precio,Costo\n' +
      'PROD-001,Producto Ejemplo,Categoría A,UND,7501234567890,Descripción del producto,100.00,50.00\n' +
      'PROD-002,Otro Producto,Categoría B,KG,,Otra descripción,200.00,80.00';
    
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
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
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

        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Descargar Plantilla
        </Button>
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
                  Columnas detectadas (Siigo):
                </h4>
                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                  <li>• <strong>Tipo</strong> - Producto o Servicio</li>
                  <li>• <strong>Código</strong> - SKU del producto (requerido)</li>
                  <li>• <strong>Nombre</strong> - Nombre del producto (requerido)</li>
                  <li>• <strong>Unidad</strong> - Unidad de medida</li>
                  <li>• <strong>Precios</strong> - Precio de venta</li>
                  <li>• <strong>Impuestos</strong> - Ej: "IVA 19%"</li>
                  <li>• <strong>Stock</strong> - Cantidad en inventario</li>
                  <li>• <strong>Estado</strong> - Active/Inactive</li>
                </ul>
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
                      <TableHead>Precio</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Imp.</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Ref.</TableHead>
                      <TableHead className="w-24">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(0, 100).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.row}</TableCell>
                        <TableCell className="font-mono text-sm">{row.sku}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={row.name}>{row.name}</TableCell>
                        <TableCell>{row.type || '-'}</TableCell>
                        <TableCell>{row.price ? `$${row.price.toLocaleString('es-CO')}` : '-'}</TableCell>
                        <TableCell>{row.stock || 0}</TableCell>
                        <TableCell>{row.taxName || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500">{row.brand || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500">{row.reference || '-'}</TableCell>
                        <TableCell>
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
