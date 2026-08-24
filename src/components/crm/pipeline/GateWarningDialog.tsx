'use client';

import { AlertTriangle, X, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface GateWarningDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  missing: string[];
  stageName: string;
}

export function GateWarningDialog({
  open,
  onClose,
  onConfirm,
  missing,
  stageName,
}: GateWarningDialogProps) {
  const hasMissing = missing.length > 0;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Criterios incompletos
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            La oportunidad no cumple los criterios para avanzar a la etapa{' '}
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              &quot;{stageName}&quot;
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          {hasMissing && (
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Faltan los siguientes requisitos:</AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                  {missing.map((criterion, index) => (
                    <li key={index} className="text-amber-700 dark:text-amber-300">
                      {criterion}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Puedes avanzar de todos modos (soft-gate) o cancelar y completar los
            datos faltantes.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
          >
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <ArrowRight className="h-4 w-4 mr-1" />
            Avanzar de todos modos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
