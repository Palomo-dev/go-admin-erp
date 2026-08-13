'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

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
import * as XLSX from 'xlsx';

interface ParsedSupplier extends SupplierInput {
  rowNumber: number;
  isValid: boolean;
  errors: string[];
}

export function ImportarProveedores() {
  const router = useRouter();

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
    const headers = ['Nombre', 'Tipo', 'NIT', 'Tipo Doc', 'Contacto', 'Teléfono', 'Email', 'Descripción', 'Dirección', 'Ciudad', 'Departamento', 'País', 'Código Postal', 'Tax ID', 'Régimen Tributario', 'Responsabilidades Fiscales', 'Términos de Pago', 'Días Crédito', 'Sitio Web', 'Activo', 'Rating', 'Banco', 'Cuenta Bancaria', 'Tipo Cuenta', 'Notas'];
    const exampleRow = ['Proveedor Ejemplo S.A.S', 'company', '900123456-7', 'NIT', 'Juan Pérez', '3001234567', 'proveedor@ejemplo.com', 'Distribuidor mayorista', 'Calle 123 #45-67', 'Bogotá', 'Cundinamarca', 'Colombia', '110111', '900123456-7', 'Común', 'R-99-PA;R-00-PN', '30 días', '30', 'https://ejemplo.com', 'Sí', '5', 'Banco de Bogotá', '123456789', 'Ahorros', 'Notas adicionales'];
    
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

    const headerIndex = (names: string[]): number => {
      for (const n of names) {
        const idx = headers.indexOf(n);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idxNombre = headerIndex(['nombre', 'name']);
    const idxTipo = headerIndex(['tipo', 'supplier_type', 'tipo de proveedor']);
    const idxNit = headerIndex(['nit']);
    const idxTipoDoc = headerIndex(['tipo doc', 'doc_type', 'tipo documento']);
    const idxContacto = headerIndex(['contacto', 'contact']);
    const idxTelefono = headerIndex(['teléfono', 'telefono', 'phone']);
    const idxEmail = headerIndex(['email', 'correo']);
    const idxDescripcion = headerIndex(['descripción', 'descripcion', 'description']);
    const idxDireccion = headerIndex(['dirección', 'direccion', 'address']);
    const idxCiudad = headerIndex(['ciudad', 'city']);
    const idxDepartamento = headerIndex(['departamento', 'state']);
    const idxPais = headerIndex(['país', 'pais', 'country']);
    const idxCodigoPostal = headerIndex(['código postal', 'codigo postal', 'postal_code']);
    const idxTaxId = headerIndex(['tax id', 'tax_id']);
    const idxRegimen = headerIndex(['régimen tributario', 'regimen tributario', 'tax_regime']);
    const idxRespFiscales = headerIndex(['responsabilidades fiscales', 'fiscal_responsibilities']);
    const idxTerminosPago = headerIndex(['términos de pago', 'terminos de pago', 'payment_terms']);
    const idxDiasCredito = headerIndex(['días crédito', 'dias credito', 'credit_days']);
    const idxSitioWeb = headerIndex(['sitio web', 'website']);
    const idxActivo = headerIndex(['activo', 'is_active']);
    const idxRating = headerIndex(['rating']);
    const idxBanco = headerIndex(['banco', 'bank_name']);
    const idxCuentaBancaria = headerIndex(['cuenta bancaria', 'bank_account']);
    const idxTipoCuenta = headerIndex(['tipo cuenta', 'account_type']);
    const idxNotas = headerIndex(['notas', 'notes']);

    const getVal = (values: string[], idx: number): string => idx !== -1 ? (values[idx] || '') : '';

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
      const cleanValues = values.map(v => v.replace(/^"|"$/g, '').trim());

      const supplierTypeRaw = getVal(cleanValues, idxTipo).toLowerCase();
      const supplierType = supplierTypeRaw === 'person' || supplierTypeRaw === 'company'
        ? (supplierTypeRaw as 'person' | 'company')
        : undefined;

      const creditDaysRaw = getVal(cleanValues, idxDiasCredito);
      const creditDays = creditDaysRaw ? Number(creditDaysRaw) : undefined;

      const ratingRaw = getVal(cleanValues, idxRating);
      const rating = ratingRaw ? Number(ratingRaw) : undefined;

      const activoRaw = getVal(cleanValues, idxActivo).toLowerCase();
      const isActive = activoRaw === 'sí' || activoRaw === 'si' || activoRaw === 'true' || activoRaw === '1';

      const respFiscalesRaw = getVal(cleanValues, idxRespFiscales);
      const fiscalResponsibilities = respFiscalesRaw
        ? respFiscalesRaw.split(';').map(r => r.trim()).filter(Boolean)
        : undefined;

      const supplier: ParsedSupplier = {
        rowNumber: i + 1,
        name: getVal(cleanValues, idxNombre),
        supplier_type: supplierType,
        nit: getVal(cleanValues, idxNit) || undefined,
        doc_type: getVal(cleanValues, idxTipoDoc) || undefined,
        contact: getVal(cleanValues, idxContacto) || undefined,
        phone: getVal(cleanValues, idxTelefono) || undefined,
        email: getVal(cleanValues, idxEmail) || undefined,
        description: getVal(cleanValues, idxDescripcion) || undefined,
        address: getVal(cleanValues, idxDireccion) || undefined,
        city: getVal(cleanValues, idxCiudad) || undefined,
        state: getVal(cleanValues, idxDepartamento) || undefined,
        country: getVal(cleanValues, idxPais) || undefined,
        postal_code: getVal(cleanValues, idxCodigoPostal) || undefined,
        tax_id: getVal(cleanValues, idxTaxId) || undefined,
        tax_regime: getVal(cleanValues, idxRegimen) || undefined,
        fiscal_responsibilities: fiscalResponsibilities,
        payment_terms: getVal(cleanValues, idxTerminosPago) || undefined,
        credit_days: !isNaN(creditDays as number) ? creditDays : undefined,
        website: getVal(cleanValues, idxSitioWeb) || undefined,
        bank_name: getVal(cleanValues, idxBanco) || undefined,
        bank_account: getVal(cleanValues, idxCuentaBancaria) || undefined,
        account_type: getVal(cleanValues, idxTipoCuenta) || undefined,
        notes: getVal(cleanValues, idxNotas) || undefined,
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

      if (supplier.supplier_type && supplier.supplier_type !== 'person' && supplier.supplier_type !== 'company') {
        supplier.isValid = false;
        supplier.errors.push('Tipo debe ser "person" o "company"');
      }

      if (supplier.credit_days !== undefined && supplier.credit_days !== null && isNaN(supplier.credit_days)) {
        supplier.isValid = false;
        supplier.errors.push('Días Crédito debe ser numérico');
      }

      // Marcar is_active en el objeto si viene (se omite de SupplierInput pero se usa para validación)
      void isActive;
      void rating;

      results.push(supplier);
    }

    return results;
  };

  // Procesar archivo XLSX
  const parseXLSX = (rows: Record<string, unknown>[]): ParsedSupplier[] => {
    const results: ParsedSupplier[] = [];

    const getStr = (row: Record<string, unknown>, names: string[]): string => {
      for (const n of names) {
        const key = Object.keys(row).find(k => k.toLowerCase().trim() === n);
        if (key && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
          return String(row[key]).trim();
        }
      }
      return '';
    };

    rows.forEach((row, i) => {
      const supplierTypeRaw = getStr(row, ['tipo', 'supplier_type', 'tipo de proveedor']).toLowerCase();
      const supplierType = supplierTypeRaw === 'person' || supplierTypeRaw === 'company'
        ? (supplierTypeRaw as 'person' | 'company')
        : undefined;

      const creditDaysRaw = getStr(row, ['días crédito', 'dias credito', 'credit_days']);
      const creditDays = creditDaysRaw ? Number(creditDaysRaw) : undefined;

      const respFiscalesRaw = getStr(row, ['responsabilidades fiscales', 'fiscal_responsibilities']);
      const fiscalResponsibilities = respFiscalesRaw
        ? respFiscalesRaw.split(';').map(r => r.trim()).filter(Boolean)
        : undefined;

      const supplier: ParsedSupplier = {
        rowNumber: i + 2,
        name: getStr(row, ['nombre', 'name']),
        supplier_type: supplierType,
        nit: getStr(row, ['nit']) || undefined,
        doc_type: getStr(row, ['tipo doc', 'doc_type', 'tipo documento']) || undefined,
        contact: getStr(row, ['contacto', 'contact']) || undefined,
        phone: getStr(row, ['teléfono', 'telefono', 'phone']) || undefined,
        email: getStr(row, ['email', 'correo']) || undefined,
        description: getStr(row, ['descripción', 'descripcion', 'description']) || undefined,
        address: getStr(row, ['dirección', 'direccion', 'address']) || undefined,
        city: getStr(row, ['ciudad', 'city']) || undefined,
        state: getStr(row, ['departamento', 'state']) || undefined,
        country: getStr(row, ['país', 'pais', 'country']) || undefined,
        postal_code: getStr(row, ['código postal', 'codigo postal', 'postal_code']) || undefined,
        tax_id: getStr(row, ['tax id', 'tax_id']) || undefined,
        tax_regime: getStr(row, ['régimen tributario', 'regimen tributario', 'tax_regime']) || undefined,
        fiscal_responsibilities: fiscalResponsibilities,
        payment_terms: getStr(row, ['términos de pago', 'terminos de pago', 'payment_terms']) || undefined,
        credit_days: !isNaN(creditDays as number) ? creditDays : undefined,
        website: getStr(row, ['sitio web', 'website']) || undefined,
        bank_name: getStr(row, ['banco', 'bank_name']) || undefined,
        bank_account: getStr(row, ['cuenta bancaria', 'bank_account']) || undefined,
        account_type: getStr(row, ['tipo cuenta', 'account_type']) || undefined,
        notes: getStr(row, ['notas', 'notes']) || undefined,
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

      if (supplier.supplier_type && supplier.supplier_type !== 'person' && supplier.supplier_type !== 'company') {
        supplier.isValid = false;
        supplier.errors.push('Tipo debe ser "person" o "company"');
      }

      if (supplier.credit_days !== undefined && supplier.credit_days !== null && isNaN(supplier.credit_days)) {
        supplier.isValid = false;
        supplier.errors.push('Días Crédito debe ser numérico');
      }

      results.push(supplier);
    });

    return results;
  };

  // Manejar selección de archivo
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const isCSV = selectedFile.name.toLowerCase().endsWith('.csv');
    const isXLSX = selectedFile.name.toLowerCase().endsWith('.xlsx') || selectedFile.name.toLowerCase().endsWith('.xls');

    if (!isCSV && !isXLSX) {
      toast({
        variant: 'destructive',
        title: 'Archivo inválido',
        description: 'Por favor selecciona un archivo CSV o Excel (.xlsx)'
      });
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);
    setImportResults(null);

    try {
      let data: ParsedSupplier[] = [];

      if (isXLSX) {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        data = parseXLSX(rows);
      } else {
        const text = await selectedFile.text();
        data = parseCSV(text);
      }

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
        supplier_type: s.supplier_type,
        nit: s.nit,
        doc_type: s.doc_type,
        contact: s.contact,
        phone: s.phone,
        email: s.email,
        description: s.description,
        address: s.address,
        city: s.city,
        state: s.state,
        country: s.country,
        postal_code: s.postal_code,
        tax_id: s.tax_id,
        tax_regime: s.tax_regime,
        fiscal_responsibilities: s.fiscal_responsibilities,
        payment_terms: s.payment_terms,
        credit_days: s.credit_days,
        website: s.website,
        bank_name: s.bank_name,
        bank_account: s.bank_account,
        account_type: s.account_type,
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
            Importa proveedores masivamente desde un archivo CSV o Excel
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
                Sube un archivo CSV o Excel (.xlsx) con los proveedores a importar
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
                  accept=".csv,.xlsx,.xls"
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
                      Archivos CSV o Excel (.xlsx)
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
