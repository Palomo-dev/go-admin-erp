'use client';

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClientForm } from '@/components/clientes/new/ClientForm';
import { customerValuesFromAction } from '@/lib/services/customers/customerPayload';
import type { PendingAction } from '@/lib/ai/assistant/clientTypes';

interface Props {
  action: PendingAction;
  organizationId: number;
  branchId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El formulario del módulo ya guardó: se cierra la propuesta con ese id. */
  onCreated: (customerId: string) => void;
}

/**
 * El MISMO formulario de `/app/clientes/new`, abierto desde la tarjeta del
 * asistente y prellenado con lo que entendió del mensaje (persona/empresa,
 * documento, teléfono…). No hay un segundo formulario "del chat": si cambia
 * `ClientForm`, cambia aquí.
 */
export default function CustomerFormDialog({ action, organizationId, branchId, open, onOpenChange, onCreated }: Props) {
  const fields = Object.fromEntries(action.fields.map((f) => [f.name, f.value]));
  const initialValues = customerValuesFromAction(fields);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Es el formulario de Clientes, con lo que entendí del mensaje ya puesto. Revísalo y guarda.
          </DialogDescription>
        </DialogHeader>
        <div className="px-2 pb-4">
          <ClientForm
            organizationId={organizationId}
            branchId={branchId ?? undefined}
            embedded
            initialValues={initialValues}
            onSuccess={(customer: { id?: string }) => {
              if (customer?.id) onCreated(String(customer.id));
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
