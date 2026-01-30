'use client';

import { ArrowLeft, Upload, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImportHeaderProps {
  onBack: () => void;
}

export default function ImportHeader({ onBack }: ImportHeaderProps) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onBack}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                Importar Fragmentos
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Importa múltiples fragmentos de conocimiento desde CSV o texto
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <FileSpreadsheet className="h-4 w-4" />
            <span>Formatos soportados: CSV, Texto plano</span>
          </div>
        </div>
      </div>
    </div>
  );
}
