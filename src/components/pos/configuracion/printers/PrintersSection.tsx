'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Printer as PrinterIcon, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  PrintersService,
  type Printer,
  type PrinterFormData,
  STATION_LABELS,
  CONNECTION_TYPE_LABELS,
} from '../printersService';
import { PrinterFormDialog } from './PrinterFormDialog';

interface PrintersSectionProps {
  branches: { id: number; name: string }[];
}

export function PrintersSection({ branches }: PrintersSectionProps) {
  const { toast } = useToast();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<Printer | null>(null);
  const [printerToDelete, setPrinterToDelete] = useState<Printer | null>(null);

  const loadPrinters = useCallback(async () => {
    setLoading(true);
    try {
      const data = await PrintersService.getPrinters();
      setPrinters(data);
    } catch (error) {
      console.error('Error cargando impresoras:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las impresoras', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  const handleSave = async (form: PrinterFormData) => {
    try {
      if (editingPrinter) {
        await PrintersService.updatePrinter(editingPrinter.id, form);
        toast({ title: 'Actualizada', description: 'Impresora actualizada correctamente' });
      } else {
        await PrintersService.createPrinter(form);
        toast({ title: 'Creada', description: 'Impresora creada correctamente' });
      }
      await loadPrinters();
    } catch (error) {
      console.error('Error guardando impresora:', error);
      toast({ title: 'Error', description: 'No se pudo guardar la impresora', variant: 'destructive' });
      throw error;
    }
  };

  const handleToggle = async (printer: Printer) => {
    try {
      await PrintersService.togglePrinter(printer.id, !printer.is_active);
      await loadPrinters();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo actualizar la impresora', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!printerToDelete) return;
    try {
      await PrintersService.deletePrinter(printerToDelete.id);
      toast({ title: 'Eliminada', description: 'Impresora eliminada correctamente' });
      await loadPrinters();
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudo eliminar la impresora', variant: 'destructive' });
    } finally {
      setPrinterToDelete(null);
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <PrinterIcon className="h-5 w-5 text-slate-600" />
            Impresoras
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Configura impresoras USB, red, Bluetooth o del sistema, y asígnalas a estaciones de cocina/caja
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditingPrinter(null);
            setShowForm(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Impresora
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : printers.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            No hay impresoras configuradas
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {printers.map((printer) => (
              <div
                key={printer.id}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{printer.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {CONNECTION_TYPE_LABELS[printer.connection_type]}
                      {printer.branches?.name ? ` • ${printer.branches.name}` : ' • Todas las sucursales'}
                    </p>
                  </div>
                  <Switch checked={printer.is_active} onCheckedChange={() => handleToggle(printer)} />
                </div>

                {(printer.printer_station_assignments || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {printer.printer_station_assignments!.map((s) => (
                      <Badge key={s.id} variant="secondary" className="text-xs">
                        {STATION_LABELS[s.station]}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingPrinter(printer);
                      setShowForm(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setPrinterToDelete(printer)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <PrinterFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        printer={editingPrinter}
        branches={branches}
        onSave={handleSave}
      />

      <AlertDialog open={!!printerToDelete} onOpenChange={(open) => !open && setPrinterToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar impresora?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "{printerToDelete?.name}" y sus asignaciones de estación. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
