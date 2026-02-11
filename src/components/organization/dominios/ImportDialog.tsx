'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DomainType } from '@/lib/services/domainService';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (domains: Array<{ host: string; domain_type?: DomainType }>) => Promise<{
    success: number;
    failed: number;
    errors: string[];
  }>;
}

interface ParsedDomain {
  host: string;
  domain_type: DomainType;
  valid: boolean;
  error?: string;
}

export function ImportDialog({ open, onOpenChange, onImport }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedDomains, setParsedDomains] = useState<ParsedDomain[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setParsedDomains([]);
    setImportResult(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setImportResult(null);

    // Parsear CSV
    const text = await selectedFile.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    // Saltar header si existe
    const startIndex = lines[0]?.toLowerCase().includes('host') || lines[0]?.toLowerCase().includes('domain') ? 1 : 0;
    
    const parsed: ParsedDomain[] = lines.slice(startIndex).map(line => {
      const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
      const host = parts[0]?.toLowerCase();
      const type = (parts[1]?.toLowerCase() === 'subdomain' ? 'subdomain' : 'custom_domain') as DomainType;

      // Validar formato de dominio
      const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
      const valid = domainRegex.test(host);

      return {
        host,
        domain_type: type,
        valid,
        error: valid ? undefined : 'Formato de dominio inválido',
      };
    });

    setParsedDomains(parsed);
  };

  const handleImport = async () => {
    const validDomains = parsedDomains.filter(d => d.valid);
    if (validDomains.length === 0) return;

    setIsImporting(true);
    try {
      const result = await onImport(validDomains.map(d => ({
        host: d.host,
        domain_type: d.domain_type,
      })));
      setImportResult(result);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const validCount = parsedDomains.filter(d => d.valid).length;
  const invalidCount = parsedDomains.filter(d => !d.valid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] dark:bg-gray-800 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <DialogTitle className="dark:text-white">
                Importar Dominios
              </DialogTitle>
              <DialogDescription className="dark:text-gray-400">
                Importa múltiples dominios desde un archivo CSV
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Resultado de importación */}
          {importResult && (
            <Alert className={
              importResult.failed === 0 
                ? 'dark:bg-green-900/20 dark:border-green-800 border-green-300 bg-green-50'
                : 'dark:bg-yellow-900/20 dark:border-yellow-800 border-yellow-300 bg-yellow-50'
            }>
              <CheckCircle2 className={`h-4 w-4 ${importResult.failed === 0 ? 'text-green-600' : 'text-yellow-600'}`} />
              <AlertDescription className="dark:text-gray-300">
                <strong>Importación completada:</strong>
                <br />
                ✓ {importResult.success} dominios importados correctamente
                {importResult.failed > 0 && (
                  <>
                    <br />
                    ✗ {importResult.failed} dominios fallidos
                  </>
                )}
                {importResult.errors.length > 0 && (
                  <ul className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {importResult.errors.slice(0, 3).map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                    {importResult.errors.length > 3 && (
                      <li>• ... y {importResult.errors.length - 3} errores más</li>
                    )}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Selector de archivo */}
          {!importResult && (
            <>
              <div className="space-y-2">
                <Label className="dark:text-gray-200">Archivo CSV</Label>
                <div 
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          resetState();
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 dark:text-gray-400">
                        Haz clic para seleccionar un archivo CSV
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        o arrastra y suelta aquí
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Formato esperado */}
              <Alert className="dark:bg-gray-900 dark:border-gray-700">
                <AlertTriangle className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <AlertDescription className="text-sm dark:text-gray-300">
                  <strong>Formato esperado del CSV:</strong>
                  <code className="block mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                    host,domain_type<br />
                    www.ejemplo.com,custom_domain<br />
                    app.miempresa.goadmin.io,subdomain
                  </code>
                </AlertDescription>
              </Alert>

              {/* Vista previa de dominios */}
              {parsedDomains.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="dark:text-gray-200">Vista Previa</Label>
                    <div className="flex gap-2">
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        {validCount} válidos
                      </Badge>
                      {invalidCount > 0 && (
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          {invalidCount} inválidos
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Dominio</th>
                          <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Tipo</th>
                          <th className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {parsedDomains.slice(0, 10).map((domain, idx) => (
                          <tr key={idx} className={!domain.valid ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                            <td className="px-3 py-2 text-gray-900 dark:text-white">{domain.host}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                              {domain.domain_type === 'subdomain' ? 'Subdominio' : 'Personalizado'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {domain.valid ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                              ) : (
                                <span className="text-xs text-red-600 dark:text-red-400">{domain.error}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {parsedDomains.length > 10 && (
                      <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 text-center bg-gray-50 dark:bg-gray-900">
                        ... y {parsedDomains.length - 10} dominios más
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {importResult ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!importResult && (
            <Button
              onClick={handleImport}
              disabled={isImporting || validCount === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isImporting ? 'Importando...' : `Importar ${validCount} dominio${validCount !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportDialog;
