'use client';

import { useCallback, useState } from 'react';
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
      setError('Solo se permiten archivos CSV o TXT');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo no puede superar 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileSelect(content, file.name, isCSV ? 'csv' : 'text');
    };
    reader.onerror = () => {
      setError('Error al leer el archivo');
    };
    reader.readAsText(file);
  }, [onFileSelect]);

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
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Upload className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Cargar Archivo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {selectedFile ? (
          <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{selectedFile.name}</p>
                <Badge variant="outline" className="mt-1">
                  {selectedFile.type === 'csv' ? 'CSV' : 'Texto'}
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClear}>
              <X className="h-4 w-4" />
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
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600'
              }
            `}
          >
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <Upload className={`h-12 w-12 mx-auto mb-4 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Arrastra un archivo aquí o <span className="text-blue-600 dark:text-blue-400 font-medium">haz clic para seleccionar</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              CSV o TXT • Máximo 5MB
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Formato CSV esperado:</p>
          <code className="text-xs text-gray-600 dark:text-gray-400 block bg-gray-100 dark:bg-gray-900 p-2 rounded">
            title,content,tags,priority<br/>
            "Título 1","Contenido del fragmento","tag1;tag2",5<br/>
            "Título 2","Otro contenido","tag3",8
          </code>
        </div>
      </CardContent>
    </Card>
  );
}
