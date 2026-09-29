'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Copy, ExternalLink, Info, Pencil, Printer, Receipt, XCircle } from 'lucide-react';
import {
  BranchBadgeActiva,
  DataTable,
  EmptyState,
  KpiStrip,
  ListCard,
  PageHeader,
  RowActionsMenu,
  StatCard,
  type ColumnaTabla,
} from '@/components/kit';
import { BadgeOrigenMovimiento } from '@/components/kit/inventario';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { SIN_PERMISOS_INVENTARIO } from '@/lib/inventario/permisos';
import {
  adjustmentService,
  ErrorAjuste,
  type DetalleAjuste,
  type MovimientoAjuste,
  type RenglonAjuste,
  type ResultadoAplicar,
} from '@/lib/services/adjustmentService';
import { resumirDiferencias, rutaAsiento, rutaEditarAjuste, rutaKardex, rutaNuevoAjuste, RUTA_AJUSTES } from './logica';
import { BadgeEstadoAjuste, BadgeTipoAjuste, CifraDiferencia, useEtiquetaRazon, useFormatoCantidad } from './piezas';
import { useAccionesAjuste } from './useAccionesAjuste';

type Estado = 'cargando' | 'listo' | 'error' | 'sinPermiso' | 'noEncontrado';

/**
 * Detalle de un ajuste (Figma 586:308354 borrador, 586:309146 menú, 586:309538
 * aplicado; móvil 587:305277). En un borrador, «Sistema al contar» es el de
 * cuando se guardó y avisa si la existencia cambió desde entonces; en un
 * aplicado es el congelado al aplicar, y la pantalla enlaza cada movimiento del
 * kardex y el asiento contable del ajuste.
 */
export function AjusteDetalle({ ajusteId }: { ajusteId: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('inventarioAjustes.detalle');
  const tc = useTranslations('inventarioAjustes');
  const entero = useFormatoEntero();
  const cantidad = useFormatoCantidad();
  const etiquetaRazon = useEtiquetaRazon();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { formatDateTime, formatDate, formatTime } = useFormatDate();
  const [detalle, setDetalle] = useState<DetalleAjuste | null>(null);
  const [estado, setEstado] = useState<Estado>('cargando');
  const [recarga, setRecarga] = useState(0);
  const [ultimoAplicado, setUltimoAplicado] = useState<ResultadoAplicar | null>(null);
  const impreso = useRef(false);

  const recargar = useCallback((r?: ResultadoAplicar) => {
    if (r) setUltimoAplicado(r);
    setRecarga((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!ajusteId) {
      setEstado('noEncontrado');
      return;
    }
    const control = new AbortController();
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    adjustmentService
      .detalle(getOrganizationId(), ajusteId, control.signal)
      .then((d) => {
        setDetalle(d);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (e instanceof ErrorAjuste && e.noEncontrado) setEstado('noEncontrado');
        else if (e instanceof ErrorAjuste && e.sinPermiso) setEstado('sinPermiso');
        else {
          console.error('Error cargando el ajuste:', e);
          setEstado('error');
        }
      });
    return () => control.abort();
  }, [ajusteId, recarga]);

  // «Imprimir» desde la selección del listado: abre el detalle y el diálogo del navegador.
  useEffect(() => {
    if (estado === 'listo' && params?.get('imprimir') === '1' && !impreso.current) {
      impreso.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [estado, params]);

  const acciones = useAccionesAjuste({ permisos: detalle?.permisos ?? SIN_PERMISOS_INVENTARIO, onCambio: recargar, enDetalle: true });

  const migasBase = [
    { etiqueta: tc('inventario'), href: '/app/inventario' },
    { etiqueta: tc('listado.titulo'), href: RUTA_AJUSTES },
  ];

  if (estado !== 'listo' || !detalle) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        <PageHeader titulo={t('tituloVacio')} icono={ClipboardCheck} variante="detail" migas={migasBase} volverA={RUTA_AJUSTES} cargando={estado === 'cargando'} />
        {estado === 'cargando' ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('cargando')}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : estado === 'sinPermiso' ? (
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('volver'), href: RUTA_AJUSTES }} />
        ) : estado === 'noEncontrado' ? (
          <EmptyState titulo={t('noEncontrado.titulo')} descripcion={t('noEncontrado.descripcion')} icono={ClipboardCheck} accion={{ etiqueta: t('volver'), href: RUTA_AJUSTES }} />
        ) : (
          <EmptyState variante="error" titulo={t('error')} onReintentar={() => recargar()} />
        )}
      </div>
    );
  }

  const a = detalle.ajuste;
  const borrador = a.estado === 'draft';
  const aplicado = a.estado === 'posted';
  const conteo = a.modo === 'conteo';
  const renglones = detalle.renglones;
  const resumen = resumirDiferencias(renglones);
  const cambiados = borrador ? renglones.filter((r) => r.sistema_actual !== null && r.sistema_actual !== r.sistema) : [];
  const importe = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${moneda(Math.abs(n))}`);
  const unidadDe = (u: string | null | undefined) => u ?? t('uds');
  const unidadComun = (() => {
    const us = new Set(renglones.map((r) => r.producto.unidad ?? ''));
    return us.size === 1 ? [...us][0] || null : null;
  })();
  const accionable = { id: a.id, codigo: a.codigo, estado: a.estado, sucursal: a.sucursal };
  const menu = acciones.accionesDe(accionable);

  const subtitulo = [
    a.sucursal.nombre,
    aplicado && a.aplicado
      ? t('aplicadoEl', { fecha: formatDateTime(a.aplicado) })
      : conteo
        ? t('contadoEl', { fecha: formatDateTime(a.fecha) })
        : t('registradoEl', { fecha: formatDateTime(a.fecha) }),
    (aplicado ? a.aplicado_por : a.creado_por) ? t('por', { nombre: (aplicado ? a.aplicado_por : a.creado_por) as string }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const etiquetaCantidad = conteo ? t('columnas.contado') : a.modo === 'entrada' ? t('columnas.entra') : t('columnas.sale');
  const etiquetaSistema = conteo ? t('columnas.sistema') : t('columnas.sistemaAntes');

  const columnasRenglones: ColumnaTabla<RenglonAjuste>[] = [
    {
      id: 'producto',
      encabezado: t('columnas.producto'),
      celda: (r) => (
        <div className="flex min-w-0 flex-col">
          <Link href={`/app/inventario/productos/${r.producto.id}`} className="truncate font-medium text-fg hover:underline">
            {r.producto.nombre}
          </Link>
          <span className="truncate text-xs text-fg-secondary">
            {[r.producto.sku ? t('sku', { sku: r.producto.sku }) : null, r.seriales.length ? t('seriales', { lista: r.seriales.join(', ') }) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      ),
    },
    { id: 'lote', encabezado: t('columnas.lote'), ocultarDebajo: 'md', celda: (r) => <span className="text-fg-secondary">{r.lote?.codigo ?? '—'}</span> },
    {
      id: 'sistema',
      encabezado: etiquetaSistema,
      variante: 'importe',
      celda: (r) => (
        <span className="flex flex-col items-end">
          <span>{cantidad(r.sistema)}</span>
          {borrador && r.sistema_actual !== null && r.sistema_actual !== r.sistema && (
            <span className="text-xs text-warning-text">{t('hoy', { n: cantidad(r.sistema_actual) })}</span>
          )}
        </span>
      ),
    },
    { id: 'cantidad', encabezado: etiquetaCantidad, variante: 'importe', celda: (r) => cantidad(r.cantidad) },
    {
      id: 'diferencia',
      encabezado: t('columnas.diferencia'),
      variante: 'importe',
      celda: (r) => <CifraDiferencia valor={r.diferencia} texto={cantidad(r.diferencia, { signo: true })} />,
    },
    { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', ocultarDebajo: 'lg', celda: (r) => (r.costo === null ? '—' : moneda(r.costo)) },
    {
      id: 'impacto',
      encabezado: t('columnas.impacto'),
      variante: 'importe',
      celda: (r) => <CifraDiferencia valor={r.impacto} texto={importe(r.impacto)} />,
    },
  ];

  const columnasMovimientos: ColumnaTabla<MovimientoAjuste>[] = [
    {
      id: 'fecha',
      encabezado: t('movimientos.fecha'),
      celda: (m) => (
        <span className="flex flex-col">
          <span className="text-fg">{formatDate(m.fecha)}</span>
          <span className="text-xs text-fg-secondary">{formatTime(m.fecha)}</span>
        </span>
      ),
    },
    {
      id: 'producto',
      encabezado: t('movimientos.producto'),
      celda: (m) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{m.producto.nombre}</span>
          {m.producto.sku && <span className="truncate text-xs text-fg-secondary">{t('sku', { sku: m.producto.sku })}</span>}
        </span>
      ),
    },
    { id: 'tipo', encabezado: t('movimientos.tipo'), ocultarDebajo: 'md', celda: (m) => <BadgeOrigenMovimiento origen="adjustment" direccion={m.direccion} /> },
    {
      id: 'sucursal',
      encabezado: t('movimientos.sucursalLote'),
      ocultarDebajo: 'lg',
      celda: (m) => (
        <span className="flex flex-col">
          <span className="text-fg">{a.sucursal.nombre}</span>
          {m.lote && <span className="text-xs text-fg-secondary">{m.lote}</span>}
        </span>
      ),
    },
    {
      id: 'cantidad',
      encabezado: t('movimientos.cantidad'),
      variante: 'importe',
      celda: (m) => {
        const v = m.direccion === 'in' ? m.cantidad : -m.cantidad;
        return <CifraDiferencia valor={v} texto={cantidad(v, { signo: true })} />;
      },
    },
    { id: 'costo', encabezado: t('movimientos.costo'), variante: 'importe', ocultarDebajo: 'md', celda: (m) => (m.costo === null ? '—' : moneda(m.costo)) },
    {
      id: 'kardex',
      encabezado: t('movimientos.enKardex'),
      celda: (m) => (
        <span className="flex flex-col">
          <Link
            href={rutaKardex(m.producto.id, a.sucursal.id)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-sm"
          >
            <ClipboardCheck aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            {t('movimientos.verKardex')}
          </Link>
          {m.saldo_despues !== null && <span className="text-xs text-fg-secondary">{t('movimientos.saldoTras', { n: cantidad(m.saldo_despues) })}</span>}
        </span>
      ),
    },
  ];

  const cabecera = (
    <PageHeader
      titulo={t('titulo', { codigo: a.codigo })}
      subtitulo={subtitulo}
      icono={ClipboardCheck}
      variante="detail"
      volverA={RUTA_AJUSTES}
      badge={
        <span className="flex items-center gap-2">
          <BadgeEstadoAjuste estado={a.estado} tamano="md" />
          <BadgeTipoAjuste tipo={a.tipo} tamano="md" />
        </span>
      }
      migas={[...migasBase, { etiqueta: a.codigo }]}
      debajo={<BranchBadgeActiva />}
      acciones={
        <span className="flex items-center gap-2 print:hidden">
          <Button variant="outline" className="h-10 gap-2" onClick={() => window.print()}>
            <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('imprimir')}
          </Button>
          {borrador && acciones.puedeAjustar && (
            <>
              <Button variant="outline" className="h-10 gap-2" onClick={() => router.push(rutaEditarAjuste(a.id))}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('editar')}
              </Button>
              <Button className="h-10 gap-2" onClick={() => acciones.pedirAplicar([accionable])}>
                <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                {t('aplicar')}
              </Button>
            </>
          )}
          {!borrador && acciones.puedeAjustar && (
            <Button variant="outline" className="h-10 gap-2" onClick={() => router.push(rutaNuevoAjuste({ desde: a.id, sucursal: a.sucursal.id }))}>
              <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {tc('acciones.duplicar')}
            </Button>
          )}
          {borrador && menu.length > 0 && <RowActionsMenu orientacion="horizontal" tamano="md" titulo={a.codigo} acciones={menu} />}
        </span>
      }
      movil={{
        titulo: a.codigo,
        subtitulo: [a.sucursal.nombre, formatDateTime(a.fecha)].join(' · '),
        accion: <RowActionsMenu orientacion="horizontal" titulo={a.codigo} acciones={menu} />,
      }}
    />
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      {/* Móvil: los badges van bajo la cabecera (Figma 587:305277). */}
      <div className="flex items-center gap-2 sm:hidden">
        <BadgeEstadoAjuste estado={a.estado} />
        <BadgeTipoAjuste tipo={a.tipo} />
      </div>

      {conteo && renglones.length > 0 && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard etiqueta={t('kpis.productos')} valor={entero(resumen.productos)} detalle={etiquetaRazon(a.razon)} />
          <StatCard
            etiqueta={t('kpis.faltantes')}
            valor={cantidad(resumen.faltantes, { signo: true, unidad: unidadDe(unidadComun) })}
            tono={resumen.faltantes < 0 ? 'peligro' : 'neutro'}
            tendencia={resumen.faltantes < 0 ? 'baja' : undefined}
            detalle={t('kpis.enProductos', { count: resumen.productosFaltantes, n: entero(resumen.productosFaltantes) })}
          />
          <StatCard
            etiqueta={t('kpis.sobrantes')}
            valor={cantidad(resumen.sobrantes, { signo: true, unidad: unidadDe(unidadComun) })}
            tono={resumen.sobrantes > 0 ? 'exito' : 'neutro'}
            detalle={t('kpis.enProductos', { count: resumen.productosSobrantes, n: entero(resumen.productosSobrantes) })}
          />
          <StatCard
            etiqueta={t('kpis.impacto')}
            valor={detalle.permisos.costos ? importe(resumen.impacto) : '—'}
            tono={(resumen.impacto ?? 0) < 0 ? 'peligro' : (resumen.impacto ?? 0) > 0 ? 'exito' : 'neutro'}
            tendencia={(resumen.impacto ?? 0) < 0 ? 'baja' : (resumen.impacto ?? 0) > 0 ? 'sube' : undefined}
            detalle={detalle.permisos.costos ? t('kpis.alCosto') : t('kpis.sinCostos')}
          />
        </KpiStrip>
      )}

      {borrador && (
        <div role="status" className="flex gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning-text" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-warning-text">{t('avisoBorrador.titulo')}</p>
            <p className="hidden text-[13px] text-fg-secondary sm:block">
              {t('avisoBorrador.descripcion', { count: resumen.conDiferencia, n: entero(resumen.conDiferencia) })}
            </p>
            {cambiados.length > 0 && (
              <p className="mt-1 text-[13px] font-medium text-warning-text">{t('avisoBorrador.cambiados', { count: cambiados.length, n: entero(cambiados.length) })}</p>
            )}
          </div>
        </div>
      )}

      {aplicado && (
        <div role="status" className="flex gap-3 rounded-xl border border-line-success bg-success-subtle p-4">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-text" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-success-text">
              {t('avisoAplicado.titulo', { count: detalle.movimientos.length, n: entero(detalle.movimientos.length) })}
            </p>
            <p className="text-[13px] text-fg-secondary">{t('avisoAplicado.descripcion')}</p>
            {ultimoAplicado && ultimoAplicado.recalculados.length > 0 && (
              <p className="mt-1 text-[13px] font-medium text-warning-text">
                {t('avisoAplicado.recalculados', {
                  count: ultimoAplicado.recalculados.length,
                  productos: ultimoAplicado.recalculados.map((r) => r.nombre).join(', '),
                })}
              </p>
            )}
            {detalle.asiento ? (
              <Link
                href={rutaAsiento(detalle.asiento.id)}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 rounded-sm"
              >
                <Receipt aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('avisoAplicado.asiento', { id: detalle.asiento.id })}
                <ExternalLink aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              </Link>
            ) : (
              detalle.movimientos.length > 0 && <p className="mt-1 text-xs text-fg-muted">{t('avisoAplicado.sinAsiento')}</p>
            )}
          </div>
        </div>
      )}

      {a.estado === 'cancelled' && (
        <div role="status" className="flex gap-3 rounded-xl border border-line bg-subtle p-4">
          <XCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fg-secondary" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">
              {t('avisoDescartado.titulo', {
                fecha: a.descartado ? formatDateTime(a.descartado) : '—',
                nombre: a.descartado_por ?? '—',
              })}
            </p>
            {a.motivo_descarte && <p className="text-[13px] text-fg-secondary">{t('avisoDescartado.motivo', { motivo: a.motivo_descarte })}</p>}
          </div>
        </div>
      )}

      {a.notas && (
        <p className="flex items-start gap-2 text-sm text-fg-secondary">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {/* Texto plano: nunca HTML. */}
          <span className="whitespace-pre-line">{a.notas}</span>
        </p>
      )}

      <section aria-labelledby="renglones-ajuste" className="flex flex-col gap-3">
        <h2 id="renglones-ajuste" className="text-base font-semibold text-fg">
          {conteo
            ? t('renglones.tituloConteo', { count: resumen.productos, n: entero(resumen.productos), sin: resumen.sinDiferencia })
            : t('renglones.titulo', { count: resumen.productos, n: entero(resumen.productos) })}
        </h2>
        <DataTable
          etiqueta={t('renglones.etiqueta')}
          columnas={columnasRenglones}
          filas={renglones}
          obtenerId={(r) => String(r.id)}
          tonoFila={(r) => (borrador && r.sistema_actual !== null && r.sistema_actual !== r.sistema ? 'advertencia' : undefined)}
          tarjetaMovil={(r) => (
            <ListCard
              titulo={r.producto.nombre}
              subtitulo={[
                r.lote ? t('movil.lote', { lote: r.lote.codigo }) : t('movil.sinLote'),
                t('movil.sistema', { n: cantidad(r.sistema) }),
                `${etiquetaCantidad.toLowerCase()} ${cantidad(r.cantidad)}`,
              ].join(' · ')}
              meta={<CifraDiferencia valor={r.diferencia} texto={cantidad(r.diferencia, { signo: true, unidad: unidadDe(r.producto.unidad) })} className="font-medium" />}
              valor={r.impacto !== null ? <span className="text-sm text-fg-secondary">{importe(r.impacto)}</span> : undefined}
            />
          )}
          vacio={{ titulo: t('renglones.vacio') }}
        />
      </section>

      {!borrador && detalle.movimientos.length > 0 && (
        <section id="movimientos-ajuste" aria-labelledby="movimientos-ajuste-titulo" className="flex scroll-mt-20 flex-col gap-3">
          <h2 id="movimientos-ajuste-titulo" className="text-base font-semibold text-fg">
            {t('movimientos.titulo', { count: detalle.movimientos.length, n: entero(detalle.movimientos.length) })}
          </h2>
          <DataTable
            etiqueta={t('movimientos.etiqueta')}
            columnas={columnasMovimientos}
            filas={detalle.movimientos}
            obtenerId={(m) => String(m.id)}
            tarjetaMovil={(m) => {
              const v = m.direccion === 'in' ? m.cantidad : -m.cantidad;
              return (
                <ListCard
                  titulo={m.producto.nombre}
                  subtitulo={[formatDateTime(m.fecha), m.lote].filter(Boolean).join(' · ')}
                  meta={m.saldo_despues !== null ? t('movimientos.saldoTras', { n: cantidad(m.saldo_despues) }) : undefined}
                  valor={<CifraDiferencia valor={v} texto={cantidad(v, { signo: true })} className="font-medium" />}
                  onClick={() => router.push(rutaKardex(m.producto.id, a.sucursal.id))}
                />
              );
            }}
          />
        </section>
      )}

      {/* Móvil: acciones al pie (Figma 587:305277). */}
      {borrador && acciones.puedeAjustar && (
        <div className="sticky bottom-0 z-20 -mx-4 flex gap-3 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden print:hidden">
          <Button variant="outline" className="h-11 flex-1 gap-2" onClick={() => router.push(rutaEditarAjuste(a.id))}>
            <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('editar')}
          </Button>
          <Button className="h-11 flex-1 gap-2" onClick={() => acciones.pedirAplicar([accionable])}>
            <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t('aplicar')}
          </Button>
        </div>
      )}

      {acciones.dialogos}
    </div>
  );
}

export default AjusteDetalle;
