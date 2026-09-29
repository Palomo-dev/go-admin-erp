'use client';

/**
 * Tarjetas del detalle de venta (Figma `332:40219`, P-V2): productos, pagos,
 * historial, notas, cliente, resumen, comisión, factura, cuenta por cobrar,
 * asientos, devoluciones y notas crédito, mesa y pedido web. Todas leen el
 * `DetalleVenta` que arma el servidor en una respuesta (`GET /api/pos/ventas/[id]`);
 * aquí no se consulta nada. Fechas en la zona de la organización (todas las
 * columnas de origen son `timestamptz`).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  BookOpen,
  CircleDollarSign,
  FileText,
  History,
  Package,
  ShoppingBag,
  StickyNote,
  Undo2,
  User,
  UtensilsCrossed,
  Wallet,
  Award,
} from 'lucide-react';
import { AvatarIniciales, DataTable, FilaDato, ListCard, ListaDatos, StatusBadge, Tarjeta, type ColumnaTabla } from '@/components/kit';
import { DocumentoLineas, DocumentoTotales, type LineaDocumento } from '@/components/kit/documento';
import { Button } from '@/components/ui/button';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import type { DetalleVenta, PagoDetalle } from '@/lib/pos/ventas/detalleServidor';
import { useFechaHoraCaja } from '@/components/pos/cajas/comunesCaja';
import { useEtiquetaMetodoPago } from '@/components/pos/cajas/paymentMethodLabels';

type Formato = (v: number) => string;

/** Botón de ancho completo al pie de la tarjeta (Figma `332:40867`): «Ver ficha», «Ver factura»… */
function BotonPie({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild variant="outline" className="h-8 w-full">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export function TarjetaProductos({ venta, moneda, formatear }: { venta: DetalleVenta; moneda: ContextoMoneda; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  // Tabla de líneas del kit en modo lectura (Figma `332:40658`), la misma de la factura de venta.
  // La venta guarda la tarifa por línea pero no el nombre del impuesto: se muestra «Impuesto 19 %».
  const lineas: LineaDocumento[] = venta.lineas.map((l) => ({
    id: String(l.id),
    descripcion: l.nombre ?? t('productos.sinNombre'),
    sku: l.sku,
    nota: l.nota,
    cantidad: l.cantidad,
    precioUnitario: l.precio,
    descuento: l.descuento > 0 ? l.descuento : null,
    impuestos: (l.tasa !== null && l.tasa > 0) || l.impuesto > 0 ? [{ nombre: t('productos.impuesto'), tarifa: l.tasa, incluido: venta.impuestos_incluidos }] : [],
    total: l.total,
    detalleTotal: l.impuesto > 0 ? `${t('productos.impuesto')} ${formatear(l.impuesto)}` : null,
  }));
  return (
    <DocumentoLineas
      modo="lectura"
      moneda={moneda}
      etiqueta={t('productos.titulo', { count: venta.lineas.length })}
      lineas={lineas}
      estado={lineas.length === 0 ? 'vacio' : 'listo'}
      vacio={{ titulo: t('productos.vacio'), icono: Package }}
    />
  );
}

export function TarjetaPagos({ venta, formatear }: { venta: DetalleVenta; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  const fechaHora = useFechaHoraCaja();
  const etiquetaMetodo = useEtiquetaMetodoPago();
  const anulado = (p: PagoDetalle) => p.estado === 'voided' || p.estado === 'cancelled';
  const cambio = venta.pagos.filter((p) => !anulado(p)).reduce((s, p) => s + (p.vuelto || 0), 0);
  const importe = (p: PagoDetalle) => <span className={anulado(p) ? 'text-fg-muted line-through' : undefined}>{formatear(p.monto)}</span>;
  const estadoPago = (p: PagoDetalle) => (p.estado && p.estado !== 'completed' ? <StatusBadge estado={p.estado} tamano="sm" /> : undefined);
  const columnas: ColumnaTabla<PagoDetalle>[] = [
    {
      id: 'metodo',
      encabezado: t('pagos.columnas.metodo'),
      celda: (p) => (
        <span className="flex items-center gap-2">
          {etiquetaMetodo(p.metodo ?? 'other')}
          {estadoPago(p)}
        </span>
      ),
    },
    { id: 'referencia', encabezado: t('pagos.columnas.referencia'), variante: 'mono', ocultarDebajo: 'md', celda: (p) => p.referencia || '—' },
    { id: 'fecha', encabezado: t('pagos.columnas.fecha'), celda: (p) => <span className="whitespace-nowrap">{fechaHora(p.fecha)}</span> },
    { id: 'cambio', encabezado: t('pagos.columnas.cambio'), variante: 'importe', celda: (p) => (p.vuelto > 0 ? formatear(p.vuelto) : '—') },
    { id: 'importe', encabezado: t('pagos.columnas.importe'), variante: 'importe', celda: importe },
  ];
  return (
    <Tarjeta titulo={t('pagos.titulo')} icono={CircleDollarSign}>
      {venta.pagos.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('pagos.vacio')}</p>
      ) : (
        <DataTable
          etiqueta={t('pagos.titulo')}
          columnas={columnas}
          filas={venta.pagos}
          obtenerId={(p) => String(p.id)}
          densidad="compacta"
          estado="listo"
          tonoFila={(p) => (anulado(p) ? 'peligro' : undefined)}
          tarjetaMovil={(p) => (
            <ListCard
              icono={CircleDollarSign}
              titulo={etiquetaMetodo(p.metodo ?? 'other')}
              meta={[fechaHora(p.fecha), p.referencia, p.vuelto > 0 ? t('pagos.vuelto', { monto: formatear(p.vuelto) }) : null].filter(Boolean).join(' · ')}
              valor={importe(p)}
              estado={estadoPago(p)}
            />
          )}
        />
      )}
      <ListaDatos etiqueta={t('pagos.totales')} className="mt-3">
        <FilaDato etiqueta={t('pagos.totalPagado')} valor={formatear(venta.pagado)} tono="fuerte" />
        <FilaDato etiqueta={t('pagos.cambio')} valor={formatear(cambio)} />
        <FilaDato etiqueta={t('pagos.falta')} valor={formatear(venta.saldo)} tono={venta.saldo > 0.005 ? 'advertencia' : 'neutro'} />
      </ListaDatos>
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
    <Tarjeta titulo={t('cliente.titulo')} icono={User} pie={c ? <BotonPie href={`/app/clientes/${c.id}`}>{t('cliente.ver')}</BotonPie> : undefined}>
      {c ? (
        <>
          <div className="flex min-w-0 items-center gap-3">
            <AvatarIniciales nombre={c.nombre ?? '—'} tamano="md" />
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{c.nombre ?? '—'}</p>
              {c.documento && <p className="truncate text-xs text-fg-secondary">{c.documento}</p>}
            </div>
          </div>
          {(c.email || c.telefono) && (
            <ListaDatos etiqueta={t('cliente.titulo')} className="mt-3">
              {c.email && <FilaDato etiqueta={t('cliente.correo')} valor={c.email} />}
              {c.telefono && <FilaDato etiqueta={t('cliente.telefono')} valor={c.telefono} />}
            </ListaDatos>
          )}
        </>
      ) : (
        <p className="text-sm text-fg-secondary">{t('cliente.consumidorFinal')}</p>
      )}
    </Tarjeta>
  );
}

export function TarjetaResumen({ venta, moneda, formatear }: { venta: DetalleVenta; moneda: ContextoMoneda; formatear: Formato }) {
  const t = useTranslations('posVentas.detalle');
  // El desglose guardado en la venta trae nombre e importe (sin tarifa). Sin
  // desglose, una sola fila con el total de impuestos.
  const desglose = (venta.desglose_impuestos ?? []).map((d) => ({ nombre: d.name ?? t('resumen.impuesto'), importe: Number(d.amount) || 0 }));
  const impuestos = desglose.length > 0 ? desglose : venta.impuestos > 0 ? [{ nombre: t('resumen.impuestos'), importe: venta.impuestos }] : [];
  const cargos = [
    ...(venta.envio > 0 ? [{ id: 'envio', etiqueta: t('resumen.envio'), importe: venta.envio }] : []),
    ...(venta.propina > 0 ? [{ id: 'propina', etiqueta: t('resumen.propina'), importe: venta.propina }] : []),
  ];
  return (
    <DocumentoTotales
      variante="venta"
      titulo={t('resumen.titulo')}
      moneda={moneda}
      subtotal={venta.subtotal}
      impuestosIncluidos={venta.impuestos_incluidos}
      impuestos={impuestos}
      mostrarBases={false}
      descuentos={venta.descuentos > 0 ? [{ id: 'descuentos', etiqueta: t('resumen.descuentos'), importe: venta.descuentos }] : []}
      cargos={cargos}
      total={venta.total}
      pagado={venta.pagado}
      saldo={venta.saldo}
      extras={venta.devuelto > 0 ? [{ etiqueta: t('resumen.devuelto'), valor: formatear(venta.devuelto), tono: 'peligro' }] : undefined}
    />
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
      pie={<BotonPie href={`/app/finanzas/facturas-venta/${f.id}`}>{t('factura.ver')}</BotonPie>}
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
      pie={<BotonPie href={`/app/finanzas/cuentas-por-cobrar/${c.id}`}>{t('cxc.ver')}</BotonPie>}
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
      pie={<BotonPie href={`/app/pos/pedidos-online/${p.id}`}>{t('pedido.ver')}</BotonPie>}
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
