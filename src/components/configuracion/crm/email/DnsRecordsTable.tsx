'use client';

/**
 * Tabla de registros DNS a publicar (SPF/DKIM/MX/Tracking + DMARC sugerido)
 * con botón copiar por celda y acción "Verificar".
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DnsRecord } from '@/lib/services/crm/email/types';

interface Props {
  records: DnsRecord[];
  onVerify: () => void;
  verifying: boolean;
  canVerify: boolean;
}

function CopyCell({ value, label }: { value: string; label: string }) {
  const t = useTranslations('configuracionTextos.dnsRecordsTable');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible */
    }
  };
  return (
    <div className="flex items-start gap-1">
      <code className="max-w-[320px] break-all font-mono text-[11px] text-gray-800 dark:text-gray-100">{value}</code>
      <button type="button" onClick={copy} aria-label={t('copiar', { campo: label })} className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200">
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const t = useTranslations('configuracionTextos.dnsRecordsTable');
  const s = (status ?? '').toLowerCase();
  if (s === 'verified') return <Badge variant="success">{t('estados.verificado')}</Badge>;
  if (s === 'failed' || s === 'partially_failed') return <Badge variant="destructive">{t('estados.fallo')}</Badge>;
  if (s === 'recommended') return <Badge variant="outline">{t('estados.recomendado')}</Badge>;
  // Un estado desconocido del proveedor se muestra tal cual (valor técnico).
  return <Badge variant="secondary">{s || t('estados.pendiente')}</Badge>;
}

export function DnsRecordsTable({ records, onVerify, verifying, canVerify }: Props) {
  const t = useTranslations('configuracionTextos.dnsRecordsTable');
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('instrucciones')}</p>
        <Button type="button" size="sm" variant="outline" onClick={onVerify} disabled={verifying || !canVerify} className="gap-1">
          {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />} {t('verificar')}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columnas.registro')}</TableHead>
              <TableHead>{t('columnas.tipo')}</TableHead>
              <TableHead>{t('columnas.nombre')}</TableHead>
              <TableHead>{t('columnas.valor')}</TableHead>
              <TableHead>{t('columnas.prioridad')}</TableHead>
              <TableHead>{t('columnas.estado')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-500">{t('vacio')}</TableCell></TableRow>
            ) : records.map((r, i) => (
              <TableRow key={`${r.record}-${r.name}-${i}`}>
                <TableCell className="text-xs font-medium text-gray-700 dark:text-gray-200">{r.record}</TableCell>
                <TableCell className="text-xs text-gray-600 dark:text-gray-300">{r.type}</TableCell>
                <TableCell><CopyCell value={r.name} label={t('campoNombre', { registro: r.record })} /></TableCell>
                <TableCell><CopyCell value={r.value} label={t('campoValor', { registro: r.record })} /></TableCell>
                <TableCell className="text-xs text-gray-600 dark:text-gray-300">{r.priority ?? '—'}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
