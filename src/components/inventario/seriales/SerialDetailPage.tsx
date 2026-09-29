'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Printer, ScanBarcode, ShieldCheck, Undo2 } from 'lucide-react';
import { BranchBadgeActiva, EmptyState, FilaDato, ListaDatos, PageHeader, RowActionsMenu, Tarjeta, type AccionFila } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ErrorPeticionSeriales, clienteSeriales } from '@/lib/services/seriales/cliente';
import { PERMISOS_SERIALES_VACIOS, type SerialDetalle } from '@/lib/services/seriales/contrato';
import { mesesYDias, numeroDocumento, rutaCliente, rutaDocumento, rutaProveedor, rutaReclamo, RUTA_SERIALES, situacionGarantia } from './logica';
import { BadgeEstadoSerial, EnlaceDocumento, HistorialSerial } from './piezas';
import { useAccionesSerial } from './useAccionesSerial';

/**
 * Detalle de un serial (Figma 591:112363 escritorio, 591:113637 móvil):
 * origen (proveedor, orden o factura de compra, costo si hay permiso, sucursal
 * y lote), venta (con la sucursal de la venta, no la actual), garantía desde
 * la venta con sus reclamos, e historial con cada documento enlazado.
 */
export function SerialDetailPage({ serialId }: { serialId: number }) {
  const router = useRouter();
  const t = useTranslations('inventarioSeriales.detalle');
  const tc = useTranslations('inventarioSeriales.comun');
  const tr = useTranslations('inventarioGarantias.estados');
  const { formatDate, formatDateTime, formatPlain } = useFormatDate();
  const { formatear: dinero } = useMonedaOrganizacion();

  const [serial, setSerial] = useState<SerialDetalle | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinPermiso' | 'noEncontrado'>('cargando');
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    clienteSeriales
      .detalle(serialId)
      .then((d) => {
        if (!vigente) return;
        setSerial(d);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        if (e instanceof ErrorPeticionSeriales && e.sinPermiso) setEstado('sinPermiso');
        else if (e instanceof ErrorPeticionSeriales && e.noEncontrado) setEstado('noEncontrado');
        else {
          console.error('Error cargando el serial:', e);
          setEstado('error');
        }
      });
    return () => {
      vigente = false;
    };
  }, [serialId, recarga]);

  const permisos = serial?.permisos ?? PERMISOS_SERIALES_VACIOS;
  const hoy = serial?.hoy ?? '';
  const acciones = useAccionesSerial({ permisos, hoy, onCambio: recargar });

  const migas = [
    { etiqueta: tc('inventario'), href: '/app/inventario' },
    { etiqueta: tc('titulo'), href: RUTA_SERIALES },
    { etiqueta: serial?.serial ?? '…' },
  ];

  if (estado !== 'listo' || !serial) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        <PageHeader titulo={tc('tituloSerial', { serial: '' }).trim()} icono={ScanBarcode} variante="detail" migas={migas} volverA={RUTA_SERIALES} cargando={estado === 'cargando'} />
        {estado === 'cargando' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label={t('cargando')}>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : estado === 'sinPermiso' ? (
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('volver'), href: RUTA_SERIALES }} />
        ) : estado === 'noEncontrado' ? (
          <EmptyState titulo={t('noEncontrado.titulo')} descripcion={t('noEncontrado.descripcion')} icono={ScanBarcode} accion={{ etiqueta: t('volver'), href: RUTA_SERIALES }} />
        ) : (
          <EmptyState variante="error" titulo={t('error')} onReintentar={recargar} />
        )}
      </div>
    );
  }

  const g = situacionGarantia({ estado: serial.estado, garantia: serial.garantia, reclamo: null }, hoy);
  const reclamoAbierto = serial.reclamos.find((r) => ['pending', 'approved', 'in_process'].includes(r.estado)) ?? null;
  const puedeReclamar = acciones.puedeReclamar({ ...serial, reclamo: reclamoAbierto ? { ...reclamoAbierto, rma: reclamoAbierto.rma } : null });
  const docVenta = serial.venta?.documento ?? null;

  const menu: AccionFila[] = [
    ...acciones.accionesDe(
      { ...serial, reclamo: reclamoAbierto ? { id: reclamoAbierto.id, codigo: reclamoAbierto.codigo, estado: reclamoAbierto.estado, rma: reclamoAbierto.rma } : null },
      { enDetalle: true },
    ),
    ...(serial.estado === 'sold' && docVenta
      ? [{ id: 'devolucion', etiqueta: t('registrarDevolucion'), icono: Undo2, separadorAntes: true, onSelect: () => router.push('/app/pos/devoluciones') }]
      : []),
  ];

  const vigencia = (() => {
    if (!serial.garantia.inicio || !serial.garantia.fin) return null;
    const rango = t('garantia.rango', { inicio: formatPlain(serial.garantia.inicio), fin: formatPlain(serial.garantia.fin) });
    if (g.tipo === 'vigente' || g.tipo === 'por_vencer') return { texto: `${rango} · ${t('garantia.quedan', { dias: g.dias })}`, tono: g.tipo === 'vigente' ? ('exito' as const) : ('advertencia' as const) };
    if (g.tipo === 'vencida') return { texto: `${rango} · ${t('garantia.vencida')}`, tono: 'peligro' as const };
    return { texto: rango, tono: 'neutro' as const };
  })();
  const restante = (g.tipo === 'vigente' || g.tipo === 'por_vencer') && serial.garantia.fin ? mesesYDias(hoy, serial.garantia.fin.slice(0, 10)) : null;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={tc('tituloSerial', { serial: serial.serial })}
        subtitulo={[serial.producto.nombre, serial.producto.sku ? t('sku', { sku: serial.producto.sku }) : null].filter(Boolean).join(' · ')}
        icono={ScanBarcode}
        variante="detail"
        volverA={RUTA_SERIALES}
        badge={<BadgeEstadoSerial estado={serial.estado} tamano="md" />}
        migas={migas}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            {serial.estado === 'in_stock' && (
              <Button variant="outline" className="h-10 gap-2" onClick={() => acciones.imprimirEtiquetas([serial])}>
                <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('imprimirEtiqueta')}
              </Button>
            )}
            {puedeReclamar && (
              <Button className="h-10 gap-2" onClick={() => acciones.abrirReclamo(serial.id)}>
                <ShieldCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('abrirReclamo')}
              </Button>
            )}
            {menu.length > 0 && <RowActionsMenu orientacion="horizontal" tamano="md" titulo={serial.serial} acciones={menu} />}
          </>
        }
        movil={{
          titulo: serial.serial,
          subtitulo: serial.producto.nombre,
          accion: menu.length > 0 ? <RowActionsMenu orientacion="horizontal" titulo={serial.serial} acciones={menu} /> : undefined,
        }}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4">
          <p className="flex flex-wrap items-center gap-2 lg:hidden">
            <BadgeEstadoSerial estado={serial.estado} />
            {vigencia && (g.tipo === 'vigente' || g.tipo === 'por_vencer') && (
              <span className="text-[13px] text-success-text">{t('garantia.hastaCorto', { fecha: formatPlain(serial.garantia.fin) })}</span>
            )}
          </p>

          <Tarjeta titulo={t('origen.titulo')} className="hidden lg:flex">
            <ListaDatos etiqueta={t('origen.titulo')}>
              <FilaDato
                etiqueta={t('origen.proveedor')}
                valor={serial.proveedor?.nombre ?? <span className="text-fg-muted">{t('sinDato')}</span>}
                href={serial.proveedor ? rutaProveedor(serial.proveedor.uuid ?? null) ?? undefined : undefined}
              />
              <FilaDato
                etiqueta={serial.origen?.tipo === 'factura_compra' ? t('origen.facturaCompra') : t('origen.ordenCompra')}
                valor={
                  serial.origen ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-1">
                      <EnlaceDocumento documento={serial.origen} />
                      {serial.recibido && <span className="text-fg-secondary">{t('origen.recibidaEl', { fecha: formatDate(serial.recibido) })}</span>}
                    </span>
                  ) : (
                    <span className="text-fg-muted">{serial.recibido ? t('origen.altaManual', { fecha: formatDate(serial.recibido) }) : t('sinDato')}</span>
                  )
                }
              />
              {permisos.costos && serial.costo !== null && <FilaDato etiqueta={t('origen.costo')} valor={dinero(serial.costo)} />}
              <FilaDato etiqueta={t('origen.recibidoEn')} valor={serial.recibido_en?.nombre ?? serial.sucursal?.nombre ?? <span className="text-fg-muted">{t('sinDato')}</span>} />
              <FilaDato etiqueta={t('origen.lote')} valor={serial.lote?.codigo ?? <span className="text-fg-muted">{t('origen.sinLote')}</span>} />
            </ListaDatos>
          </Tarjeta>

          <Tarjeta titulo={t('venta.titulo')}>
            {serial.venta || serial.estado === 'sold' ? (
              <ListaDatos etiqueta={t('venta.titulo')}>
                <FilaDato
                  etiqueta={t('venta.venta')}
                  valor={
                    docVenta ? (
                      <span className="inline-flex flex-wrap items-center justify-end gap-1">
                        <Link href={rutaDocumento(docVenta) ?? '#'} className="rounded text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                          {numeroDocumento(docVenta)}
                          {serial.fecha_venta ? ` · ${formatDateTime(serial.fecha_venta)}` : ''}
                        </Link>
                      </span>
                    ) : (
                      <span className="text-warning-text">{t('venta.sinEnlace')}</span>
                    )
                  }
                />
                <FilaDato
                  etiqueta={t('venta.cliente')}
                  valor={serial.cliente?.nombre ?? <span className="text-fg-muted">{t('venta.sinCliente')}</span>}
                  href={serial.cliente ? rutaCliente(serial.cliente.id) ?? undefined : undefined}
                />
                <FilaDato
                  etiqueta={t('venta.vendidoPor')}
                  valor={[serial.vendedor, serial.venta?.sucursal?.nombre].filter(Boolean).join(' · ') || <span className="text-fg-muted">{t('sinDato')}</span>}
                />
                {serial.precio_venta !== null && <FilaDato etiqueta={t('venta.precio')} valor={dinero(Number(serial.precio_venta))} />}
              </ListaDatos>
            ) : (
              <p className="px-0 text-sm text-fg-secondary">{t('venta.sinVenta')}</p>
            )}
          </Tarjeta>

          <Tarjeta titulo={t('garantia.titulo')} className="hidden lg:flex">
            <ListaDatos etiqueta={t('garantia.titulo')}>
              <FilaDato
                etiqueta={t('garantia.plazo')}
                valor={serial.garantia.meses ? t('garantia.plazoMeses', { meses: serial.garantia.meses }) : <span className="text-fg-muted">{t('garantia.sinPlazo')}</span>}
              />
              <FilaDato
                etiqueta={t('garantia.vigencia')}
                tono={vigencia?.tono ?? 'neutro'}
                valor={vigencia ? vigencia.texto : <span className="text-fg-muted">{g.tipo === 'empieza_al_vender' ? t('garantia.empiezaAlVender') : t('garantia.sinVigencia')}</span>}
                descripcion={restante ? t('garantia.restante', { meses: restante.meses, dias: restante.dias }) : undefined}
              />
              <FilaDato
                etiqueta={t('garantia.reclamos')}
                valor={
                  serial.reclamos.length === 0 ? (
                    t('garantia.ninguno')
                  ) : (
                    <span className="inline-flex flex-wrap justify-end gap-2">
                      {serial.reclamos.map((r) => (
                        <Link key={r.id} href={rutaReclamo(r.id)} className="rounded text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                          {t('garantia.reclamoEstado', { codigo: r.codigo ?? '', estado: tr(r.estado) })}
                        </Link>
                      ))}
                    </span>
                  )
                }
              />
            </ListaDatos>
          </Tarjeta>
        </div>

        <Tarjeta titulo={t('historial')}>
          <HistorialSerial eventos={serial.eventos} proveedor={serial.proveedor?.nombre ?? null} etiqueta={t('historial')} />
        </Tarjeta>
      </div>

      {puedeReclamar && (
        <div className="lg:hidden">
          <Button className="h-11 w-full gap-2" onClick={() => acciones.abrirReclamo(serial.id)}>
            <ShieldCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('abrirReclamoGarantia')}
          </Button>
        </div>
      )}

      {acciones.dialogos}
    </div>
  );
}

export default SerialDetailPage;
