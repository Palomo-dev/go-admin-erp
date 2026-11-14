'use client';

/**
 * Zona del archivo CSV de «Importar fragmentos» (Figma 94-chat-recuperado-ia-05):
 * sin archivo, recuadro punteado para arrastrar o elegir; con archivo, el
 * nombre, «N filas · columnas: …» y «Cambiar». Va dentro de la tarjeta
 * «1. Archivo» de la página (sin tarjeta propia).
 */
import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, FileSpreadsheet, Upload } from 'lucide-react';
import { clasesBoton } from '@/components/kit';

interface FileUploadZoneProps {
  onFileSelect: (content: string, fileName: string, fileType: 'csv' | 'text') => void;
  selectedFile: { name: string; type: 'csv' | 'text' } | null;
  /** Ya no se usa: «Cambiar» reemplaza el archivo sin quitarlo antes. */
  onClear?: () => void;
  /** Filas de datos y columnas del encabezado del archivo elegido. */
  resumen?: { filas: number; columnas: string[] } | null;
}

export default function FileUploadZone({ onFileSelect, selectedFile, resumen }: FileUploadZoneProps) {
  const t = useTranslations('chatDialogos.importar');
  const tr = useTranslations('chatRecuperado.importar');
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setIsDragActive(true);
    else if (e.type === 'dragleave') setIsDragActive(false);
  }, []);

  const processFile = useCallback(
    (file: File) => {
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
      reader.onload = (e) => onFileSelect(e.target?.result as string, file.name, isCSV ? 'csv' : 'text');
      reader.onerror = () => setError(t('errorLectura'));
      reader.readAsText(file);
    },
    [onFileSelect, t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
    },
    [processFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) processFile(e.target.files[0]);
      // Permite volver a elegir el mismo archivo después de «Cambiar».
      e.target.value = '';
    },
    [processFile],
  );

  return (
    <div className="flex flex-col gap-3">
      <input ref={entrada} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={handleFileInput} aria-label={t('elegirArchivo')} className="sr-only" tabIndex={-1} />
      {selectedFile ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 ${isDragActive ? 'border-brand bg-brand-tint' : 'border-line-strong bg-subtle'}`}
        >
          <FileSpreadsheet aria-hidden="true" className="size-6 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-fg">{selectedFile.name}</p>
            {resumen && (
              <p className="truncate text-xs text-fg-muted">
                {resumen.columnas.length > 0 ? tr('archivoResumen', { n: resumen.filas, columnas: resumen.columnas.join(', ') }) : tr('archivoFilas', { n: resumen.filas })}
              </p>
            )}
          </div>
          <button
            type="button"
            // Elegir otro reemplaza al actual; si se cancela, el actual sigue.
            onClick={() => entrada.current?.click()}
            className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
          >
            {tr('cambiar')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            isDragActive ? 'border-brand bg-brand-tint' : 'border-line-strong bg-subtle hover:border-brand'
          }`}
        >
          <Upload aria-hidden="true" className={`size-6 ${isDragActive ? 'text-brand' : 'text-fg-muted'}`} strokeWidth={1.5} />
          <span className="text-[13px] text-fg-secondary">
            {t('arrastra')} <span className="font-medium text-brand">{t('seleccionar')}</span>
          </span>
          <span className="text-xs text-fg-muted">{t('formatos')}</span>
          <span className="font-mono text-[11px] text-fg-muted">title,content,tags,priority</span>
        </button>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 text-[13px] text-danger-text">
          <AlertCircle aria-hidden="true" className="size-4" />
          {error}
        </p>
      )}
    </div>
  );
}
