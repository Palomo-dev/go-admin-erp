'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';

interface FileUploaderProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onFileClear: () => void;
  acceptedFormats?: string[];
}

export function FileUploader({
  file,
  onFileSelect,
  onFileClear,
  acceptedFormats = ['.csv'],
}: FileUploaderProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.csv'],
    },
    maxFiles: 1,
  });

  if (file) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {(file.size / 1024).toFixed(2)} KB
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onFileClear}
            className="text-gray-500 hover:text-red-500"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
        isDragActive
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500'
      )}
    >
      <input {...getInputProps()} />
      <Upload className="h-10 w-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
      <p className="text-gray-900 dark:text-white font-medium mb-1">
        {isDragActive ? 'Suelta el archivo aquí' : 'Arrastra un archivo CSV aquí'}
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        o haz clic para seleccionar
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Formatos aceptados: {acceptedFormats.join(', ')}
      </p>
    </div>
  );
}
