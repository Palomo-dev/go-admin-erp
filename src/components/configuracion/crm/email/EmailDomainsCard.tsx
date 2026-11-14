'use client';

/**
 * Tarjeta de dominios de envío: lista con estado, por defecto, verificar,
 * eliminar; al expandir muestra DNS y remitente. Solo admins editan.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Globe, Plus, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { EmailDomain, EmailDomainStatus } from '@/lib/services/crm/email/types';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { cn } from '@/utils/Utils';
import { AddDomainDialog } from './AddDomainDialog';
import { DnsRecordsTable } from './DnsRecordsTable';
import { DomainSendersForm } from './DomainSendersForm';
import type { EmailSettingsApi } from './useEmailSettings';

/** Variante del badge por estado; la etiqueta visible sale de `estados.<estado>`. */
const STATUS: Record<EmailDomainStatus, 'success' | 'secondary' | 'destructive' | 'outline'> = {
  verified: 'success',
  verifying: 'secondary',
  pending: 'outline',
  failed: 'destructive',
};

interface Props {
  api: EmailSettingsApi;
  canEdit: boolean;
}

export function EmailDomainsCard({ api, canEdit }: Props) {
  const t = useTranslations('configuracionTextos.emailDomainsCard');
  // «Verificado el…» con la zona horaria de la organización (antes `toLocaleString('es-CO')`, sin zona).
  const { formatDateTime } = useFormatDate();
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(api.domains.find((d) => d.status !== 'verified')?.id ?? null);
  const [pendingDelete, setPendingDelete] = useState<EmailDomain | null>(null);

  return (
    <Card className="dark:border-gray-700 dark:bg-gray-800">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4" aria-hidden="true" /> {t('titulo')}</CardTitle>
          <CardDescription>{t('descripcion')}</CardDescription>
        </div>
        {canEdit && <Button type="button" size="sm" onClick={() => setAddOpen(true)} className="gap-1 shrink-0"><Plus className="h-4 w-4" aria-hidden="true" /> {t('anadir')}</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {api.domains.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            {canEdit ? t('vacio.admin') : t('vacio.lector')}
          </p>
        ) : api.domains.map((d) => {
          const open = expanded === d.id;
          const estado: EmailDomainStatus = STATUS[d.status] ? d.status : 'pending';
          return (
            <div key={d.id} className={cn('rounded-lg border border-gray-200 dark:border-gray-700', open && 'bg-gray-50/60 dark:bg-gray-900/40')}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setExpanded(open ? null : d.id)} aria-expanded={open} aria-controls={`dom-${d.id}`} className="flex items-center gap-2 text-left">
                  {open ? <ChevronUp className="h-4 w-4 text-gray-400" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{d.domain}</span>
                </button>
                <Badge variant={STATUS[estado]}>{t(`estados.${estado}`)}</Badge>
                {d.is_default && <Badge variant="outline" className="gap-1"><Star className="h-3 w-3" aria-hidden="true" /> {t('porDefecto')}</Badge>}
                {d.api_key_unreadable ? (
                  <Badge variant="outline" className="text-red-700 dark:text-red-300" title={t('apiKeyIlegible.ayuda')}>{t('apiKeyIlegible.etiqueta')}</Badge>
                ) : d.has_api_key ? null : (
                  <Badge variant="outline" className="text-amber-700 dark:text-amber-300">{t('sinApiKey')}</Badge>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">{d.from_name ? `${d.from_name} <${d.from_email}>` : d.from_email}</span>
                {canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    {!d.is_default && d.status === 'verified' && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => api.makeDefault(d.id)} disabled={api.busy === `default:${d.id}`} className="h-7 gap-1 text-xs"><Star className="h-3.5 w-3.5" aria-hidden="true" /> {t('porDefecto')}</Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDelete(d)} aria-label={t('eliminarAria', { dominio: d.domain })} className="h-7 text-red-600 hover:text-red-700 dark:text-red-400"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                  </div>
                )}
              </div>
              {open && (
                <div id={`dom-${d.id}`} className="space-y-4 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                  <DnsRecordsTable records={d.dns_records} onVerify={() => api.verify(d.id)} verifying={api.busy === `verify:${d.id}`} canVerify={canEdit} />
                  {d.verified_at && <p className="text-xs text-gray-500 dark:text-gray-400">{t('verificadoEl', { fecha: formatDateTime(d.verified_at), region: d.region })}</p>}
                  <DomainSendersForm domain={d} onSave={(body) => api.update(d.id, body)} busy={api.busy === `update:${d.id}`} canEdit={canEdit} />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      <AddDomainDialog open={addOpen} onOpenChange={setAddOpen} onSubmit={api.addDomain} busy={api.busy === 'add'} />
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={t('eliminar.titulo')}
        description={t('eliminar.descripcion', { dominio: pendingDelete?.domain ?? '' })}
        confirmLabel={t('eliminar.confirmar')}
        variant="destructive"
        loading={!!pendingDelete && api.busy === `remove:${pendingDelete.id}`}
        onConfirm={async () => { if (pendingDelete) { await api.remove(pendingDelete.id); setPendingDelete(null); } }}
      />
    </Card>
  );
}
