'use client';

/**
 * Tarjetas del detalle de venta (Figma `332:40219`, P-V2): productos, pagos,
 * historial, notas, cliente, resumen, comisión, factura, cuenta por cobrar,
 * asientos, devoluciones y notas crédito, mesa y pedido web. Todas leen el
 * `DetalleVenta` que arma el servidor en una respuesta (`GET /api/pos/ventas/[id]`);
 * aquí no se consulta nada. Fechas en la zona de la organización (todas las
 * columnas de origen son `timestamptz`).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BookOpen,
  CircleDollarSign,
  FileText,
  History,
  Package,
  ReceiptText,
  ShoppingBag,
  StickyNote,
  Undo2,
  User,
  UtensilsCrossed,
  Wallet,
  Award,
} from 'lucide-react';
import { FilaDato, ListaDatos, StatusBadge, Tarjeta } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { DetalleVenta } from '@/lib/pos/ventas/detalleServidor';
import { useFechaHoraCaja } from '@/components/pos/cajas/comunesCaja';
import { useEtiquetaMetodoPago } from '@/components/pos/cajas/paymentMethodLabels';

type Formato = (v: number) => string;

const ENLACE = 'text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded';

export function TarjetaProductos({ venta, formatear }: { venta: DetalleVenta; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  return (
    <Tarjeta titulo={t('productos.titulo', { count: venta.lineas.length })} icono={Package} sinRelleno>
      {venta.lineas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-fg-secondary">{t('productos.vacio')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('productos.titulo', { count: venta.lineas.length })}</caption>
            <thead className="border-b border-line text-left text-xs text-fg-secondary">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">{t('productos.producto')}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t('productos.cantidad')}</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">{t('productos.precio')}</th>
                <th scope="col" className="hidden px-2 py-2 text-right font-medium md:table-cell">{t('productos.impuesto')}</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">{t('productos.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {venta.lineas.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 align-top">
                    <span className="block text-fg">{l.nombre ?? t('productos.sinNombre')}</span>
                    {(l.sku || l.nota) && (
                      <span className="block text-xs text-fg-secondary">{[l.sku, l.nota].filter(Boolean).join(' · ')}</span>
                    )}
                    {l.descuento > 0 && <span className="block text-xs text-success-text">{t('productos.descuento', { monto: formatear(l.descuento) })}</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right align-top tabular-nums">{l.cantidad}</td>
                  <td className="hidden px-2 py-2.5 text-right align-top tabular-nums sm:table-cell">{formatear(l.precio)}</td>
                  <td className="hidden px-2 py-2.5 text-right align-top tabular-nums md:table-cell">
                    {formatear(l.impuesto)}
                    {l.tasa !== null && l.tasa > 0 && (
                      <span className="block text-xs text-fg-secondary">{t('productos.tasa', { tasa: Math.round(l.tasa * 100) / 100 })}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right align-top font-medium tabular-nums text-fg">{formatear(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

export function TarjetaPagos({ venta, formatear }: { venta: DetalleVenta; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  const fechaHora = useFechaHoraCaja();
  const etiquetaMetodo = useEtiquetaMetodoPago();
  return (
    <Tarjeta titulo={t('pagos.titulo')} icono={CircleDollarSign}>
      {venta.pagos.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('pagos.vacio')}</p>
      ) : (
        <ListaDatos etiqueta={t('pagos.titulo')} divisores>
          {venta.pagos.map((p) => (
            <FilaDato
              key={p.id}
              etiqueta={etiquetaMetodo(p.metodo ?? 'other')}
              descripcion={[fechaHora(p.fecha), p.referencia, p.vuelto > 0 ? t('pagos.vuelto', { monto: formatear(p.vuelto) }) : null].filter(Boolean).join(' · ')}
              valor={formatear(p.monto)}
              tono={p.estado === 'voided' || p.estado === 'cancelled' ? 'peligro' : 'neutro'}
              accesorio={p.estado && p.estado !== 'completed' ? <StatusBadge estado={p.estado} /> : undefined}
            />
          ))}
        </ListaDatos>
      )}
    </Tarjeta>
  );
}

/** Historial: lo que pasó con la venta, en orden (sin tabla de eventos: se arma con sus documentos). */
export function TarjetaHistorial({ venta, formatear }: { venta: DetalleVenta; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  const fechaHora = useFechaHoraCaja();
  const eventos = [
    { id: 'creada', fecha: venta.creada, texto: t('historial.creada', { nombre: venta.cajero.nombre ?? '—' }) },
    ...(venta.factura?.emitida ? [{ id: 'factura', fecha: venta.factura.emitida, texto: t('historial.facturada', { numero: venta.factura.numero ?? '' }) }] : []),
    ...venta.pagos.map((p) => ({ id: `p${p.id}`, fecha: p.fecha, texto: t('historial.pago', { monto: formatear(p.monto) }) })),
    ...venta.devoluciones.map((d) => ({ id: `d${d.id}`, fecha: d.fecha, texto: t('historial.devolucion', { monto: formatear(d.total) }) })),
    ...venta.notas_credito.map((n) => ({ id: `n${n.id}`, fecha: n.emitida, texto: t('historial.notaCredito', { numero: n.numero ?? '' }) })),
  ]
    .filter((e) => e.fecha)
    .sort((a, b) => new Date(a.fecha as string).getTime() - new Date(b.fecha as string).getTime());
  return (
    <Tarjeta titulo={t('historial.titulo')} icono={History}>
      <ol className="flex flex-col gap-3">
        {eventos.map((e) => (
          <li key={e.id} className="flex gap-3 text-sm">
            <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-line-strong" />
            <span className="flex min-w-0 flex-col">
              <span className="text-fg">{e.texto}</span>
              <span className="text-xs text-fg-secondary">{fechaHora(e.fecha)}</span>
            </span>
          </li>
        ))}
      </ol>
    </Tarjeta>
  );
}

export function TarjetaNotas({ venta }: { venta: DetalleVenta }) {
  const t = useTranslations('posVentas.detalle');
  if (!venta.notas) return null;
  return (
    <Tarjeta titulo={t('notas')} icono={StickyNote}>
      <p className="whitespace-pre-line text-sm text-fg">{venta.notas}</p>
    </Tarjeta>
  );
}

export function TarjetaCliente({ venta }: { venta: DetalleVenta }) {
  const t = useTranslations('posVentas.detalle');
  const c = venta.cliente;
  return (
    <Tarjeta
      titulo={t('cliente.titulo')}
      icono={User}
      accion={c ? <Link href={`/app/clientes/${c.id}`} className={ENLACE}>{t('cliente.ver')}</Link> : undefined}
    >
      {c ? (
        <ListaDatos etiqueta={t('cliente.titulo')}>
          <FilaDato etiqueta={t('cliente.nombre')} valor={c.nombre ?? '—'} tono="fuerte" />
          {c.documento && <FilaDato etiqueta={t('cliente.documento')} valor={c.documento} />}
          {c.email && <FilaDato etiqueta={t('cliente.correo')} valor={c.email} />}
          {c.telefono && <FilaDato etiqueta={t('cliente.telefono')} valor={c.telefono} />}
        </ListaDatos>
      ) : (
        <p className="text-sm text-fg-secondary">{t('cliente.consumidorFinal')}</p>
      )}
    </Tarjeta>
  );
}

export function TarjetaResumen({ venta, formatear }: { venta: DetalleVenta; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  return (
    <Tarjeta titulo={t('resumen.titulo')} icono={ReceiptText}>
      <ListaDatos etiqueta={t('resumen.titulo')}>
        <FilaDato etiqueta={t('resumen.subtotal')} valor={formatear(venta.subtotal)} />
        {venta.descuentos > 0 && <FilaDato etiqueta={t('resumen.descuentos')} valor={`−${formatear(venta.descuentos)}`} tono="exito" />}
        <FilaDato
          etiqueta={venta.impuestos_incluidos ? t('resumen.impuestosIncluidos') : t('resumen.impuestos')}
          valor={formatear(venta.impuestos)}
        />
        {(venta.desglose_impuestos ?? []).map((d, i) => (
          <FilaDato key={i} sangria={1} tamano="sm" etiqueta={d.name ?? t('resumen.impuesto')} valor={formatear(Number(d.amount) || 0)} />
        ))}
        {venta.envio > 0 && <FilaDato etiqueta={t('resumen.envio')} valor={formatear(venta.envio)} />}
        {venta.propina > 0 && <FilaDato etiqueta={t('resumen.propina')} valor={formatear(venta.propina)} />}
        <FilaDato etiqueta={t('resumen.total')} valor={formatear(venta.total)} tamano="lg" tono="fuerte" separadorAntes />
        <FilaDato etiqueta={t('resumen.pagado')} valor={formatear(venta.pagado)} tono="exito" />
        {venta.saldo > 0.005 && <FilaDato etiqueta={t('resumen.saldo')} valor={formatear(venta.saldo)} tono="advertencia" />}
        {venta.devuelto > 0 && <FilaDato etiqueta={t('resumen.devuelto')} valor={formatear(venta.devuelto)} tono="peligro" />}
      </ListaDatos>
    </Tarjeta>
  );
}

export function TarjetaComision({ venta, formatear }: { venta: DetalleVenta; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  if (!venta.comision && !venta.vendedor) return null;
  return (
    <Tarjeta titulo={t('comision.titulo')} icono={Award}>
      <ListaDatos etiqueta={t('comision.titulo')}>
        {venta.vendedor && <FilaDato etiqueta={t('comision.vendedor')} valor={venta.vendedor.nombre ?? '—'} />}
        {venta.comision && (
          <>
            <FilaDato etiqueta={t('comision.monto')} valor={formatear(venta.comision.monto)} tono="fuerte" />
            {venta.comision.beneficiario && <FilaDato etiqueta={t('comision.beneficiario')} valor={venta.comision.beneficiario} />}
            {venta.comision.estado && <FilaDato etiqueta={t('comision.estado')} valor={<StatusBadge estado={venta.comision.estado} />} />}
          </>
        )}
      </ListaDatos>
    </Tarjeta>
  );
}

export function TarjetaFactura({ venta, formatear }: { venta: DetalleVenta; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  const { formatDate } = useFormatDate();
  const f = venta.factura;
  if (!f) return null;
  return (
    <Tarjeta
      titulo={t('factura.titulo')}
      icono={FileText}
      tono={f.estado === 'void' ? 'peligro' : 'neutro'}
      accion={<Link href={`/app/finanzas/facturas-venta/${f.id}`} className={ENLACE}>{t('factura.ver')}</Link>}
    >
      <ListaDatos etiqueta={t('factura.titulo')}>
        <FilaDato etiqueta={t('factura.numero')} valor={f.numero ?? '—'} tono="fuerte" />
        <FilaDato etiqueta={t('factura.emitida')} valor={formatDate(f.emitida)} />
        {f.vence && <FilaDato etiqueta={t('factura.vence')} valor={formatDate(f.vence)} />}
        <FilaDato etiqueta={t('factura.saldo')} valor={formatear(f.saldo)} tono={f.saldo > 0.005 ? 'advertencia' : 'neutro'} />
        {f.estado && <FilaDato etiqueta={t('factura.estado')} valor={<StatusBadge estado={f.estado} />} />}
        {f.estado_fe && <FilaDato etiqueta={t('factura.estadoFe')} valor={<StatusBadge estado={f.estado_fe} />} />}
      </ListaDatos>
    </Tarjeta>
  );
}

export function TarjetaCuentaPorCobrar({ venta, formatear }: { venta: DetalleVenta; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  const { formatDate } = useFormatDate();
  const c = venta.cxc;
  if (!c) return null;
  return (
    <Tarjeta
      titulo={t('cxc.titulo')}
      icono={Wallet}
      tono={c.saldo > 0.005 ? 'advertencia' : 'neutro'}
      accion={<Link href={`/app/finanzas/cuentas-por-cobrar/${c.id}`} className={ENLACE}>{t('cxc.ver')}</Link>}
    >
      <ListaDatos etiqueta={t('cxc.titulo')}>
        <FilaDato etiqueta={t('cxc.monto')} valor={formatear(c.monto)} />
        <FilaDato etiqueta={t('cxc.saldo')} valor={formatear(c.saldo)} tono={c.saldo > 0.005 ? 'advertencia' : 'exito'} />
        {c.vence && <FilaDato etiqueta={t('cxc.vence')} valor={formatDate(c.vence)} />}
        {c.estado && <FilaDato etiqueta={t('cxc.estado')} valor={<StatusBadge estado={c.estado} />} />}
      </ListaDatos>
    </Tarjeta>
  );
}

export function TarjetaAsientos({ venta }: { venta: DetalleVenta }) {
  const t = useTranslations('posVentas.detalle');
  const { formatDate } = useFormatDate();
  if (venta.asientos.length === 0) return null;
  return (
    <Tarjeta titulo={t('asientos.titulo', { count: venta.asientos.length })} icono={BookOpen}>
      <ListaDatos etiqueta={t('asientos.titulo', { count: venta.asientos.length })} divisores>
        {venta.asientos.map((a) => (
          <FilaDato
            key={a.id}
            etiqueta={t('asientos.numero', { id: a.id })}
            descripcion={[formatDate(a.fecha), a.memo].filter(Boolean).join(' · ')}
            href={`/app/finanzas/contabilidad/asientos/${a.id}`}
            valor={a.publicado ? undefined : <StatusBadge estado="draft" />}
          />
        ))}
      </ListaDatos>
    </Tarjeta>
  );
}

export function TarjetaDevoluciones({ venta, formatear }: { venta: DetalleVenta; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  const { formatDate } = useFormatDate();
  if (venta.devoluciones.length === 0 && venta.notas_credito.length === 0) return null;
  return (
    <Tarjeta titulo={t('devoluciones.titulo')} icono={Undo2}>
      <ListaDatos etiqueta={t('devoluciones.titulo')} divisores>
        {venta.devoluciones.map((d) => (
          <FilaDato
            key={`d${d.id}`}
            etiqueta={t('devoluciones.devolucion', { id: d.id })}
            descripcion={[formatDate(d.fecha), d.motivo].filter(Boolean).join(' · ')}
            valor={formatear(d.total)}
            accesorio={d.estado ? <StatusBadge estado={d.estado} /> : undefined}
          />
        ))}
        {venta.notas_credito.map((n) => (
          <FilaDato
            key={`n${n.id}`}
            etiqueta={t('devoluciones.notaCredito', { numero: n.numero ?? '' })}
            descripcion={formatDate(n.emitida)}
            valor={formatear(n.total)}
            href={`/app/finanzas/facturas-venta/${n.id}`}
          />
        ))}
      </ListaDatos>
    </Tarjeta>
  );
}

export function TarjetaMesa({ venta }: { venta: DetalleVenta }) {
  const t = useTranslations('posVentas.detalle');
  const fechaHora = useFechaHoraCaja();
  const m = venta.mesa;
  if (!m) return null;
  return (
    <Tarjeta titulo={t('mesa.titulo')} icono={UtensilsCrossed}>
      <ListaDatos etiqueta={t('mesa.titulo')}>
        <FilaDato etiqueta={t('mesa.mesa')} valor={m.nombre ?? '—'} tono="fuerte" />
        {m.mesero && <FilaDato etiqueta={t('mesa.mesero')} valor={m.mesero} />}
        {m.comensales !== null && <FilaDato etiqueta={t('mesa.comensales')} valor={m.comensales} />}
        {m.abierta && <FilaDato etiqueta={t('mesa.abierta')} valor={fechaHora(m.abierta)} />}
        {m.cerrada && <FilaDato etiqueta={t('mesa.cerrada')} valor={fechaHora(m.cerrada)} />}
      </ListaDatos>
    </Tarjeta>
  );
}

export function TarjetaPedido({ venta }: { venta: DetalleVenta }) {
  const t = useTranslations('posVentas.detalle');
  const p = venta.pedido;
  if (!p) return null;
  return (
    <Tarjeta
      titulo={t('pedido.titulo')}
      icono={ShoppingBag}
      accion={<Link href={`/app/pos/pedidos-online/${p.id}`} className={ENLACE}>{t('pedido.ver')}</Link>}
    >
      <ListaDatos etiqueta={t('pedido.titulo')}>
        <FilaDato etiqueta={t('pedido.numero')} valor={p.numero ?? '—'} tono="fuerte" />
        {p.entrega && <FilaDato etiqueta={t('pedido.entrega')} valor={p.entrega} />}
        {p.direccion && <FilaDato etiqueta={t('pedido.direccion')} valor={p.direccion} />}
        {p.cupon && <FilaDato etiqueta={t('pedido.cupon')} valor={p.cupon} />}
      </ListaDatos>
    </Tarjeta>
  );
}
