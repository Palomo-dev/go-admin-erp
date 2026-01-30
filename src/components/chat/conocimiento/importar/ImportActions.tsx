'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { ImportResult } from '@/lib/services/knowledgeService';

interface ImportActionsProps {
  fragmentCount: number;
  validCount: number;
  importing: boolean;
  result: ImportResult | null;
  onImport: () => void;
  onReset: () => void;
}

export default function ImportActions({
  fragmentCount,
  validCount,
  importing,
  result,
  onImport,
  onReset
}: ImportActionsProps) {
  if (result) {
    return (
      <Card className={`border-2 ${result.success ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20' : 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'}`}>
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {result.success ? (
                <div className="p-3 bg-green-100 dark:bg-green-900/40 rounded-full">
                  <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              ) : (
                <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-full">
                  <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
              )}
              <div>
                <h3 className={`text-lg font-semibold ${result.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                  {result.success ? 'Importación Completada' : 'Error en la Importación'}
                </h3>
                <div className="flex flex-wrap gap-4 mt-1 text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Procesados: <strong>{result.totalProcessed}</strong>
                  </span>
                  <span className="text-green-600 dark:text-green-400">
                    Exitosos: <strong>{result.successCount}</strong>
                  </span>
                  {result.errorCount > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      Errores: <strong>{result.errorCount}</strong>
                    </span>
                  )}
                  {result.jobId && (
                    <span className="text-blue-600 dark:text-blue-400">
                      Embeddings en cola
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button 
              onClick={onReset}
              variant="outline"
              className="border-gray-300 dark:border-gray-700"
            >
              Nueva Importación
            </Button>
          </div>

          {result.errors.length > 0 && (
            <div className="mt-4 p-4 bg-white dark:bg-gray-900 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Errores encontrados:
              </p>
              <ul className="space-y-1 text-sm text-red-600 dark:text-red-400 max-h-32 overflow-y-auto">
                {result.errors.map((error, idx) => (
                  <li key={idx}>
                    {error.row > 0 ? `Fila ${error.row}: ` : ''}{error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <CardContent className="py-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-600 dark:text-gray-400">
              {fragmentCount === 0 ? (
                'Carga un archivo o pega texto para comenzar'
              ) : (
                <>
                  <strong className="text-gray-900 dark:text-white">{validCount}</strong> de {fragmentCount} fragmentos listos para importar
                </>
              )}
            </p>
            {fragmentCount > 0 && validCount < fragmentCount && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {fragmentCount - validCount} fragmentos tienen errores y serán omitidos
              </p>
            )}
          </div>
          <Button
            onClick={onImport}
            disabled={validCount === 0 || importing}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar {validCount > 0 ? `${validCount} Fragmentos` : ''}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
