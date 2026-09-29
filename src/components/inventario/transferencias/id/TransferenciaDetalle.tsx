'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeftRight, Info, PackageCheck, Pencil, Printer, Send } from 'lucide-react';
import { BranchBadgeActiva, EmptyState, PageHeader, RowActionsMenu, Tarjeta } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ErrorPeticionTraslado, clienteTraslados } from '@/lib/inventario/transferencias/cliente';
import { PERMISOS_TRASLADOS_VACIOS, type DetalleTraslado, type RenglonTraslado } from '@/lib/inventario/transferencias/contrato';
import {
  RUTA_TRASLADOS,
  accionesDe,
  redondear,
  rutaEditarTraslado,
  rutaKardex,
  rutaOrdenProduccion,
} from '@/lib/inventario/transferencias/logica';
import { cn } from '@/utils/Utils';
import { useImpresionGuias } from '../ImpresionGuias';
import { BadgeEstadoTraslado, SeguimientoTraslado, useCantidad } from '../piezas';
import { useAccionesTraslado } from '../useAccionesTraslado';

/**
 * Detalle de un traslado (Figma 831:535830 en tránsito, 831:536248 con el menú
 * ⋯, móvil 589:326053): renglones con lote, seriales y costo (con permiso),
 * seguimiento con autor y enlace al kardex, y las acciones del estado:
 * despachar (y escanear seriales), recibir, editar, imprimir guía, cancelar o
 * devolver al origen. `?despachar=1` abre el despacho (desde «Crear y
 * despachar» con seriales) y `?imprimir=1` la guía.
 */
export function TransferenciaDetalle({ transferenciaId }: { transferenciaId: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTranslations('inventarioTraslados.detalle');
  const tc = useTranslations('inventarioTraslados.comun');
  const cantidad = useCantidad();
  const { formatDateTime, formatPlain } = useFormatDate();
  const { formatear: dinero } = useMonedaOrganizacion();
  const guias = useImpresionGuias();

  const [detalle, setDetalle] = useState<DetalleTraslado | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinPermiso' | 'noEncontrado'>('cargando');
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const autoAbierto = useRef(false);

  useEffect(() => {
    if (!Number.isSafeInteger(transferenciaId) || transferenciaId <= 0) {
      setEstado('noEncontrado');
      return;
    }
    let vigente = true;
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    clienteTraslados
      .detalle(transferenciaId)
      .then((d) => {
        if (!vigente) return;
        setDetalle(d);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        if (e instanceof ErrorPeticionTraslado && e.sinPermiso) setEstado('sinPermiso');
        else if (e instanceof ErrorPeticionTraslado && e.noEncontrado) setEstado('noEncontrado');
        else {
          console.error('Error cargando el traslado:', e);
          setEstado('error');
        }
      });
    return () => {
      vigente = false;
    };
  }, [transferenciaId, recarga]);

  const permisos = detalle?.permisos ?? PERMISOS_TRASLADOS_VACIOS;
  const acciones = useAccionesTraslado({ permisos, onCambio: recargar, detalle });

  // Enlaces que abren una acción al llegar (una sola vez).
  useEffect(() => {
    if (!detalle || autoAbierto.current) return;
    const a = accionesDe(detalle.traslado.estado, permisos);
    if (params?.get('despachar') === '1' && a.despachar) {
      autoAbierto.current = true;
      acciones.despachar(detalle.traslado.id);
    } else if (params?.get('recibir') === '1' && a.recibir) {
      autoAbierto.current = true;
      acciones.recibir(detalle.traslado.id);
    } else if (params?.get('imprimir') === '1') {
      autoAbierto.current = true;
      void guias.imprimir([detalle.traslado.id], [detalle]);
    }
  }, [detalle, permisos, params, acciones, guias]);

  const migas = [
    { etiqueta: tc('inventario'), href: '/app/inventario' },
    { etiqueta: tc('tituloCorto'), href: RUTA_TRASLADOS },
    { etiqueta: detalle?.traslado.code ?? '…' },
  ];

  if (estado !== 'listo' || !detalle) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        <PageHeader titulo={t('tituloCargando')} icono={ArrowLeftRight} variante="detail" migas={migas} volverA={RUTA_TRASLADOS} cargando={estado === 'cargando'} />
        {estado === 'cargando' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true" aria-label={t('cargando')}>
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : estado === 'sinPermiso' ? (
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: tc('volver'), href: RUTA_TRASLADOS }} />
        ) : estado === 'noEncontrado' ? (
          <EmptyState titulo={t('noEncontrado.titulo')} descripcion={t('noEncontrado.descripcion')} icono={ArrowLeftRight} accion={{ etiqueta: tc('volver'), href: RUTA_TRASLADOS }} />
        ) : (
          <EmptyState variante="error" titulo={t('error')} onReintentar={recargar} />
        )}
      </div>
    );
  }

  const tr = detalle.traslado;
  const items = detalle.items;
  const a = accionesDe(tr.estado, permisos);
  const origen = tr.origen.nombre ?? '';
  const destino = tr.destino.nombre ?? '';
  const productos = new Set(items.map((i) => i.product_id)).size;
  const unidades = redondear(items.reduce((s, i) => s + i.cantidad, 0));
  const pendientes = redondear(items.reduce((s, i) => s + i.pendiente, 0));
  const conDiferencia = items.some((i) => i.faltante > 0);
  const primerProducto = items[0] ?? null;
  const enlaceKardex = primerProducto ? rutaKardex(primerProducto.product_id, tr.origen.id) : null;
  const loteMenu = items.find((i) => i.lote)?.lote?.codigo ?? null;

  const subtitulo = (() => {
    const ruta = tc('ruta', { origen, destino });
    const autor = tr.autor ?? t('sinAutor');
    if (tr.estado === 'pending') return t('subtitulo.pendiente', { ruta, fecha: formatDateTime(tr.creado_en), autor });
    if (tr.estado === 'in_transit')
      return tr.despachado_en
        ? t('subtitulo.enTransito', { ruta, fecha: formatDateTime(tr.despachado_en), autor: tr.despachado_por ?? autor })
        : t('subtitulo.enTransitoLegado', { ruta });
    if (tr.estado === 'received')
      return tr.recibido_en ? t('subtitulo.recibido', { ruta, fecha: formatDateTime(tr.recibido_en), autor: tr.recibido_por ?? autor }) : ruta;
    return tr.cancelado_en ? t('subtitulo.cancelado', { ruta, fecha: formatDateTime(tr.cancelado_en) }) : ruta;
  })();

  const menu = acciones.accionesFila(
    { id: tr.id, code: tr.code, estado: tr.estado, origen: tr.origen, destino: tr.destino, unidades: tr.estado === 'pending' ? unidades : pendientes, orden_produccion: tr.orden_produccion },
    { enDetalle: true, productoKardex: enlaceKardex && primerProducto ? { id: primerProducto.product_id, sucursal: tr.origen.id } : null, lote: loteMenu },
  );

  const botonPrincipal = a.recibir ? (
    <Button className="h-10 gap-2" onClick={() => acciones.recibir(tr.id)}>
      <PackageCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('recibir')}
    </Button>
  ) : a.despachar ? (
    <Button className="h-10 gap-2" onClick={() => acciones.despachar(tr.id)}>
      <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('despachar')}
    </Button>
  ) : null;

  const descripcionRenglones =
    tr.estado === 'pending'
      ? t('renglones.pendiente', { origen })
      : tr.estado === 'in_transit'
        ? t('renglones.enTransito', { origen, destino })
        : tr.estado === 'received'
          ? t('renglones.recibido', { origen, destino })
          : t('renglones.cancelado');

  const lineaSecundaria = (i: RenglonTraslado) => {
    if (i.seriales.length > 0) {
      const lista = i.seriales.map((s) => s.serial);
      return t('seriales', {
        count: lista.length,
        n: lista.length,
        lista: lista.length > 2 ? `${lista[0]} … ${lista[lista.length - 1]}` : lista.join(', '),
      });
    }
    return [i.sku ? tc('sku', { sku: i.sku }) : null, i.variante].filter(Boolean).join(' · ');
  };

  const celdaRecibido = (i: RenglonTraslado) => {
    if (tr.estado === 'pending' || (tr.estado === 'cancelled' && i.recibido === 0)) return <span className="text-fg-muted">—</span>;
    if (i.recibido === 0 && i.faltante === 0 && i.devuelto === 0) return <span className="text-fg-muted">—</span>;
    return (
      <div className="flex flex-col items-end">
        <span className={cn('tabular-nums', i.faltante > 0 ? 'font-medium text-danger-text' : 'text-fg')}>{cantidad(i.recibido)}</span>
        {i.faltante > 0 && <span className="text-xs text-danger-text">{t('faltan', { n: cantidad(i.faltante) })}</span>}
        {i.devuelto > 0 && <span className="text-xs text-fg-secondary">{t('devueltas', { n: cantidad(i.devuelto) })}</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 pb-24 lg:gap-5 lg:pb-0">
      <PageHeader
        titulo={tc('tituloTraslado', { codigo: tr.code })}
        subtitulo={subtitulo}
        icono={ArrowLeftRight}
        variante="detail"
        volverA={RUTA_TRASLADOS}
        badge={<BadgeEstadoTraslado estado={tr.estado} conDiferencia={conDiferencia} tamano="md" />}
        migas={migas}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            {a.imprimir && (
              <Button variant="outline" className="h-10 gap-2" onClick={() => void guias.imprimir([tr.id], [detalle])}>
                <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('imprimirGuia')}
              </Button>
            )}
            {a.editar && (
              <Button variant="outline" className="h-10 gap-2" onClick={() => router.push(rutaEditarTraslado(tr.id))}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('editar')}
              </Button>
            )}
            {botonPrincipal}
            {menu.length > 0 && <RowActionsMenu orientacion="horizontal" tamano="md" titulo={tr.code} acciones={menu} />}
          </>
        }
        movil={{
          titulo: tr.code,
          subtitulo: tc('ruta', { origen, destino }),
          accion:
            menu.length > 0 || a.imprimir ? (
              <RowActionsMenu
                orientacion="horizontal"
                titulo={tr.code}
                acciones={[
                  ...(a.imprimir ? [{ id: 'imprimir', etiqueta: t('imprimirGuia'), icono: Printer, onSelect: () => void guias.imprimir([tr.id], [detalle]) }] : []),
                  ...(a.editar ? [{ id: 'editar', etiqueta: t('editar'), icono: Pencil, onSelect: () => router.push(rutaEditarTraslado(tr.id)) }] : []),
                  ...menu,
                ]}
              />
            ) : undefined,
        }}
      />

      {tr.atascado && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          {t('atascado', { fecha: formatDateTime(tr.despachado_en ?? tr.creado_en) })}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4">
          <p className="flex flex-wrap items-center gap-2 lg:hidden">
            <BadgeEstadoTraslado estado={tr.estado} conDiferencia={conDiferencia} />
            <span className="text-[13px] text-fg-secondary">{subtitulo}</span>
          </p>

          <Tarjeta
            titulo={t('renglones.titulo', {
              productos: tc('productos', { count: productos, n: productos }),
              unidades: tc('unidades', { count: unidades, n: cantidad(unidades) }),
            })}
            descripcion={descripcionRenglones}
            sinRelleno
          >
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('renglones.tabla')}</caption>
                <thead className="bg-subtle text-left text-[13px] text-fg-secondary">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">{t('columnas.producto')}</th>
                    <th scope="col" className="px-3 py-3 font-medium">{t('columnas.lote')}</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">{tr.estado === 'pending' ? t('columnas.cantidad') : t('columnas.enviado')}</th>
                    {tr.estado === 'pending' ? (
                      <th scope="col" className="px-3 py-3 text-right font-medium">{t('columnas.disponible')}</th>
                    ) : (
                      <th scope="col" className="px-3 py-3 text-right font-medium">{t('columnas.recibido')}</th>
                    )}
                    {detalle.ver_costos && <th scope="col" className="px-5 py-3 text-right font-medium">{t('columnas.costo')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-t border-line align-top">
                      <td className="px-5 py-3">
                        <p className="font-medium text-fg">{i.nombre}</p>
                        <p className="text-xs text-fg-secondary">{lineaSecundaria(i)}</p>
                        {i.motivo && <p className="text-xs text-danger-text">{t('motivoFaltante', { motivo: i.motivo })}</p>}
                      </td>
                      <td className="px-3 py-3 text-fg-secondary">
                        {i.lote ? (
                          <span className="flex flex-col">
                            <span>{i.lote.codigo}</span>
                            {i.lote.vence && <span className="text-xs">{t('vence', { fecha: formatPlain(i.lote.vence) })}</span>}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums text-fg">{cantidad(i.cantidad)}</td>
                      <td className="px-3 py-3 text-right">
                        {tr.estado === 'pending' ? (
                          <span className={cn('tabular-nums', (i.disponible ?? 0) < i.cantidad ? 'font-medium text-danger-text' : 'text-fg-secondary')}>
                            {cantidad(i.disponible ?? 0)}
                          </span>
                        ) : (
                          celdaRecibido(i)
                        )}
                      </td>
                      {detalle.ver_costos && <td className="px-5 py-3 text-right tabular-nums text-fg">{i.costo !== null ? dinero(i.costo) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col divide-y divide-line md:hidden">
              {items.map((i) => (
                <li key={i.id} className="px-4 py-3">
                  <p className="font-medium text-fg">{i.nombre}</p>
                  <p className="text-[13px] text-fg-secondary">
                    {[tc('unidades', { count: i.cantidad, n: cantidad(i.cantidad) }), i.lote?.codigo ?? tc('sinLote')].join(' · ')}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className={cn(i.faltante > 0 ? 'text-danger-text' : 'text-fg')}>
                      {tr.estado === 'pending'
                        ? t('disponibleN', { n: cantidad(i.disponible ?? 0) })
                        : i.pendiente > 0 && tr.estado === 'in_transit'
                          ? t('porRecibir')
                          : t('recibidasN', { n: cantidad(i.recibido) })}
                    </span>
                    {detalle.ver_costos && i.costo !== null && <span className="tabular-nums text-fg-secondary">{dinero(i.costo)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </Tarjeta>

          {(tr.notas || tr.orden_produccion || tr.motivo_cancelacion) && (
            <Tarjeta titulo={t('datos.titulo')}>
              <dl className="flex flex-col gap-2 text-sm">
                {tr.notas && (
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="w-40 shrink-0 text-fg-secondary">{t('datos.nota')}</dt>
                    <dd className="text-fg">{tr.notas}</dd>
                  </div>
                )}
                {tr.orden_produccion && (
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="w-40 shrink-0 text-fg-secondary">{t('datos.orden')}</dt>
                    <dd>
                      <Link href={rutaOrdenProduccion(tr.orden_produccion.id)} className="rounded text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                        {tr.orden_produccion.numero}
                      </Link>
                    </dd>
                  </div>
                )}
                {tr.motivo_cancelacion && (
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                    <dt className="w-40 shrink-0 text-fg-secondary">{t('datos.motivo')}</dt>
                    <dd className="text-fg">{tr.motivo_cancelacion}</dd>
                  </div>
                )}
              </dl>
            </Tarjeta>
          )}
        </div>

        <Tarjeta titulo={t('seguimiento.titulo')}>
          <SeguimientoTraslado traslado={tr} eventos={detalle.eventos} formatoFecha={(v) => (v ? formatDateTime(v) : '')} enlaceKardex={enlaceKardex} />
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-[13px] text-fg-secondary">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {tr.legado ? t('seguimiento.legado') : t('seguimiento.ayuda')}
          </p>
        </Tarjeta>
      </div>

      {/* Móvil: la acción principal al pie (Figma 589:326053). */}
      {botonPrincipal && (
        <div className="fixed inset-x-0 bottom-16 z-20 px-4 md:hidden">
          <Button className="h-11 w-full gap-2" onClick={() => (a.recibir ? acciones.recibir(tr.id) : acciones.despachar(tr.id))}>
            {a.recibir ? <PackageCheck aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {a.recibir ? t('recibirEn', { destino }) : t('despachar')}
          </Button>
        </div>
      )}

      {acciones.dialogos}
      {guias.nodo}
    </div>
  );
}
