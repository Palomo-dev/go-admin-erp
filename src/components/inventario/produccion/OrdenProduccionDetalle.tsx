'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeftRight, Calculator, ChefHat, CircleCheck, Factory, History, Plus, Printer, Send } from 'lucide-react';
import {
  BranchBadge,
  DataTable,
  EmptyState,
  FilaDato,
  PageHeader,
  RelatedLinkCard,
  RowActionsMenu,
  StatusBadge,
  Stepper,
  Tarjeta,
  type ColumnaTabla,
} from '@/components/kit';
import { Button } from '@/components/ui/button';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { SIN_PERMISOS_INVENTARIO } from '@/lib/inventario/permisos';
import {
  ErrorProduccion,
  productionOrderService,
  type ConsumoProduccion,
  type DetalleProduccion,
  type LineaNecesidad,
} from '@/lib/services/productionOrderService';
import { PASOS_ORDEN, rutaDistribuirOrden, rutaKardexOrden, rutaProduccion, rutaRecetaProducto, rutaTraslado, tandas } from './logica';
import { BadgeEstadoProduccion, useFormatoCantidad } from './piezas';
import { useAccionesProduccion } from './useAccionesProduccion';

/**
 * Detalle de una orden de producción (Figma 603:153432 «detalle en proceso» y
 * «completado»): paso a paso, necesidades por ingrediente con lo disponible en
 * la sucursal (abierta) o consumos reales con su movimiento del kardex, lote y
 * costo (completada), producto terminado con su costo real, resumen y «Cómo se
 * conecta» (receta usada, costo, kardex, distribución).
 */
export function OrdenProduccionDetalle({ ordenId }: { ordenId: number }) {
  const router = useRouter();
  const t = useTranslations('inventarioProduccion.detalle');
  const tc = useTranslations('inventarioProduccion');
  const cantidad = useFormatoCantidad();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { formatDate, formatDateTime } = useFormatDate();
  const [datos, setDatos] = useState<DetalleProduccion | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'noEncontrada' | 'sinPermiso'>('cargando');
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!ordenId) {
      setEstado('noEncontrada');
      return;
    }
    const control = new AbortController();
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    productionOrderService
      .detalle(getOrganizationId(), ordenId, control.signal)
      .then((d) => {
        setDatos(d);
        setEstado('listo');
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (e instanceof ErrorProduccion && e.noEncontrado) setEstado('noEncontrada');
        else if (e instanceof ErrorProduccion && e.sinPermiso) setEstado('sinPermiso');
        else setEstado('error');
      });
    return () => control.abort();
  }, [ordenId, recarga]);

  const acciones = useAccionesProduccion({ permisos: datos?.permisos ?? SIN_PERMISOS_INVENTARIO, onCambio: recargar, enDetalle: true });

  const columnasNecesidad = useMemo<ColumnaTabla<LineaNecesidad>[]>(
    () => [
      {
        id: 'ingrediente',
        encabezado: t('columnas.ingrediente'),
        celda: (l) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-fg">{l.nombre}</span>
            {(l.merma_pct > 0 || l.opcional) && (
              <span className="text-xs text-fg-secondary">{l.opcional ? t('opcional') : t('merma', { pct: l.merma_pct })}</span>
            )}
          </div>
        ),
      },
      { id: 'requerido', encabezado: t('columnas.requerido'), variante: 'importe', celda: (l) => (l.opcional ? '—' : cantidad(l.necesario, l.unidad)) },
      {
        id: 'disponible',
        encabezado: datos ? t('columnas.enSucursal', { sucursal: datos.orden.sucursal.nombre }) : '',
        variante: 'importe',
        celda: (l) => (l.track_stock ? cantidad(l.disponible, l.unidad) : <span className="text-fg-secondary">{t('noDescuenta')}</span>),
      },
      {
        id: 'estado',
        encabezado: t('columnas.estado'),
        celda: (l) =>
          l.error === 'conversion_faltante' ? (
            <StatusBadge estado="error" tono="peligro" etiqueta={t('sinConversion')} />
          ) : !l.track_stock || l.opcional ? (
            <span className="text-xs text-fg-muted">—</span>
          ) : l.faltante > 0 ? (
            <StatusBadge estado="faltante" tono="peligro" etiqueta={t('falta', { cantidad: cantidad(l.faltante, l.unidad) })} />
          ) : (
            <StatusBadge estado="suficiente" tono="exito" etiqueta={t('suficiente')} />
          ),
      },
    ],
    [cantidad, datos, t],
  );

  const columnasConsumo = useMemo<ColumnaTabla<ConsumoProduccion>[]>(
    () => [
      {
        id: 'ingrediente',
        encabezado: t('columnas.ingrediente'),
        celda: (c) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-fg">{c.nombre}</span>
            {c.lote && <span className="text-xs text-fg-secondary">{t('lote', { codigo: c.lote.codigo })}</span>}
          </div>
        ),
      },
      { id: 'consumido', encabezado: t('columnas.consumido'), variante: 'importe', celda: (c) => cantidad(c.cantidad, c.unidad) },
      { id: 'costo', encabezado: t('columnas.costoUnitario'), variante: 'importe', ocultarDebajo: 'md', celda: (c) => (c.costo_unitario !== null ? `${moneda(c.costo_unitario)} / ${c.unidad}` : '—') },
      { id: 'subtotal', encabezado: t('columnas.subtotal'), variante: 'importe', celda: (c) => (c.costo_total !== null ? moneda(c.costo_total) : '—') },
      {
        id: 'movimiento',
        encabezado: t('columnas.kardex'),
        celda: (c) =>
          c.movement_id ? (
            <Link href={rutaKardexOrden(c.ingredient_product_id)} className="text-sm text-brand hover:underline">
              {t('movimiento', { id: c.movement_id })}
            </Link>
          ) : (
            <span className="text-xs text-fg-secondary">{t('noDescuenta')}</span>
          ),
      },
    ],
    [cantidad, moneda, t],
  );

  if (estado === 'noEncontrada' || estado === 'sinPermiso' || estado === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader titulo={t('tituloVacio')} icono={Factory} migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: tc('listado.titulo'), href: rutaProduccion() }]} />
        <EmptyState
          variante={estado === 'sinPermiso' ? 'forbidden' : estado === 'error' ? 'error' : 'empty'}
          icono={Factory}
          titulo={t(`estados.${estado}.titulo`)}
          descripcion={t(`estados.${estado}.descripcion`)}
          accion={estado === 'error' ? { etiqueta: t('reintentar'), onClick: recargar } : { etiqueta: t('volver'), onClick: () => router.push(rutaProduccion()) }}
        />
      </div>
    );
  }

  const o = datos?.orden;
  const n = datos?.necesidades;
  const faltantes = n?.lineas.filter((l) => l.faltante > 0) ?? [];
  const abierta = o ? ['draft', 'confirmed', 'in_progress'].includes(o.estado) : false;
  const menu = o ? acciones.accionesDe(o) : [];
  const principal = o
    ? o.estado === 'in_progress' || o.estado === 'confirmed'
      ? { etiqueta: tc('acciones.completar'), icono: CircleCheck, onClick: () => acciones.pedirCompletar(o), visible: acciones.puedeProducir }
      : o.estado === 'draft'
        ? { etiqueta: tc('acciones.confirmar.boton'), icono: CircleCheck, onClick: () => acciones.confirmar(o), visible: acciones.puedeProducir }
        : o.estado === 'completed'
          ? { etiqueta: tc('acciones.distribuir'), icono: Send, onClick: () => router.push(rutaDistribuirOrden(o.id)), visible: true }
          : null
    : null;
  const menuSecundario = menu.filter((a) => !principal || !['completar', 'confirmar', 'distribuir'].includes(a.id));

  const subtitulo = o
    ? [
        t('recetaVersion', { version: o.receta.version }),
        t('tandas', { count: tandas(o.a_producir, o.receta.rinde), n: cantidad(tandas(o.a_producir, o.receta.rinde)) }),
        t('planeadas', { cantidad: cantidad(o.a_producir, o.producto.unidad) }),
        o.creado_en ? t('creada', { fecha: formatDate(o.creado_en), autor: o.creado_por ?? '—' }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  const costoTotal = o ? (o.estado === 'completed' ? o.costo_real : o.costo_estimado) : null;
  const costoUnidad = o ? (o.estado === 'completed' ? o.costo_real_unidad : o.costo_estimado_unidad) : null;

  return (
    <div className="flex flex-col gap-4 lg:gap-5 print:gap-3">
      <PageHeader
        titulo={o ? `${o.numero} · ${o.producto.nombre}` : t('cargando')}
        subtitulo={subtitulo}
        icono={Factory}
        cargando={estado === 'cargando'}
        variante="detail"
        badge={o ? <BadgeEstadoProduccion estado={o.estado} /> : undefined}
        migas={[
          { etiqueta: tc('inventario'), href: '/app/inventario' },
          { etiqueta: tc('listado.titulo'), href: rutaProduccion() },
          { etiqueta: o?.numero ?? '…' },
        ]}
        onVolver={() => router.push(rutaProduccion())}
        debajo={o ? <BranchBadge alcance="una" nombre={o.sucursal.nombre} /> : undefined}
        acciones={
          o ? (
            <>
              <Button variant="outline" className="h-10 gap-2 print:hidden" onClick={() => window.print()}>
                <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('imprimir')}
              </Button>
              {principal?.visible && (
                <Button className="h-10 gap-2 print:hidden" onClick={principal.onClick}>
                  <principal.icono aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  {principal.etiqueta}
                </Button>
              )}
              {menuSecundario.length > 0 && <RowActionsMenu acciones={menuSecundario} titulo={o.numero} orientacion="horizontal" tamano="md" />}
            </>
          ) : undefined
        }
      />

      {o && o.estado !== 'cancelled' && (
        <Stepper
          pasos={PASOS_ORDEN.map((p) => ({ valor: p, etiqueta: tc(`estados.${p}`) }))}
          actual={o.estado as (typeof PASOS_ORDEN)[number]}
          etiqueta={t('pasos')}
          resumenMovil={(num, tot, etq) => t('pasoMovil', { num, tot, etiqueta: etq })}
        />
      )}

      {o?.estado === 'cancelled' && (
        <div role="status" className="rounded-xl border border-line bg-subtle px-4 py-3 text-sm text-fg">
          {t('cancelada', { fecha: o.cancelado_en ? formatDateTime(o.cancelado_en) : '—', autor: o.cancelado_por ?? '—', motivo: o.motivo_cancelacion ?? '—' })}
        </div>
      )}
      {o?.sin_consumos && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-line-warning bg-warning-subtle px-4 py-3 text-sm text-warning-text">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          {t('sinConsumos')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          {abierta ? (
            <Tarjeta titulo={o ? t('ingredientesPara', { cantidad: cantidad(o.a_producir, o.producto.unidad) }) : t('ingredientes')} icono={ChefHat}>
              <div className="flex flex-col gap-3">
                <DataTable
                  etiqueta={t('ingredientes')}
                  columnas={columnasNecesidad}
                  filas={n?.lineas ?? []}
                  obtenerId={(l) => String(l.orden)}
                  estado={estado === 'cargando' && !n ? 'cargando' : 'listo'}
                  densidad="compacta"
                  vacio={{ titulo: t('sinIngredientes'), icono: ChefHat }}
                />
                {faltantes.length > 0 && o && (
                  <>
                    <p role="status" className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-[13px] text-warning-text">
                      {t('avisoFaltante', { count: faltantes.length, nombre: faltantes[0].nombre, cantidad: cantidad(faltantes[0].faltante, faltantes[0].unidad) })}
                    </p>
                    <div className="flex flex-wrap gap-2 print:hidden">
                      <Button variant="outline" className="h-10 gap-2" onClick={() => router.push(`/app/inventario/transferencias/nuevo?producto_id=${faltantes[0].ingredient_product_id}`)}>
                        <ArrowLeftRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        {t('pedirTraslado')}
                      </Button>
                      <Button variant="outline" className="h-10 gap-2" onClick={() => router.push('/app/inventario/ordenes-compra/nuevo')}>
                        <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        {t('crearOrdenCompra')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Tarjeta>
          ) : (
            o?.estado === 'completed' && (
              <Tarjeta titulo={t('consumos')} icono={ChefHat}>
                <DataTable
                  etiqueta={t('consumos')}
                  columnas={columnasConsumo}
                  filas={datos?.consumos ?? []}
                  obtenerId={(c) => String(c.id)}
                  densidad="compacta"
                  vacio={{ titulo: t('sinConsumosTitulo'), descripcion: t('sinConsumos'), icono: ChefHat }}
                />
              </Tarjeta>
            )
          )}

          {o && o.estado !== 'cancelled' && (
            <Tarjeta titulo={t('terminado')} icono={Factory}>
              <FilaDato
                etiqueta={o.estado === 'completed' ? t('entro') : t('entrara')}
                valor={t('entraValor', { cantidad: cantidad(o.estado === 'completed' ? o.producido : o.a_producir, o.producto.unidad), producto: o.producto.nombre, sucursal: o.sucursal.nombre })}
              />
              {costoTotal !== null && (
                <FilaDato
                  etiqueta={o.estado === 'completed' ? t('costoReal') : t('costoEstimado')}
                  valor={t('costoValor', { total: moneda(costoTotal), unidad: costoUnidad !== null ? moneda(costoUnidad) : '—' })}
                />
              )}
              {o.estado === 'completed' && datos?.terminado?.promedio_despues !== null && datos?.terminado?.promedio_despues !== undefined && (
                <FilaDato etiqueta={t('promedio')} valor={moneda(datos.terminado.promedio_despues)} />
              )}
              <FilaDato etiqueta={t('kardex')} valor={o.estado === 'completed' ? t('kardexHecho') : t('kardexPendiente')} />
            </Tarjeta>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:gap-5">
          <Tarjeta titulo={t('resumen')}>
            {o && (
              <>
                <FilaDato etiqueta={t('receta')} valor={<Link href={rutaRecetaProducto(o.receta.product_id)} className="text-brand hover:underline">{t('recetaVersionNombre', { nombre: o.receta.nombre ?? o.producto.nombre, version: o.receta.version })}</Link>} />
                <FilaDato etiqueta={t('sucursal')} valor={o.sucursal.nombre} />
                <FilaDato etiqueta={t('planeado')} valor={cantidad(o.a_producir, o.producto.unidad)} />
                {o.estado === 'completed' && <FilaDato etiqueta={t('producido')} valor={cantidad(o.producido, o.producto.unidad)} />}
                {o.confirmado_en && <FilaDato etiqueta={t('confirmada')} valor={`${formatDateTime(o.confirmado_en)}${o.confirmado_por ? ` · ${o.confirmado_por}` : ''}`} />}
                {o.iniciado_en && <FilaDato etiqueta={t('iniciada')} valor={`${formatDateTime(o.iniciado_en)}${o.iniciado_por ? ` · ${o.iniciado_por}` : ''}`} />}
                {o.completado_en && <FilaDato etiqueta={t('completada')} valor={`${formatDateTime(o.completado_en)}${o.completado_por ? ` · ${o.completado_por}` : ''}`} />}
                {o.notas && <FilaDato etiqueta={t('notas')} valor={o.notas} />}
              </>
            )}
          </Tarjeta>
          {o && (
            <Tarjeta titulo={t('conecta')}>
              <div className="flex flex-col gap-2">
                <RelatedLinkCard icono={ChefHat} etiqueta={t('recetaUsada')} valor={t('recetaVersionNombre', { nombre: o.receta.nombre ?? o.producto.nombre, version: o.receta.version })} href={rutaRecetaProducto(o.receta.product_id)} textoAccion={t('ver')} />
                {costoUnidad !== null && (
                  <RelatedLinkCard icono={Calculator} etiqueta={t('costoRecetas')} valor={`${moneda(costoUnidad)} / ${o.producto.unidad}`} href={`/app/inventario/reportes/costo-recetas?busqueda=${encodeURIComponent(o.producto.nombre)}`} textoAccion={t('ver')} />
                )}
                <RelatedLinkCard
                  icono={History}
                  etiqueta={t('movimientosKardex')}
                  valor={o.estado === 'completed' ? t('nMovimientos', { count: (datos?.consumos.filter((c) => c.movement_id).length ?? 0) + (datos?.terminado ? 1 : 0) }) : t('alCompletar')}
                  href={rutaKardexOrden(o.producto.id)}
                  textoAccion={t('ver')}
                />
                <RelatedLinkCard
                  icono={Send}
                  etiqueta={t('distribucion')}
                  valor={
                    datos && datos.traslados.length > 0
                      ? datos.traslados.map((tr) => `${tr.codigo} → ${tr.destino.nombre}`).join(' · ')
                      : o.estado === 'completed'
                        ? t('sinDistribuir')
                        : t('alCompletar')
                  }
                  href={datos && datos.traslados.length === 1 ? rutaTraslado(datos.traslados[0].id) : rutaDistribuirOrden(o.id)}
                  textoAccion={t('ver')}
                />
              </div>
            </Tarjeta>
          )}
        </div>
      </div>

      {acciones.dialogos}
    </div>
  );
}

export default OrdenProduccionDetalle;
