'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2,
  Loader2,
  X,
  FileWarning
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
  category?: string;
  unit?: string;
  barcode?: string;
  description?: string;
  price?: number;
  cost?: number;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

interface ImportStats {
  total: number;
  success: number;
  errors: number;
  pending: number;
}

export default function ImportarProductosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState<ImportRow[]>([]);
  const [stats, setStats] = useState<ImportStats>({ total: 0, success: 0, errors: 0, pending: 0 });
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv')) {
      toast({
        title: 'Formato no válido',
        description: 'Por favor seleccione un archivo CSV o Excel',
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);
    parseFile(selectedFile);
  };

  const parseFile = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast({
          title: 'Archivo vacío',
          description: 'El archivo no contiene datos para importar',
          variant: 'destructive',
        });
        return;
      }

      // Parse header
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const skuIndex = headers.findIndex(h => h === 'sku' || h === 'código' || h === 'codigo');
      const nameIndex = headers.findIndex(h => h === 'name' || h === 'nombre' || h === 'producto');
      const categoryIndex = headers.findIndex(h => h === 'category' || h === 'categoría' || h === 'categoria');
      const unitIndex = headers.findIndex(h => h === 'unit' || h === 'unidad');
      const barcodeIndex = headers.findIndex(h => h === 'barcode' || h === 'código de barras' || h === 'codigo_barras');
      const descriptionIndex = headers.findIndex(h => h === 'description' || h === 'descripción' || h === 'descripcion');
      const priceIndex = headers.findIndex(h => h === 'price' || h === 'precio');
      const costIndex = headers.findIndex(h => h === 'cost' || h === 'costo');

      if (skuIndex === -1 || nameIndex === -1) {
        toast({
          title: 'Columnas requeridas',
          description: 'El archivo debe contener las columnas SKU y Nombre',
          variant: 'destructive',
        });
        return;
      }

      // Parse data rows
      const rows: ImportRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        
        if (!values[skuIndex] || !values[nameIndex]) continue;

        rows.push({
          row: i + 1,
          sku: values[skuIndex],
          name: values[nameIndex],
          category: categoryIndex !== -1 ? values[categoryIndex] : undefined,
          unit: unitIndex !== -1 ? values[unitIndex] : undefined,
          barcode: barcodeIndex !== -1 ? values[barcodeIndex] : undefined,
          description: descriptionIndex !== -1 ? values[descriptionIndex] : undefined,
          price: priceIndex !== -1 ? parseFloat(values[priceIndex]) || undefined : undefined,
          cost: costIndex !== -1 ? parseFloat(values[costIndex]) || undefined : undefined,
          status: 'pending',
        });
      }

      setPreviewData(rows);
      setStats({ total: rows.length, success: 0, errors: 0, pending: rows.length });
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

  const handleImport = async () => {
    if (!organization?.id || previewData.length === 0) return;

    setImporting(true);
    setStep('importing');

    const updatedRows = [...previewData];
    let successCount = 0;
    let errorCount = 0;

    // Get existing categories for lookup
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('organization_id', organization.id);

    const categoryMap = new Map(categories?.map(c => [c.name.toLowerCase(), c.id]) || []);

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];

      try {
        // Check if SKU already exists
        const { data: existingProduct } = await supabase
          .from('products')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('sku', row.sku)
          .single();

        if (existingProduct) {
          throw new Error('El SKU ya existe');
        }

        // Get category ID if specified
        let categoryId = null;
        if (row.category) {
          categoryId = categoryMap.get(row.category.toLowerCase()) || null;
        }

        // Insert product
        const { data: newProduct, error: insertError } = await supabase
          .from('products')
          .insert({
            organization_id: organization.id,
            sku: row.sku,
            name: row.name,
            category_id: categoryId,
            unit_code: row.unit || 'UND',
            barcode: row.barcode || null,
            description: row.description || null,
            status: 'active',
            is_parent: false,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Insert price if specified
        if (row.price && newProduct) {
          await supabase.from('product_prices').insert({
            product_id: newProduct.id,
            price: row.price,
            effective_from: new Date().toISOString(),
          });
        }

        // Insert cost if specified
        if (row.cost && newProduct) {
          await supabase.from('product_costs').insert({
            product_id: newProduct.id,
            cost: row.cost,
            effective_from: new Date().toISOString(),
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
      description: `${successCount} productos importados, ${errorCount} errores`,
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
    setPreviewData([]);
    setStats({ total: 0, success: 0, errors: 0, pending: 0 });
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Seleccionar Archivo</CardTitle>
            <CardDescription>
              Selecciona un archivo CSV o Excel con los productos a importar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                Arrastra un archivo aquí o haz clic para seleccionar
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
                Columnas requeridas:
              </h4>
              <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                <li>• <strong>SKU</strong> - Código único del producto</li>
                <li>• <strong>Nombre</strong> - Nombre del producto</li>
              </ul>
              <h4 className="font-medium text-blue-800 dark:text-blue-300 mt-3 mb-2">
                Columnas opcionales:
              </h4>
              <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                <li>• Categoría, Unidad, Código de Barras, Descripción, Precio, Costo</li>
              </ul>
            </div>
          </CardContent>
        </Card>
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
                      <TableHead>Categoría</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Costo</TableHead>
                      <TableHead className="w-24">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.slice(0, 100).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row.row}</TableCell>
                        <TableCell className="font-mono text-sm">{row.sku}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.category || '-'}</TableCell>
                        <TableCell>{row.price ? `$${row.price.toFixed(2)}` : '-'}</TableCell>
                        <TableCell>{row.cost ? `$${row.cost.toFixed(2)}` : '-'}</TableCell>
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
