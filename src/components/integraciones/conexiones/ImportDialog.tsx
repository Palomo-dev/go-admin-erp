'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, FileText, CheckCircle2, XCircle, Download } from 'lucide-react';
import { IntegrationConnector, IntegrationProvider } from '@/lib/services/integrationsService';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectors: IntegrationConnector[];
  onImport: (
    connectorId: string,
    connections: Array<{
      name: string;
      branchId?: number;
      countryCode?: string;
      environment?: string;
    }>
  ) => Promise<{ success: number; failed: number; errors: string[] }>;
}

interface ParsedRow {
  name: string;
  branchId?: number;
  countryCode?: string;
  environment?: string;
}

export function ImportDialog({
  open,
  onOpenChange,
  connectors,
  onImport,
}: ImportDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [connectorId, setConnectorId] = useState('');
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter((line) => line.trim());
      
      if (lines.length < 2) {
        setParsedData([]);
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const nameIndex = headers.indexOf('name') !== -1 ? headers.indexOf('name') : headers.indexOf('nombre');
      const branchIndex = headers.indexOf('branch_id') !== -1 ? headers.indexOf('branch_id') : headers.indexOf('sucursal_id');
      const countryIndex = headers.indexOf('country_code') !== -1 ? headers.indexOf('country_code') : headers.indexOf('pais');
      const envIndex = headers.indexOf('environment') !== -1 ? headers.indexOf('environment') : headers.indexOf('ambiente');

      if (nameIndex === -1) {
        setParsedData([]);
        return;
      }

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        if (values[nameIndex]) {
          parsed.push({
            name: values[nameIndex],
            branchId: branchIndex !== -1 && values[branchIndex] ? parseInt(values[branchIndex]) : undefined,
            countryCode: countryIndex !== -1 ? values[countryIndex] : undefined,
            environment: envIndex !== -1 ? values[envIndex] : undefined,
          });
        }
      }

      setParsedData(parsed);
    };
    reader.readAsText(selectedFile);
  };

  const handleImport = async () => {
    if (!connectorId || parsedData.length === 0) return;

    setIsImporting(true);
    try {
      const importResult = await onImport(connectorId, parsedData);
      setResult(importResult);

      if (importResult.success > 0 && importResult.failed === 0) {
        setTimeout(() => {
          onOpenChange(false);
          resetForm();
        }, 2000);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const resetForm = () => {
    setConnectorId('');
    setFile(null);
    setParsedData([]);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = () => {
    const template = 'name,country_code,branch_id,environment\nSucursal Centro,CO,1,production\nSucursal Norte,CO,2,production\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'conexiones_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const groupedConnectors = connectors.reduce(
    (acc, connector) => {
      const provider = connector.provider as IntegrationProvider | undefined;
      const providerName = provider?.name || 'Otros';
      if (!acc[providerName]) {
        acc[providerName] = [];
      }
      acc[providerName].push(connector);
      return acc;
    },
    {} as Record<string, IntegrationConnector[]>
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-[550px] dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-gray-100">
            <Upload className="h-5 w-5" />
            Importar Conexiones
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Importa múltiples conexiones desde un archivo CSV
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selector de conector */}
          <div className="space-y-2">
            <Label htmlFor="connector" className="dark:text-gray-200">
              Proveedor / Conector *
            </Label>
            <Select value={connectorId} onValueChange={setConnectorId}>
              <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                <SelectValue placeholder="Selecciona un conector" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700 max-h-[300px]">
                {Object.entries(groupedConnectors).map(([providerName, providerConnectors]) => (
                  <div key={providerName}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-900">
                      {providerName}
                    </div>
                    {providerConnectors.map((connector) => (
                      <SelectItem
                        key={connector.id}
                        value={connector.id}
                        className="dark:text-gray-200 dark:focus:bg-gray-700"
                      >
                        {connector.name}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Upload de archivo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="file" className="dark:text-gray-200">
                Archivo CSV *
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={downloadTemplate}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700"
              >
                <Download className="h-4 w-4 mr-1" />
                Descargar plantilla
              </Button>
            </div>
            <Input
              ref={fileInputRef}
              id="file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-400"
            />
          </div>

          {/* Preview de datos */}
          {parsedData.length > 0 && (
            <div className="space-y-2">
              <Label className="dark:text-gray-200">
                Vista previa ({parsedData.length} conexiones)
              </Label>
              <div className="max-h-[150px] overflow-y-auto rounded-lg border dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
                {parsedData.slice(0, 5).map((row, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm py-1 text-gray-700 dark:text-gray-300"
                  >
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span>{row.name}</span>
                    {row.countryCode && (
                      <span className="text-xs text-gray-500">({row.countryCode})</span>
                    )}
                  </div>
                ))}
                {parsedData.length > 5 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    ... y {parsedData.length - 5} más
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <Alert
              className={
                result.failed === 0
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                  : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
              }
            >
              {result.failed === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-yellow-600" />
              )}
              <AlertDescription
                className={
                  result.failed === 0
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-yellow-700 dark:text-yellow-300'
                }
              >
                {result.success} conexiones creadas
                {result.failed > 0 && `, ${result.failed} fallidas`}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
            disabled={isImporting}
            className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || !connectorId || parsedData.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Importar {parsedData.length > 0 && `(${parsedData.length})`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportDialog;
