'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { DriverCredential } from '@/lib/services/transportService';

interface ImportDriversDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (drivers: Partial<DriverCredential>[]) => Promise<{ success: number; errors: string[] }>;
}

interface ParsedRow {
  employment_id: string;
  license_number: string;
  license_category: string;
  license_expiry: string;
  license_restrictions?: string;
  medical_certificate_expiry?: string;
  hazmat_certified: boolean;
  passenger_certified: boolean;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_type?: string;
  is_active: boolean;
}

export function ImportDriversDialog({
  open,
  onOpenChange,
  onImport,
}: ImportDriversDialogProps) {
  const [, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseCSV(selectedFile);
    }
  };

  const parseCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      setParseErrors(['El archivo debe tener al menos una fila de encabezados y una de datos']);
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredHeaders = ['employment_id', 'license_number', 'license_category', 'license_expiry'];
    const missing = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missing.length > 0) {
      setParseErrors([`Faltan columnas requeridas: ${missing.join(', ')}`]);
      return;
    }

    const rows: ParsedRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: Record<string, string> = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      if (!row.employment_id || !row.license_number || !row.license_category || !row.license_expiry) {
        errors.push(`Fila ${i + 1}: campos requeridos faltantes`);
        continue;
      }

      const validCategories = ['A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];
      if (!validCategories.includes(row.license_category.toUpperCase())) {
        errors.push(`Fila ${i + 1}: categoría de licencia inválida (${row.license_category})`);
        continue;
      }

      rows.push({
        employment_id: row.employment_id,
        license_number: row.license_number,
        license_category: row.license_category.toUpperCase(),
        license_expiry: row.license_expiry,
        license_restrictions: row.license_restrictions || undefined,
        medical_certificate_expiry: row.medical_certificate_expiry || undefined,
        hazmat_certified: row.hazmat_certified?.toLowerCase() === 'true',
        passenger_certified: row.passenger_certified?.toLowerCase() === 'true',
        emergency_contact_name: row.emergency_contact_name || undefined,
        emergency_contact_phone: row.emergency_contact_phone || undefined,
        blood_type: row.blood_type || undefined,
        is_active: row.is_active?.toLowerCase() !== 'false',
      });
    }

    setParsedData(rows);
    setParseErrors(errors);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setIsImporting(true);
    try {
      const result = await onImport(parsedData);
      setImportResult(result);
    } catch (error) {
      setImportResult({ success: 0, errors: ['Error al importar: ' + String(error)] });
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'employment_id',
      'license_number',
      'license_category',
      'license_expiry',
      'license_restrictions',
      'medical_certificate_expiry',
      'hazmat_certified',
      'passenger_certified',
      'emergency_contact_name',
      'emergency_contact_phone',
      'blood_type',
      'is_active'
    ];
    const exampleRow = [
      'uuid-del-empleo',
      'ABC123456',
      'C1',
      '2025-12-31',
      '',
      '2025-06-30',
      'false',
      'false',
      'Juan Pérez',
      '3001234567',
      'O+',
      'true'
    ];
    
    const csv = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_conductores.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    setParseErrors([]);
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Importar Conductores
          </DialogTitle>
          <DialogDescription>
            Sube un archivo CSV con las credenciales de conductores a importar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!importResult ? (
            <>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Plantilla
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">Archivo CSV</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <p className="text-xs text-gray-500">
                  Categorías válidas: A1, A2, B1, B2, B3, C1, C2, C3
                </p>
              </div>

              {parseErrors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Errores de validación
                  </p>
                  <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside">
                    {parseErrors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {parsedData.length > 0 && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    {parsedData.length} conductor(es) listo(s) para importar
                  </p>
                </div>
              )}

              {parsedData.length > 0 && (
                <div className="max-h-48 overflow-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Licencia</th>
                        <th className="px-3 py-2 text-left">Categoría</th>
                        <th className="px-3 py-2 text-left">Vencimiento</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 font-medium">{row.license_number}</td>
                          <td className="px-3 py-2">{row.license_category}</td>
                          <td className="px-3 py-2">{row.license_expiry}</td>
                          <td className="px-3 py-2">{row.is_active ? 'Activo' : 'Inactivo'}</td>
                        </tr>
                      ))}
                      {parsedData.length > 10 && (
                        <tr className="border-t">
                          <td colSpan={4} className="px-3 py-2 text-gray-500 text-center">
                            ... y {parsedData.length - 10} más
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {importResult.success > 0 && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-300">
                      Importación completada
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      {importResult.success} conductor(es) importado(s) correctamente
                    </p>
                  </div>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="font-medium text-red-700 dark:text-red-300 flex items-center gap-2 mb-2">
                    <XCircle className="h-5 w-5" />
                    Errores durante la importación
                  </p>
                  <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside max-h-32 overflow-auto">
                    {importResult.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {importResult ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!importResult && (
            <Button
              onClick={handleImport}
              disabled={parsedData.length === 0 || isImporting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Upload className="h-4 w-4 mr-2" />
              Importar {parsedData.length > 0 && `(${parsedData.length})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
