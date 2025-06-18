'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface MergeModalProps {
  existingClient: {
    id: string;
    first_name: string;
    last_name: string;
    email?: string;
    doc_number?: string;
    roles?: string[];
  };
  newClientData: {
    firstName: string;
    lastName: string;
    email?: string;
    documentNumber?: string;
  };
  onMerge: (action: 'keep-existing' | 'update-existing' | 'create-new') => void;
  onCancel: () => void;
}

export function MergeModal({ existingClient, newClientData, onMerge, onCancel }: MergeModalProps) {
  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-center">Cliente Duplicado Detectado</DialogTitle>
          <DialogDescription className="text-center text-gray-600 dark:text-gray-400">
            Se ha encontrado un cliente con el mismo documento o correo electrónico.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-4 border border-gray-200 dark:border-gray-700 rounded-md">
              <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">Cliente Existente</h3>
              <ul className="space-y-2 text-sm">
                <li><span className="font-medium">Nombre:</span> {existingClient.first_name} {existingClient.last_name}</li>
                {existingClient.email && <li><span className="font-medium">Email:</span> {existingClient.email}</li>}
                {existingClient.doc_number && <li><span className="font-medium">Documento:</span> {existingClient.doc_number}</li>}
                {existingClient.roles && existingClient.roles.length > 0 && (
                  <li>
                    <span className="font-medium">Roles:</span>{" "}
                    {existingClient.roles.join(", ")}
                  </li>
                )}
              </ul>
            </Card>

            <Card className="p-4 border border-gray-200 dark:border-gray-700 rounded-md">
              <h3 className="font-semibold text-green-600 dark:text-green-400 mb-2">Nuevo Cliente</h3>
              <ul className="space-y-2 text-sm">
                <li><span className="font-medium">Nombre:</span> {newClientData.firstName} {newClientData.lastName}</li>
                {newClientData.email && <li><span className="font-medium">Email:</span> {newClientData.email}</li>}
                {newClientData.documentNumber && <li><span className="font-medium">Documento:</span> {newClientData.documentNumber}</li>}
              </ul>
            </Card>
          </div>
          
          <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-md border border-amber-200 dark:border-amber-700">
            <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-1">¿Qué acción desea realizar?</h4>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Seleccione cómo desea proceder con este cliente duplicado.
            </p>
          </div>
        </div>
        
        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => onMerge('keep-existing')}
            className="w-full sm:w-auto"
          >
            Usar Existente
          </Button>
          
          <Button
            variant="secondary"
            onClick={() => onMerge('update-existing')}
            className="w-full sm:w-auto"
          >
            Actualizar Existente
          </Button>
          
          <Button
            onClick={() => onMerge('create-new')}
            className="w-full sm:w-auto"
          >
            Crear como Nuevo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
