'use client';

import { useState, useRef } from 'react';
import { Upload, Download, FileJson, AlertCircle, CheckCircle } from 'lucide-react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';

import { getTemplates, createTemplate } from '@/lib/services/templateService';
import type { NotificationTemplate, CreateTemplateData } from '@/types/eventTrigger';

interface TemplateImportExportProps {
  onImportComplete?: () => void;
}

export function TemplateImportExport({ onImportComplete }: TemplateImportExportProps) {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [importResults, setImportResults] = useState<{ success: number; failed: number; total: number }>({ success: 0, failed: 0, total: 0 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      const templates = await getTemplates();
      
      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        templates: templates.map(template => ({
          channel: template.channel,
          name: template.name,
          subject: template.subject,
          body_html: template.body_html,
          body_text: template.body_text,
          variables: template.variables,
        })),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `plantillas-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      setIsExportOpen(false);
      
      toast({
        title: 'Exportación exitosa',
        description: `Se exportaron ${templates.length} plantillas`,
      });
    } catch (error) {
      console.error('Error exporting templates:', error);
      toast({
        title: 'Error en la exportación',
        description: 'No se pudieron exportar las plantillas',
        variant: 'destructive',
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      setImportFile(file);
      setImportStatus('idle');
    } else {
      toast({
        title: 'Archivo inválido',
        description: 'Por favor selecciona un archivo JSON válido',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    if (!importFile) return;

    try {
      setImportStatus('processing');
      setImportProgress(0);

      const text = await importFile.text();
      const data = JSON.parse(text);

      if (!data.templates || !Array.isArray(data.templates)) {
        throw new Error('Formato de archivo inválido');
      }

      const templates = data.templates as CreateTemplateData[];
      let success = 0;
      let failed = 0;

      for (let i = 0; i < templates.length; i++) {
        try {
          await createTemplate(templates[i]);
          success++;
        } catch (error) {
          console.error(`Error importing template ${i}:`, error);
          failed++;
        }
        
        setImportProgress(((i + 1) / templates.length) * 100);
      }

      setImportResults({ success, failed, total: templates.length });
      setImportStatus('success');
      
      if (onImportComplete) {
        onImportComplete();
      }

      if (failed === 0) {
        toast({
          title: 'Importación exitosa',
          description: `Se importaron ${success} plantillas correctamente`,
        });
      } else {
        toast({
          title: 'Importación parcial',
          description: `${success} exitosas, ${failed} fallidas`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error importing templates:', error);
      setImportStatus('error');
      toast({
        title: 'Error en la importación',
        description: 'No se pudieron importar las plantillas',
        variant: 'destructive',
      });
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportStatus('idle');
    setImportProgress(0);
    setImportResults({ success: 0, failed: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex gap-2">
      {/* Importar */}
      <Dialog open={isImportOpen} onOpenChange={(open) => {
        setIsImportOpen(open);
        if (!open) resetImport();
      }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
        </DialogTrigger>
        
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Importar Plantillas
            </DialogTitle>
            <DialogDescription>
              Importa plantillas desde un archivo JSON exportado previamente
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {importStatus === 'idle' && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="import-file">Archivo JSON</Label>
                  <Input
                    id="import-file"
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="mt-1"
                  />
                </div>

                {importFile && (
                  <Alert>
                    <FileJson className="h-4 w-4" />
                    <AlertDescription>
                      Archivo seleccionado: <strong>{importFile.name}</strong>
                      <br />
                      Tamaño: {(importFile.size / 1024).toFixed(2)} KB
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {importStatus === 'processing' && (
              <div className="space-y-4">
                <div>
                  <Label>Progreso de importación</Label>
                  <Progress value={importProgress} className="mt-2" />
                  <p className="text-sm text-muted-foreground mt-1">
                    {Math.round(importProgress)}% completado
                  </p>
                </div>
              </div>
            )}

            {importStatus === 'success' && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Importación completada</strong>
                  <br />
                  Total: {importResults.total} plantillas
                  <br />
                  Exitosas: {importResults.success}
                  <br />
                  Fallidas: {importResults.failed}
                </AlertDescription>
              </Alert>
            )}

            {importStatus === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Error durante la importación. Verifica que el archivo tenga el formato correcto.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsImportOpen(false)}
              disabled={importStatus === 'processing'}
            >
              {importStatus === 'success' ? 'Cerrar' : 'Cancelar'}
            </Button>
            
            {importStatus === 'idle' && (
              <Button 
                onClick={handleImport} 
                disabled={!importFile}
              >
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </Button>
            )}

            {importStatus === 'success' && (
              <Button onClick={resetImport}>
                Importar Más
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exportar */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </DialogTrigger>
        
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Exportar Plantillas
            </DialogTitle>
            <DialogDescription>
              Descarga todas tus plantillas en formato JSON
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <FileJson className="h-4 w-4" />
            <AlertDescription>
              Se exportarán todas las plantillas de tu organización en un archivo JSON.
              Podrás importar este archivo más tarde para restaurar las plantillas.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
