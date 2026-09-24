'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Loader2, ListChecks, Settings2, XCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FormField, FormSection, SegmentedControl, StatCard, KpiStrip } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { AVISOS_INFORMATIVOS } from '@/lib/inventario/importacion/validacion';
import type { ModoImportacion } from '@/lib/inventario/importacion/tipos';
import type { AsistenteImportacion } from './useAsistenteImportacion';

interface Props {
  a: AsistenteImportacion;
  sucursales: { id: number; name: string }[];
}

const MODOS: ModoImportacion[] = ['crear_y_actualizar', 'solo_crear', 'solo_actualizar', 'duplicar'];

export function PasoValidacion({ a, sucursales }: Props) {
  const t = useTranslations('productosImportar');
  const modos = a.origen === 'web' ? MODOS : MODOS.filter((m) => m !== 'duplicar');

  // Los mensajes más frecuentes, para ver de un vistazo qué hay que corregir.
  const frecuentes = useMemo(() => {
    const cuenta = new Map<string, { n: number; tipo: 'error' | 'aviso'; codigo: string }>();
    for (const f of a.validadas) {
      for (const m of f.errores) cuenta.set(`e:${m.codigo}`, { n: (cuenta.get(`e:${m.codigo}`)?.n ?? 0) + 1, tipo: 'error', codigo: m.codigo });
      for (const m of f.avisos) if (!AVISOS_INFORMATIVOS.has(m.codigo)) cuenta.set(`a:${m.codigo}`, { n: (cuenta.get(`a:${m.codigo}`)?.n ?? 0) + 1, tipo: 'aviso', codigo: m.codigo });
    }
    return Array.from(cuenta.values()).sort((x, y) => (x.tipo === y.tipo ? y.n - x.n : x.tipo === 'error' ? -1 : 1)).slice(0, 8);
  }, [a.validadas]);

  return (
    <div className="flex flex-col gap-4">
      <FormSection titulo={t('validacion.titulo')} icono={Settings2}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">{t('validacion.modo')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {modos.map((m) => (
              <label
                key={m}
                className={cn(
                  'flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors focus-within:ring-2 focus-within:ring-brand',
                  a.opciones.modo === m ? 'border-line-brand bg-brand-tint' : 'border-line hover:bg-hover',
                )}
              >
                <input type="radio" name="modo" className="mt-1 accent-[rgb(var(--brand-action))]" checked={a.opciones.modo === m} onChange={() => a.setOpciones({ modo: m })} />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-fg">{t(`validacion.modos.${m}.titulo`)}</span>
                  <span className="text-xs text-fg-secondary">{t(`validacion.modos.${m}.desc`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('validacion.sucursal')} ayuda={t('validacion.sucursalAyuda')} obligatorio error={a.branchId ? undefined : t('validacion.sinSucursal')}>
            {(c) => (
              <Select value={a.branchId ? String(a.branchId) : undefined} onValueChange={(v) => a.setBranchId(Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta}>
                  <SelectValue placeholder={t('validacion.elegirSucursal')} />
                </SelectTrigger>
                <SelectContent>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('validacion.stockExistentes')} ayuda={t('validacion.stockExistentesAyuda')}>
            {(c) => (
              <SegmentedControl
                aria-labelledby={c.idEtiqueta}
                anchoCompleto
                valor={a.opciones.stockExistentes}
                onValorChange={(v) => a.setOpciones({ stockExistentes: v })}
                opciones={[
                  { valor: 'ignorar', etiqueta: t('validacion.stockIgnorar') },
                  { valor: 'sumar', etiqueta: t('validacion.stockSumar') },
                ]}
              />
            )}
          </FormField>
        </div>

        <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {(
            [
              ['importarImagenes', t('validacion.imagenes'), t('validacion.imagenesAyuda')],
              ['generarSku', t('validacion.generarSku'), t('validacion.generarSkuAyuda')],
            ] as const
          ).map(([clave, titulo, ayuda]) => (
            <label key={clave} className="flex items-center justify-between gap-3 p-3">
              <span className="flex flex-col">
                <span className="text-sm font-medium text-fg">{titulo}</span>
                <span className="text-xs text-fg-secondary">{ayuda}</span>
              </span>
              <Switch checked={a.opciones[clave]} onCheckedChange={(v) => a.setOpciones({ [clave]: v })} />
            </label>
          ))}
        </div>
      </FormSection>

      <FormSection titulo={t('validacion.resumenTitulo')} icono={ListChecks}>
        {a.cargandoContexto ? (
          <p className="flex items-center gap-2 text-sm text-fg-secondary" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('validacion.validando')}
          </p>
        ) : a.errorContexto ? (
          <div className="flex flex-col gap-2 rounded-lg bg-danger-subtle p-3 text-sm text-danger-text" role="alert">
            <p>{t('validacion.errorContexto', { mensaje: a.errorContexto })}</p>
            <Button variant="outline" size="sm" className="self-start" onClick={() => a.validarContraCatalogo()}>
              {t('acciones.reintentar')}
            </Button>
          </div>
        ) : (
          <>
            <KpiStrip etiqueta={t('validacion.resumenTitulo')}>
              <StatCard etiqueta={t('validacion.resumen.crear')} valor={String(a.resumen.crear)} icono={CheckCircle2} tono="exito" />
              <StatCard etiqueta={t('validacion.resumen.actualizar')} valor={String(a.resumen.actualizar)} tono="informacion" />
              <StatCard etiqueta={t('validacion.resumen.avisos')} valor={String(a.resumen.avisos)} icono={AlertTriangle} tono="advertencia" />
              <StatCard etiqueta={t('validacion.resumen.errores')} valor={String(a.resumen.errores)} icono={XCircle} tono="peligro" />
            </KpiStrip>
            {a.resumen.omitir > 0 && <p className="text-xs text-fg-secondary">{t('validacion.omitidas', { n: a.resumen.omitir })}</p>}
            {frecuentes.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-fg">{t('validacion.frecuentes')}</p>
                <ul className="flex flex-col gap-1">
                  {frecuentes.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      {f.tipo === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />}
                      <span className="text-fg-secondary">
                        <span className="font-medium text-fg">{t('validacion.filasCon', { n: f.n })}</span> {t(`tipos.${f.codigo}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </FormSection>
    </div>
  );
}
