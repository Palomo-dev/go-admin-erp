'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import type { PreviewResult, WhatsAppTemplate } from '../api';
import { CostEstimate } from './CostEstimate';

const CATEGORY_LABEL: Record<string, string> = { utility: 'Utility', marketing: 'Marketing', authentication: 'Autenticación' };

export function TemplatePicker(p: {
  templates: WhatsAppTemplate[];
  loading: boolean;
  value: string | null;
  onChange: (id: string | null) => void;
  variables: Record<string, string>;
  onVariable: (k: string, v: string) => void;
  preview: PreviewResult | null;
  previewing: boolean;
  onCreateTemplate?: () => void;
  onSync?: () => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const list = useMemo(() => p.templates.filter((t) => (cat === 'all' || t.meta.category === cat) && (!q || t.name.includes(q.toLowerCase()) || (t.description ?? '').toLowerCase().includes(q.toLowerCase()))), [p.templates, q, cat]);
  const selected = p.templates.find((t) => t.id === p.value) ?? null;
  const params = selected ? Object.keys(p.preview?.variable_map ?? selected.meta.variable_map ?? {}) : [];

  if (!p.loading && p.templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-4 text-center text-sm text-gray-600 dark:text-gray-300">
        <p className="font-medium">No tienes plantillas aprobadas</p>
        <p className="text-xs mt-1">Crea una en Plantillas › WhatsApp y envíala a aprobación, o sincroniza las existentes desde Meta.</p>
        <div className="mt-2 flex justify-center gap-2 text-xs">
          {p.onCreateTemplate && <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline" onClick={p.onCreateTemplate}>Crear plantilla</button>}
          {p.onSync && <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline" onClick={p.onSync}>Sincronizar desde Meta</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
          <Input aria-label="Buscar plantilla" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" className="h-9 pl-7 bg-white dark:bg-gray-900" />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="h-9 w-36 bg-white dark:bg-gray-900" aria-label="Categoría"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="utility">Utility</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
            <SelectItem value="authentication">Autenticación</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ul className="max-h-40 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800" role="listbox" aria-label="Plantillas aprobadas">
        {p.loading && <li className="p-3 text-xs text-gray-500 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando…</li>}
        {list.map((t) => (
          <li key={t.id} role="option" aria-selected={t.id === p.value}>
            <button type="button" onClick={() => p.onChange(t.id)} className={cn('w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800', t.id === p.value && 'bg-emerald-50 dark:bg-emerald-900/30')}>
              <span className="font-mono text-xs truncate flex-1">{t.name}</span>
              <Badge variant={t.meta.category === 'marketing' ? 'warning' : 'secondary'} className="text-[10px]">{CATEGORY_LABEL[t.meta.category] ?? t.meta.category}</Badge>
              <span className="text-[10px] text-gray-400">{t.meta.language}</span>
            </button>
          </li>
        ))}
        {!p.loading && list.length === 0 && <li className="p-3 text-xs text-gray-500">Sin resultados</li>}
      </ul>

      {selected && (
        <div className="space-y-2">
          {params.map((k) => {
            const src = (p.preview?.variable_map ?? selected.meta.variable_map)[k];
            const missing = p.preview?.missing.includes(k);
            return (
              <div key={k} className="grid grid-cols-[110px_1fr] items-center gap-2">
                <Label htmlFor={`var-${k}`} className="text-xs font-mono truncate">{`{{${k}}}`}</Label>
                <div>
                  <Input id={`var-${k}`} aria-describedby={`var-${k}-src`} value={p.variables[k] ?? p.preview?.values[k] ?? ''} onChange={(e) => p.onVariable(k, e.target.value)} className={cn('h-8 text-sm bg-white dark:bg-gray-900', missing && 'border-amber-500')} placeholder={missing ? 'Requerido' : ''} />
                  <p id={`var-${k}-src`} className="text-[10px] text-gray-400 mt-0.5">← {src ?? 'manual'}{missing ? ' · ⚠ falta valor' : ''}</p>
                </div>
              </div>
            );
          })}
          <CostEstimate cost={p.preview?.estimated_cost ?? null} loading={p.previewing} />
        </div>
      )}
    </div>
  );
}
