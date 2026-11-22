'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Archive, ArchiveRestore, Copy, Download, Pencil, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import {
  BarraProgreso,
  DataTable,
  EmptyState,
  FilaDato,
  ListaDatos,
  PageHeader,
  Pagination,
  RowActionsMenu,
  Tarjeta,
  calcularRango,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { CouponsService } from './couponsService';
import { CuponFormDialog } from './CuponFormDialog';
import { TONO_ESTADO_CUPON, codigoErrorCupon, csvLote, type CodigoErrorCupon } from './cuponesVista';
import { rutaCupon } from './CuponesPage';
import { useFormatoCupones } from './useFormatoCupones';
import type { CanjeCupon, CanjesCupon, Coupon, EstadoCupon } from './types';

const RUTA_LISTA = '/app/pos/cupones';

/** El estado lo calcula la base (`estado_codigo` → `fn_cupon_estado`), la misma regla de la lista. */
function estadoDe(c: Coupon): EstadoCupon {
  return c.estado_codigo ?? (c.is_active ? 'activo' : 'inactivo');
}

/** Detalle de un cupón (Figma 458:83350 · 27-promociones-04): datos, estado, estadísticas e historial de canjes. */
export function CuponDetalle({ id }: { id: string }) {
  const t = useTranslations('posCupones');
  const router = useRouter();
  const formato = useFormatoCupones();
  const [cupon, setCupon] = useState<Coupon | null>(null);
  const [canjes, setCanjes] = useState<CanjesCupon | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoCanjes, setCargandoCanjes] = useState(true);
  const [error, setError] = useState<CodigoErrorCupon | null>(null);
  const [errorCanjes, setErrorCanjes] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [promociones, setPromociones] = useState<{ id: string; name: string }[]>([]);
  const [editar, setEditar] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  const cargarCupon = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const c = await CouponsService.getById(id);
      setCupon(c);
      if (!c) setError('NO_ENCONTRADO');
    } catch (e) {
      setError(codigoErrorCupon(e));
    } finally {
      setCargando(false);
    }
  }, [id]);

  const cargarCanjes = useCallback(async () => {
    setCargandoCanjes(true);
    setErrorCanjes(false);
    try {
      setCanjes(await CouponsService.canjes(id, tamano, (pagina - 1) * tamano));
    } catch {
      setErrorCanjes(true);
    } finally {
      setCargandoCanjes(false);
    }
  }, [id, pagina, tamano]);

  useEffect(() => {
    void cargarCupon();
  }, [cargarCupon]);
  useEffect(() => {
    void cargarCanjes();
  }, [cargarCanjes]);
  useEffect(() => {
    let vigente = true;
    CouponsService.puedeGestionar().then((p) => vigente && setPuedeGestionar(p)).catch(() => undefined);
    CouponsService.promociones().then((p) => vigente && setPromociones(p)).catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  const migas = [
    { etiqueta: t('migaPos'), href: '/app/pos' },
    { etiqueta: t('titulo'), href: RUTA_LISTA },
    { etiqueta: cupon?.code ?? '…' },
  ];

  if (cargando && !cupon) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={t('detalle.cargando')} icono={Ticket} migas={migas} variante="detail" volverA={RUTA_LISTA} cargando />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !cupon) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={t('titulo')} icono={Ticket} migas={migas} variante="detail" volverA={RUTA_LISTA} />
        <EmptyState
          variante={error === 'SIN_PERMISO' ? 'forbidden' : error === 'NO_ENCONTRADO' ? 'empty' : 'error'}
          titulo={error === 'NO_ENCONTRADO' ? t('detalle.noEncontrado') : error === 'SIN_PERMISO' ? t('sinPermiso.titulo') : t('error.titulo')}
          onReintentar={error && error !== 'NO_ENCONTRADO' ? () => void cargarCupon() : undefined}
          accion={error === 'NO_ENCONTRADO' ? { etiqueta: t('detalle.volver'), href: RUTA_LISTA } : undefined}
        />
      </div>
    );
  }

  const estado = estadoDe(cupon);
  const est = canjes?.estadisticas;
  const usos = formato.usos(cupon, estado);
  const vigencia = formato.vigencia(cupon, estado);
  const cliente = cupon.customer?.full_name ?? null;

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    try {
      await accion();
      toast.success(exito);
      void cargarCupon();
    } catch (e) {
      toast.error(t(`errores.${codigoErrorCupon(e)}`));
    }
  };

  const cambiarActivo = async (activo: boolean) => {
    setCambiandoEstado(true);
    await ejecutar(() => CouponsService.setActivo(cupon.id, activo), activo ? t('toast.activado') : t('toast.desactivado'));
    setCambiandoEstado(false);
  };

  const exportarCanjes = async () => {
    try {
      const todos = await CouponsService.canjes(cupon.id, 200, 0);
      const filas = todos.filas.map((r) => [r.created_at, r.factura ?? r.pedido ?? r.sale_id, r.cliente ?? '', r.sucursal ?? '', String(r.discount_applied)].join(','));
      const blob = new Blob(['﻿', `${t('detalle.csvEncabezado')}\n${filas.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canjes-${cupon.code.toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(t(`errores.${codigoErrorCupon(e)}`));
    }
  };

  const exportarLote = async () => {
    if (!cupon.batch_id) return;
    try {
      const codigos = await CouponsService.codigosDelLote(cupon.batch_id);
      const blob = new Blob(['﻿', csvLote(codigos)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lote-${cupon.code.split('-')[0].toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(t(`errores.${codigoErrorCupon(e)}`));
    }
  };

  const menu: AccionFila[] = [
    { id: 'exportar', etiqueta: t('detalle.exportarCanjes'), icono: Download, onSelect: () => void exportarCanjes(), deshabilitada: !est || est.canjes === 0, motivo: t('detalle.sinCanjes') },
    { id: 'lote', etiqueta: t('detalle.exportarLote'), icono: Download, onSelect: () => void exportarLote(), oculta: !cupon.batch_id },
    {
      id: 'archivar',
      etiqueta: t('acciones.archivar'),
      icono: Archive,
      separadorAntes: true,
      onSelect: () => void ejecutar(() => CouponsService.archive(cupon.id), t('toast.archivado')),
      oculta: !puedeGestionar || estado === 'archivado',
    },
    {
      id: 'restaurar',
      etiqueta: t('acciones.restaurar'),
      icono: ArchiveRestore,
      separadorAntes: true,
      onSelect: () => void ejecutar(() => CouponsService.restore(cupon.id), t('toast.restaurado')),
      oculta: !puedeGestionar || estado !== 'archivado',
    },
  ];

  const columnas: ColumnaTabla<CanjeCupon>[] = [
    { id: 'fecha', encabezado: t('detalle.columnas.fecha'), celda: (r) => formato.fechaHora(r.created_at) },
    {
      id: 'venta',
      encabezado: t('detalle.columnas.venta'),
      celda: (r) => (
        <Link href={`/app/pos/ventas/${r.sale_id}`} className="font-medium text-fg-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {r.factura ?? r.pedido ?? t('detalle.verVenta')}
        </Link>
      ),
    },
    { id: 'cliente', encabezado: t('detalle.columnas.cliente'), ocultarDebajo: 'md', celda: (r) => r.cliente ?? t('detalle.consumidorFinal') },
    { id: 'sucursal', encabezado: t('detalle.columnas.sucursal'), ocultarDebajo: 'lg', celda: (r) => r.sucursal ?? '—' },
    { id: 'canal', encabezado: t('detalle.columnas.canal'), ocultarDebajo: 'xl', celda: (r) => (r.es_web ? t('detalle.web') : t('detalle.pos')) },
    {
      id: 'descuento',
      encabezado: t('detalle.columnas.descuento'),
      variante: 'importe',
      celda: (r) => <span className="text-success-text">− {formato.moneda.formatear(Number(r.discount_applied))}</span>,
    },
  ];

  const totalCanjes = canjes?.total ?? 0;
  const rango = calcularRango(pagina, tamano, totalCanjes);
  const subtitulo = [cupon.name, formato.descuento(cupon), cupon.end_date ? null : t('detalle.sinFechaFin')].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        titulo={cupon.code}
        icono={Ticket}
        migas={migas}
        variante="detail"
        volverA={RUTA_LISTA}
        subtitulo={subtitulo}
        badge={
          <Badge tono={TONO_ESTADO_CUPON[estado]} apariencia="suave" tamano="sm">
            {t(`estado.${estado}`)}
          </Badge>
        }
        acciones={
          <>
            {puedeGestionar && (
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario' })}
                onClick={() =>
                  void ejecutar(async () => {
                    const copia = await CouponsService.duplicate(cupon.id);
                    router.push(rutaCupon(copia.id));
                  }, t('toast.duplicado'))
                }
              >
                <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.duplicar')}
              </button>
            )}
            {puedeGestionar && estado !== 'archivado' && (
              <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setEditar(true)}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.editar')}
              </button>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={cupon.code} acciones={menu} />
          </>
        }
        movil={{
          subtitulo: subtitulo,
          menu: [
            ...(puedeGestionar && estado !== 'archivado' ? [{ id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setEditar(true) }] : []),
            ...menu,
          ],
        }}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta titulo={t('detalle.detalles')}>
            <ListaDatos>
              <FilaDato
                etiqueta={t('detalle.descuento')}
                valor={
                  cupon.discount_type === 'percentage' && cupon.max_discount_amount
                    ? t('detalle.descuentoConTope', { valor: formato.descuento(cupon), tope: formato.moneda.formatear(Number(cupon.max_discount_amount)) })
                    : formato.descuento(cupon)
                }
              />
              <FilaDato etiqueta={t('detalle.compraMinima')} valor={cupon.min_purchase_amount ? formato.moneda.formatear(Number(cupon.min_purchase_amount)) : t('detalle.ninguna')} />
              <FilaDato etiqueta={t('detalle.vigencia')} valor={vigencia.linea} descripcion={vigencia.detalle ?? undefined} />
              <FilaDato
                etiqueta={t('detalle.limiteUsos')}
                valor={[
                  cupon.usage_limit ? t('detalle.enTotal', { n: cupon.usage_limit }) : t('lista.sinLimite'),
                  cupon.usage_limit_per_customer ? t('lista.porCliente', { n: cupon.usage_limit_per_customer }) : null,
                ].filter(Boolean).join(' · ')}
              />
              <FilaDato etiqueta={t('detalle.cliente')} valor={cliente ?? t('detalle.cualquiera')} />
              <FilaDato etiqueta={t('detalle.primeraCompra')} valor={cupon.applies_to_first_purchase ? t('detalle.si') : t('detalle.no')} />
              <FilaDato etiqueta={t('detalle.promocion')} valor={cupon.promotion?.name ?? t('detalle.ninguna')} />
            </ListaDatos>
          </Tarjeta>

          <Tarjeta titulo={t('detalle.historial', { n: totalCanjes })} sinRelleno>
            <DataTable
              etiqueta={t('detalle.historial', { n: totalCanjes })}
              columnas={columnas}
              filas={canjes?.filas ?? []}
              obtenerId={(r) => r.id}
              estado={cargandoCanjes && !canjes ? 'cargando' : errorCanjes ? 'error' : totalCanjes === 0 ? 'vacio' : 'listo'}
              densidad="compacta"
              vacio={{ titulo: t('detalle.sinCanjes'), descripcion: t('detalle.sinCanjesDescripcion'), icono: Ticket, compacto: true }}
              error={{ titulo: t('error.titulo') }}
              onReintentar={() => void cargarCanjes()}
              tarjetaMovil={(r) => (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{r.factura ?? r.pedido ?? t('detalle.verVenta')}</p>
                    <p className="truncate text-xs text-fg-secondary">{`${formato.fechaHora(r.created_at)} · ${r.cliente ?? t('detalle.consumidorFinal')}`}</p>
                  </div>
                  <span className="shrink-0 text-success-text">− {formato.moneda.formatear(Number(r.discount_applied))}</span>
                </div>
              )}
              pie={
                totalCanjes > 0 ? (
                  <Pagination
                    pagina={rango.pagina}
                    tamano={tamano}
                    total={totalCanjes}
                    onPaginaChange={setPagina}
                    onTamanoChange={(n) => {
                      setTamano(n);
                      setPagina(1);
                    }}
                    sustantivo={{ singular: t('detalle.canje'), plural: t('detalle.canjes') }}
                    cargando={cargandoCanjes}
                  />
                ) : undefined
              }
            />
          </Tarjeta>
        </div>

        <div className="flex flex-col gap-4">
          <Tarjeta
            titulo={t('detalle.estado')}
            accion={
              puedeGestionar && estado !== 'archivado' ? (
                <Switch checked={cupon.is_active} disabled={cambiandoEstado} onCheckedChange={(v) => void cambiarActivo(v)} aria-label={t('detalle.estado')} />
              ) : undefined
            }
          >
            <p className="text-sm text-fg-secondary">{t(`detalle.estadoTexto.${estado}`)}</p>
          </Tarjeta>

          <Tarjeta titulo={t('detalle.estadisticas')}>
            {!est ? (
              <Skeleton className="h-36" />
            ) : (
              <div className="flex flex-col gap-3">
                <ListaDatos>
                  <FilaDato etiqueta={t('detalle.redenciones')} valor={cupon.usage_limit ? t('lista.usos', { usados: est.canjes, limite: cupon.usage_limit }) : formato.numero(est.canjes)} />
                  <FilaDato etiqueta={t('detalle.descuentoEntregado')} valor={formato.moneda.formatear(Number(est.descuento))} />
                  <FilaDato etiqueta={t('detalle.ticketMedio')} valor={est.canjes ? formato.moneda.formatear(Number(est.ticket_medio)) : '—'} />
                  <FilaDato etiqueta={t('detalle.canal')} valor={t('detalle.canalValor', { web: est.web, pos: est.pos })} />
                  <FilaDato etiqueta={t('detalle.ultimaVez')} valor={est.ultimo ? formato.fechaHora(est.ultimo) : '—'} />
                </ListaDatos>
                {cupon.usage_limit ? (
                  <BarraProgreso
                    valor={cupon.usage_count || 0}
                    max={cupon.usage_limit}
                    etiqueta={t('detalle.usoCupo')}
                    textoValor={usos.linea}
                    tono={estado === 'agotado' ? 'advertencia' : 'marca'}
                  />
                ) : null}
              </div>
            )}
          </Tarjeta>
        </div>
      </div>

      <CuponFormDialog
        abierto={editar}
        onAbiertoChange={setEditar}
        cupon={cupon}
        promociones={promociones}
        onGuardado={() => {
          void cargarCupon();
          void cargarCanjes();
        }}
      />
    </div>
  );
}
