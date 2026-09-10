'use client';

/**
 * Adjuntos desde `documents` de la oportunidad/cliente (GET /api/crm/documents).
 * Límite 40 MB en total (incluye el HTML); el servidor vuelve a validar.
 */

import { useEffect, useState } from 'react';
import { FileText, Loader2, Paperclip } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { listDocumentsFor, type DocumentOption } from '../emailApi';

const MAX_BYTES = 40 * 1024 * 1024;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  opportunityId?: string;
  customerId?: string;
  value: DocumentOption[];
  onChange: (docs: DocumentOption[]) => void;
}

export function AttachmentsPanel({ opportunityId, customerId, value, onChange }: Props) {
  const [docs, setDocs] = useState<DocumentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const relatedType = opportunityId ? 'opportunity' : customerId ? 'customer' : null;
  const relatedId = opportunityId ?? customerId ?? null;

  useEffect(() => {
    if (!relatedType || !relatedId) return;
    let cancelled = false;
    setLoading(true);
    listDocumentsFor(relatedType, relatedId)
      .then((d) => { if (!cancelled) setDocs(d); })
      .catch(() => { if (!cancelled) setDocs([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [relatedType, relatedId]);

  const total = value.reduce((s, d) => s + (d.file_size ?? 0), 0);
  const over = total > MAX_BYTES;
  const toggle = (d: DocumentOption, checked: boolean) => onChange(checked ? [...value, d] : value.filter((x) => x.id !== d.id));

  return (
    <div className="space-y-2 rounded-md border border-gray-200 p-3 dark:border-gray-700" aria-label="Adjuntos">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-200"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" /> Adjuntos ({value.length})</span>
        <span className={`text-[11px] ${over ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{fmtBytes(total)} / 40 MB</span>
      </div>
      {!relatedType ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Abre el compositor desde una oportunidad o cliente para adjuntar sus documentos.</p>
      ) : loading ? (
        <p className="flex items-center gap-1 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Cargando documentos…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">No hay documentos asociados. Súbelos en la pestaña Documentos.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {docs.map((d) => {
            const checked = value.some((x) => x.id === d.id);
            return (
              <li key={d.id} className="flex items-center gap-2">
                <Checkbox id={`att-${d.id}`} checked={checked} onCheckedChange={(v) => toggle(d, v === true)} />
                <Label htmlFor={`att-${d.id}`} className="flex flex-1 cursor-pointer items-center gap-1 text-xs text-gray-800 dark:text-gray-100">
                  <FileText className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                  <span className="truncate">{d.name}</span>
                  <span className="ml-auto text-[11px] text-gray-400">{d.file_size ? fmtBytes(d.file_size) : ''}</span>
                </Label>
              </li>
            );
          })}
        </ul>
      )}
      {over && <p className="text-xs text-red-600 dark:text-red-400" role="alert">Los adjuntos superan 40 MB.</p>}
    </div>
  );
}
