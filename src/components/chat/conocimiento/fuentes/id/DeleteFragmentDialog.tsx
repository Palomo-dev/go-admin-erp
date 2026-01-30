'use client';

import { Loader2, AlertTriangle } from 'lucide-react';
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

interface DeleteFragmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fragmentTitle: string;
  onConfirm: () => Promise<void>;
  loading?: boolean;
}

export default function DeleteFragmentDialog({
  open,
  onOpenChange,
  fragmentTitle,
  onConfirm,
  loading
}: DeleteFragmentDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              Eliminar Fragmento
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-gray-500 dark:text-gray-400 pt-2">
            ¿Estás seguro de eliminar el fragmento <strong className="text-gray-700 dark:text-gray-300">&quot;{fragmentTitle}&quot;</strong>?
            <br /><br />
            Esta acción eliminará también los embeddings asociados y no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            disabled={loading}
            className="border-gray-300 dark:border-gray-700"
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Eliminando...
              </>
            ) : (
              'Eliminar Fragmento'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
