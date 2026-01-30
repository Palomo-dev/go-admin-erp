'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Trash2,
} from 'lucide-react';

export interface ImportShiftRow {
  row: number;
  employee_code: string;
  template_code: string;
  branch_id?: number;
  work_date: string;
  status: 'pending' | 'valid' | 'error';
  error?: string;
}

interface ShiftImporterProps {
  onImport: (data: { employee_code: string; template_code: string; branch_id?: number; work_date: string }[]) => Promise<{
    success: number;
    errors: { row: number; message: string }[];
  }>;
  onDownloadTemplate: () => void;
  isLoading?: boolean;
}

export function ShiftImporter({
  onImport,
  onDownloadTemplate,
  isLoading,
}: ShiftImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportShiftRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    errors: { row: number; message: string }[];
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParseError(null);
    setImportResult(null);

    // Parse CSV
    const text = await selectedFile.text();
    const lines = text.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      setParseError('El archivo debe tener al menos una fila de datos además del encabezado');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
    const requiredHeaders = ['employee_code', 'template_code', 'work_date'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      setParseError(`Faltan columnas requeridas: ${missingHeaders.join(', ')}`);
      return;
    }

    const parsedRows: ImportShiftRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));
      const rowData: Record<string, string> = {};

      headers.forEach((header, index) => {
        if (values[index]) {
          rowData[header] = values[index];
        }
      });

      const row: ImportShiftRow = {
        row: i,
        employee_code: rowData.employee_code || '',
        template_code: rowData.template_code || '',
        branch_id: rowData.branch_id ? parseInt(rowData.branch_id) : undefined,
        work_date: rowData.work_date || '',
        status: 'pending',
      };

      // Validate
      if (!row.employee_code) {
        row.status = 'error';
        row.error = 'Código de empleado requerido';
      } else if (!row.template_code) {
        row.status = 'error';
        row.error = 'Código de turno requerido';
      } else if (!row.work_date) {
        row.status = 'error';
        row.error = 'Fecha requerida';
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(row.work_date)) {
        row.status = 'error';
        row.error = 'Formato de fecha inválido (usar YYYY-MM-DD)';
      } else {
        row.status = 'valid';
      }

      parsedRows.push(row);
    }

    setRows(parsedRows);
  }, []);

  const handleImport = async () => {
    const validRows = rows.filter((r) => r.status === 'valid');
    if (validRows.length === 0) {
      setParseError('No hay filas válidas para importar');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await onImport(
        validRows.map((r) => ({
          employee_code: r.employee_code,
          template_code: r.template_code,
          branch_id: r.branch_id,
          work_date: r.work_date,
        }))
      );
      setImportResult(result);

      // Update row status
      setRows((prev) =>
        prev.map((r) => {
          if (r.status !== 'valid') return r;
          const error = result.errors.find((e) => e.row === r.row);
          if (error) {
            return { ...r, status: 'error' as const, error: error.message };
          }
          return r;
        })
      );
    } catch (error: any) {
      setParseError(error.message || 'Error durante la importación');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setRows([]);
    setImportResult(null);
    setParseError(null);
  };

  const validCount = rows.filter((r) => r.status === 'valid').length;
  const errorCount = rows.filter((r) => r.status === 'error').length;

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Importar Turnos
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Carga un archivo CSV con las asignaciones de turnos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h4 className="font-medium text-blue-700 dark:text-blue-300 mb-2">
              Columnas del CSV
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div>
                <span className="font-medium text-blue-800 dark:text-blue-200">employee_code</span>
                <span className="text-red-500 ml-1">*</span>
              </div>
              <div>
                <span className="font-medium text-blue-800 dark:text-blue-200">template_code</span>
                <span className="text-red-500 ml-1">*</span>
              </div>
              <div>
                <span className="font-medium text-blue-800 dark:text-blue-200">work_date</span>
                <span className="text-red-500 ml-1">*</span>
              </div>
              <div className="text-blue-700 dark:text-blue-300">branch_id</div>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
              * Campos requeridos. Formato de fecha: YYYY-MM-DD
            </p>
          </div>

          <Button variant="outline" onClick={onDownloadTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Descargar Plantilla
          </Button>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          {!file ? (
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="h-10 w-10 text-gray-400 mb-3" />
                <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="font-semibold">Haz clic para subir</span> o arrastra y suelta
                </p>
                <p className="text-xs text-gray-400">CSV (max. 10MB)</p>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                disabled={isLoading || isProcessing}
              />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {rows.length} turnos detectados
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={handleClear}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {validCount} válidos
                </Badge>
                {errorCount > 0 && (
                  <Badge variant="outline" className="gap-1 border-red-200 text-red-600">
                    <XCircle className="h-3 w-3" />
                    {errorCount} con errores
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Errors */}
      {parseError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      {/* Import Result */}
      {importResult && (
        <Alert
          className={
            importResult.errors.length === 0
              ? 'border-green-200 bg-green-50 dark:bg-green-900/20'
              : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20'
          }
        >
          {importResult.errors.length === 0 ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          )}
          <AlertDescription>
            Se importaron {importResult.success} turnos correctamente.
            {importResult.errors.length > 0 && ` ${importResult.errors.length} filas fallaron.`}
          </AlertDescription>
        </Alert>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Vista Previa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                    <TableHead className="w-[60px]">Fila</TableHead>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Turno</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Sede</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((row) => (
                    <TableRow
                      key={row.row}
                      className={row.status === 'error' ? 'bg-red-50 dark:bg-red-900/10' : ''}
                    >
                      <TableCell className="font-mono text-sm">{row.row}</TableCell>
                      <TableCell>{row.employee_code}</TableCell>
                      <TableCell>{row.template_code}</TableCell>
                      <TableCell>{row.work_date}</TableCell>
                      <TableCell>{row.branch_id || '-'}</TableCell>
                      <TableCell className="text-center">
                        {row.status === 'valid' && (
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          >
                            Válido
                          </Badge>
                        )}
                        {row.status === 'error' && (
                          <Badge variant="destructive" className="text-xs">
                            {row.error}
                          </Badge>
                        )}
                        {row.status === 'pending' && <Badge variant="outline">Pendiente</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > 50 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 text-center">
                Mostrando 50 de {rows.length} filas
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import Button */}
      {rows.length > 0 && validCount > 0 && !importResult && (
        <div className="flex justify-end">
          <Button onClick={handleImport} disabled={isProcessing} className="min-w-[150px]">
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar {validCount} Turnos
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default ShiftImporter;
