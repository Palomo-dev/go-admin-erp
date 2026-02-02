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
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { VehicleType, RateUnit } from './types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rates: ImportedRate[]) => Promise<{ success: number; errors: number }>;
}

export interface ImportedRate {
  rate_name: string;
  vehicle_type: VehicleType;
  unit: RateUnit;
  price: number;
  grace_period_min: number;
  lost_ticket_fee?: number;
}

interface ParsedRow {
  data: ImportedRate;
  isValid: boolean;
  errors: string[];
  rowNumber: number;
}

const validVehicleTypes: VehicleType[] = ['car', 'motorcycle', 'truck', 'bicycle'];
const validUnits: RateUnit[] = ['minute', 'hour', 'day'];

const vehicleMap: Record<string, VehicleType> = {
  'car': 'car',
  'auto': 'car',
  'automóvil': 'car',
  'automovil': 'car',
  'carro': 'car',
  'motorcycle': 'motorcycle',
  'moto': 'motorcycle',
  'motocicleta': 'motorcycle',
  'truck': 'truck',
  'camión': 'truck',
  'camion': 'truck',
  'bicycle': 'bicycle',
  'bici': 'bicycle',
  'bicicleta': 'bicycle',
};

const unitMap: Record<string, RateUnit> = {
  'minute': 'minute',
  'minuto': 'minute',
  'min': 'minute',
  'hour': 'hour',
  'hora': 'hour',
  'hr': 'hour',
  'day': 'day',
  'día': 'day',
  'dia': 'day',
};

export function ImportDialog({
  open,
  onOpenChange,
  onImport,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setImportResult(null);
    parseCSV(selectedFile);
  };

  const parseCSV = async (csvFile: File) => {
    const text = await csvFile.text();
    const lines = text.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      setParsedRows([]);
      return;
    }

    const separator = lines[0].includes(';') ? ';' : ',';
    const dataLines = lines.slice(1);

    const parsed: ParsedRow[] = dataLines.map((line, index) => {
      const values = line.split(separator).map((v) => v.trim().replace(/^["']|["']$/g, ''));
      const [name, vehicleRaw, unitRaw, priceRaw, graceRaw, lostFeeRaw] = values;

      const errors: string[] = [];

      if (!name || name.length === 0) {
        errors.push('Nombre requerido');
      }

      const normalizedVehicle = vehicleMap[vehicleRaw?.toLowerCase()] || vehicleRaw?.toLowerCase();
      if (!validVehicleTypes.includes(normalizedVehicle as VehicleType)) {
        errors.push(`Tipo de vehículo inválido: ${vehicleRaw}`);
      }

      const normalizedUnit = unitMap[unitRaw?.toLowerCase()] || unitRaw?.toLowerCase();
      if (!validUnits.includes(normalizedUnit as RateUnit)) {
        errors.push(`Unidad inválida: ${unitRaw}`);
      }

      const price = parseFloat(priceRaw);
      if (isNaN(price) || price < 0) {
        errors.push(`Precio inválido: ${priceRaw}`);
      }

      const gracePeriod = parseInt(graceRaw) || 0;
      const lostFee = lostFeeRaw ? parseFloat(lostFeeRaw) : undefined;

      return {
        data: {
          rate_name: name || '',
          vehicle_type: (normalizedVehicle as VehicleType) || 'car',
          unit: (normalizedUnit as RateUnit) || 'hour',
          price: price || 0,
          grace_period_min: gracePeriod,
          lost_ticket_fee: lostFee,
        },
        isValid: errors.length === 0,
        errors,
        rowNumber: index + 2,
      };
    });

    setParsedRows(parsed);
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsImporting(true);
    try {
      const result = await onImport(validRows.map((r) => r.data));
      setImportResult(result);

      if (result.success > 0) {
        setTimeout(() => {
          setFile(null);
          setParsedRows([]);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }, 2000);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = [
      'Nombre,Tipo Vehículo,Unidad,Precio,Periodo Gracia,Ticket Perdido',
      'Tarifa Estándar Auto,car,hour,5000,15,50000',
      'Tarifa Estándar Moto,motorcycle,hour,3000,15,30000',
      'Tarifa Diaria Auto,car,day,25000,30,50000',
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla-tarifas-parking.csv';
    link.click();
  };

  const handleClose = () => {
    setFile(null);
    setParsedRows([]);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const errorCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Importar Tarifas desde CSV
          </DialogTitle>
          <DialogDescription>
            Sube un archivo CSV con las tarifas a importar. Descarga la plantilla para ver el formato correcto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-4">
          <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Plantilla CSV</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Descarga la plantilla con el formato correcto
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
          </div>

          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload-rates"
            />
            <label htmlFor="csv-upload-rates" className="cursor-pointer">
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 dark:text-gray-300">
                {file ? file.name : 'Haz clic para seleccionar un archivo CSV'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Formato: Nombre, Tipo Vehículo, Unidad, Precio, Gracia, Ticket Perdido
              </p>
            </label>
          </div>

          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 dark:text-white">
                  Vista Previa ({parsedRows.length} filas)
                </h3>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {validCount} válidos
                  </Badge>
                  {errorCount > 0 && (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                      <XCircle className="h-3 w-3 mr-1" />
                      {errorCount} errores
                    </Badge>
                  )}
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Vehículo</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead className="w-24">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 50).map((row, idx) => (
                      <TableRow key={idx} className={!row.isValid ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                        <TableCell className="text-gray-500">{row.rowNumber}</TableCell>
                        <TableCell className="font-medium">{row.data.rate_name}</TableCell>
                        <TableCell>{row.data.vehicle_type}</TableCell>
                        <TableCell>{row.data.unit}</TableCell>
                        <TableCell>${row.data.price.toLocaleString()}</TableCell>
                        <TableCell>
                          {row.isValid ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                              <span className="text-xs text-red-600" title={row.errors.join(', ')}>
                                Error
                              </span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {importResult && (
            <div className={`p-4 rounded-lg ${
              importResult.errors === 0
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
            }`}>
              <div className="flex items-center gap-2">
                {importResult.errors === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                )}
                <span className="font-medium">
                  Importación completada: {importResult.success} tarifas creadas
                  {importResult.errors > 0 && `, ${importResult.errors} errores`}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || validCount === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Importar {validCount} tarifas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
