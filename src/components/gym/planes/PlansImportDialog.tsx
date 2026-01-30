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
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2,
  Download,
  Loader2,
  X
} from 'lucide-react';
import { cn } from '@/utils/Utils';

interface ImportPlan {
  name: string;
  description?: string;
  duration_days: number;
  price: number;
  is_active?: boolean;
  frequency?: string;
}

interface PlansImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (plans: ImportPlan[]) => Promise<void>;
}

interface ParsedResult {
  valid: ImportPlan[];
  errors: { row: number; message: string }[];
}

export function PlansImportDialog({ open, onOpenChange, onImport }: PlansImportDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const headers = ['nombre', 'descripcion', 'duracion_dias', 'precio', 'activo', 'frecuencia'];
    const example = ['Plan Mensual', 'Acceso completo al gym', '30', '50000', 'true', 'monthly'];
    const csv = [headers.join(','), example.join(',')].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_planes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): ParsedResult => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return { valid: [], errors: [{ row: 0, message: 'El archivo está vacío o no tiene datos' }] };
    }

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    const nameIdx = headers.findIndex(h => h.includes('nombre') || h === 'name');
    const descIdx = headers.findIndex(h => h.includes('descripcion') || h === 'description');
    const durationIdx = headers.findIndex(h => h.includes('duracion') || h === 'duration_days');
    const priceIdx = headers.findIndex(h => h.includes('precio') || h === 'price');
    const activeIdx = headers.findIndex(h => h.includes('activo') || h === 'is_active');
    const freqIdx = headers.findIndex(h => h.includes('frecuencia') || h === 'frequency');

    if (nameIdx === -1 || durationIdx === -1 || priceIdx === -1) {
      return { 
        valid: [], 
        errors: [{ row: 0, message: 'Faltan columnas requeridas: nombre, duracion_dias, precio' }] 
      };
    }

    const valid: ImportPlan[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const name = values[nameIdx];
      const duration = parseInt(values[durationIdx]);
      const price = parseFloat(values[priceIdx]);

      if (!name) {
        errors.push({ row: i + 1, message: 'Nombre vacío' });
        continue;
      }
      if (isNaN(duration) || duration <= 0) {
        errors.push({ row: i + 1, message: `Duración inválida: ${values[durationIdx]}` });
        continue;
      }
      if (isNaN(price) || price < 0) {
        errors.push({ row: i + 1, message: `Precio inválido: ${values[priceIdx]}` });
        continue;
      }

      valid.push({
        name,
        description: descIdx >= 0 ? values[descIdx] : undefined,
        duration_days: duration,
        price,
        is_active: activeIdx >= 0 ? values[activeIdx]?.toLowerCase() === 'true' : true,
        frequency: freqIdx >= 0 ? values[freqIdx] || 'monthly' : 'monthly'
      });
    }

    return { valid, errors };
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setParsedData({
        valid: [],
        errors: [{ row: 0, message: 'Solo se permiten archivos CSV' }]
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCSV(text);
      setParsedData(result);
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!parsedData?.valid.length) return;

    try {
      setIsProcessing(true);
      await onImport(parsedData.valid);
      setParsedData(null);
      onOpenChange(false);
    } catch (error) {
      console.error('Error importando planes:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setParsedData(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            Importar Planes
          </DialogTitle>
          <DialogDescription>
            Importa planes desde un archivo CSV
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              <span className="text-sm text-blue-700 dark:text-blue-300">
                Descarga la plantilla CSV
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-1" />
              Plantilla
            </Button>
          </div>

          {/* Drop zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
              dragActive 
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                : "border-gray-300 dark:border-gray-600 hover:border-gray-400"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Arrastra un archivo CSV o <span className="text-blue-600">haz clic para seleccionar</span>
            </p>
          </div>

          {/* Results */}
          {parsedData && (
            <div className="space-y-3">
              {parsedData.valid.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-sm text-green-700 dark:text-green-300">
                    {parsedData.valid.length} plan{parsedData.valid.length !== 1 ? 'es' : ''} listo{parsedData.valid.length !== 1 ? 's' : ''} para importar
                  </span>
                </div>
              )}

              {parsedData.errors.length > 0 && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      {parsedData.errors.length} error{parsedData.errors.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {parsedData.errors.map((err, idx) => (
                      <p key={idx} className="text-xs text-red-600 dark:text-red-400">
                        Fila {err.row}: {err.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {parsedData.valid.length > 0 && (
                <div className="max-h-32 overflow-y-auto border rounded-lg dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Nombre</th>
                        <th className="p-2 text-right">Duración</th>
                        <th className="p-2 text-right">Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.valid.map((plan, idx) => (
                        <tr key={idx} className="border-t dark:border-gray-700">
                          <td className="p-2">{plan.name}</td>
                          <td className="p-2 text-right">{plan.duration_days} días</td>
                          <td className="p-2 text-right">${plan.price.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setParsedData(null)}
                className="w-full"
              >
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={isProcessing || !parsedData?.valid.length}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar {parsedData?.valid.length || 0} planes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PlansImportDialog;
