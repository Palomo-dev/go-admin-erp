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
import { Vehicle } from '@/lib/services/transportService';

interface ImportVehiclesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (vehicles: Partial<Vehicle>[]) => Promise<{ success: number; errors: string[] }>;
}

type VehicleType = 'motorcycle' | 'car' | 'van' | 'truck' | 'minibus' | 'bus';

interface ParsedRow {
  plate_number: string;
  vehicle_type: VehicleType;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  capacity_kg?: number;
  capacity_m3?: number;
  capacity_seats?: number;
  fuel_type?: string;
  vin?: string;
  soat_expiry?: string;
  tech_review_expiry?: string;
  insurance_expiry?: string;
  status: 'available' | 'in_use' | 'maintenance' | 'inactive';
  is_active: boolean;
}

export function ImportVehiclesDialog({
  open,
  onOpenChange,
  onImport,
}: ImportVehiclesDialogProps) {
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
    const requiredHeaders = ['plate_number', 'vehicle_type'];
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

      if (!row.plate_number || !row.vehicle_type) {
        errors.push(`Fila ${i + 1}: placa y tipo son requeridos`);
        continue;
      }

      const validTypes = ['motorcycle', 'car', 'van', 'truck', 'minibus', 'bus'];
      if (!validTypes.includes(row.vehicle_type)) {
        errors.push(`Fila ${i + 1}: tipo de vehículo inválido (${row.vehicle_type})`);
        continue;
      }

      rows.push({
        plate_number: row.plate_number,
        vehicle_type: row.vehicle_type as VehicleType,
        brand: row.brand || undefined,
        model: row.model || undefined,
        year: row.year ? parseInt(row.year) : undefined,
        color: row.color || undefined,
        capacity_kg: row.capacity_kg ? parseFloat(row.capacity_kg) : undefined,
        capacity_m3: row.capacity_m3 ? parseFloat(row.capacity_m3) : undefined,
        capacity_seats: row.capacity_seats ? parseInt(row.capacity_seats) : undefined,
        fuel_type: row.fuel_type || undefined,
        vin: row.vin || undefined,
        soat_expiry: row.soat_expiry || undefined,
        tech_review_expiry: row.tech_review_expiry || undefined,
        insurance_expiry: row.insurance_expiry || undefined,
        status: (row.status || 'available') as 'available' | 'in_use' | 'maintenance' | 'inactive',
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
      'plate_number',
      'vehicle_type',
      'brand',
      'model',
      'year',
      'color',
      'capacity_kg',
      'capacity_m3',
      'capacity_seats',
      'fuel_type',
      'vin',
      'soat_expiry',
      'tech_review_expiry',
      'insurance_expiry',
      'status',
      'is_active'
    ];
    const exampleRow = [
      'ABC-123',
      'truck',
      'Toyota',
      'Hilux',
      '2023',
      'Blanco',
      '1000',
      '10',
      '',
      'Diesel',
      '1HGBH41JXMN109186',
      '2025-12-31',
      '2025-06-30',
      '2025-12-31',
      'available',
      'true'
    ];
    
    const csv = [headers.join(','), exampleRow.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_vehiculos.csv';
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

  const vehicleTypeLabels: Record<string, string> = {
    motorcycle: 'Moto',
    car: 'Auto',
    van: 'Van',
    truck: 'Camión',
    minibus: 'Minibús',
    bus: 'Bus',
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            Importar Vehículos
          </DialogTitle>
          <DialogDescription>
            Sube un archivo CSV con los vehículos a importar
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
                  Tipos válidos: motorcycle, car, van, truck, minibus, bus
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
                    {parsedData.length} vehículo(s) listo(s) para importar
                  </p>
                </div>
              )}

              {parsedData.length > 0 && (
                <div className="max-h-48 overflow-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Placa</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">Marca</th>
                        <th className="px-3 py-2 text-left">Modelo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 font-medium">{row.plate_number}</td>
                          <td className="px-3 py-2">{vehicleTypeLabels[row.vehicle_type] || row.vehicle_type}</td>
                          <td className="px-3 py-2">{row.brand || '-'}</td>
                          <td className="px-3 py-2">{row.model || '-'}</td>
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
                      {importResult.success} vehículo(s) importado(s) correctamente
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
