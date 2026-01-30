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

export interface ImportRow {
  row: number;
  employee_code?: string;
  organization_member_id?: number;
  hire_date: string;
  employment_type?: string;
  contract_type?: string;
  position_id?: string;
  department_id?: string;
  branch_id?: number;
  base_salary?: number;
  status: 'pending' | 'valid' | 'error';
  error?: string;
}

interface EmployeeImporterProps {
  onImport: (data: ImportRow[]) => Promise<{ success: number; errors: { row: number; message: string }[] }>;
  onDownloadTemplate: () => void;
  isLoading?: boolean;
}

export function EmployeeImporter({
  onImport,
  onDownloadTemplate,
  isLoading,
}: EmployeeImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
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

    // Parsear CSV
    const text = await selectedFile.text();
    const lines = text.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      setParseError('El archivo debe tener al menos una fila de datos además del encabezado');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
    const requiredHeaders = ['hire_date'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      setParseError(`Faltan columnas requeridas: ${missingHeaders.join(', ')}`);
      return;
    }

    const parsedRows: ImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/"/g, ''));
      const rowData: any = {};

      headers.forEach((header, index) => {
        if (values[index]) {
          rowData[header] = values[index];
        }
      });

      const row: ImportRow = {
        row: i,
        employee_code: rowData.employee_code,
        organization_member_id: rowData.organization_member_id
          ? parseInt(rowData.organization_member_id)
          : undefined,
        hire_date: rowData.hire_date,
        employment_type: rowData.employment_type || 'employee',
        contract_type: rowData.contract_type,
        position_id: rowData.position_id,
        department_id: rowData.department_id,
        branch_id: rowData.branch_id ? parseInt(rowData.branch_id) : undefined,
        base_salary: rowData.base_salary ? parseFloat(rowData.base_salary) : undefined,
        status: 'pending',
      };

      // Validar fila
      if (!row.hire_date) {
        row.status = 'error';
        row.error = 'Fecha de ingreso requerida';
      } else if (!row.organization_member_id && !row.employee_code) {
        row.status = 'error';
        row.error = 'Se requiere organization_member_id o employee_code';
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
      const result = await onImport(validRows);
      setImportResult(result);

      // Actualizar estado de filas según resultado
      const errorRowNumbers = new Set(result.errors.map((e) => e.row));
      setRows((prev) =>
        prev.map((r) => {
          if (r.status !== 'valid') return r;
          const error = result.errors.find((e) => e.row === r.row);
          if (error) {
            return { ...r, status: 'error' as const, error: error.message };
          }
          return { ...r, status: 'valid' as const };
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
      {/* Instrucciones */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Importar Empleados
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Carga un archivo CSV con los datos de los empleados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h4 className="font-medium text-blue-700 dark:text-blue-300 mb-2">
              Columnas del CSV
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div>
                <span className="font-medium text-blue-800 dark:text-blue-200">organization_member_id</span>
                <span className="text-blue-600 dark:text-blue-400 ml-1">*</span>
              </div>
              <div>
                <span className="font-medium text-blue-800 dark:text-blue-200">hire_date</span>
                <span className="text-red-500 ml-1">*</span>
              </div>
              <div className="text-blue-700 dark:text-blue-300">employee_code</div>
              <div className="text-blue-700 dark:text-blue-300">employment_type</div>
              <div className="text-blue-700 dark:text-blue-300">contract_type</div>
              <div className="text-blue-700 dark:text-blue-300">position_id</div>
              <div className="text-blue-700 dark:text-blue-300">department_id</div>
              <div className="text-blue-700 dark:text-blue-300">branch_id</div>
              <div className="text-blue-700 dark:text-blue-300">base_salary</div>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
              * Campos requeridos. Formato de fecha: YYYY-MM-DD
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Descargar Plantilla
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subida de Archivo */}
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
                      {rows.length} filas detectadas
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={handleClear}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Estadísticas */}
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  {validCount} válidas
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

      {/* Errores */}
      {parseError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      {/* Resultado de Importación */}
      {importResult && (
        <Alert className={importResult.errors.length === 0 ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20'}>
          {importResult.errors.length === 0 ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          )}
          <AlertDescription>
            Se importaron {importResult.success} empleados correctamente.
            {importResult.errors.length > 0 && ` ${importResult.errors.length} filas fallaron.`}
          </AlertDescription>
        </Alert>
      )}

      {/* Vista Previa de Datos */}
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
                    <TableHead>Código</TableHead>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Fecha Ingreso</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Salario</TableHead>
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
                      <TableCell>{row.employee_code || '-'}</TableCell>
                      <TableCell>{row.organization_member_id || '-'}</TableCell>
                      <TableCell>{row.hire_date}</TableCell>
                      <TableCell>{row.employment_type || '-'}</TableCell>
                      <TableCell>{row.base_salary?.toLocaleString() || '-'}</TableCell>
                      <TableCell className="text-center">
                        {row.status === 'valid' && (
                          <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Válido
                          </Badge>
                        )}
                        {row.status === 'error' && (
                          <Badge variant="destructive" className="text-xs">
                            {row.error}
                          </Badge>
                        )}
                        {row.status === 'pending' && (
                          <Badge variant="outline">Pendiente</Badge>
                        )}
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

      {/* Botón de Importar */}
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
                Importar {validCount} Empleados
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default EmployeeImporter;
