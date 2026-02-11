'use client';

import { useState, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, FileJson, AlertTriangle } from 'lucide-react';
import type { TemplateFormData, TemplateChannel } from './types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (templates: TemplateFormData[]) => Promise<{ success: number; failed: number }>;
}

const validChannels = ['app', 'email', 'sms', 'push', 'whatsapp', 'webhook'];

export function ImportDialog({ open, onOpenChange, onImport }: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<TemplateFormData[]>([]);
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
        const valid: TemplateFormData[] = [];

        for (const item of arr) {
          if (!item.name || !item.body_text || !item.channel) {
            setError('Cada plantilla debe tener: name, channel, body_text');
            return;
          }
          if (!validChannels.includes(item.channel)) {
            setError(`Canal inválido: ${item.channel}. Válidos: ${validChannels.join(', ')}`);
            return;
          }
          valid.push({
            channel: item.channel as TemplateChannel,
            name: item.name,
            subject: item.subject || '',
            body_html: item.body_html || '',
            body_text: item.body_text,
            variables: Array.isArray(item.variables) ? item.variables : [],
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
          <DialogTitle>Importar Plantillas</DialogTitle>
          <DialogDescription>
            Sube un archivo JSON con un arreglo de plantillas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
            <FileJson className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={handleFile}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Seleccionar archivo JSON
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
              Se encontraron <strong>{parsed.length}</strong> plantillas listas para importar.
            </p>
          )}

          {result && (
            <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg text-sm">
              <p className="text-green-700 dark:text-green-300">
                Importadas: <strong>{result.success}</strong>
                {result.failed > 0 && <> · Fallidas: <strong className="text-red-500">{result.failed}</strong></>}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && parsed.length > 0 && (
            <Button
              onClick={handleImport}
              disabled={isImporting}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Importar {parsed.length}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
