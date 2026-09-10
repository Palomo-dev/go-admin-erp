'use client';

/**
 * Tabla de registros DNS a publicar (SPF/DKIM/MX/Tracking + DMARC sugerido)
 * con botón copiar por celda y acción "Verificar".
 */

import { useState } from 'react';
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
      <button type="button" onClick={copy} aria-label={`Copiar ${label}`} className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200">
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
}

function statusBadge(status?: string) {
  const s = (status ?? '').toLowerCase();
  if (s === 'verified') return <Badge variant="success">Verificado</Badge>;
  if (s === 'failed' || s === 'partially_failed') return <Badge variant="destructive">Falló</Badge>;
  if (s === 'recommended') return <Badge variant="outline">Recomendado</Badge>;
  return <Badge variant="secondary">{s || 'pendiente'}</Badge>;
}

export function DnsRecordsTable({ records, onVerify, verifying, canVerify }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">Publica estos registros en el DNS del dominio y pulsa “Verificar”. La propagación puede tardar hasta 72 h.</p>
        <Button type="button" size="sm" variant="outline" onClick={onVerify} disabled={verifying || !canVerify} className="gap-1">
          {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />} Verificar
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Registro</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-gray-500">Sin registros. Pulsa “Verificar” para sincronizar con el proveedor.</TableCell></TableRow>
            ) : records.map((r, i) => (
              <TableRow key={`${r.record}-${r.name}-${i}`}>
                <TableCell className="text-xs font-medium text-gray-700 dark:text-gray-200">{r.record}</TableCell>
                <TableCell className="text-xs text-gray-600 dark:text-gray-300">{r.type}</TableCell>
                <TableCell><CopyCell value={r.name} label={`nombre ${r.record}`} /></TableCell>
                <TableCell><CopyCell value={r.value} label={`valor ${r.record}`} /></TableCell>
                <TableCell className="text-xs text-gray-600 dark:text-gray-300">{r.priority ?? '—'}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
