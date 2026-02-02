'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  Check,
  Download,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/utils/Utils';
import { FileUploader } from './FileUploader';
import { ColumnMapper } from './ColumnMapper';
import { ImportPreview } from './ImportPreview';
import { useImportEvents } from './useImportEvents';
import {
  ImportStep,
  ColumnMapping,
  ParsedRow,
  ImportResult,
  TARGET_FIELDS,
  ImportableEvent,
} from './types';

interface ImportWizardProps {
  organizationId: number | null;
  onComplete: () => void;
  onCancel: () => void;
}

const STEPS: { id: ImportStep; title: string; description: string }[] = [
  { id: 'upload', title: 'Subir archivo', description: 'Selecciona un archivo CSV' },
  { id: 'mapping', title: 'Mapear columnas', description: 'Asigna las columnas' },
  { id: 'preview', title: 'Vista previa', description: 'Revisa los datos' },
  { id: 'importing', title: 'Importando', description: 'Procesando eventos' },
  { id: 'complete', title: 'Completado', description: 'Importación finalizada' },
];

export function ImportWizard({
  organizationId,
  onComplete,
  onCancel,
}: ImportWizardProps) {
  const [currentStep, setCurrentStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const {
    isImporting,
    progress,
    parseCSV,
    validateRows,
    importEvents,
    generateTemplate,
  } = useImportEvents({ organizationId });

  const csvHeaders = useMemo(() => csvData[0] || [], [csvData]);
  const csvRows = useMemo(() => {
    if (csvData.length <= 1) return [];
    return csvData.slice(1).map(row => {
      const obj: Record<string, string> = {};
      csvHeaders.forEach((header, i) => {
        obj[header] = row[i] || '';
      });
      return obj;
    });
  }, [csvData, csvHeaders]);

  const requiredFieldsMapped = useMemo(() => {
    const required = TARGET_FIELDS.filter(f => f.required);
    return required.every(field =>
      mappings.some(m => m.targetField === field.value)
    );
  }, [mappings]);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    const content = await selectedFile.text();
    const parsed = parseCSV(content);
    setCsvData(parsed);

    const headers = parsed[0] || [];
    const initialMappings: ColumnMapping[] = headers.map(header => {
      const matchingField = TARGET_FIELDS.find(
        f => f.value.toLowerCase() === header.toLowerCase() ||
             f.label.toLowerCase() === header.toLowerCase()
      );
      return {
        csvColumn: header,
        targetField: matchingField?.value || null,
      };
    });
    setMappings(initialMappings);
  }, [parseCSV]);

  const handleFileClear = useCallback(() => {
    setFile(null);
    setCsvData([]);
    setMappings([]);
    setParsedRows([]);
  }, []);

  const handleMappingChange = useCallback((
    csvColumn: string,
    targetField: keyof ImportableEvent | null
  ) => {
    setMappings(prev =>
      prev.map(m =>
        m.csvColumn === csvColumn ? { ...m, targetField } : m
      )
    );
  }, []);

  const handleNext = useCallback(async () => {
    if (currentStep === 'upload' && file) {
      setCurrentStep('mapping');
    } else if (currentStep === 'mapping') {
      const validated = validateRows(csvRows, mappings);
      setParsedRows(validated);
      setCurrentStep('preview');
    } else if (currentStep === 'preview') {
      setCurrentStep('importing');
      const validRows = csvRows.filter((_, index) => parsedRows[index]?.isValid);
      const result = await importEvents(validRows, mappings);
      setImportResult(result);
      setCurrentStep('complete');
    }
  }, [currentStep, file, csvRows, mappings, validateRows, parsedRows, importEvents]);

  const handleBack = useCallback(() => {
    if (currentStep === 'mapping') {
      setCurrentStep('upload');
    } else if (currentStep === 'preview') {
      setCurrentStep('mapping');
    }
  }, [currentStep]);

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors',
                  index < currentStepIndex
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : index === currentStepIndex
                    ? 'border-blue-600 text-blue-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-400'
                )}
              >
                {index < currentStepIndex ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>
              <span className={cn(
                'mt-2 text-xs font-medium',
                index <= currentStepIndex
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-400'
              )}>
                {step.title}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-16 h-0.5 mx-2',
                  index < currentStepIndex
                    ? 'bg-blue-600'
                    : 'bg-gray-300 dark:bg-gray-600'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Contenido del paso actual */}
      <div className="min-h-[300px]">
        {currentStep === 'upload' && (
          <div className="space-y-4">
            <FileUploader
              file={file}
              onFileSelect={handleFileSelect}
              onFileClear={handleFileClear}
            />
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={generateTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Descargar plantilla CSV
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'mapping' && (
          <ColumnMapper
            csvColumns={csvHeaders}
            mappings={mappings}
            onMappingChange={handleMappingChange}
          />
        )}

        {currentStep === 'preview' && (
          <ImportPreview rows={parsedRows} mappings={mappings} />
        )}

        {currentStep === 'importing' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin mb-4" />
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Importando eventos...
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Por favor, no cierres esta página
            </p>
            <div className="w-64">
              <Progress value={progress} />
              <p className="text-sm text-center text-gray-500 mt-2">{progress}%</p>
            </div>
          </div>
        )}

        {currentStep === 'complete' && importResult && (
          <div className="flex flex-col items-center justify-center py-12">
            {importResult.success > 0 ? (
              <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            ) : (
              <XCircle className="h-16 w-16 text-red-500 mb-4" />
            )}
            <p className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Importación completada
            </p>
            <div className="flex gap-4 mt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{importResult.success}</p>
                <p className="text-sm text-gray-500">Exitosos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                <p className="text-sm text-gray-500">Fallidos</p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg max-w-md">
                <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                  Errores:
                </p>
                <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>Fila {err.row}: {err.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botones de navegación */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          variant="outline"
          onClick={currentStep === 'complete' ? onComplete : handleBack}
          disabled={isImporting}
        >
          {currentStep === 'complete' ? (
            'Cerrar'
          ) : currentStep === 'upload' ? (
            <>
              <XCircle className="h-4 w-4 mr-2" />
              Cancelar
            </>
          ) : (
            <>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Atrás
            </>
          )}
        </Button>

        {currentStep !== 'complete' && currentStep !== 'importing' && (
          <Button
            onClick={handleNext}
            disabled={
              (currentStep === 'upload' && !file) ||
              (currentStep === 'mapping' && !requiredFieldsMapped) ||
              (currentStep === 'preview' && parsedRows.every(r => !r.isValid))
            }
            className="bg-blue-600 hover:bg-blue-700"
          >
            {currentStep === 'preview' ? (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar {parsedRows.filter(r => r.isValid).length} eventos
              </>
            ) : (
              <>
                Siguiente
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        )}

        {currentStep === 'complete' && (
          <Button onClick={onComplete} className="bg-blue-600 hover:bg-blue-700">
            <Check className="h-4 w-4 mr-2" />
            Ir al calendario
          </Button>
        )}
      </div>
    </div>
  );
}
