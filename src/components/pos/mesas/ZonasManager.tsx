'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
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

interface ZonasManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zonas: string[];
  onEditarZona: (zonaAntigua: string, zonaNueva: string) => Promise<void>;
  onEliminarZona: (zona: string) => Promise<void>;
}

export function ZonasManager({
  open,
  onOpenChange,
  zonas,
  onEditarZona,
  onEliminarZona,
}: ZonasManagerProps) {
  const [zonaEditar, setZonaEditar] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [zonaEliminar, setZonaEliminar] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleEditar = async () => {
    if (!zonaEditar || !nuevoNombre.trim()) return;

    setIsProcessing(true);
    try {
      await onEditarZona(zonaEditar, nuevoNombre.trim());
      setZonaEditar(null);
      setNuevoNombre('');
    } catch (error) {
      console.error('Error editando zona:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEliminar = async () => {
    if (!zonaEliminar) return;

    setIsProcessing(true);
    try {
      await onEliminarZona(zonaEliminar);
      setZonaEliminar(null);
    } catch (error) {
      console.error('Error eliminando zona:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Gestionar Zonas</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {zonas.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No hay zonas creadas
              </div>
            ) : (
              zonas.map((zona) => (
                <Card key={zona} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {zona}
                      </h3>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setZonaEditar(zona);
                          setNuevoNombre(zona);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setZonaEliminar(zona)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Zona */}
      <Dialog open={!!zonaEditar} onOpenChange={() => setZonaEditar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Zona</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nuevo nombre</Label>
              <Input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Nombre de la zona"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZonaEditar(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEditar} disabled={isProcessing}>
              {isProcessing ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog Eliminar */}
      <AlertDialog
        open={!!zonaEliminar}
        onOpenChange={() => setZonaEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar zona?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción quitará la zona de todas las mesas asociadas. Las
              mesas no serán eliminadas, solo quedarán sin zona asignada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEliminar}
              disabled={isProcessing}
              className="bg-red-600 hover:bg-red-700"
            >
              {isProcessing ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
