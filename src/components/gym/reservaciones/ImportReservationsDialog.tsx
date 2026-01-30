'use client';

import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  Download,
  Loader2,
  X
} from 'lucide-react';
import { GymClass, createReservation } from '@/lib/services/gymService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toast } from 'sonner';

interface ImportReservationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
  classes: GymClass[];
}

interface ParsedReservation {
  customerEmail: string;
  customerName: string;
  classTitle: string;
  classDate: string;
  notes: string;
  isValid: boolean;
  errors: string[];
  customerId?: string;
  classId?: number;
}

export function ImportReservationsDialog({ 
  open, 
  onOpenChange, 
  onImportComplete,
  classes 
}: ImportReservationsDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parsedReservations, setParsedReservations] = useState<ParsedReservation[]>([]);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [importedCount, setImportedCount] = useState(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error('El archivo debe tener al menos una fila de datos');
        return;
      }

      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      const emailIndex = headers.findIndex(h => h.includes('email') || h.includes('correo'));
      const nameIndex = headers.findIndex(h => h.includes('nombre') || h.includes('name') || h.includes('cliente'));
      const classIndex = headers.findIndex(h => h.includes('clase') || h.includes('class'));
      const dateIndex = headers.findIndex(h => h.includes('fecha') || h.includes('date'));
      const notesIndex = headers.findIndex(h => h.includes('nota') || h.includes('notes'));

      const parsed: ParsedReservation[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const errors: string[] = [];

        const customerEmail = emailIndex >= 0 ? values[emailIndex] : '';
        const customerName = nameIndex >= 0 ? values[nameIndex] : '';
        const classTitle = classIndex >= 0 ? values[classIndex] : '';
        const classDate = dateIndex >= 0 ? values[dateIndex] : '';
        const notes = notesIndex >= 0 ? values[notesIndex] : '';

        if (!customerEmail) errors.push('Email requerido');
        if (!classTitle) errors.push('Clase requerida');

        // Buscar cliente por email
        let customerId: string | undefined;
        if (customerEmail) {
          const orgId = getOrganizationId();
          const { data: customerData } = await supabase
            .from('customers')
            .select('id')
            .eq('organization_id', orgId)
            .ilike('email', customerEmail)
            .single();
          
          if (customerData) {
            customerId = customerData.id;
          } else {
            errors.push('Cliente no encontrado');
          }
        }

        // Buscar clase por título
        let classId: number | undefined;
        if (classTitle) {
          const matchingClass = classes.find(c => 
            c.title.toLowerCase().includes(classTitle.toLowerCase()) ||
            classTitle.toLowerCase().includes(c.title.toLowerCase())
          );
          if (matchingClass) {
            classId = matchingClass.id;
          } else {
            errors.push('Clase no encontrada');
          }
        }

        parsed.push({
          customerEmail,
          customerName,
          classTitle,
          classDate,
          notes,
          isValid: errors.length === 0,
          errors,
          customerId,
          classId,
        });
      }

      setParsedReservations(parsed);
      setImportStep('preview');
    } catch (error) {
      console.error('Error parseando archivo:', error);
      toast.error('Error al leer el archivo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    const validReservations = parsedReservations.filter(r => r.isValid);
    if (validReservations.length === 0) {
      toast.error('No hay reservaciones válidas para importar');
      return;
    }

    setIsLoading(true);
    let imported = 0;

    try {
      for (const reservation of validReservations) {
        if (reservation.customerId && reservation.classId) {
          try {
            await createReservation({
              gym_class_id: reservation.classId,
              customer_id: reservation.customerId,
              notes: reservation.notes || undefined,
              reservation_source: 'import',
            });
            imported++;
          } catch (err) {
            console.error('Error importando reservación:', err);
          }
        }
      }

      setImportedCount(imported);
      setImportStep('done');
      toast.success(`${imported} reservaciones importadas correctamente`);
      onImportComplete();
    } catch (error) {
      console.error('Error en importación:', error);
      toast.error('Error durante la importación');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setParsedReservations([]);
    setImportStep('upload');
    setImportedCount(0);
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const template = 'email,nombre_cliente,clase,fecha,notas\njuan@ejemplo.com,Juan Pérez,Spinning,2025-01-30,Primera clase\nmaria@ejemplo.com,María García,Yoga,2025-01-30,';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_reservaciones.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = parsedReservations.filter(r => r.isValid).length;
  const invalidCount = parsedReservations.filter(r => !r.isValid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Importar Reservaciones
          </DialogTitle>
          <DialogDescription>
            Importa reservaciones desde un archivo CSV
          </DialogDescription>
        </DialogHeader>

        {importStep === 'upload' && (
          <div className="space-y-4">
            <div 
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                Arrastra un archivo CSV o haz clic para seleccionar
              </p>
              <p className="text-xs text-gray-500">
                Formato: email, nombre_cliente, clase, fecha, notas
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <Button
              variant="outline"
              onClick={downloadTemplate}
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              Descargar Plantilla CSV
            </Button>
          </div>
        )}

        {importStep === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {validCount} válidas
              </Badge>
              {invalidCount > 0 && (
                <Badge className="bg-red-100 text-red-800">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {invalidCount} con errores
                </Badge>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Estado</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Clase</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedReservations.map((res, index) => (
                    <TableRow key={index} className={!res.isValid ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                      <TableCell>
                        {res.isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <span title={res.errors.join(', ')}>
                            <AlertCircle className="h-4 w-4 text-red-500" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{res.customerName || res.customerEmail}</p>
                          {res.customerName && <p className="text-xs text-gray-500">{res.customerEmail}</p>}
                        </div>
                      </TableCell>
                      <TableCell>{res.classTitle}</TableCell>
                      <TableCell className="text-sm text-gray-500">{res.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {importStep === 'done' && (
          <div className="py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              ¡Importación Completada!
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Se importaron <strong>{importedCount}</strong> reservaciones correctamente.
            </p>
          </div>
        )}

        <DialogFooter>
          {importStep === 'done' ? (
            <Button onClick={handleClose} className="bg-blue-600 hover:bg-blue-700">
              Cerrar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              {importStep === 'preview' && (
                <Button
                  onClick={handleImport}
                  disabled={isLoading || validCount === 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Importar {validCount} Reservaciones
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
