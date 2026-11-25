'use client';

/**
 * Procesadores de pago › pestaña «Cobros» (Figma «05 POS y ventas» 3300-421113, aprobado el
 * 2026-11-25): lo que cobró cada procesador en el día (o el periodo), con comisión + IVA,
 * retenciones y neto ESTIMADOS con la tarifa que la organización configuró, y lo que falta por
 * liquidar (saldo de su 138020xx, `fn_procesadores_pago_saldos`). Todo es «Estimado» hasta
 * registrar el abono real, que trae los valores verdaderos y es el que va a contabilidad.
 *
 * Los cobros salen de los pagos aprobados (`fn_recaudo_pagos`) cuyo medio es la pasarela o el
 * datáfono. Fecha («Hoy» por defecto) y procesador se recuerdan por persona solo durante el día.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BadgePercent, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AvisoTonal, BarraFecha, DataTable, KpiStrip, StatCard, StatusBadge, clasesBoton, presetsRango, type ColumnaTabla, type IdPresetRango, type RangoFechas } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatDateTimeInTz, formatPlainDate } from '@/lib/utils/dateDisplay';
import { getDateRange } from '@/lib/utils/dateRanges';
import { leerPagosRecaudo } from '@/lib/services/recaudoService';
import { esCobroPorAbonar } from '@/lib/finanzas/recaudo/movimientosRecaudo';
import type { PagoRecaudo } from '@/lib/finanzas/recaudo/recaudoPorMedio';
import { estimarCobro, sumarEstimaciones, tramoDelCobro, type Estimacion, type TarifaProcesador } from '@/lib/finanzas/procesadoresPago/tarifaProcesador';
import type { CodigoProcesador, RespuestaProcesadores } from '@/lib/finanzas/procesadoresPago/procesadoresLogica';
import { useFiltroDelDia } from '@/components/finanzas/recaudo/useFiltroDelDia';
import { TarifaProcesadorDialog } from './TarifaProcesadorDialog';

interface FiltroCobros {
  periodo: IdPresetRango | 'rango';
  desde: string;
  hasta: string;
  procesador: string;
}
const FILTRO_COBROS_POR_DEFECTO: FiltroCobros = { periodo: 'hoy', desde: '', hasta: '', procesador: '' };
const TODOS = 'todos';

interface FilaCobro {
  pago: PagoRecaudo;
  procesador: CodigoProcesador;
  est: Estimacion;
}

export interface CobrosProcesadoresProps {
  datos: RespuestaProcesadores | null;
  puedeEditar: boolean;
  onTarifaGuardada: () => void;
}

export function CobrosProcesadores({ datos, puedeEditar, onTarifaGuardada }: CobrosProcesadoresProps) {
  const tx = useTranslations('recaudoMedio.cobros');
  const tm = useTranslations('recaudoMedio');
  const router = useRouter();
  const fmt = useMonedaOrganizacion().formatear;
  const { getToday, timezone } = useFormatDate();
  const hoy = getToday();
  const recordado = useFiltroDelDia<FiltroCobros>('procesadores-cobros', FILTRO_COBROS_POR_DEFECTO);
  const { setValor: setRecordado } = recordado;
  const [pagos, setPagos] = useState<PagoRecaudo[] | null>(null);
  const [error, setError] = useState(false);
  const [tarifaAbierta, setTarifaAbierta] = useState<CodigoProcesador | null>(null);

  const rango: RangoFechas = useMemo(() => {
    const v = recordado.valor;
    if (v.periodo === 'rango' && v.desde && v.hasta) return { desde: v.desde, hasta: v.hasta };
    return presetsRango(hoy).find((p) => p.id === v.periodo)?.rango ?? { desde: hoy, hasta: hoy };
  }, [recordado.valor, hoy]);

  const cargar = useCallback(async () => {
    if (!recordado.listo) return;
    let organizacion = 0;
    try {
      organizacion = getOrganizationId();
    } catch {
      organizacion = 0;
    }
    if (!organizacion) return;
    const r = getDateRange(rango.desde, rango.hasta, timezone);
    try {
      // Los procesadores son de la organización (no de una sede): sin filtro de sede.
      setPagos((await leerPagosRecaudo(organizacion, { desde: r.start, hasta: r.end }, null)).filter(esCobroPorAbonar));
      setError(false);
    } catch {
      setPagos(null);
      setError(true);
    }
  }, [recordado.listo, rango.desde, rango.hasta, timezone]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const procesadores = useMemo(() => datos?.procesadores ?? [], [datos]);
  const nombre = useCallback((c: string) => (c === 'datafono' ? tm('medios.datafono') : procesadores.find((p) => p.codigo === c)?.etiqueta ?? c), [procesadores, tm]);
  const tarifaDe = useCallback((c: string): TarifaProcesador | null => procesadores.find((p) => p.codigo === c)?.tarifa ?? null, [procesadores]);

  // Procesadores con cobros en el periodo (más los que tienen saldo), para el selector.
  const conCobros = useMemo(() => [...new Set((pagos ?? []).map((p) => String(p.medio)))], [pagos]);
  const elegido = recordado.valor.procesador && recordado.valor.procesador !== TODOS ? recordado.valor.procesador : null;

  const filas: FilaCobro[] = useMemo(
    () =>
      (pagos ?? [])
        .filter((p) => !elegido || p.medio === elegido)
        .map((p) => ({
          pago: p,
          procesador: p.medio as CodigoProcesador,
          est: estimarCobro(p.monto, tarifaDe(String(p.medio)), { submetodo: p.submetodo }),
        }))
        .sort((a, b) => Date.parse(b.pago.fecha) - Date.parse(a.pago.fecha)),
    [pagos, elegido, tarifaDe],
  );
  const total = useMemo(() => sumarEstimaciones(filas.map((f) => f.est)), [filas]);
  const completos = filas.filter((f) => f.pago.tipo === 'completo').length;
  const anticipos = filas.filter((f) => f.pago.tipo === 'anticipo').length;
  const tarifaElegida = elegido ? tarifaDe(elegido) : null;
  const sinTarifa = filas.some((f) => f.est.sinTarifa);
  const sinRetenciones = elegido ? !!tarifaElegida && !tarifaElegida.retencionesConfiguradas : filas.some((f) => !tarifaDe(f.procesador)?.retencionesConfiguradas);
  const saldo = elegido ? datos?.saldos.find((s) => s.procesador === elegido) ?? null : null;
  const saldoTotal = (datos?.saldos ?? []).reduce((a, s) => a + s.saldo, 0);
  const esHoy = recordado.valor.periodo === 'hoy';
  const nombreElegido = elegido ? nombre(elegido) : null;

  const textoTarifa = (x: TarifaProcesador | null) => {
    if (!x) return tx('sinTarifa');
    const b = tramoDelCobro(x);
    return tx('tarifaTexto', { pct: b.porcentaje.toLocaleString('es-CO'), fijo: fmt(b.fijo), iva: x.ivaComisionPct.toLocaleString('es-CO') });
  };
  const textoRetenciones = (x: TarifaProcesador | null) =>
    !x || !x.retencionesConfiguradas
      ? tx('configuraRetenciones', { procesador: nombreElegido ?? tx('tuProcesador') })
      : tx('retencionesTexto', { fuente: x.reteFuentePct.toLocaleString('es-CO'), ica: x.reteIcaPct.toLocaleString('es-CO'), iva: x.reteIvaPct.toLocaleString('es-CO') });

  const hora = (iso: string) => formatDateTimeInTz(iso, timezone, { hour: '2-digit', minute: '2-digit' });
  const columnas: ColumnaTabla<FilaCobro>[] = [
    {
      id: 'pago',
      encabezado: tx('columnas.pago'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{[f.pago.pedidoNumero ?? f.pago.factura ?? f.pago.referencia ?? '—', hora(f.pago.fecha)].join(' · ')}</span>
          <span className="truncate text-xs text-fg-secondary">
            {[f.pago.pedidoId ? tx('origenPedido') : tx('origenVenta'), !elegido ? nombre(f.procesador) : null, f.pago.submetodo ? tm(`cobros.submetodos.${f.pago.submetodo}` as never) : null].filter(Boolean).join(' · ')}
          </span>
        </div>
      ),
    },
    {
      id: 'tipo',
      encabezado: tx('columnas.tipo'),
      ocultarDebajo: 'md',
      celda: (f) => <StatusBadge estado={f.pago.tipo} etiqueta={tx(`tipos.${f.pago.tipo}`)} tono={f.pago.tipo === 'anticipo' ? 'informacion' : f.pago.tipo === 'completo' ? 'exito' : 'neutro'} />,
    },
    { id: 'bruto', encabezado: tx('columnas.bruto'), variante: 'importe', celda: (f) => fmt(f.est.bruto) },
    { id: 'comision', encabezado: tx('columnas.comision'), variante: 'importe', ocultarDebajo: 'md', celda: (f) => `− ${fmt(f.est.comision + f.est.ivaComision)}` },
    { id: 'retenciones', encabezado: tx('columnas.retenciones'), variante: 'importe', ocultarDebajo: 'lg', celda: (f) => `− ${fmt(f.est.retenciones)}` },
    {
      id: 'neto',
      encabezado: tx('columnas.neto'),
      variante: 'importe',
      celda: (f) => (
        <div className="flex flex-col items-end">
          <span className="font-semibold">{fmt(f.est.neto)}</span>
          <span className="text-xs text-fg-secondary">{tx('estimado')}</span>
        </div>
      ),
    },
    { id: 'estado', encabezado: tx('columnas.estado'), ocultarDebajo: 'sm', celda: () => <StatusBadge estado="por_abonar" etiqueta={tm('movimientos.porAbonar')} tono="advertencia" /> },
  ];

  const verPago = (f: FilaCobro) => {
    if (f.pago.pedidoId) router.push(`/app/pos/pedidos-online/${f.pago.pedidoId}`);
    else if (f.pago.ventaId) router.push(`/app/pos/ventas/${f.pago.ventaId}`);
  };

  const estadoTabla = error ? 'error' : !pagos ? 'cargando' : filas.length === 0 ? 'vacio' : 'listo';
  const cargando = !pagos && !error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <BarraFecha
          atajos={['hoy', 'ayer', 'semana', 'mes', 'mesPasado']}
          activo={recordado.valor.periodo}
          rango={rango}
          hoy={hoy}
          onElegir={(id, r) => setRecordado((v) => ({ ...v, periodo: id, desde: id === 'rango' ? r.desde : v.desde, hasta: id === 'rango' ? r.hasta : v.hasta }))}
        />
        <Select value={elegido ?? TODOS} onValueChange={(v) => setRecordado((x) => ({ ...x, procesador: v }))}>
          <SelectTrigger aria-label={tx('procesador')} className="h-10 w-full border-line-strong bg-surface sm:w-60">
            <SelectValue>{tx('procesadorResumen', { valor: nombreElegido ?? tx('todos') })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{tx('todos')}</SelectItem>
            {[...new Set([...procesadores.map((p) => p.codigo as string), ...conCobros])].map((c) => (
              <SelectItem key={c} value={c}>
                {nombre(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {elegido && (
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => setTarifaAbierta(elegido as CodigoProcesador)}>
            <BadgePercent aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {tx('configurarTarifa')}
          </button>
        )}
      </div>

      <KpiStrip etiqueta={tx('kpis')} columnas={5}>
        <StatCard
          etiqueta={nombreElegido ? tx(esHoy ? 'cobradoHoyPor' : 'cobradoPeriodoPor', { procesador: nombreElegido }) : tx(esHoy ? 'cobradoHoy' : 'cobradoPeriodo')}
          valor={fmt(total.bruto)}
          detalle={tx('cobradoDetalle', { n: filas.length, completos, anticipos })}
          cargando={cargando}
        />
        <StatCard
          etiqueta={tx('comisionIva')}
          valor={fmt(total.comision + total.ivaComision)}
          detalle={elegido ? textoTarifa(tarifaElegida) : sinTarifa ? tx('algunosSinTarifa') : tx('segunTarifa')}
          tono={sinTarifa ? 'advertencia' : 'neutro'}
          cargando={cargando}
        />
        <StatCard
          etiqueta={tx('retenciones')}
          valor={fmt(total.retenciones)}
          detalle={elegido ? textoRetenciones(tarifaElegida) : sinRetenciones ? tx('configuraRetenciones', { procesador: tx('tuProcesador') }) : tx('segunTarifa')}
          tono={sinRetenciones ? 'advertencia' : 'neutro'}
          cargando={cargando}
        />
        <StatCard etiqueta={tx('neto')} valor={fmt(total.neto)} detalle={tx('netoDetalle')} tono="exito" tendencia="sube" cargando={cargando} />
        <StatCard
          etiqueta={nombreElegido ? tx('faltaPorLiquidarDe', { procesador: nombreElegido }) : tx('faltaPorLiquidar')}
          valor={fmt(saldo ? saldo.saldo : saldoTotal)}
          detalle={
            saldo?.cobro_pendiente_desde
              ? tx('desde', { fecha: formatPlainDate(saldo.cobro_pendiente_desde, { day: 'numeric', month: 'short' }), dias: saldo.dias_habiles_sin_abono ?? 0 })
              : tx('faltaDetalle')
          }
          tono={saldo?.alerta ? 'peligro' : 'neutro'}
          cargando={!datos}
        />
      </KpiStrip>

      {sinRetenciones && filas.length > 0 && (
        <AvisoTonal
          tono="advertencia"
          titulo={tx('avisoRetencionesTitulo')}
          descripcion={tx('avisoRetenciones', { procesador: nombreElegido ?? tx('tuProcesador') })}
          accion={elegido && puedeEditar ? { etiqueta: tx('configurarTarifa'), onClick: () => setTarifaAbierta(elegido as CodigoProcesador) } : undefined}
        />
      )}

      <DataTable
        etiqueta={tx('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.pago.id}
        estado={estadoTabla}
        etiquetaFila={(f) => tx('etiquetaFila', { pago: f.pago.pedidoNumero ?? f.pago.factura ?? '—', bruto: fmt(f.est.bruto) })}
        onFilaClick={verPago}
        acciones={(f) => [{ id: 'ver', etiqueta: tx('verPago'), icono: Eye, onSelect: () => verPago(f), oculta: !f.pago.pedidoId && !f.pago.ventaId }]}
        vacio={{ titulo: tx('vacioTitulo'), descripcion: tx('vacioDescripcion') }}
        error={{ titulo: tm('errorLectura') }}
        onReintentar={() => void cargar()}
        pie={
          filas.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
              <span className="font-semibold text-fg">{tx(esHoy ? 'totalHoy' : 'totalPeriodo', { n: filas.length })}</span>
              <span className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums text-fg-secondary">
                <span>
                  {tx('columnas.bruto')}: <strong className="text-fg">{fmt(total.bruto)}</strong>
                </span>
                <span>
                  {tx('columnas.comision')}: <strong className="text-fg">− {fmt(total.comision + total.ivaComision)}</strong>
                </span>
                <span>
                  {tx('columnas.retenciones')}: <strong className="text-fg">− {fmt(total.retenciones)}</strong>
                </span>
                <span>
                  {tx('columnas.neto')}: <strong className="text-fg">{fmt(total.neto)}</strong>
                </span>
              </span>
            </div>
          ) : undefined
        }
      />

      <p className="text-xs text-fg-muted">{tx('pie')}</p>

      {tarifaAbierta && (
        <TarifaProcesadorDialog
          abierto={!!tarifaAbierta}
          onAbiertoChange={(v) => !v && setTarifaAbierta(null)}
          procesador={tarifaAbierta}
          nombre={nombre(tarifaAbierta)}
          tarifa={tarifaDe(tarifaAbierta)}
          puedeEditar={puedeEditar}
          onGuardada={onTarifaGuardada}
        />
      )}
    </div>
  );
}
