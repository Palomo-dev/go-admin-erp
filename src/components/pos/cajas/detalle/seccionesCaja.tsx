'use client';

/**
 * Bloques del detalle de una caja (Figma `355:53499`, «CD-Resumen»,
 * «CD-Movs», «CD-Arq», «CD-Ventas»), reutilizados en «Mi caja»: cifras,
 * información de la sesión, desglose del esperado, pagos por método y las
 * tablas de movimientos, arqueos y ventas del turno.
 *
 * Todas las cifras vienen del resumen del servidor (`GET
 * /api/pos/cajas/[id]/resumen`): ningún bloque recalcula el esperado. Con
 * cierre ciego sin permiso el servidor no manda las cifras y aquí se ve
 * «Oculto».
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, FileText, Info, Printer, Receipt, Wallet } from 'lucide-react';
import {
  DataTable,
  FilaDato,
  KpiStrip,
  ListaDatos,
  PaginationCompact,
  StatCard,
  StatusBadge,
  Tarjeta,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { imprimirDocumento, abrirDocumento } from '@/lib/documents/cliente';
import { resultadoDiferencia } from '../historialCajas';
import { useEtiquetaMetodoPago } from '../paymentMethodLabels';
import { Oculto } from '../listado/comunes';
import { useFechaHoraCaja } from '../comunesCaja';
import { BADGE_ESTADO_VENTA, estadoVenta } from '@/lib/pos/ventas/estadoVenta';
import type { ArqueoResumen, MovimientoResumen, ResumenCaja, VentaTurno } from '@/lib/pos/cajas/resumenServidor';

type Formatear = (v: number) => string;

function conSigno(v: number, formatear: Formatear): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatear(Math.abs(v))}`;
}

/** Las 4 cifras del detalle: inicial, ventas en efectivo, esperado y diferencia. */
export function KpisCaja({ resumen, formatear, cargando }: { resumen: ResumenCaja; formatear: Formatear; cargando?: boolean }) {
  const t = useTranslations('cajas.ficha');
  const d = resumen.esperado.detalle;
  const visible = resumen.verImportes;
  const cerrada = resumen.sesion.status === 'closed';
  const dif = resumen.sesion.difference;
  const resultado = resultadoDiferencia(dif);
  return (
    <KpiStrip etiqueta={t('kpis')}>
      <StatCard etiqueta={t('montoInicial')} icono={Wallet} cargando={cargando} valor={formatear(resumen.sesion.initial_amount)} detalle={t('aperturaTurno')} />
      <StatCard
        etiqueta={t('ventasEfectivo')}
        icono={Banknote}
        cargando={cargando}
        valor={visible && d ? formatear(d.ventas_efectivo) : <Oculto />}
        detalle={t('ventasTurno', { count: resumen.ventas.cantidad })}
        tono={visible ? 'exito' : 'neutro'}
      />
      <StatCard
        etiqueta={t('montoEsperado')}
        icono={Receipt}
        cargando={cargando}
        valor={visible && resumen.esperado.efectivo_esperado !== null ? formatear(resumen.esperado.efectivo_esperado) : <Oculto />}
        detalle={visible ? t('formulaEsperado') : t('cierreCiego')}
      />
      <StatCard
        etiqueta={t('diferencia')}
        icono={Receipt}
        cargando={cargando}
        valor={!cerrada ? '—' : visible && dif !== null ? conSigno(dif, formatear) : <Oculto />}
        detalle={!cerrada ? t('diferenciaAlCerrar') : visible && resultado ? t(`resultados.${resultado}`) : t('cierreCiego')}
        tono={cerrada && visible && resultado === 'faltante' ? 'peligro' : cerrada && visible && resultado === 'sobrante' ? 'exito' : 'neutro'}
        tendencia={cerrada && visible && resultado === 'faltante' ? 'baja' : cerrada && visible && resultado === 'sobrante' ? 'sube' : undefined}
      />
    </KpiStrip>
  );
}

/** «Información de la sesión». */
export function TarjetaInfoSesion({ resumen }: { resumen: ResumenCaja }) {
  const t = useTranslations('cajas.ficha');
  const fechaHora = useFechaHoraCaja();
  const s = resumen.sesion;
  return (
    <Tarjeta titulo={t('infoTitulo')} icono={Info}>
      <ListaDatos etiqueta={t('infoTitulo')}>
        <FilaDato etiqueta={t('cajeroAbrio')} valor={s.opened_by_name || '—'} />
        {s.status === 'closed' && <FilaDato etiqueta={t('cajeroCerro')} valor={s.closed_by_name || '—'} />}
        <FilaDato etiqueta={t('sucursal')} valor={s.branch_id === null ? t('todasSucursales') : s.branch_name ?? t('sucursalNumero', { id: s.branch_id })} />
        <FilaDato etiqueta={t('apertura')} valor={fechaHora(s.opened_at)} />
        {s.closed_at && <FilaDato etiqueta={t('cierre')} valor={fechaHora(s.closed_at)} />}
        <FilaDato etiqueta={t('modo')} valor={resumen.modo === 'user' ? t('modoCajero') : t('modoSucursal')} />
      </ListaDatos>
      {s.notes && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-xs font-medium text-fg-secondary">{t('notas')}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-fg">{s.notes.replace(/<[^>]*>/g, ' ').trim()}</p>
        </div>
      )}
    </Tarjeta>
  );
}

/** «Desglose de caja»: cómo se llega al efectivo esperado (del servidor). */
export function TarjetaDesglose({ resumen, formatear }: { resumen: ResumenCaja; formatear: Formatear }) {
  const t = useTranslations('cajas.ficha');
  const d = resumen.esperado.detalle;
  const visible = resumen.verImportes && !!d;
  const s = resumen.sesion;
  const filas: Array<{ clave: string; valor: number; signo: 1 | -1; descripcion?: string }> = d
    ? [
        { clave: 'ventasEfectivo', valor: d.ventas_efectivo, signo: 1, descripcion: d.vuelto > 0 ? t('netoVuelto', { monto: formatear(d.vuelto) }) : undefined },
        { clave: 'abonos', valor: d.abonos_efectivo, signo: 1 },
        { clave: 'ingresos', valor: d.entradas, signo: 1 },
        { clave: 'egresos', valor: d.salidas, signo: -1 },
        { clave: 'compras', valor: d.compras_efectivo, signo: -1 },
        { clave: 'devoluciones', valor: d.devoluciones, signo: -1 },
      ]
    : [];
  return (
    <Tarjeta titulo={t('desgloseTitulo')} icono={Receipt}>
      <ListaDatos etiqueta={t('desgloseTitulo')}>
        <FilaDato etiqueta={t('montoInicial')} valor={formatear(s.initial_amount)} />
        {visible ? (
          filas
            .filter((f) => f.valor !== 0 || f.clave === 'ventasEfectivo')
            .map((f) => (
              <FilaDato
                key={f.clave}
                etiqueta={`${f.signo > 0 ? '+' : '−'} ${t(`desglose.${f.clave}`)}`}
                descripcion={f.descripcion}
                valor={`${f.signo > 0 ? '+' : '−'}${formatear(Math.abs(f.valor))}`}
                tono={f.signo > 0 ? 'exito' : 'peligro'}
              />
            ))
        ) : (
          <FilaDato etiqueta={t('desglose.movimientosTurno')} oculto />
        )}
        <FilaDato
          etiqueta={`= ${t('montoEsperado')}`}
          valor={visible && resumen.esperado.efectivo_esperado !== null ? formatear(resumen.esperado.efectivo_esperado) : null}
          oculto={!visible}
          tono="fuerte"
          separadorAntes
        />
        {s.status === 'closed' && (
          <>
            <FilaDato etiqueta={t('montoContado')} valor={s.final_amount === null ? null : formatear(s.final_amount)} oculto={s.final_amount === null && !resumen.verImportes} />
            <FilaDato
              etiqueta={t('diferencia')}
              valor={s.difference === null ? null : conSigno(s.difference, formatear)}
              oculto={s.difference === null}
              tono={s.difference !== null && s.difference <= -0.5 ? 'peligro' : s.difference !== null && s.difference >= 0.5 ? 'exito' : 'neutro'}
              tamano="lg"
            />
          </>
        )}
      </ListaDatos>
    </Tarjeta>
  );
}

/** «Pagos por método» del turno: efectivo cobrado y cada otro método (del servidor). */
export function TarjetaPagosPorMetodo({ resumen, formatear }: { resumen: ResumenCaja; formatear: Formatear }) {
  const t = useTranslations('cajas.ficha');
  const etiquetaMetodo = useEtiquetaMetodoPago();
  const visible = resumen.verImportes && !!resumen.esperado.por_metodo && !!resumen.esperado.detalle;
  const filas = useMemo(() => {
    if (!visible) return [];
    const d = resumen.esperado.detalle!;
    const efectivo = d.ventas_efectivo + d.abonos_efectivo;
    const otros = Object.entries(resumen.esperado.por_metodo ?? {})
      .filter(([m, v]) => m !== 'cash' && Number(v) !== 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    return [['cash', efectivo] as [string, number], ...otros.map(([m, v]) => [m, Number(v)] as [string, number])];
  }, [visible, resumen]);
  const total = filas.reduce((s, [, v]) => s + v, 0);
  return (
    <Tarjeta titulo={t('pagosTitulo')} icono={CreditCard}>
      {!visible ? (
        <ListaDatos etiqueta={t('pagosTitulo')}>
          <FilaDato etiqueta={t('pagosTitulo')} oculto />
        </ListaDatos>
      ) : filas.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('pagosVacio')}</p>
      ) : (
        <ListaDatos etiqueta={t('pagosTitulo')}>
          {filas.map(([metodo, valor]) => (
            <FilaDato key={metodo} etiqueta={etiquetaMetodo(metodo)} valor={formatear(valor)} />
          ))}
          <FilaDato etiqueta={t('total')} valor={formatear(total)} tono="fuerte" separadorAntes />
        </ListaDatos>
      )}
    </Tarjeta>
  );
}

function usePaginado<T>(filas: readonly T[], tamano = 10) {
  const [pagina, setPagina] = useState(1);
  const total = filas.length;
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const actual = Math.min(pagina, paginas);
  const visibles = filas.slice((actual - 1) * tamano, actual * tamano);
  return { pagina: actual, setPagina, total, tamano, visibles };
}

/** Tabla de movimientos manuales del turno. */
export function TablaMovimientos({ movimientos, formatear, compacta }: { movimientos: readonly MovimientoResumen[]; formatear: Formatear; compacta?: boolean }) {
  const t = useTranslations('cajas.ficha');
  const tConceptos = useTranslations('cajas.conceptos');
  const fechaHora = useFechaHoraCaja();
  const p = usePaginado(movimientos, compacta ? 5 : 10);
  const concepto = (m: MovimientoResumen) => (m.clave_concepto ? tConceptos(m.clave_concepto) : m.concept);
  const columnas: ColumnaTabla<MovimientoResumen>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (m) => fechaHora(m.created_at) },
    {
      id: 'tipo',
      encabezado: t('columnas.tipo'),
      celda: (m) => (
        <Badge tono={m.type === 'in' ? 'exito' : 'peligro'} apariencia="suave" tamano="sm" icono={m.type === 'in' ? ArrowUpCircle : ArrowDownCircle}>
          {m.type === 'in' ? t('ingreso') : t('egreso')}
        </Badge>
      ),
    },
    { id: 'concepto', encabezado: t('columnas.concepto'), celda: (m) => concepto(m) },
    { id: 'soporte', encabezado: t('columnas.soporte'), variante: 'mono', ocultarDebajo: 'md', celda: (m) => m.reference || '—' },
    { id: 'usuario', encabezado: t('columnas.usuario'), ocultarDebajo: 'lg', celda: (m) => m.user_name || '—' },
    {
      id: 'monto',
      encabezado: t('columnas.monto'),
      variante: 'importe',
      celda: (m) => <span className={m.type === 'in' ? 'text-success-text' : 'text-danger-text'}>{`${m.type === 'in' ? '+' : '−'}${formatear(m.amount)}`}</span>,
    },
  ];
  return (
    <DataTable
      etiqueta={t('movimientosTitulo')}
      columnas={columnas}
      filas={p.visibles}
      obtenerId={(m) => String(m.id)}
      densidad="compacta"
      estado="listo"
      vacio={{ titulo: t('movimientosVacio'), descripcion: t('movimientosVacioDescripcion') }}
      tarjetaMovil={(m) => (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{concepto(m)}</p>
            <p className="text-xs text-fg-muted">{fechaHora(m.created_at)}{m.reference ? ` · ${m.reference}` : ''}</p>
          </div>
          <span className={m.type === 'in' ? 'shrink-0 text-sm font-semibold tabular-nums text-success-text' : 'shrink-0 text-sm font-semibold tabular-nums text-danger-text'}>
            {`${m.type === 'in' ? '+' : '−'}${formatear(m.amount)}`}
          </span>
        </div>
      )}
      pie={p.total > p.tamano ? <PaginationCompact pagina={p.pagina} tamano={p.tamano} total={p.total} onPaginaChange={p.setPagina} /> : undefined}
    />
  );
}

/** Tabla de arqueos con la columna por método (de `method_breakdown`). */
export function TablaArqueos({ arqueos, formatear, visible }: { arqueos: readonly ArqueoResumen[]; formatear: Formatear; visible: boolean }) {
  const t = useTranslations('cajas.ficha');
  const tTipos = useTranslations('cajas.arqueo.tipos');
  const etiquetaMetodo = useEtiquetaMetodoPago();
  const fechaHora = useFechaHoraCaja();
  const p = usePaginado(arqueos, 10);
  const porMetodo = (a: ArqueoResumen) =>
    Object.entries(a.method_breakdown ?? {})
      .filter(([m, l]) => m !== 'cash' && l?.contado !== null && l?.contado !== undefined)
      .map(([m, l]) => `${etiquetaMetodo(m)} ${formatear(Number(l.contado))}`)
      .join(' · ');
  const acciones = (a: ArqueoResumen): AccionFila[] => [
    { id: 'imprimir', etiqueta: t('imprimirComprobante'), icono: Printer, onSelect: () => imprimirDocumento('arqueo-caja', a.id, { papel: '80mm' }) },
    { id: 'pdf', etiqueta: t('verPdf'), icono: FileText, onSelect: () => abrirDocumento('arqueo-caja', a.id) },
  ];
  const columnas: ColumnaTabla<ArqueoResumen>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (a) => fechaHora(a.created_at) },
    { id: 'tipo', encabezado: t('columnas.tipo'), celda: (a) => tTipos(a.count_type) },
    { id: 'contado', encabezado: t('columnas.efectivoContado'), variante: 'importe', celda: (a) => formatear(a.counted_amount) },
    { id: 'metodos', encabezado: t('columnas.otrosMetodos'), ocultarDebajo: 'lg', celda: (a) => porMetodo(a) || '—' },
    { id: 'esperado', encabezado: t('columnas.esperado'), variante: 'importe', celda: (a) => (visible && a.expected_amount !== null ? formatear(a.expected_amount) : <Oculto />) },
    {
      id: 'diferencia',
      encabezado: t('columnas.diferencia'),
      variante: 'importe',
      celda: (a) =>
        visible && a.difference !== null ? (
          <span className={a.difference <= -0.5 ? 'text-danger-text' : a.difference >= 0.5 ? 'text-success-text' : ''}>{conSigno(a.difference, formatear)}</span>
        ) : (
          <Oculto />
        ),
    },
    { id: 'conto', encabezado: t('columnas.conto'), ocultarDebajo: 'md', celda: (a) => a.counted_by_name || '—' },
  ];
  return (
    <DataTable
      etiqueta={t('arqueosTitulo')}
      columnas={columnas}
      filas={p.visibles}
      obtenerId={(a) => String(a.id)}
      densidad="compacta"
      estado="listo"
      acciones={acciones}
      vacio={{ titulo: t('arqueosVacio'), descripcion: t('arqueosVacioDescripcion') }}
      tarjetaMovil={(a) => (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">{tTipos(a.count_type)}</p>
            <p className="text-xs text-fg-muted">{fechaHora(a.created_at)}{a.counted_by_name ? ` · ${a.counted_by_name}` : ''}</p>
          </div>
          <div className="shrink-0 text-right text-sm tabular-nums">
            <p className="font-semibold text-fg">{formatear(a.counted_amount)}</p>
            {visible && a.difference !== null && <p className={a.difference < 0 ? 'text-xs text-danger-text' : 'text-xs text-fg-muted'}>{conSigno(a.difference, formatear)}</p>}
          </div>
        </div>
      )}
      pie={p.total > p.tamano ? <PaginationCompact pagina={p.pagina} tamano={p.tamano} total={p.total} onPaginaChange={p.setPagina} /> : undefined}
    />
  );
}

/** Ventas del turno; cada fila abre la venta. */
export function TablaVentasTurno({ ventas, formatear, truncadas }: { ventas: readonly VentaTurno[]; formatear: Formatear; truncadas?: boolean }) {
  const t = useTranslations('cajas.ficha');
  const tEstados = useTranslations('posVentas.estados');
  const router = useRouter();
  const fechaHora = useFechaHoraCaja();
  const p = usePaginado(ventas, 10);
  const estado = (v: VentaTurno) => estadoVenta({ status: v.status, payment_status: v.payment_status });
  const columnas: ColumnaTabla<VentaTurno>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (v) => fechaHora(v.created_at) },
    { id: 'numero', encabezado: t('columnas.numero'), variante: 'mono', celda: (v) => v.numero ?? t('sinNumero') },
    { id: 'cliente', encabezado: t('columnas.cliente'), ocultarDebajo: 'md', celda: (v) => v.cliente || t('consumidorFinal') },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (v) => <StatusBadge estado={BADGE_ESTADO_VENTA[estado(v)]} etiqueta={tEstados(estado(v))} /> },
    { id: 'total', encabezado: t('columnas.total'), variante: 'importe', celda: (v) => formatear(v.total) },
  ];
  return (
    <div className="flex flex-col gap-2">
      {truncadas && <p className="text-xs text-fg-muted">{t('ventasTruncadas')}</p>}
      <DataTable
        etiqueta={t('ventasTitulo')}
        columnas={columnas}
        filas={p.visibles}
        obtenerId={(v) => v.id}
        densidad="compacta"
        estado="listo"
        onFilaClick={(v) => router.push(`/app/pos/ventas/${v.id}`)}
        etiquetaFila={(v) => v.numero ?? t('sinNumero')}
        vacio={{ titulo: t('ventasVacio'), descripcion: t('ventasVacioDescripcion') }}
        tarjetaMovil={(v) => (
          <button
            type="button"
            onClick={() => router.push(`/app/pos/ventas/${v.id}`)}
            className="flex w-full items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{v.numero ?? t('sinNumero')}</p>
              <p className="text-xs text-fg-muted">{fechaHora(v.created_at)}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">{formatear(v.total)}</span>
          </button>
        )}
        pie={p.total > p.tamano ? <PaginationCompact pagina={p.pagina} tamano={p.tamano} total={p.total} onPaginaChange={p.setPagina} /> : undefined}
      />
    </div>
  );
}
