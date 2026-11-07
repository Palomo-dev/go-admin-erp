'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { History } from 'lucide-react';
import { CampoFecha, DataTable, FormField, Pagination, type ColumnaTabla } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sincronizarTasasDeCambio } from '@/lib/services/tasasCambioCliente';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import {
  filasCsvHistorico,
  historico,
  monedaPorDefecto,
  nombreArchivoCsv,
  puntosGrafica,
  rangoLectura,
  rangoPorDefecto,
  serieTasas,
  type FilaHistorico,
} from '@/lib/finanzas/monedas/tasasLogica';
import type { MonedaOrganizacion } from '@/lib/services/monedasTasasService';
import { useTasasOrganizacion } from './useTasasOrganizacion';
import { useFormatoTasas } from './useFormatoTasas';
import { BadgeFuente, useSincronizarCatalogo, Variacion } from './piezasTasas';
import GraficaTasas from './ExchangeRatesChart';

export interface PestanaHistoricoProps {
  organizationId: number;
  base: string;
  monedas: readonly MonedaOrganizacion[];
  hoy: string;
  version: number;
  /** La moneda pedida desde «Ver historial» (Tasas o Monedas). */
  monedaPedida: string | null;
  /** La página pone «Exportar» en la cabecera: recibe la función, o null si no hay filas. */
  onExportable: (exportar: (() => void) | null) => void;
}

const TAMANO_PAGINA = 25;

/**
 * M2 · Histórico (captura 82-finanzas-r2-14): moneda, desde y hasta; la
 * gráfica de 30 días arriba de la tabla; «Exportar» (CSV) se conserva y vive en
 * la cabecera de la página. La tabla muestra la tasa efectiva de cada día
 * frente a la moneda base: la manual manda sobre la automática.
 */
export function ExchangeRateHistory({ organizationId, base, monedas, hoy, version, monedaPedida, onExportable }: PestanaHistoricoProps) {
  const t = useTranslations('finanzasMonedasR2.historico');
  const tComun = useTranslations('finanzasMonedasR2.comun');
  const formato = useFormatoTasas(base);
  const otras = useMemo(() => monedas.filter((m) => !m.is_base), [monedas]);

  const [moneda, setMoneda] = useState<string | null>(null);
  const [rango, setRango] = useState(() => rangoPorDefecto(hoy));
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    if (monedaPedida) setMoneda(monedaPedida);
  }, [monedaPedida]);
  useEffect(() => {
    if (!moneda || !otras.some((m) => m.code === moneda)) setMoneda(monedaPorDefecto(otras.map((m) => m.code), base));
  }, [otras, base, moneda]);
  useEffect(() => setPagina(1), [moneda, rango]);

  const lectura = rangoLectura(rango.desde, rango.hasta, { conGrafica: true });
  const codigos = useMemo(() => (moneda ? [moneda, base] : []), [moneda, base]);
  const datos = useTasasOrganizacion(moneda ? organizationId : null, codigos, lectura.desde, lectura.hasta, version);
  const { sincronizando, sincronizarCatalogo } = useSincronizarCatalogo(sincronizarTasasDeCambio, datos.recargar);

  const serie = useMemo(
    () => (moneda ? serieTasas({ moneda, base, catalogo: datos.catalogo, manuales: datos.manuales }) : []),
    [moneda, base, datos.catalogo, datos.manuales],
  );
  const filas = useMemo(() => historico(serie, rango.desde, rango.hasta), [serie, rango]);
  const puntos = useMemo(() => puntosGrafica(serie, rango.hasta), [serie, rango.hasta]);
  const par = moneda ? `${moneda}/${base}` : '';

  const registro = (f: FilaHistorico) => {
    if (f.fuente === 'automatica') return t('plataforma');
    const quien = f.autorId ? datos.autores.get(f.autorId) ?? tComun('alguien') : tComun('alguien');
    return f.motivo ? t('registroCon', { autor: quien, motivo: f.motivo }) : quien;
  };

  // «Exportar» de la cabecera: las filas del filtro actual.
  useEffect(() => {
    if (!moneda || datos.estado !== 'listo' || filas.length === 0) {
      onExportable(null);
      return;
    }
    onExportable(() => {
      const csv = aCsv(
        filasCsvHistorico(filas, moneda, base, {
          encabezados: [
            t('csv.fecha'),
            t('csv.par'),
            t('csv.tasa'),
            t('csv.variacion'),
            t('csv.fuente'),
            t('csv.registro'),
            t('csv.motivo'),
          ],
          fuente: (f) => (f === 'manual' ? tComun('manual') : tComun('automatica')),
          registro: (f) => (f.fuente === 'automatica' ? t('plataforma') : f.autorId ? datos.autores.get(f.autorId) ?? '' : ''),
        }),
      );
      descargarCsv(nombreArchivoCsv(moneda, base, rango.desde, rango.hasta), csv);
      toast.success(t('exportado', { n: filas.length }));
    });
  }, [filas, moneda, base, rango, datos.estado, datos.autores, onExportable, t, tComun]);
  useEffect(() => () => onExportable(null), [onExportable]);

  const columnas: ColumnaTabla<FilaHistorico>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (f) => formato.dia(f.dia) },
    { id: 'par', encabezado: t('columnas.par'), variante: 'mono', ocultarDebajo: 'sm', celda: () => par },
    { id: 'tasa', encabezado: t('columnas.tasa'), variante: 'importe', celda: (f) => formato.tasa(f.tasa) },
    { id: 'variacion', encabezado: t('columnas.variacion'), alinear: 'derecha', celda: (f) => <Variacion valor={f.variacion} formato={formato.porcentaje} /> },
    { id: 'fuente', encabezado: t('columnas.fuente'), celda: (f) => <BadgeFuente fuente={f.fuente} /> },
    { id: 'registro', encabezado: t('columnas.registro'), ocultarDebajo: 'md', celda: (f) => <span className="text-fg-secondary">{registro(f)}</span> },
  ];

  const visibles = filas.slice((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA);
  const estadoTabla = !moneda ? 'vacio' : datos.estado === 'cargando' ? 'cargando' : datos.estado === 'error' ? 'error' : 'listo';

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-2xl">
        <FormField etiqueta={t('moneda')}>
          {(campo) => (
            <Select value={moneda ?? ''} onValueChange={setMoneda} disabled={otras.length === 0}>
              <SelectTrigger id={campo.id}>
                <SelectValue placeholder={t('monedaPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {otras.map((m) => (
                  <SelectItem key={m.code} value={m.code}>
                    {m.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('desde')}>
          {(campo) => (
            <CampoFecha
              id={campo.id}
              valor={rango.desde}
              onValorChange={(v) => v && setRango((r) => ({ desde: v, hasta: v > r.hasta ? v : r.hasta }))}
              max={hoy}
              hoy={hoy}
              limpiable={false}
            />
          )}
        </FormField>
        <FormField etiqueta={t('hasta')}>
          {(campo) => (
            <CampoFecha
              id={campo.id}
              valor={rango.hasta}
              onValorChange={(v) => v && setRango((r) => ({ desde: v < r.desde ? v : r.desde, hasta: v }))}
              max={hoy}
              hoy={hoy}
              limpiable={false}
            />
          )}
        </FormField>
      </div>

      {moneda && <GraficaTasas puntos={puntos} par={par} formato={formato} cargando={datos.estado === 'cargando'} onSincronizado={datos.recargar} />}

      <DataTable
        etiqueta={t('etiqueta', { par })}
        columnas={columnas}
        filas={visibles}
        obtenerId={(f) => f.dia}
        estado={estadoTabla}
        onReintentar={datos.recargar}
        filasEsqueleto={4}
        vacio={
          moneda
            ? {
                titulo: t('vacio.titulo'),
                descripcion: t('vacio.descripcion'),
                icono: History,
                accion: { etiqueta: sincronizando ? tComun('sincronizando') : tComun('sincronizar'), onClick: sincronizarCatalogo },
              }
            : { titulo: t('sinMonedas.titulo'), descripcion: t('sinMonedas.descripcion', { base }), icono: History }
        }
        error={{ titulo: t('errorCarga') }}
        tarjetaMovil={(f) => (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium text-fg">{formato.dia(f.dia)}</p>
              <p className="truncate text-xs text-fg-muted">{registro(f)}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <p className="text-sm font-semibold tabular-nums text-fg">{formato.tasa(f.tasa)}</p>
              <div className="flex items-center gap-2 text-xs">
                <Variacion valor={f.variacion} formato={formato.porcentaje} />
                <BadgeFuente fuente={f.fuente} />
              </div>
            </div>
          </div>
        )}
        pie={
          filas.length > TAMANO_PAGINA ? (
            <Pagination pagina={pagina} tamano={TAMANO_PAGINA} total={filas.length} onPaginaChange={setPagina} />
          ) : undefined
        }
      />
    </div>
  );
}

export default ExchangeRateHistory;
