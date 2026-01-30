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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Download } from 'lucide-react';

interface ImportDepartmentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: any[]) => Promise<{ success: number; errors: string[] }>;
}

interface ParsedRow {
  code?: string;
  name: string;
  parent_code?: string;
  cost_center?: string;
  description?: string;
}

export function ImportDepartmentsDialog({
  open,
  onOpenChange,
  onImport,
}: ImportDepartmentsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      setParsedData(rows);
    };
    reader.readAsText(selectedFile);
  };

  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row: any = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      if (row.name) {
        rows.push({
          code: row.code || row.codigo || undefined,
          name: row.name || row.nombre,
          parent_code: row.parent_code || row.codigo_padre || undefined,
          cost_center: row.cost_center || row.centro_costos || undefined,
          description: row.description || row.descripcion || undefined,
        });
      }
    }

    return rows;
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setIsImporting(true);
    try {
      const importResult = await onImport(parsedData);
      setResult(importResult);

      if (importResult.errors.length === 0) {
        setTimeout(() => {
          onOpenChange(false);
          resetState();
        }, 2000);
      }
    } catch (error) {
      console.error('Import error:', error);
      setResult({ success: 0, errors: ['Error al importar los datos'] });
    } finally {
      setIsImporting(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setParsedData([]);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const template = 'code,name,parent_code,cost_center,description\nRRHH,Recursos Humanos,,CC-001,Departamento de RRHH\nRRHH-SEL,Selección,RRHH,CC-002,Área de selección';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_departamentos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) resetState(); }}>
      <DialogContent className="sm:max-w-[700px] bg-white dark:bg-gray-800 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Importar Departamentos
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Sube un archivo CSV con los departamentos a importar
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                ¿Primera vez importando?
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Descarga la plantilla CSV de ejemplo
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Plantilla
            </Button>
          </div>

          {/* File Upload */}
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-300">
              {file ? file.name : 'Click para seleccionar archivo CSV'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Columnas: code, name, parent_code, cost_center, description
            </p>
          </div>

          {/* Preview Table */}
          {parsedData.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-b dark:border-gray-600">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Vista previa ({parsedData.length} departamentos)
                </p>
              </div>
              <div className="max-h-[200px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Padre</TableHead>
                      <TableHead>Centro Costos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 10).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-xs">
                          {row.code || '-'}
                        </TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.parent_code || '-'}
                        </TableCell>
                        <TableCell>{row.cost_center || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedData.length > 10 && (
                <p className="text-xs text-gray-500 text-center py-2">
                  ...y {parsedData.length - 10} más
                </p>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <Alert
              variant={result.errors.length === 0 ? 'default' : 'destructive'}
              className={
                result.errors.length === 0
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : ''
              }
            >
              {result.errors.length === 0 ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {result.success > 0 && (
                  <p className="text-green-700 dark:text-green-300">
                    ✓ {result.success} departamentos importados correctamente
                  </p>
                )}
                {result.errors.length > 0 && (
                  <div className="mt-2 text-red-700 dark:text-red-300">
                    <p>Errores:</p>
                    <ul className="list-disc list-inside text-sm">
                      {result.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                    {result.errors.length > 5 && (
                      <p className="text-xs mt-1">
                        ...y {result.errors.length - 5} errores más
                      </p>
                    )}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); resetState(); }}
            disabled={isImporting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={parsedData.length === 0 || isImporting}
          >
            {isImporting ? 'Importando...' : `Importar ${parsedData.length} departamentos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportDepartmentsDialog;
