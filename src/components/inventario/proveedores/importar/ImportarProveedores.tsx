'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService, type SupplierInput } from '@/lib/services/supplierService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Upload, 
  Loader2, 
  FileSpreadsheet,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileUp
} from 'lucide-react';
import Link from 'next/link';

interface ParsedSupplier extends SupplierInput {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
}

export function ImportarProveedores() {
  const router = useRouter();
  const { theme } = useTheme();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedSupplier[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; errors: { row: number; error: string }[] } | null>(null);

  // Descargar plantilla
  const handleDownloadTemplate = () => {
    const headers = ['Nombre', 'NIT', 'Contacto', 'Telefono', 'Email', 'Notas'];
    const exampleRow = ['Proveedor Ejemplo S.A.S', '900123456-7', 'Juan Pérez', '3001234567', 'proveedor@ejemplo.com', 'Notas adicionales'];
    
    const csvContent = [
      headers.join(','),
      exampleRow.map(cell => `"${cell}"`).join(',')
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_proveedores.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Procesar archivo CSV
  const parseCSV = (text: string): ParsedSupplier[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const results: ParsedSupplier[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
      const cleanValues = values.map(v => v.replace(/^"|"$/g, '').trim());

      const supplier: ParsedSupplier = {
        rowNumber: i + 1,
        name: cleanValues[0] || '',
        nit: cleanValues[1] || '',
        contact: cleanValues[2] || '',
        phone: cleanValues[3] || '',
        email: cleanValues[4] || '',
        notes: cleanValues[5] || '',
        isValid: true,
        errors: []
      };

      // Validaciones
      if (!supplier.name) {
        supplier.isValid = false;
        supplier.errors.push('Nombre es requerido');
      }

      if (supplier.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email)) {
        supplier.isValid = false;
        supplier.errors.push('Email inválido');
      }

      results.push(supplier);
    }

    return results;
  };

  // Manejar selección de archivo
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast({
        variant: 'destructive',
        title: 'Archivo inválido',
        description: 'Por favor selecciona un archivo CSV'
      });
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);
    setImportResults(null);

    try {
      const text = await selectedFile.text();
      const data = parseCSV(text);
      setParsedData(data);

      if (data.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Archivo vacío',
          description: 'El archivo no contiene datos para importar'
        });
      }
    } catch (error) {
      console.error('Error procesando archivo:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo procesar el archivo'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Importar proveedores
  const handleImport = async () => {
    const validSuppliers = parsedData.filter(s => s.isValid);
    
    if (validSuppliers.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sin datos válidos',
        description: 'No hay proveedores válidos para importar'
      });
      return;
    }

    try {
      setIsImporting(true);
      const organizationId = getOrganizationId();

      const suppliersToImport: SupplierInput[] = validSuppliers.map(s => ({
        name: s.name,
        nit: s.nit,
        contact: s.contact,
        phone: s.phone,
        email: s.email,
        notes: s.notes
      }));

      const results = await supplierService.importSuppliers(organizationId, suppliersToImport);
      setImportResults(results);

      if (results.success > 0) {
        toast({
          title: 'Importación completada',
          description: `${results.success} proveedores importados correctamente`
        });
      }

      if (results.errors.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Errores en la importación',
          description: `${results.errors.length} proveedores no pudieron ser importados`
        });
      }
    } catch (error: any) {
      console.error('Error importando proveedores:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo completar la importación'
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Limpiar y reiniciar
  const handleReset = () => {
    setFile(null);
    setParsedData([]);
    setImportResults(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validCount = parsedData.filter(s => s.isValid).length;
  const invalidCount = parsedData.filter(s => !s.isValid).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/app/inventario/proveedores">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Importar Proveedores
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Importa proveedores masivamente desde un archivo CSV
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Área principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Selector de archivo */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                Seleccionar Archivo
              </CardTitle>
              <CardDescription className="dark:text-gray-400">
                Sube un archivo CSV con los proveedores a importar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  file 
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-500'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="csv-upload"
                />
                
                {file ? (
                  <div className="space-y-2">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                    <p className="font-medium dark:text-white">{file.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {parsedData.length} registros encontrados
                    </p>
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      Seleccionar otro archivo
                    </Button>
                  </div>
                ) : (
                  <label htmlFor="csv-upload" className="cursor-pointer">
                    <FileUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="font-medium dark:text-white mb-2">
                      Arrastra un archivo o haz clic para seleccionar
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Solo archivos CSV
                    </p>
                  </label>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Vista previa de datos */}
          {parsedData.length > 0 && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white">
                  Vista Previa ({parsedData.length} registros)
                </CardTitle>
                <div className="flex gap-2 mt-2">
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {validCount} válidos
                  </Badge>
                  {invalidCount > 0 && (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                      <XCircle className="h-3 w-3 mr-1" />
                      {invalidCount} con errores
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow className="dark:border-gray-700">
                        <TableHead className="w-16 dark:text-gray-300">Fila</TableHead>
                        <TableHead className="dark:text-gray-300">Nombre</TableHead>
                        <TableHead className="dark:text-gray-300">NIT</TableHead>
                        <TableHead className="dark:text-gray-300">Contacto</TableHead>
                        <TableHead className="dark:text-gray-300">Teléfono</TableHead>
                        <TableHead className="dark:text-gray-300">Email</TableHead>
                        <TableHead className="dark:text-gray-300">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.map((supplier) => (
                        <TableRow 
                          key={supplier.rowNumber} 
                          className={`dark:border-gray-700 ${!supplier.isValid ? 'bg-red-50 dark:bg-red-900/10' : ''}`}
                        >
                          <TableCell className="font-medium dark:text-white">
                            {supplier.rowNumber}
                          </TableCell>
                          <TableCell className="dark:text-white">{supplier.name || '-'}</TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">{supplier.nit || '-'}</TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">{supplier.contact || '-'}</TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">{supplier.phone || '-'}</TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">{supplier.email || '-'}</TableCell>
                          <TableCell>
                            {supplier.isValid ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Válido
                              </Badge>
                            ) : (
                              <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                <XCircle className="h-3 w-3 mr-1" />
                                {supplier.errors.join(', ')}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resultados de importación */}
          {importResults && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white">
                  Resultados de Importación
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">{importResults.success} importados correctamente</span>
                    </div>
                    {importResults.errors.length > 0 && (
                      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                        <XCircle className="h-5 w-5" />
                        <span className="font-medium">{importResults.errors.length} con errores</span>
                      </div>
                    )}
                  </div>

                  {importResults.errors.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Errores:</p>
                      <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                        {importResults.errors.map((err, idx) => (
                          <li key={idx}>Fila {err.row}: {err.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Panel lateral */}
        <div className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="outline"
                className="w-full dark:border-gray-700"
                onClick={handleDownloadTemplate}
              >
                <Download className="h-4 w-4 mr-2" />
                Descargar Plantilla
              </Button>

              {parsedData.length > 0 && validCount > 0 && !importResults && (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleImport}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Importar {validCount} Proveedores
                </Button>
              )}

              {importResults && importResults.success > 0 && (
                <Link href="/app/inventario/proveedores" className="block">
                  <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Ver Proveedores
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Instrucciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
                <li>Descarga la plantilla CSV</li>
                <li>Llena los datos de proveedores</li>
                <li>El campo "Nombre" es obligatorio</li>
                <li>Guarda el archivo en formato CSV</li>
                <li>Sube el archivo y verifica la vista previa</li>
                <li>Haz clic en "Importar" para confirmar</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ImportarProveedores;
