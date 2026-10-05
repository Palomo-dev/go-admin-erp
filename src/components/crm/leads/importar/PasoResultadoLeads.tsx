'use client';

import { useMemo } from 'react';
import { CheckCircle2, CircleSlash, Clock, FileDown, Link2, Loader2, Info, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormSection, KpiStrip, StatCard } from '@/components/kit';
import { descargarTexto } from '@/components/inventario/productos/importar/exportarCatalogoCsv';
import { reporteLeadsCsv } from '@/lib/crm/importacionLeads/plantilla';
import type { ResultadoFilaLead } from '@/lib/crm/importacionLeads/tipos';
import type { ImportarLeads } from './useImportarLeads';
import { useTextosLeads } from './useTextosLeads';

/**
 * Resultado: lo que respondió el servidor para las filas enviadas + lo que no
 * se envió (errores, omitidas y excluidas de la validación). El CSV lista TODAS
 * las filas del archivo: creadas, ligadas a cliente existente, omitidas por
 * duplicado y con error.
 */
export function PasoResultadoLeads({ a }: { a: ImportarLeads }) {
  const { t, accion, detalle } = useTextosLeads();
  const e = a.ejecucion;

  const todas = useMemo<ResultadoFilaLead[]>(() => {
    if (!e) return [];
    const enviadas = new Set(e.resultados.map((r) => r.fila));
    const noEnviadas = (a.validacion?.resultados ?? []).filter((r) => !enviadas.has(r.fila));
    return [...e.resultados, ...noEnviadas].sort((x, y) => x.fila - y.fila);
  }, [e, a.validacion]);
  const seleccionadas = useMemo(() => new Set(a.aImportar.map((f) => f.fila)), [a.aImportar]);

  if (!e) return null;
  const corriendo = e.estado === 'corriendo';
  const pct = e.total ? Math.round((e.procesadas / e.total) * 100) : 100;
  const cuenta = (acc: ResultadoFilaLead['accion']) => e.resultados.filter((r) => r.accion === acc).length;
  const noIntentadas = e.total - e.procesadas;
  const conError = e.resultados.filter((r) => r.accion === 'error');

  const descargar = () => {
    const csv = reporteLeadsCsv(todas, {
      cabeceras: [t('resultado.reporte.fila'), t('resultado.reporte.nombre'), t('resultado.reporte.telefono'), t('resultado.reporte.resultado'), t('resultado.reporte.cliente'), t('resultado.reporte.detalle')],
      accion: (r) => {
        const enviada = e.resultados.some((x) => x.fila === r.fila);
        // Seleccionada pero no enviada: la importación se detuvo antes de su bloque.
        if (!enviada && seleccionadas.has(r.fila)) return t('resultado.kpi.sinIntentar');
        return accion(r, !enviada && a.excluidas.has(r.fila) && (r.accion === 'crear' || r.accion === 'ligar'));
      },
      detalle,
    });
    descargarTexto(csv, `${t('resultado.reporte.archivo')}_${a.opciones.lote}.csv`);
  };

  return (
    <FormSection titulo={corriendo ? t('resultado.enCurso') : e.estado === 'detenido' ? t('resultado.detenida') : t('resultado.terminada')}>
      <div className="flex flex-col gap-1.5" aria-live="polite">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-fg">
            {corriendo && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {t('resultado.bloque', { actual: e.bloqueActual, total: e.totalBloques, procesadas: e.procesadas, filas: e.total })}
          </span>
          <span className="font-medium tabular-nums text-brand">{pct} %</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full bg-brand-action transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <KpiStrip etiqueta={t('resultado.terminada')}>
        <StatCard etiqueta={t('resultado.kpi.creados')} valor={String(cuenta('crear'))} icono={CheckCircle2} tono="exito" />
        <StatCard etiqueta={t('resultado.kpi.ligados')} valor={String(cuenta('ligar'))} icono={Link2} tono="informacion" />
        <StatCard etiqueta={t('resultado.kpi.omitidos')} valor={String(cuenta('omitir'))} icono={CircleSlash} tono="neutro" />
        <StatCard etiqueta={t('resultado.kpi.errores')} valor={String(conError.length)} icono={XCircle} tono="peligro" />
        {noIntentadas > 0 && <StatCard etiqueta={t('resultado.kpi.sinIntentar')} valor={String(noIntentadas)} icono={Clock} tono="advertencia" />}
      </KpiStrip>

      {cuenta('crear') + cuenta('ligar') > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-sm text-info-text" role="note">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t('resultado.rne')}
        </p>
      )}

      {e.erroresBloque.map((x) => (
        <p key={x.bloque} className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text" role="alert">
          {t('resultado.errorBloque', { n: x.bloque, mensaje: x.mensaje })}
        </p>
      ))}

      <div className="rounded-lg border border-line">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-3 py-2">
          <p className="text-sm font-medium text-fg">{t('resultado.errores', { n: conError.length })}</p>
          <Button variant="ghost" size="sm" onClick={descargar} disabled={corriendo}>
            <FileDown className="size-4" aria-hidden="true" /> {t('resultado.descargar')}
          </Button>
        </div>
        {conError.length === 0 ? (
          <p className="px-3 py-3 text-sm text-fg-secondary">{corriendo ? t('resultado.esperando') : t('resultado.sinErrores')}</p>
        ) : (
          <ul className="max-h-72 divide-y divide-line overflow-y-auto">
            {conError.slice(0, 200).map((r) => (
              <li key={r.fila} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:gap-3">
                <span className="flex shrink-0 items-center gap-2 text-fg-secondary">
                  <XCircle className="size-4 text-danger" aria-hidden="true" /> {t('resultado.fila', { n: r.fila })}
                </span>
                <span className="shrink-0 text-fg sm:w-48 sm:truncate">{r.nombre}</span>
                <span className="text-fg-secondary">{detalle(r)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormSection>
  );
}
