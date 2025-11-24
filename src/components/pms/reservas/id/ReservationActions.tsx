'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Printer,
  Copy,
  XCircle,
  FileText,
  Receipt,
  MoreVertical,
  ArrowLeft,
} from 'lucide-react';

interface ReservationActionsProps {
  reservationId: string;
  status: string;
  onBack: () => void;
  onPrint: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
  onInvoice: () => void;
  onReceipt: () => void;
}

export function ReservationActions({
  reservationId,
  status,
  onBack,
  onPrint,
  onDuplicate,
  onCancel,
  onInvoice,
  onReceipt,
}: ReservationActionsProps) {
  const canCancel = ['tentative', 'confirmed'].includes(status);

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver
      </Button>

      <Button variant="outline" onClick={onPrint}>
        <Printer className="h-4 w-4 mr-2" />
        Imprimir
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <MoreVertical className="h-4 w-4 mr-2" />
            Más Acciones
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicar Reserva
          </DropdownMenuItem>

          <DropdownMenuItem onClick={onInvoice}>
            <FileText className="mr-2 h-4 w-4" />
            Emitir Factura
          </DropdownMenuItem>

          <DropdownMenuItem onClick={onReceipt}>
            <Receipt className="mr-2 h-4 w-4" />
            Generar Recibo
          </DropdownMenuItem>

          {canCancel && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onCancel}
                className="text-red-600 dark:text-red-400"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancelar Reserva
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
