'use client';

/**
 * Detalle de un pedido «Anticipo pagado · vencido» (Figma «05 POS y ventas» › 05, 06, 07, 07b, 08):
 * - `AvisoAnticipoVencido`: aviso rojo arriba con el stock de cada línea en la sede y los botones
 *   «Reactivar pedido…» y «Devolver anticipo…».
 * - `TarjetaAnticipoVencido`: la tarjeta «Pago contra entrega» en este estado (monto, referencia,
 *   por devolver o aplicar, cuenta 2805).
 * - `DialogoReactivarPedido`: línea por línea; con stock de todo sigue a la confirmación de siempre
 *   (la base vuelve a apartar el stock, todo o nada). El reemplazo por otro producto queda para la
 *   siguiente fase: hoy se espera la reposición y se vuelve a intentar.
 * - `DialogoDevolverAnticipo`: devolución completa por el mismo medio (reverso en la pasarela) o por
 *   transferencia, con el asiento que se registra (Dr 2805 / Cr 138020xx o 1110) y el aviso al
 *   cliente. La base lo registra con la sesión y el permiso de devoluciones.
 * Montos en la moneda de la organización; horas en su zona.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, CircleAlert, RotateCcw, CircleCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AvisoTonal, Dialogo, FilaDato, FormField, StatusBadge, clasesBoton, type TonoBadge } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { metodoDePago } from '@/lib/pos/pedidosWeb/metodoDePago';
import {
  estadoLineaStock,
  minutosTarde,
  resumenStockAnticipo,
  type EstadoLineaStock,
  type LineaStockAnticipo,
  type MedioDevolucion,
} from '@/lib/pos/pedidosWeb/anticipoVencido';
import { devolverAnticipo, DevolverAnticipoError, stockPedidoVencido } from '@/lib/services/anticipoVencidoCliente';
import type { WebOrder } from '@/lib/services/webOrdersService';

type Pedido = Pick<WebOrder, 'id' | 'order_number' | 'customer_name' | 'advance_amount' | 'advance_due_at' | 'advance_reference' | 'advance_gateway'>;

const TONO_LINEA: Record<EstadoLineaStock, TonoBadge> = { disponible: 'exito', parcial: 'advertencia', sin_stock: 'peligro' };

/** Stock por línea del pedido en su sede (se vuelve a leer al reabrir). */
export function useStockPedidoVencido(orderId: string, activo: boolean): { lineas: LineaStockAnticipo[]; cargando: boolean; recargar: () => void } {
  const [lineas, setLineas] = useState<LineaStockAnticipo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    setCargando(true);
    void stockPedidoVencido(orderId).then((l) => {
      if (!vivo) return;
      setLineas(l);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [orderId, activo, vuelta]);
  return { lineas, cargando, recargar: () => setVuelta((v) => v + 1) };
}

function EtiquetaLinea({ linea }: { linea: LineaStockAnticipo }) {
  const t = useTranslations('anticipoVencido');
  const estado = estadoLineaStock(linea);
  const valores = { hay: Math.max(0, Number(linea.disponible) || 0), pide: Number(linea.quantity) || 0 };
  return <StatusBadge estado={`stock_${estado}`} etiqueta={t(`detalle.linea.${estado}`, valores)} tono={TONO_LINEA[estado]} tamano="sm" />;
}

function ListaLineas({ lineas }: { lineas: readonly LineaStockAnticipo[] }) {
  return (
    <ul className="space-y-1.5">
      {lineas.map((l, i) => (
        <li key={`${l.product_id ?? 'x'}-${i}`} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate text-fg">
            {l.product_name ?? '—'} <span className="text-fg-secondary">× {Number(l.quantity) || 0}</span>
          </span>
          <EtiquetaLinea linea={l} />
        </li>
      ))}
    </ul>
  );
}

export function AvisoAnticipoVencido({
  order,
  lineas,
  pagadoEn,
  onReactivar,
  onDevolver,
}: {
  order: Pedido;
  lineas: readonly LineaStockAnticipo[];
  pagadoEn: string | null;
  onReactivar: () => void;
  onDevolver: () => void;
}) {
  const t = useTranslations('anticipoVencido');
  const { formatear } = useMonedaOrganizacion();
  const { faltan } = resumenStockAnticipo(lineas);
  const min = minutosTarde(order.advance_due_at, pagadoEn);
  return (
    <AvisoTonal
      tono="peligro"
      rol="alert"
      titulo={faltan > 0 ? t('detalle.tituloSinStock') : t('detalle.titulo')}
      descripcion={
        <div className="space-y-2">
          <p>
            {t('detalle.texto', {
              cliente: order.customer_name?.trim() || t('lista.cliente'),
              monto: formatear(Number(order.advance_amount) || 0),
              tarde: min !== null ? t('detalle.minTarde', { min }) : t('detalle.tarde'),
            })}
          </p>
          {lineas.length > 0 && <ListaLineas lineas={lineas} />}
        </div>
      }
      acciones={[
        { etiqueta: t('detalle.reactivar'), onClick: onReactivar },
        { etiqueta: t('detalle.devolver'), onClick: onDevolver },
      ]}
    />
  );
}

export function TarjetaAnticipoVencido({
  order,
  timezone,
  pagadoEn,
  onReactivar,
  onDevolver,
}: {
  order: Pedido;
  timezone: string;
  pagadoEn: string | null;
  onReactivar: () => void;
  onDevolver: () => void;
}) {
  const t = useTranslations('anticipoVencido');
  const { formatear } = useMonedaOrganizacion();
  const anticipo = Number(order.advance_amount) || 0;
  const pasarela = order.advance_gateway ? metodoDePago({ payment_method: order.advance_gateway }) : null;
  const min = minutosTarde(order.advance_due_at, pagadoEn);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
            <Banknote className="size-4" strokeWidth={1.5} />
          </span>
          <span className="flex-1">{t('tarjeta.titulo')}</span>
          <StatusBadge estado="anticipo_pagado_vencido" etiqueta={t('lista.insignia')} tono="peligro" tamano="sm" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <FilaDato etiqueta={t('tarjeta.estado')} valor={<span className="text-danger-text">{t('tarjeta.estadoValor')}</span>} />
        <FilaDato etiqueta={t('tarjeta.anticipo')} valor={[formatear(anticipo), pasarela].filter(Boolean).join(' · ')} />
        {order.advance_reference && <FilaDato etiqueta={t('tarjeta.referencia')} valor={order.advance_reference} />}
        {pagadoEn && (
          <FilaDato
            etiqueta={t('tarjeta.fecha')}
            valor={`${formatDateTimeInTz(pagadoEn, timezone)}${min !== null ? ` (${t('detalle.minTarde', { min })})` : ''}`}
          />
        )}
        <FilaDato etiqueta={t('tarjeta.porDevolver')} valor={<span className="font-semibold text-danger-text">{formatear(anticipo)}</span>} />
        <FilaDato etiqueta={t('tarjeta.contabilidad')} valor={t('tarjeta.cuenta')} />
        <p className="pt-1 text-xs text-fg-secondary">{t('tarjeta.nota')}</p>
        <div className="flex flex-col gap-2 pt-2">
          <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md', anchoCompleto: true })} onClick={onReactivar}>
            <CircleCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('detalle.reactivar')}
          </button>
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })} onClick={onDevolver}>
            <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('detalle.devolver')}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DialogoReactivarPedido({
  abierto,
  onAbiertoChange,
  order,
  lineas,
  cargando,
  onContinuar,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  order: Pedido;
  lineas: readonly LineaStockAnticipo[];
  cargando: boolean;
  /** Sigue a la confirmación de siempre (la base vuelve a apartar el stock, todo o nada). */
  onContinuar: () => void;
}) {
  const t = useTranslations('anticipoVencido');
  const { faltan, todoDisponible } = resumenStockAnticipo(lineas);
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('reactivar.titulo', { numero: order.order_number })}
      descripcion={t('reactivar.descripcion')}
      icono={CircleCheck}
      ancho={560}
      primario={{
        etiqueta: t('reactivar.continuar'),
        onClick: () => {
          onAbiertoChange(false);
          onContinuar();
        },
        deshabilitada: cargando || !todoDisponible,
        motivo: t('reactivar.motivoDeshabilitado'),
      }}
    >
      {cargando ? <p className="text-sm text-fg-secondary">{t('detalle.cargandoStock')}</p> : <ListaLineas lineas={lineas} />}
      {!cargando && (
        <AvisoTonal
          tono={todoDisponible ? 'exito' : 'advertencia'}
          compacto
          titulo={todoDisponible ? t('reactivar.listo') : t('reactivar.faltan', { n: faltan })}
        />
      )}
    </Dialogo>
  );
}

export function DialogoDevolverAnticipo({
  abierto,
  onAbiertoChange,
  order,
  pagadoEn,
  timezone,
  onHecho,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  order: Pedido;
  pagadoEn: string | null;
  timezone: string;
  onHecho: (ok: boolean, mensaje: string) => void;
}) {
  const t = useTranslations('anticipoVencido');
  const { formatear } = useMonedaOrganizacion();
  const anticipo = Number(order.advance_amount) || 0;
  const pasarela = order.advance_gateway ? metodoDePago({ payment_method: order.advance_gateway }) : null;
  const cliente = order.customer_name?.trim() || t('lista.cliente');
  const [medio, setMedio] = useState<MedioDevolucion>('pasarela');
  const [referencia, setReferencia] = useState('');
  const [motivo, setMotivo] = useState(() => t('devolver.motivoPorDefecto'));
  const [avisar, setAvisar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!referencia.trim()) {
      setErrorCampo(t('devolver.errores.COMPROBANTE_REQUERIDO'));
      return;
    }
    setGuardando(true);
    setError(null);
    setErrorCampo(null);
    try {
      const r = await devolverAnticipo(order.id, { medio, referencia: referencia.trim(), motivo: motivo.trim() || null, monto: anticipo, avisar });
      onHecho(true, r.yaRegistrado ? t('devolver.yaRegistrado') : t('devolver.hecho', { monto: formatear(anticipo) }));
      onAbiertoChange(false);
      setReferencia('');
    } catch (e) {
      const codigo = e instanceof DevolverAnticipoError ? e.codigo : 'desconocido';
      setError(t.has(`devolver.errores.${codigo}`) ? t(`devolver.errores.${codigo}`) : t('devolver.errores.desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const opcion = (valor: MedioDevolucion, titulo: string, ayuda: string) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${medio === valor ? 'border-brand bg-brand-tint' : 'border-line'}`}
    >
      <input type="radio" name="medio-devolucion" className="mt-1" checked={medio === valor} onChange={() => setMedio(valor)} />
      <span>
        <span className="block font-medium text-fg">{titulo}</span>
        <span className="block text-xs text-fg-secondary">{ayuda}</span>
      </span>
    </label>
  );

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('devolver.titulo', { numero: order.order_number })}
      descripcion={t('devolver.descripcion', {
        cliente,
        monto: formatear(anticipo),
        medio: pasarela ?? '—',
        fecha: pagadoEn ? formatDateTimeInTz(pagadoEn, timezone) : '—',
      })}
      icono={RotateCcw}
      ancho={560}
      primario={{ etiqueta: t('devolver.confirmar', { monto: formatear(anticipo) }), onClick: () => void guardar(), cargando: guardando, destructiva: true }}
    >
      <FilaDato etiqueta={t('devolver.monto')} valor={<span className="font-semibold">{formatear(anticipo)}</span>} />
      <p className="text-xs text-fg-secondary">{t('devolver.montoAyuda')}</p>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-fg">{t('devolver.medio')}</legend>
        {opcion('pasarela', t('devolver.pasarela', { pasarela: pasarela ?? t('devolver.laPasarela') }), t('devolver.pasarelaAyuda'))}
        {opcion('transferencia', t('devolver.transferencia'), t('devolver.transferenciaAyuda'))}
      </fieldset>
      <FormField etiqueta={t('devolver.referencia')} obligatorio error={errorCampo}>
        <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} />
      </FormField>
      <div className="rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm">
        <div className="flex justify-between font-medium">
          <span>{t('devolver.devuelves', { cliente })}</span>
          <span className="tabular-nums">{formatear(anticipo)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-fg-secondary">{t('devolver.comision')}</span>
          <span className="text-warning-text">{t('devolver.comisionNo')}</span>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{t('devolver.asiento')}</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-fg-secondary">
              <th className="text-left font-medium">{t('devolver.cuenta')}</th>
              <th className="text-right font-medium">{t('devolver.debito')}</th>
              <th className="text-right font-medium">{t('devolver.credito')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('devolver.cuenta2805', { cliente })}</td>
              <td className="text-right tabular-nums">{formatear(anticipo)}</td>
              <td />
            </tr>
            <tr>
              <td>{medio === 'pasarela' ? t('devolver.cuentaPasarela', { pasarela: pasarela ?? t('devolver.laPasarela') }) : t('devolver.cuentaBanco')}</td>
              <td />
              <td className="text-right tabular-nums">{formatear(anticipo)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-fg-secondary">{t('devolver.notaAsiento')}</p>
      </div>
      <FormField etiqueta={t('devolver.motivo')}>
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={avisar} onCheckedChange={(v) => setAvisar(v === true)} />
        {t('devolver.avisar', { cliente })}
      </label>
      {error && (
        <p role="alert" className="flex items-center gap-1 text-sm text-danger-text">
          <CircleAlert aria-hidden="true" className="size-4" />
          {error}
        </p>
      )}
    </Dialogo>
  );
}

/**
 * Aviso de arriba y los dos diálogos, con el stock de la sede leído una vez (y otra al reabrir
 * «Reactivar»). Los diálogos los abre el aviso o la tarjeta lateral; el estado vive en la página.
 */
export function PanelAnticipoVencido({
  order,
  timezone,
  pagadoEn,
  reactivarAbierto,
  onReactivarAbierto,
  devolverAbierto,
  onDevolverAbierto,
  onConfirmar,
  onHecho,
}: {
  order: Pedido;
  timezone: string;
  pagadoEn: string | null;
  reactivarAbierto: boolean;
  onReactivarAbierto: (v: boolean) => void;
  devolverAbierto: boolean;
  onDevolverAbierto: (v: boolean) => void;
  /** Abre la confirmación de siempre (ConfirmOrderDialog). */
  onConfirmar: () => void;
  onHecho: (ok: boolean, mensaje: string) => void;
}) {
  const { lineas, cargando, recargar } = useStockPedidoVencido(order.id, true);
  useEffect(() => {
    if (reactivarAbierto) recargar();
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactivarAbierto]);
  return (
    <>
      <AvisoAnticipoVencido
        order={order}
        lineas={lineas}
        pagadoEn={pagadoEn}
        onReactivar={() => onReactivarAbierto(true)}
        onDevolver={() => onDevolverAbierto(true)}
      />
      <DialogoReactivarPedido
        abierto={reactivarAbierto}
        onAbiertoChange={onReactivarAbierto}
        order={order}
        lineas={lineas}
        cargando={cargando}
        onContinuar={onConfirmar}
      />
      <DialogoDevolverAnticipo
        abierto={devolverAbierto}
        onAbiertoChange={onDevolverAbierto}
        order={order}
        pagadoEn={pagadoEn}
        timezone={timezone}
        onHecho={onHecho}
      />
    </>
  );
}
