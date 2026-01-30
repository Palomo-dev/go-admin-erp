'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Download,
  FileSpreadsheet,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import type { CreateShippingRateData } from '@/lib/services/shippingRatesService';

interface ImportRatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rates: Partial<CreateShippingRateData>[]) => Promise<{ success: number; errors: string[] }>;
  isLoading?: boolean;
}

interface ParsedRow {
  rate_name: string;
  rate_code?: string;
  origin_city?: string;
  destination_city?: string;
  origin_zone?: string;
  destination_zone?: string;
  service_level?: string;
  calculation_method?: string;
  base_rate?: number;
  rate_per_kg?: number;
  rate_per_m3?: number;
  min_charge?: number;
  fuel_surcharge_percent?: number;
  insurance_percent?: number;
  currency?: string;
}

export function ImportRatesDialog({
  open,
  onOpenChange,
  onImport,
  isLoading = false,
}: ImportRatesDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null);

  const downloadTemplate = () => {
    const headers = [
      'rate_name',
      'rate_code',
      'origin_city',
      'destination_city',
      'origin_zone',
      'destination_zone',
      'service_level',
      'calculation_method',
      'base_rate',
      'rate_per_kg',
      'rate_per_m3',
      'min_charge',
      'fuel_surcharge_percent',
      'insurance_percent',
      'currency',
    ];

    const exampleRow = [
      'Envío Express Bogotá-Medellín',
      'EXP-BOG-MED',
      'Bogotá',
      'Medellín',
      'Centro',
      'Norte',
      'express',
      'weight',
      '5000',
      '1500',
      '0',
      '8000',
      '5',
      '1',
      'COP',
    ];

    const csvContent = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_tarifas_envio.csv';
    link.click();
  };

  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: Record<string, string | number | undefined> = {};

      headers.forEach((header, index) => {
        const value = values[index];
        if (value) {
          if (['base_rate', 'rate_per_kg', 'rate_per_m3', 'min_charge', 'fuel_surcharge_percent', 'insurance_percent'].includes(header)) {
            row[header] = parseFloat(value) || 0;
          } else {
            row[header] = value;
          }
        }
      });

      if (row.rate_name) {
        rows.push(row as unknown as ParsedRow);
      }
    }

    return rows;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setParsedData(parsed);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    const result = await onImport(parsedData);
    setImportResult(result);

    if (result.errors.length === 0) {
      setParsedData([]);
      setFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClose = () => {
    setParsedData([]);
    setFileName('');
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Importar Tarifas de Envío
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Descargar plantilla */}
          <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="font-medium">Plantilla CSV</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Descarga la plantilla con el formato correcto
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Descargar
              </Button>
            </div>
          </Card>

          {/* Subir archivo */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Upload className="h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {fileName || 'Haz clic o arrastra un archivo CSV'}
              </p>
            </label>
          </div>

          {/* Preview de datos */}
          {parsedData.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Vista previa</h4>
                <Badge variant="secondary">{parsedData.length} tarifas</Badge>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-2 py-1 text-left">Nombre</th>
                      <th className="px-2 py-1 text-left">Código</th>
                      <th className="px-2 py-1 text-left">Origen</th>
                      <th className="px-2 py-1 text-left">Destino</th>
                      <th className="px-2 py-1 text-right">Base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((row, index) => (
                      <tr key={index} className="border-t dark:border-gray-700">
                        <td className="px-2 py-1">{row.rate_name}</td>
                        <td className="px-2 py-1">{row.rate_code || '-'}</td>
                        <td className="px-2 py-1">{row.origin_city || '-'}</td>
                        <td className="px-2 py-1">{row.destination_city || '-'}</td>
                        <td className="px-2 py-1 text-right">{row.base_rate || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 10 && (
                  <p className="text-xs text-gray-500 text-center mt-2">
                    ...y {parsedData.length - 10} más
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Resultado de importación */}
          {importResult && (
            <Card className={`p-4 ${importResult.errors.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
              <div className="flex items-start gap-3">
                {importResult.errors.length === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {importResult.success} tarifas importadas correctamente
                  </p>
                  {importResult.errors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-red-600">{importResult.errors.length} errores:</p>
                      <ul className="text-xs text-red-500 list-disc list-inside max-h-24 overflow-y-auto">
                        {importResult.errors.map((error, i) => (
                          <li key={i}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
            <Button variant="outline" onClick={handleClose}>
              Cerrar
            </Button>
            <Button
              onClick={handleImport}
              disabled={isLoading || parsedData.length === 0}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar {parsedData.length} tarifas
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ImportRatesDialog;
