'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, CircleSlash, Clock, FileDown, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormSection, KpiStrip, StatCard } from '@/components/kit';
import { reporteCsv, type FilaReporte } from '@/lib/inventario/importacion/reporte';
import type { AsistenteImportacion } from './useAsistenteImportacion';
import { useTextoMensaje } from './useTextos';
import { descargarTexto } from './exportarCatalogoCsv';
import { recuentoImportacion } from './recuentoImportacion';

export function PasoResultado({ a }: { a: AsistenteImportacion }) {
  const t = useTranslations('productosImportar.resultado');
  const tm = useTranslations('productosImportar.mensajes');
  const texto = useTextoMensaje();
  const e = a.ejecucion;

  const porFila = useMemo(() => new Map(a.validadas.map((f) => [f.datos.fila, f])), [a.validadas]);
  const conAvisos = useMemo(() => (e ? e.resultados.filter((r) => r.ok && (r.avisos?.length ?? 0) > 0).length : 0), [e]);
  const fallidas = useMemo(() => (e ? e.resultados.filter((r) => !r.ok) : []), [e]);

  if (!e) return null;
  const pct = e.total ? Math.round((e.procesadas / e.total) * 100) : 100;
  const corriendo = e.estado === 'corriendo';
  const r = recuentoImportacion(e);
  const errorDe = (codigo?: string) => (codigo && tm.has(codigo) ? tm(codigo) : codigo ?? '');

  const descargar = () => {
    const filas: FilaReporte[] = [];
    // Lo que no se envió: errores de validación y filas excluidas u omitidas.
    for (const f of a.validadas) {
      const excluida = a.excluidas.has(f.id);
      if (f.estado === 'error' || excluida || f.accion === 'omitir') {
        filas.push({
          fila: f.datos.fila,
          sku: f.datos.sku ?? '',
          nombre: f.datos.name ?? '',
          resultado: f.estado === 'error' ? t('resultados.error') : excluida ? t('resultados.excluida') : t('resultados.omitido'),
          mensajes: [...f.errores, ...f.avisos].map(texto),
        });
      }
    }
    // Lo que respondió el servidor con error o avisos.
    for (const r of e.resultados) {
      if (r.ok && !(r.avisos?.length)) continue;
      filas.push({
        fila: r.fila,
        sku: r.sku,
        nombre: porFila.get(r.fila)?.datos.name ?? '',
        resultado: r.ok ? t(`resultados.${r.accion ?? 'creado'}`) : t('resultados.error'),
        mensajes: r.ok ? (r.avisos ?? []).map(texto) : [errorDe(r.error)],
      });
    }
    filas.sort((x, y) => x.fila - y.fila);
    descargarTexto(
      reporteCsv(filas, [t('reporte.fila'), t('reporte.sku'), t('reporte.nombre'), t('reporte.resultado'), t('reporte.mensajes')]),
      `${t('reporte.archivo')}.csv`,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <FormSection
        titulo={corriendo ? t('enCurso') : e.estado === 'detenido' ? t('detenida') : t('terminada')}
        descripcion={corriendo ? t('enCursoDesc') : t('terminadaDesc')}
      >
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-fg">
              {corriendo && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {t('lote', { actual: e.loteActual, total: e.totalLotes, procesadas: e.procesadas, filas: e.total })}
            </span>
            <span className="font-medium tabular-nums text-brand">{pct} %</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-full bg-brand-action transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* D5: Importados · Omitidos (gris, no son fallos) · Fallidos · Sin intentar; siempre suman lo seleccionado. */}
        <KpiStrip etiqueta={t('titulo')}>
          <StatCard
            etiqueta={t('kpi.importados')}
            valor={String(r.importados)}
            icono={CheckCircle2}
            tono="exito"
            detalle={t('kpi.importadosDetalle', { creados: r.creados, actualizados: r.actualizados })}
          />
          <StatCard etiqueta={t('kpi.omitidos')} valor={String(r.omitidos)} icono={CircleSlash} tono="neutro" detalle={t('kpi.omitidosDetalle')} />
          <StatCard etiqueta={t('kpi.fallidos')} valor={String(r.fallidos)} icono={XCircle} tono="peligro" />
          <StatCard etiqueta={t('kpi.sinIntentar')} valor={String(r.sinIntentar)} icono={Clock} tono={r.sinIntentar > 0 ? 'advertencia' : 'neutro'} />
        </KpiStrip>
        <p className="text-xs tabular-nums text-fg-secondary" aria-live="polite">
          {t('cuadre', {
            seleccionados: r.seleccionados,
            importados: r.importados,
            omitidos: r.omitidos,
            fallidos: r.fallidos,
            sinIntentar: r.sinIntentar,
          })}
        </p>
        {conAvisos > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-warning-text">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {t('conAvisosLinea', { n: conAvisos })}
          </p>
        )}

        {e.erroresLote.map((x) => (
          <p key={x.lote} className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text" role="alert">
            {t('errorLote', { n: x.lote, mensaje: x.mensaje })}
          </p>
        ))}

        <div className="rounded-lg border border-line">
          <div className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-3 py-2">
            <p className="text-sm font-medium text-fg">{t('errores', { n: fallidas.length })}</p>
            <Button variant="ghost" size="sm" onClick={descargar} disabled={corriendo}>
              <FileDown className="size-4" aria-hidden="true" /> {t('descargar')}
            </Button>
          </div>
          {fallidas.length === 0 ? (
            <p className="px-3 py-3 text-sm text-fg-secondary">{corriendo ? t('esperando') : t('sinErrores')}</p>
          ) : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto">
              {fallidas.slice(0, 200).map((r) => (
                <li key={`${r.fila}-${r.sku}`} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:gap-3">
                  <span className="flex shrink-0 items-center gap-2 text-fg-secondary">
                    <XCircle className="size-4 text-danger" aria-hidden="true" /> {t('fila', { n: r.fila })}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-fg sm:w-36 sm:truncate">{r.sku}</span>
                  <span className="text-fg-secondary">{errorDe(r.error)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </FormSection>
    </div>
  );
}
