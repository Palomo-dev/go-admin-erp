"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { useState } from "react";

interface DeleteStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageName: string;
  opportunityCount: number;
  onConfirm: () => Promise<void>;
}

export function DeleteStageDialog({
  open,
  onOpenChange,
  stageName,
  opportunityCount,
  onConfirm,
}: DeleteStageDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const hasOpportunities = opportunityCount > 0;

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error("Error eliminando etapa:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md mx-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg sm:text-xl text-gray-900 dark:text-gray-100">
            ¿Eliminar etapa &quot;{stageName}&quot;?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
            {hasOpportunities ? (
              <span className="text-red-600 dark:text-red-400">
                Esta etapa contiene {opportunityCount} oportunidad(es).
                Debes moverlas a otra etapa antes de eliminarla.
              </span>
            ) : (
              <>
                Esta acción eliminará permanentemente la etapa del pipeline.
                Esta acción no se puede deshacer.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel
            disabled={isDeleting}
            className="w-full sm:w-auto min-h-[44px] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={hasOpportunities || isDeleting}
            className="w-full sm:w-auto min-h-[44px] bg-red-600 hover:bg-red-700 text-white focus:bg-red-700"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Eliminando...
              </>
            ) : (
              "Eliminar"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
