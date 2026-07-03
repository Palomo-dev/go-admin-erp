'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ClientForm } from '@/components/clientes/new/ClientForm';

interface ClienteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  branchId?: number;
  /** Se llama con el cliente creado; el diálogo se cierra automáticamente */
  onCreated: (customer: any) => void;
}

/**
 * Diálogo compartido que reutiliza el formulario COMPLETO de cliente (ClientForm).
 * Cualquier cambio en ClientForm se refleja aquí automáticamente.
 */
export function ClienteFormDialog({ open, onOpenChange, organizationId, branchId, onCreated }: ClienteFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">Nuevo Cliente</DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            Completa la información para registrar un nuevo cliente.
          </DialogDescription>
        </DialogHeader>
        <ClientForm
          organizationId={organizationId}
          branchId={branchId}
          mode="create"
          embedded
          onSuccess={(customer) => {
            onCreated(customer);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default ClienteFormDialog;
