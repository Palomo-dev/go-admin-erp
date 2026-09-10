'use client';

/**
 * Tarjeta de dominios de envío: lista con estado, por defecto, verificar,
 * eliminar; al expandir muestra DNS y remitente. Solo admins editan.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Globe, Plus, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { EmailDomain, EmailDomainStatus } from '@/lib/services/crm/email/types';
import { cn } from '@/utils/Utils';
import { AddDomainDialog } from './AddDomainDialog';
import { DnsRecordsTable } from './DnsRecordsTable';
import { DomainSendersForm } from './DomainSendersForm';
import type { EmailSettingsApi } from './useEmailSettings';

const STATUS: Record<EmailDomainStatus, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'outline' }> = {
  verified: { label: 'Verificado', variant: 'success' },
  verifying: { label: 'Verificando', variant: 'secondary' },
  pending: { label: 'Pendiente DNS', variant: 'outline' },
  failed: { label: 'Falló', variant: 'destructive' },
};

interface Props {
  api: EmailSettingsApi;
  canEdit: boolean;
}

export function EmailDomainsCard({ api, canEdit }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(api.domains.find((d) => d.status !== 'verified')?.id ?? null);
  const [pendingDelete, setPendingDelete] = useState<EmailDomain | null>(null);

  return (
    <Card className="dark:border-gray-700 dark:bg-gray-800">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4" aria-hidden="true" /> Dominios de envío</CardTitle>
          <CardDescription>Cada organización envía desde su propio dominio verificado. Sin dominio verificado se usa el remitente global según la política de abajo.</CardDescription>
        </div>
        {canEdit && <Button type="button" size="sm" onClick={() => setAddOpen(true)} className="gap-1 shrink-0"><Plus className="h-4 w-4" aria-hidden="true" /> Añadir dominio</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {api.domains.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Aún no hay dominios. {canEdit ? 'Añade uno para enviar desde tu marca.' : 'Pide a un administrador que añada uno.'}
          </p>
        ) : api.domains.map((d) => {
          const open = expanded === d.id;
          const st = STATUS[d.status] ?? STATUS.pending;
          return (
            <div key={d.id} className={cn('rounded-lg border border-gray-200 dark:border-gray-700', open && 'bg-gray-50/60 dark:bg-gray-900/40')}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setExpanded(open ? null : d.id)} aria-expanded={open} aria-controls={`dom-${d.id}`} className="flex items-center gap-2 text-left">
                  {open ? <ChevronUp className="h-4 w-4 text-gray-400" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{d.domain}</span>
                </button>
                <Badge variant={st.variant}>{st.label}</Badge>
                {d.is_default && <Badge variant="outline" className="gap-1"><Star className="h-3 w-3" aria-hidden="true" /> Por defecto</Badge>}
                {d.api_key_unreadable ? (
                  <Badge variant="outline" className="text-red-700 dark:text-red-300" title="La credencial guardada no se puede descifrar (cambió el secreto de cifrado). Regenérala.">API key ilegible — regenerar</Badge>
                ) : d.has_api_key ? null : (
                  <Badge variant="outline" className="text-amber-700 dark:text-amber-300">Sin API key propia</Badge>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">{d.from_name ? `${d.from_name} <${d.from_email}>` : d.from_email}</span>
                {canEdit && (
                  <div className="ml-auto flex items-center gap-1">
                    {!d.is_default && d.status === 'verified' && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => api.makeDefault(d.id)} disabled={api.busy === `default:${d.id}`} className="h-7 gap-1 text-xs"><Star className="h-3.5 w-3.5" aria-hidden="true" /> Por defecto</Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDelete(d)} aria-label={`Eliminar ${d.domain}`} className="h-7 text-red-600 hover:text-red-700 dark:text-red-400"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                  </div>
                )}
              </div>
              {open && (
                <div id={`dom-${d.id}`} className="space-y-4 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                  <DnsRecordsTable records={d.dns_records} onVerify={() => api.verify(d.id)} verifying={api.busy === `verify:${d.id}`} canVerify={canEdit} />
                  {d.verified_at && <p className="text-xs text-gray-500 dark:text-gray-400">Verificado el {new Date(d.verified_at).toLocaleString('es-CO')} · región {d.region}</p>}
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
        title="Eliminar dominio"
        description={`Se eliminará ${pendingDelete?.domain ?? ''} en Resend (dominio y API key) y en el CRM. Los correos ya enviados conservan su historial.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={!!pendingDelete && api.busy === `remove:${pendingDelete.id}`}
        onConfirm={async () => { if (pendingDelete) { await api.remove(pendingDelete.id); setPendingDelete(null); } }}
      />
    </Card>
  );
}
