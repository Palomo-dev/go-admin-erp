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
import { Loader2, Upload, FileText, Download, CheckCircle, XCircle } from 'lucide-react';

interface ImportLabelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (csvData: string) => Promise<{ success: number; errors: string[] }>;
  isLoading?: boolean;
}

export function ImportLabelsDialog({
  open,
  onOpenChange,
  onImport,
  isLoading = false,
}: ImportLabelsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvData = e.target?.result as string;
      const importResult = await onImport(csvData);
      setResult(importResult);
      if (importResult.errors.length === 0) {
        setTimeout(() => {
          onOpenChange(false);
          setFile(null);
          setResult(null);
        }, 2000);
      }
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const template = 'shipment_id,label_type,format,carrier_id\n' +
      '"uuid-del-envio","shipping","pdf","uuid-del-carrier"\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_etiquetas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Importar Etiquetas
          </DialogTitle>
          <DialogDescription>
            Importe múltiples etiquetas desde un archivo CSV
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Área de drop/selección */}
          <div
            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileText className="h-8 w-8 text-blue-600" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Haga clic para seleccionar un archivo CSV
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  o arrastre y suelte aquí
                </p>
              </>
            )}
          </div>

          {/* Descargar plantilla */}
          <Button
            variant="outline"
            size="sm"
            onClick={downloadTemplate}
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            Descargar Plantilla CSV
          </Button>

          {/* Resultado de importación */}
          {result && (
            <div className="space-y-2">
              {result.success > 0 && (
                <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-300">
                    {result.success} etiqueta(s) importada(s) correctamente
                  </AlertDescription>
                </Alert>
              )}
              {result.errors.length > 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium mb-1">{result.errors.length} error(es):</p>
                    <ul className="text-xs list-disc list-inside max-h-24 overflow-y-auto">
                      {result.errors.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                      {result.errors.length > 5 && (
                        <li>... y {result.errors.length - 5} más</li>
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={isLoading || !file}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportLabelsDialog;
