'use client';

/**
 * Pestaña "Email" de Configuración › CRM (FASE-07 §5.1): dominios + DNS +
 * verificar, remitentes/tracking por dominio, política de fallback y firma
 * personal. Dominios/política solo para administradores; la firma es de cada
 * usuario.
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { EmailDomainsCard } from './email/EmailDomainsCard';
import { EmailPolicyCard } from './email/EmailPolicyCard';
import { SignatureEditor } from './email/SignatureEditor';
import { useEmailSettings } from './email/useEmailSettings';

export function EmailTab() {
  const api = useEmailSettings();

  if (api.loading && !api.settings) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Cargando configuración de email">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (api.error || !api.settings) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>No se pudo cargar la configuración de email</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-2">
          <span>{api.error ?? 'Sin datos'}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => api.refresh()} className="gap-1"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Reintentar</Button>
        </AlertDescription>
      </Alert>
    );
  }

  const canEdit = api.settings.is_admin;
  return (
    <div className="space-y-6">
      {!canEdit && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Solo los administradores pueden gestionar dominios y la política de envío. Puedes editar tu firma.</p>
      )}
      <EmailDomainsCard api={api} canEdit={canEdit} />
      <EmailPolicyCard settings={api.settings} onSave={api.savePolicy} busy={api.busy === 'policy'} canEdit={canEdit} />
      <SignatureEditor value={api.settings.signature_html} onSave={api.saveSignature} busy={api.busy === 'signature'} />
    </div>
  );
}
