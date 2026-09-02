'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  loading?: boolean;
  /** Ancho máximo del diálogo. Por defecto 'max-w-2xl'. */
  maxWidth?: string;
}

/**
 * Diálogo reutilizable para crear entidades "en línea" desde el formulario
 * de nuevo producto (categoría, proveedor, etc.). Envuelve el contenido en
 * un Dialog con scroll vertical para formularios largos.
 */
export function QuickCreateDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  loading = false,
  maxWidth = 'max-w-2xl',
}: QuickCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${maxWidth} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            {title}
          </DialogTitle>
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </DialogHeader>
        <div className="mt-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
