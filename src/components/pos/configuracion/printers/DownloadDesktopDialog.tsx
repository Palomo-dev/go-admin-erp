'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Monitor, KeyRound, Printer, CheckCircle2 } from 'lucide-react';

interface DownloadDesktopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * URL de descarga del instalador de Go Admin Desktop.
 * Por ahora apunta a las instrucciones; cuando exista el .exe (GitHub Releases),
 * actualizar esta constante.
 */
const DOWNLOAD_URL: string | null = null;

const STEPS = [
  {
    icon: Download,
    title: 'Descarga e instala',
    description:
      'Descarga Go Admin Desktop en el computador del local (el que está conectado a las impresoras) y ejecuta el instalador.',
  },
  {
    icon: KeyRound,
    title: 'Inicia sesión',
    description:
      'Abre la aplicación e ingresa el mismo email y contraseña que usas en GO Admin. La organización y sucursal se detectan automáticamente.',
  },
  {
    icon: Printer,
    title: 'Configura tus impresoras',
    description:
      'Vuelve a esta página y usa "Detectar impresoras automáticamente" al crear una impresora. Las comandas empezarán a imprimirse solas.',
  },
];

export function DownloadDesktopDialog({ open, onOpenChange }: DownloadDesktopDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-blue-600" />
            Go Admin Desktop
          </DialogTitle>
          <DialogDescription>
            Aplicación para Windows que conecta tus impresoras físicas con GO Admin. Se instala una
            sola vez en el computador del local.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <step.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {i + 1}. {step.title}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{step.description}</p>
              </div>
            </div>
          ))}

          <div className="flex items-start gap-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 p-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
            <p className="text-xs text-green-700 dark:text-green-400">
              Una vez instalado, aparecerá como "En línea" en esta página y las comandas se
              imprimirán automáticamente en cocina, bar y caja.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {DOWNLOAD_URL ? (
            <Button asChild>
              <a href={DOWNLOAD_URL} download>
                <Download className="h-4 w-4 mr-2" />
                Descargar para Windows
              </a>
            </Button>
          ) : (
            <Badge variant="secondary" className="self-center px-3 py-1.5">
              Instalador disponible próximamente
            </Badge>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
