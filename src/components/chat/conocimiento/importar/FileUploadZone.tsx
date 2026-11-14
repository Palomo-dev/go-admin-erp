'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface FileUploadZoneProps {
  onFileSelect: (content: string, fileName: string, fileType: 'csv' | 'text') => void;
  selectedFile: { name: string; type: 'csv' | 'text' } | null;
  onClear: () => void;
}

export default function FileUploadZone({ 
  onFileSelect, 
  selectedFile, 
  onClear 
}: FileUploadZoneProps) {
  const t = useTranslations('chatDialogos.importar');
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const processFile = useCallback((file: File) => {
    setError(null);
    
    const isCSV = file.name.endsWith('.csv') || file.type === 'text/csv';
    const isText = file.name.endsWith('.txt') || file.type === 'text/plain';

    if (!isCSV && !isText) {
      setError(t('errorTipo'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t('errorTamano'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileSelect(content, file.name, isCSV ? 'csv' : 'text');
    };
    reader.onerror = () => {
      setError(t('errorLectura'));
    };
    reader.readAsText(file);
  }, [onFileSelect, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  }, [processFile]);

  return (
    <Card className="border-line bg-surface">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-fg flex items-center gap-2">
          <Upload aria-hidden="true" className="h-4 w-4 text-brand" />
          {t('archivoTitulo')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {selectedFile ? (
          <div className="flex items-center justify-between rounded-lg border border-line bg-brand-tint p-4">
            <div className="flex items-center gap-3">
              <FileText aria-hidden="true" className="h-8 w-8 text-brand" />
              <div>
                <p className="font-medium text-fg">{selectedFile.name}</p>
                <Badge variant="outline" className="mt-1">
                  {selectedFile.type === 'csv' ? t('tipoCsv') : t('tipoTexto')}
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClear} aria-label={t('quitarArchivo')}>
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragActive
                ? 'border-brand bg-brand-tint'
                : 'border-line-strong hover:border-brand'
              }
            `}
          >
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFileInput}
              aria-label={t('elegirArchivo')}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Upload aria-hidden="true" className={`h-12 w-12 mx-auto mb-4 ${isDragActive ? 'text-brand' : 'text-fg-muted'}`} />
            <p className="mb-2 text-fg-secondary">
              {t('arrastra')} <span className="font-medium text-brand">{t('seleccionar')}</span>
            </p>
            <p className="text-sm text-fg-muted">
              {t('formatos')}
            </p>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 flex items-center gap-2 text-sm text-danger-text">
            <AlertCircle aria-hidden="true" className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="mt-4 rounded-lg bg-subtle p-4">
          <p className="mb-2 text-sm font-medium text-fg">{t('formatoCsv')}</p>
          <code className="block whitespace-pre-wrap rounded bg-surface p-2 text-xs text-fg-secondary">
            {`title,content,tags,priority\n${t('ejemploCsv1')}\n${t('ejemploCsv2')}`}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
