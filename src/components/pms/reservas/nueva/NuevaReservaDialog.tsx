'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { NuevaReservaWizard } from './NuevaReservaWizard';

export interface NuevaReservaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedSpaceId?: string | null;
  preselectedCheckin?: string | null;
  preselectedCheckout?: string | null;
  onSuccess?: () => void;
}

export function NuevaReservaDialog({
  open,
  onOpenChange,
  preselectedSpaceId,
  preselectedCheckin,
  preselectedCheckout,
  onSuccess,
}: NuevaReservaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col gap-0">
        <DialogTitle className="sr-only">Nueva Reserva</DialogTitle>
        <NuevaReservaWizard
          preselectedSpaceId={preselectedSpaceId}
          preselectedCheckin={preselectedCheckin}
          preselectedCheckout={preselectedCheckout}
          showHeader={false}
          onSuccess={onSuccess}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
