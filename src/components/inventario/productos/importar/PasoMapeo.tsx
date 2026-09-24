'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Info, Columns3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormSection } from '@/components/kit';
import { CAMPOS, reasignarColumna, type CampoProducto } from '@/lib/inventario/importacion/campos';
import type { AsistenteImportacion } from './useAsistenteImportacion';

const NINGUNO = '__ninguno__';
const MUESTRAS = 3;

export function PasoMapeo({ a }: { a: AsistenteImportacion }) {
  const t = useTranslations('productosImportar');
  const archivo = a.archivo;
  if (!archivo) return null;

  if (archivo.formato !== 'generico') {
    return (
      <FormSection titulo={t('mapeo.titulo')} icono={Columns3}>
        <div className="flex gap-2 rounded-lg bg-info-subtle p-3 text-sm text-info-text" role="status">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{t(`mapeo.formato.${archivo.formato}`, { n: a.filasLeidas.length, variantes: a.variantesDetectadas })}</p>
        </div>
      </FormSection>
    );
  }

  const cabeceras = archivo.filaCabecera >= 0 ? archivo.matriz[archivo.filaCabecera] ?? [] : [];
  const columnas = Math.max(cabeceras.length, ...archivo.matriz.slice(archivo.filaCabecera + 1, archivo.filaCabecera + 1 + MUESTRAS).map((f) => f?.length ?? 0));
  const muestras = archivo.matriz.slice(archivo.filaCabecera + 1).filter((f) => f && f.some((c) => c !== null && String(c).trim() !== '')).slice(0, MUESTRAS);
  const reconocidas = archivo.mapeo.filter(Boolean).length;
  const opciones = CAMPOS.map((c) => ({ valor: c.campo, etiqueta: t(`campos.${c.campo}.nombre`) }));
  const filasCandidatas = archivo.matriz.slice(0, 10).map((_, i) => i);

  return (
    <FormSection titulo={t('mapeo.titulo')} descripcion={t('mapeo.descripcion', { n: reconocidas, total: columnas })} icono={Columns3}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="fila-cabecera" className="text-sm text-fg-secondary">
          {t('mapeo.filaCabecera')}
        </label>
        <Select value={String(Math.max(0, archivo.filaCabecera))} onValueChange={(v) => a.cambiarFilaCabecera(Number(v))}>
          <SelectTrigger id="fila-cabecera" className="h-9 w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filasCandidatas.map((i) => (
              <SelectItem key={i} value={String(i)}>
                {t('mapeo.fila', { n: i + 1 })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {a.faltantes.includes('name') && (
        <p className="flex items-center gap-2 rounded-lg bg-danger-subtle p-3 text-sm text-danger-text" role="alert">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> {t('mapeo.faltaNombre')}
        </p>
      )}
      {!archivo.mapeo.includes('sku') && !a.faltantes.includes('name') && (
        <p className="flex items-center gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">
          <Info className="size-4 shrink-0" aria-hidden="true" /> {t('mapeo.sinSku')}
        </p>
      )}
      {a.variantesDetectadas > 0 && <p className="text-xs text-fg-secondary">{t('mapeo.variantesDetectadas', { n: a.variantesDetectadas })}</p>}

      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line" aria-label={t('mapeo.titulo')}>
        {Array.from({ length: columnas }, (_, col) => {
          const cabecera = String(cabeceras[col] ?? '').trim() || t('mapeo.columnaSinNombre', { n: col + 1 });
          const valor = archivo.mapeo[col] ?? null;
          const ejemplos = muestras.map((f) => String(f?.[col] ?? '').trim()).filter(Boolean);
          return (
            <li key={col} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_240px]">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg" title={cabecera}>
                  {cabecera}
                </p>
                <p className="truncate text-xs text-fg-muted lg:hidden">{ejemplos.join(' · ') || '—'}</p>
              </div>
              <p className="hidden truncate text-xs text-fg-secondary lg:block" title={ejemplos.join(' · ')}>
                {ejemplos.join(' · ') || '—'}
              </p>
              <Select
                value={valor ?? NINGUNO}
                onValueChange={(v) => a.cambiarMapeo(reasignarColumna(archivo.mapeo.length >= columnas ? archivo.mapeo : [...archivo.mapeo, ...Array(columnas - archivo.mapeo.length).fill(null)], col, v === NINGUNO ? null : (v as CampoProducto)))}
              >
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
