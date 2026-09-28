'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
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
 * Apunta a "latest" en GitHub Releases del repositorio público de releases
 * (Palomo-dev/go-admin-desktop-releases): siempre descarga la última versión
 * publicada sin necesidad de actualizar esta constante. `GoAdminERP-Setup.exe`
 * es la copia con nombre estable que sube .github/workflows/desktop-release.yml
 * junto al asset versionado (`GoAdminERP-Setup-<versión>.exe`) que usa el
 * auto-update. Mientras el repo de releases no tenga token, la misma copia
 * estable existe en el repo de código (transición 0.1.x).
 */
const DOWNLOAD_URL: string | null =
  'https://github.com/Palomo-dev/go-admin-erp/releases/latest/download/GoAdminERP-Setup.exe';

/** Pasos de la guía; los textos están en `session.desktopDialog.steps.<clave>`. */
const STEPS = [
  { icon: Download, clave: 'install' },
  { icon: KeyRound, clave: 'signIn' },
  { icon: Printer, clave: 'printers' },
] as const;

export function DownloadDesktopDialog({ open, onOpenChange }: DownloadDesktopDialogProps) {
  const t = useTranslations('session.desktopDialog');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-blue-600" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {STEPS.map((step, i) => (
            <div key={step.clave} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                <step.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {i + 1}. {t(`steps.${step.clave}.title`)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t(`steps.${step.clave}.description`)}</p>
              </div>
            </div>
          ))}

          <div className="flex items-start gap-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 p-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
            <p className="text-xs text-green-700 dark:text-green-400">{t('onlineHint')}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          {DOWNLOAD_URL ? (
            <Button asChild>
              <a href={DOWNLOAD_URL} download>
                <Download className="h-4 w-4 mr-2" />
                {t('download')}
              </a>
            </Button>
          ) : (
            <Badge variant="secondary" className="self-center px-3 py-1.5">
              {t('comingSoon')}
            </Badge>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
