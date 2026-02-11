'use client';

import { useState, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, FileJson, AlertTriangle } from 'lucide-react';
import type { ChannelFormData, ChannelCode } from './types';

interface ImportCanalesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (channels: ChannelFormData[]) => Promise<{ success: number; failed: number }>;
}

const validCodes = ['app', 'email', 'sms', 'push', 'whatsapp', 'webhook'];

export function ImportCanalesDialog({ open, onOpenChange, onImport }: ImportCanalesDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ChannelFormData[]>([]);
  const [error, setError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number } | null>(null);

  const reset = () => {
    setParsed([]);
    setError('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setParsed([]);
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const arr = Array.isArray(json) ? json : [json];
        const valid: ChannelFormData[] = [];

        for (const item of arr) {
          if (!item.code || !item.provider_name) {
            setError('Cada canal debe tener: code, provider_name');
            return;
          }
          if (!validCodes.includes(item.code)) {
            setError(`Código inválido: ${item.code}. Válidos: ${validCodes.join(', ')}`);
            return;
          }
          valid.push({
            code: item.code as ChannelCode,
            provider_name: item.provider_name,
            config_json: item.config_json || {},
            is_active: item.is_active ?? false,
            connection_id: null,
          });
        }
        setParsed(valid);
      } catch {
        setError('El archivo no es un JSON válido');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setIsImporting(true);
    const res = await onImport(parsed);
    setResult(res);
    setIsImporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle>Importar Canales</DialogTitle>
          <DialogDescription>Sube un archivo JSON con configuración de canales.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
            <FileJson className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <input ref={fileRef} type="file" accept=".json" onChange={handleFile} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Seleccionar JSON
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {parsed.length > 0 && !result && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>{parsed.length}</strong> canales listos para importar.
            </p>
          )}

          {result && (
            <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg text-sm">
              <p className="text-green-700 dark:text-green-300">
                Importados: <strong>{result.success}</strong>
                {result.failed > 0 && <> · Fallidos: <strong className="text-red-500">{result.failed}</strong></>}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && parsed.length > 0 && (
            <Button onClick={handleImport} disabled={isImporting} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Importar {parsed.length}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
