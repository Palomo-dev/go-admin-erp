'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, CircleAlert, ExternalLink, Factory, Send } from 'lucide-react';
import { FilaDato, type ColumnaTabla } from '@/components/kit';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { TablaSubseccion } from '@/components/kit/TablaSubseccion';
import { Button } from '@/components/ui/button';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { puede } from '@/lib/inventario/permisos';
import {
  productionOrderService,
  type DetalleProduccion,
  type OrdenProduccionFila,
  type ResumenProduccionProducto,
} from '@/lib/services/productionOrderService';
import { DialogoNuevaOrden } from '../../../produccion/DialogoNuevaOrden';
import { PASOS_ORDEN, rutaOrdenProduccion, rutaTraslado } from '../../../produccion/logica';
import { BadgeEstadoProduccion, useFormatoCantidad } from '../../../produccion/piezas';
import { useAccionesProduccion } from '../../../produccion/useAccionesProduccion';
import type { ProductoPestanaProduccion } from './PestanaProduccion';

/**
 * Producción › Órdenes (Figma D4 968:178151 y M3 972:179875): órdenes que
 * producen este producto; «Nueva orden» (G1) con el producto fijo; la fila abre
 * la hoja de la orden con su paso, necesidades o consumos, costo y la
 * distribución que salió de ella; «Completar» (G2) y «Cancelar» son las mismas
 * acciones de la pantalla Producción.
 */
export function SubOrdenesProducto({ producto, resumen, onCambio }: { producto: ProductoPestanaProduccion; resumen: ResumenProduccionProducto; onCambio: () => void }) {
  const t = useTranslations('subseccion.ordenes');
  const tp = useTranslations('inventarioProduccion');
  const router = useRouter();
  const cantidad = useFormatoCantidad();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { formatDate, formatDateTime } = useFormatDate();
  const [filas, setFilas] = useState<OrdenProduccionFila[]>([]);
  const [total, setTotal] = useState(0);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [recarga, setRecarga] = useState(0);
  const [nueva, setNueva] = useState(false);
  const [abierta, setAbierta] = useState<OrdenProduccionFila | null>(null);
  const [detalle, setDetalle] = useState<DetalleProduccion | null>(null);

  const refrescar = useCallback(() => {
    setRecarga((n) => n + 1);
    onCambio();
  }, [onCambio]);
  const acciones = useAccionesProduccion({ permisos: resumen.permisos, onCambio: refrescar, enDetalle: true });

  useEffect(() => {
    const control = new AbortController();
    setEstado('cargando');
    productionOrderService
      .listar(getOrganizationId(), { producto: producto.id, limite: 100 }, control.signal)
      .then((r) => {
        setFilas(r.filas);
        setTotal(r.total);
        setEstado('listo');
        setAbierta((a) => (a ? r.filas.find((f) => f.id === a.id) ?? null : null));
      })
      .catch(() => !control.signal.aborted && setEstado('error'));
    return () => control.abort();
  }, [producto.id, recarga]);

  useEffect(() => {
    setDetalle(null);
    if (!abierta) return;
    const control = new AbortController();
    productionOrderService.detalle(getOrganizationId(), abierta.id, control.signal).then(setDetalle).catch(() => undefined);
    return () => control.abort();
  }, [abierta]);

  const columnas = useMemo<ColumnaTabla<OrdenProduccionFila>[]>(
    () => [
      {
        id: 'orden',
        encabezado: t('col.orden'),
        celda: (o) => (
          <div className="flex min-w-0 flex-col">
            <span className="font-medium text-brand">{o.numero}</span>
            <span className="truncate text-xs text-fg-secondary">{[tp('listado.recetaVersion', { version: o.receta.version }), o.creado_por].filter(Boolean).join(' · ')}</span>
          </div>
        ),
      },
      { id: 'sucursal', encabezado: t('col.sucursal'), ocultarDebajo: 'md', celda: (o) => o.sucursal.nombre },
      { id: 'cantidad', encabezado: t('col.aProducir'), variante: 'importe', celda: (o) => cantidad(o.estado === 'completed' ? o.producido : o.a_producir, o.producto.unidad) },
      { id: 'fecha', encabezado: t('col.fecha'), ocultarDebajo: 'lg', celda: (o) => (o.creado_en ? formatDate(o.creado_en) : '—') },
      {
        id: 'costo',
        encabezado: t('col.costo'),
        variante: 'importe',
        ocultarDebajo: 'md',
        celda: (o) => {
          const c = o.estado === 'completed' ? o.costo_real : o.costo_estimado;
          return c !== null ? moneda(c) : '—';
        },
      },
      { id: 'estado', encabezado: t('col.estado'), celda: (o) => <BadgeEstadoProduccion estado={o.estado} /> },
    ],
    [cantidad, formatDate, moneda, t, tp],
  );

  const o = abierta;
  const n = detalle?.necesidades;
  const faltantes = n?.lineas.filter((l) => l.faltante > 0) ?? [];
  const puedeProducir = puede(resumen.permisos, 'producir');
  const pasoActual = o ? PASOS_ORDEN.indexOf(o.estado as (typeof PASOS_ORDEN)[number]) : -1;

  return (
    <>
      <TablaSubseccion
        titulo={t('titulo')}
        contador={total}
        descripcion={t('descripcion')}
        accionNueva={puedeProducir && resumen.receta_efectiva && resumen.producto.track_stock ? { etiqueta: t('nueva'), onClick: () => setNueva(true) } : undefined}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => String(f.id)}
        estado={estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : 'listo'}
        onFilaClick={setAbierta}
        etiquetaFila={(f) => t('etiquetaFila', { numero: f.numero })}
        acciones={acciones.accionesDe}
        onReintentar={() => setRecarga((x) => x + 1)}
        vacio={{
          titulo: t('vacioTitulo'),
          descripcion: resumen.receta_efectiva ? t('vacioDescripcion') : t('vacioSinReceta'),
          icono: Factory,
          accion: puedeProducir && resumen.receta_efectiva && resumen.producto.track_stock ? { etiqueta: t('nueva'), onClick: () => setNueva(true) } : undefined,
        }}
      />

      {o && (
        <HojaDetalle
          abierto
          onAbiertoChange={(a) => !a && setAbierta(null)}
          titulo={t('hojaTitulo', { numero: o.numero })}
          insignia={<BadgeEstadoProduccion estado={o.estado} />}
          subtitulo={`${producto.name} · ${o.sucursal.nombre}`}
          pie={
            <>
              {puedeProducir && ['draft', 'confirmed', 'in_progress'].includes(o.estado) && (
                <Button variant="ghost" className="h-10" onClick={() => acciones.pedirCancelar(o)}>
                  {tp('acciones.cancelar.boton')}
                </Button>
              )}
              <Button variant="outline" className="h-10 gap-2" onClick={() => router.push(rutaOrdenProduccion(o.id))}>
                <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('verOrden')}
              </Button>
              {puedeProducir && (o.estado === 'confirmed' || o.estado === 'in_progress') && <Button className="h-10" onClick={() => acciones.pedirCompletar(o)}>{t('completar')}</Button>}
              {puedeProducir && o.estado === 'draft' && <Button className="h-10" onClick={() => acciones.confirmar(o)}>{tp('acciones.confirmar.boton')}</Button>}
              {o.estado === 'completed' && (
                <Button className="h-10 gap-2" onClick={() => router.push(`/app/inventario/distribucion?orden=${o.id}`)}>
                  <Send aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  {tp('acciones.distribuir')}
                </Button>
              )}
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {o.estado !== 'cancelled' && (
              <ol className="flex flex-wrap gap-1.5" aria-label={t('pasos')}>
                {PASOS_ORDEN.map((p, i) => (
                  <li
                    key={p}
                    aria-current={i === pasoActual ? 'step' : undefined}
                    className={
                      i < pasoActual || o.estado === 'completed'
                        ? 'inline-flex items-center gap-1 rounded-full bg-success-subtle px-2.5 py-1 text-xs text-success-text'
                        : i === pasoActual
                          ? 'inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-brand-deep'
                          : 'inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1 text-xs text-fg-muted'
                    }
                  >
                    {(i < pasoActual || o.estado === 'completed') && <CheckCircle2 aria-hidden="true" className="size-3.5" />}
                    {tp(`estados.${p}`)}
                  </li>
                ))}
              </ol>
            )}
            <div>
              <FilaDato etiqueta={t('receta')} valor={tp('detalle.recetaVersionNombre', { nombre: o.receta.nombre ?? producto.name, version: o.receta.version })} />
              <FilaDato etiqueta={t('aProducir')} valor={cantidad(o.a_producir, o.producto.unidad)} />
              {o.estado === 'completed' && <FilaDato etiqueta={t('producido')} valor={cantidad(o.producido, o.producto.unidad)} />}
              {o.iniciado_en && <FilaDato etiqueta={t('iniciada')} valor={formatDateTime(o.iniciado_en)} />}
              {o.completado_en && <FilaDato etiqueta={t('completada')} valor={formatDateTime(o.completado_en)} />}
              {(o.estado === 'completed' ? o.costo_real : o.costo_estimado) !== null && (
                <FilaDato
                  etiqueta={o.estado === 'completed' ? t('costoReal') : t('costoEstimado')}
                  valor={t('costoValor', {
                    total: moneda((o.estado === 'completed' ? o.costo_real : o.costo_estimado) ?? 0),
                    unidad: moneda((o.estado === 'completed' ? o.costo_real_unidad : o.costo_estimado_unidad) ?? 0),
                  })}
                />
              )}
              {o.estado === 'cancelled' && o.motivo_cancelacion && <FilaDato etiqueta={t('motivo')} valor={o.motivo_cancelacion} />}
            </div>

            {n && n.lineas.length > 0 && (
              <section aria-labelledby="hoja-necesidades" className="flex flex-col gap-2">
                <h3 id="hoja-necesidades" className="text-sm font-semibold text-fg">{t('necesidades')}</h3>
                <ul className="flex flex-col divide-y divide-line rounded-lg border border-line text-[13px]">
                  {n.lineas.filter((l) => !l.opcional).map((l) => (
                    <li key={l.orden} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate text-fg">{l.nombre}</span>
                      <span className="flex shrink-0 items-center gap-2 tabular-nums text-fg-secondary">
                        {cantidad(l.necesario, l.unidad)}
                        <span className={l.faltante > 0 ? 'text-danger-text' : ''}>{l.track_stock ? cantidad(l.disponible, l.unidad) : t('noDescuenta')}</span>
                        {l.track_stock &&
                          (l.faltante > 0 ? (
                            <CircleAlert aria-label={t('falta')} className="size-4 text-danger-text" />
                          ) : (
                            <CheckCircle2 aria-label={t('suficiente')} className="size-4 text-success-text" />
                          ))}
                      </span>
                    </li>
                  ))}
                </ul>
                {faltantes.length > 0 && (
                  <p role="status" className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-[13px] text-warning-text">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                    {t('avisoFaltante', { nombre: faltantes[0].nombre, cantidad: cantidad(faltantes[0].faltante, faltantes[0].unidad), sucursal: o.sucursal.nombre })}
                  </p>
                )}
              </section>
            )}

            {detalle && detalle.consumos.length > 0 && (
              <section aria-labelledby="hoja-consumos" className="flex flex-col gap-2">
                <h3 id="hoja-consumos" className="text-sm font-semibold text-fg">{t('consumos')}</h3>
                <ul className="flex flex-col divide-y divide-line rounded-lg border border-line text-[13px]">
                  {detalle.consumos.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate text-fg">{c.nombre}</span>
                      <span className="shrink-0 tabular-nums text-fg-secondary">
                        {cantidad(c.cantidad, c.unidad)}
                        {c.costo_total !== null ? ` · ${moneda(c.costo_total)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detalle && detalle.traslados.length > 0 && (
              <section aria-labelledby="hoja-traslados" className="flex flex-col gap-2">
                <h3 id="hoja-traslados" className="text-sm font-semibold text-fg">{t('salioDeAqui')}</h3>
                {detalle.traslados.map((tr) => (
                  <Link key={tr.id} href={rutaTraslado(tr.id)} className="flex items-center gap-2 text-sm">
                    <Send aria-hidden="true" className="size-4 text-fg-secondary" />
                    <span className="text-brand hover:underline">{tr.codigo}</span>
                    <span className="text-fg-secondary">
                      {cantidad(tr.cantidad, o.producto.unidad)} → {tr.destino.nombre}
                    </span>
                  </Link>
                ))}
              </section>
            )}
          </div>
        </HojaDetalle>
      )}

      <DialogoNuevaOrden
        abierto={nueva}
        onAbiertoChange={setNueva}
        producto={
          resumen.receta_efectiva
            ? {
                product_id: producto.id,
                nombre: producto.name,
                sku: producto.sku ?? null,
                unidad: resumen.producto.unidad,
                decimales: resumen.producto.decimales,
                recipe_id: resumen.receta_efectiva.recipe_id,
                version: resumen.receta_efectiva.version,
              }
            : null
        }
        onCreada={() => refrescar()}
      />
      {acciones.dialogos}
    </>
  );
}
