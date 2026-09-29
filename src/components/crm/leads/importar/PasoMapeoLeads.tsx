'use client';

import { AlertTriangle, Columns3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormSection } from '@/components/kit';
import { CAMPOS_LEAD, reasignarColumnaLead, type CampoLead } from '@/lib/crm/importacionLeads/campos';
import type { ImportarLeads } from './useImportarLeads';
import { useTextosLeads } from './useTextosLeads';

const NINGUNO = '__ninguno__';
const MUESTRAS = 3;

export function PasoMapeoLeads({ a }: { a: ImportarLeads }) {
  const { t } = useTextosLeads();
  const archivo = a.archivo;
  if (!archivo) return null;

  const fc = Math.max(0, archivo.filaCabecera);
  const cabeceras = archivo.matriz[fc] ?? [];
  const muestras = archivo.matriz.slice(fc + 1).filter((f) => f && f.some((c) => c !== null && String(c).trim() !== '')).slice(0, MUESTRAS);
  const columnas = Math.max(cabeceras.length, ...muestras.map((f) => f?.length ?? 0));
  const mapeo = archivo.mapeo.length >= columnas ? archivo.mapeo : [...archivo.mapeo, ...Array<CampoLead | null>(columnas - archivo.mapeo.length).fill(null)];
  const reconocidas = mapeo.filter(Boolean).length;
  const opciones = CAMPOS_LEAD.map((c) => ({ valor: c.campo, etiqueta: c.multiple ? `${t(`campos.${c.campo}`)} (${t('mapeo.multiple')})` : t(`campos.${c.campo}`) }));

  return (
    <FormSection titulo={t('mapeo.titulo')} descripcion={t('mapeo.descripcion', { n: reconocidas, total: columnas })} icono={Columns3}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="leads-fila-cabecera" className="text-sm text-fg-secondary">
          {t('mapeo.filaCabecera')}
        </label>
        <Select value={String(fc)} onValueChange={(v) => a.cambiarFilaCabecera(Number(v))}>
          <SelectTrigger id="leads-fila-cabecera" className="h-9 w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {archivo.matriz.slice(0, 10).map((_, i) => (
              <SelectItem key={i} value={String(i)}>
                {t('mapeo.fila', { n: i + 1 })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {a.faltantes.map((f) => (
        <p key={f} className="flex items-center gap-2 rounded-lg bg-danger-subtle p-3 text-sm text-danger-text" role="alert">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> {t(f === 'nombre' ? 'mapeo.faltaNombre' : 'mapeo.faltaContacto')}
        </p>
      ))}

      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line" aria-label={t('mapeo.titulo')}>
        {Array.from({ length: columnas }, (_, col) => {
          const cabecera = String(cabeceras[col] ?? '').trim() || t('mapeo.columnaSinNombre', { n: col + 1 });
          const ejemplos = muestras.map((f) => String(f?.[col] ?? '').trim()).filter(Boolean).join(' · ');
          return (
            <li key={col} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_240px]">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg" title={cabecera}>
                  {cabecera}
                </p>
                <p className="truncate text-xs text-fg-muted lg:hidden">{ejemplos || '—'}</p>
              </div>
              <p className="hidden truncate text-xs text-fg-secondary lg:block" title={ejemplos}>
                {ejemplos || '—'}
              </p>
              <Select value={mapeo[col] ?? NINGUNO} onValueChange={(v) => a.cambiarMapeo(reasignarColumnaLead(mapeo, col, v === NINGUNO ? null : (v as CampoLead)))}>
                <SelectTrigger className="h-9" aria-label={t('mapeo.campoDe', { columna: cabecera })}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>{t('mapeo.noImportar')}</SelectItem>
                  {opciones.map((o) => (
                    <SelectItem key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          );
        })}
      </ul>
    </FormSection>
  );
}
