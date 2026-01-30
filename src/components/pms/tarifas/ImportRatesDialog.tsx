'use client';

import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface SpaceType {
  id: string;
  name: string;
}

interface ImportRatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceTypes: SpaceType[];
  onImport: (data: ImportRow[]) => Promise<{ success: number; errors: number }>;
}

export interface ImportRow {
  space_type_id: string;
  date_from: string;
  date_to: string;
  price: number;
  restrictions?: {
    min_nights?: number;
    plan?: string;
  };
}

interface ParsedRow extends ImportRow {
  spaceTypeName?: string;
  isValid: boolean;
  error?: string;
}

export function ImportRatesDialog({
  open,
  onOpenChange,
  spaceTypes,
  onImport,
}: ImportRatesDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<{
    success: number;
    errors: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const headers = 'space_type_name,date_from,date_to,price,min_nights,plan';
    const example1 = 'Habitación Doble,2025-01-01,2025-03-31,150000,1,solo_alojamiento';
    const example2 = 'Cabaña Familiar,2025-01-01,2025-06-30,250000,2,con_desayuno';
    const content = `${headers}\n${example1}\n${example2}`;

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_tarifas.csv';
    link.click();
  };

  const parseCSV = (text: string): ParsedRow[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      if (values.length < 4) continue;

      const [spaceTypeName, dateFrom, dateTo, priceStr, minNightsStr, plan] = values;

      const spaceType = spaceTypes.find(
        (st) => st.name.toLowerCase() === spaceTypeName.toLowerCase()
      );

      const price = parseFloat(priceStr);
      const minNights = minNightsStr ? parseInt(minNightsStr) : undefined;

      const isValid = !!spaceType && !isNaN(price) && !!dateFrom && !!dateTo;

      rows.push({
        space_type_id: spaceType?.id || '',
        spaceTypeName,
        date_from: dateFrom,
        date_to: dateTo,
        price: isNaN(price) ? 0 : price,
        restrictions: {
          min_nights: minNights,
          plan: plan || 'solo_alojamiento',
        },
        isValid,
        error: !spaceType
          ? `Tipo "${spaceTypeName}" no encontrado`
          : isNaN(price)
          ? 'Precio inválido'
          : !dateFrom || !dateTo
          ? 'Fechas inválidas'
          : undefined,
      });
    }

    return rows;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setParsedData(parsed);
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const validRows = parsedData.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsLoading(true);
    try {
      const result = await onImport(
        validRows.map((r) => ({
          space_type_id: r.space_type_id,
          date_from: r.date_from,
          date_to: r.date_to,
          price: r.price,
          restrictions: r.restrictions,
        }))
      );
      setImportResult(result);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setParsedData([]);
    setImportResult(null);
    onOpenChange(false);
  };

  const validCount = parsedData.filter((r) => r.isValid).length;
  const invalidCount = parsedData.filter((r) => !r.isValid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Tarifas desde CSV</DialogTitle>
          <DialogDescription>
            Sube un archivo CSV con las tarifas a importar
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* Descargar plantilla */}
          <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Plantilla CSV
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Descarga la plantilla con el formato correcto
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Descargar
              </Button>
            </div>
          </Card>

          {/* Subir archivo */}
          <div>
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full h-24 border-dashed"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-6 w-6 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Haz clic para seleccionar archivo CSV
                </span>
              </div>
            </Button>
          </div>

          {/* Preview de datos */}
          {parsedData.length > 0 && !importResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {validCount} válidas
                </Badge>
                {invalidCount > 0 && (
                  <Badge className="bg-red-100 text-red-800">
                    <XCircle className="h-3 w-3 mr-1" />
                    {invalidCount} con errores
                  </Badge>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Estado</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Fechas</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {parsedData.map((row, idx) => (
                      <tr
                        key={idx}
                        className={
                          row.isValid
                            ? ''
                            : 'bg-red-50 dark:bg-red-900/10'
                        }
                      >
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <div className="flex items-center gap-1">
                              <XCircle className="h-4 w-4 text-red-600" />
                              <span className="text-xs text-red-600">
                                {row.error}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">{row.spaceTypeName}</td>
                        <td className="px-3 py-2">
                          {row.date_from} - {row.date_to}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${row.price.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resultado de importación */}
          {importResult && (
            <Card className="p-6">
              <div className="text-center space-y-3">
                {importResult.errors === 0 ? (
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
                ) : (
                  <AlertCircle className="h-12 w-12 text-yellow-600 mx-auto" />
                )}
                <div>
                  <p className="text-lg font-semibold">Importación completada</p>
                  <p className="text-gray-600 dark:text-gray-400">
                    {importResult.success} tarifas importadas correctamente
                    {importResult.errors > 0 &&
                      `, ${importResult.errors} con errores`}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {importResult ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!importResult && parsedData.length > 0 && (
            <Button
              onClick={handleImport}
              disabled={isLoading || validCount === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar {validCount} tarifas
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
