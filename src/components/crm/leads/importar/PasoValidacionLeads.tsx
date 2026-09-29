'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Link2, ListChecks, Loader2, PhoneOff, Settings2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormSection, KpiStrip, SegmentedControl, StatCard } from '@/components/kit';
import { useOpcionesMoneda } from '@/components/transporte/useOpcionesMoneda';
import { paisesTelefono } from '@/lib/utils/telefono';
import type { ImportarLeads } from './useImportarLeads';
import { useTextosLeads } from './useTextosLeads';

const BASE = '__base__';

export function PasoValidacionLeads({ a }: { a: ImportarLeads }) {
  const { t, mensaje } = useTextosLeads();
  const v = a.validacion;
  const o = a.opciones;
  // Monedas de la organización (+ la base y la detectada en la cabecera del archivo): nunca una lista fija.
  const { opciones: monedas } = useOpcionesMoneda(o.monedaValor);

  // Los mensajes más frecuentes, para ver de un vistazo qué hay que corregir.
  const frecuentes = useMemo(() => {
    const cuenta = new Map<string, { n: number; tipo: 'error' | 'aviso'; codigo: string }>();
    for (const r of v?.resultados ?? []) {
      for (const m of r.errores) cuenta.set(`e:${m.codigo}`, { n: (cuenta.get(`e:${m.codigo}`)?.n ?? 0) + 1, tipo: 'error', codigo: m.codigo });
      for (const m of r.avisos) cuenta.set(`a:${m.codigo}`, { n: (cuenta.get(`a:${m.codigo}`)?.n ?? 0) + 1, tipo: 'aviso', codigo: m.codigo });
    }
    return Array.from(cuenta.values()).sort((x, y) => (x.tipo === y.tipo ? y.n - x.n : x.tipo === 'error' ? -1 : 1)).slice(0, 8);
  }, [v]);

  return (
    <div className="flex flex-col gap-4">
      <FormSection titulo={t('validacion.opciones')} icono={Settings2}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('validacion.lote')} ayuda={t('validacion.loteAyuda')} obligatorio error={o.lote.trim() ? undefined : t('validacion.loteFalta')}>
            <Input value={o.lote} maxLength={60} onChange={(e) => a.setOpciones({ lote: e.target.value })} />
          </FormField>
          <FormField etiqueta={t('validacion.tipoCliente')}>
            {(c) => (
              <SegmentedControl
                aria-labelledby={c.idEtiqueta}
                anchoCompleto
                valor={o.tipoCliente}
                onValorChange={(tipo) => a.setOpciones({ tipoCliente: tipo })}
                opciones={[
                  { valor: 'company', etiqueta: t('validacion.empresa') },
                  { valor: 'person', etiqueta: t('validacion.persona') },
                ]}
              />
            )}
          </FormField>
          <FormField etiqueta={t('validacion.moneda')} ayuda={t('validacion.monedaAyuda')}>
            {(c) => (
              <Select value={o.monedaValor ?? BASE} onValueChange={(m) => a.setOpciones({ monedaValor: m === BASE ? null : m })}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BASE}>{t('validacion.monedaBase')}</SelectItem>
                  {monedas.map((m) => (
                    <SelectItem key={m.code} value={m.code}>
                      {m.name === m.code ? m.code : `${m.code} · ${m.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('validacion.pais')} ayuda={t('validacion.paisAyuda')}>
            {(c) => (
              <Select value={o.pais} onValueChange={(p) => a.setOpciones({ pais: p })}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paisesTelefono.map((p) => (
                    <SelectItem key={p.iso} value={p.iso}>
                      {`${p.name} (${p.dialCode})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>
        <Button variant="outline" className="self-start" onClick={() => void a.validar()} disabled={a.validando || !o.lote.trim() || a.filas.length === 0}>
          {a.validando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ListChecks className="size-4" aria-hidden="true" />}
          {v ? t('acciones.validarDeNuevo') : t('acciones.validar')}
        </Button>
      </FormSection>

      <FormSection titulo={t('validacion.resumen')} icono={ListChecks}>
        {a.validando ? (
          <p className="flex items-center gap-2 text-sm text-fg-secondary" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('validacion.validando')}
          </p>
        ) : a.errorValidacion ? (
          <p className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text" role="alert">
            {t('validacion.error', { mensaje: a.errorValidacion })}
          </p>
        ) : !v ? (
          <p className="text-sm text-fg-secondary">{t('validacion.pendiente')}</p>
        ) : (
          <>
            <KpiStrip etiqueta={t('validacion.resumen')}>
              <StatCard etiqueta={t('validacion.kpi.crear')} valor={String(v.resumen.crear)} icono={CheckCircle2} tono="exito" />
              <StatCard etiqueta={t('validacion.kpi.ligar')} valor={String(v.resumen.ligar)} icono={Link2} tono="informacion" />
              <StatCard etiqueta={t('validacion.kpi.omitir')} valor={String(v.resumen.omitir)} icono={CircleSlash} tono="neutro" />
              <StatCard etiqueta={t('validacion.kpi.error')} valor={String(v.resumen.error)} icono={XCircle} tono="peligro" />
            </KpiStrip>
            {v.resumen.rnePendiente > 0 && (
              <p className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning-text" role="status">
                <PhoneOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t('validacion.rne', { n: v.resumen.rnePendiente })}
              </p>
            )}
            {v.resumen.rneExcluido > 0 && <p className="text-xs text-fg-secondary">{t('validacion.rneExcluidos', { n: v.resumen.rneExcluido })}</p>}
            {v.moneda.origen && !v.moneda.sinTasa && (
              <p className="text-xs text-fg-secondary">
                {t('validacion.conversion', { origen: v.moneda.origen, destino: v.moneda.moneda ?? '', fecha: v.moneda.fechaTasa ?? '', tasa: v.moneda.tasa.toFixed(2) })}
              </p>
            )}
            {v.moneda.sinTasa && <p className="text-xs text-warning-text">{t('validacion.sinTasa', { origen: v.moneda.origen ?? '' })}</p>}
            {frecuentes.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-fg">{t('validacion.frecuentes')}</p>
                <ul className="flex flex-col gap-1">
                  {frecuentes.map((f) => (
                    <li key={`${f.tipo}:${f.codigo}`} className="flex items-start gap-2 text-sm">
                      {f.tipo === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />}
                      <span className="text-fg-secondary">
                        <span className="font-medium text-fg">{t('validacion.filasCon', { n: f.n })}</span> {mensaje({ codigo: f.codigo, params: { valor: '…', moneda: '', detalle: '' } })}
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
