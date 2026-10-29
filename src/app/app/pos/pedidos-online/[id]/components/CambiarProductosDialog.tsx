'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Mail, MessageCircle, Minus, Plus, Trash2 } from 'lucide-react';
import { AvisoTonal, CampoNumero, ConfirmDialog, Dialogo, FilaDato, ListaDatos, SearchInput, clasesBoton } from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { sentidoDelta, type Cotizacion } from '@/lib/services/webOrderChanges/cotizarCambio';
import { urlWhatsappCambio } from '@/lib/services/webOrderChanges/plantillaCambio';
import type { useCambiosPedido } from '../hooks/useCambiosPedido';

interface Linea {
  product_id: number;
  nombre: string;
  quantity: number;
}

interface Props {
  order: WebOrder;
  organizationId: number;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  cambios: ReturnType<typeof useCambiosPedido>;
  onAplicado: () => void;
}

/**
 * «Cambiar productos» de un pedido pagado: carrito editable (buscador + cantidades), antes/después,
 * diferencia y, según el signo, link de pago (copiar / WhatsApp / correo) o reembolso parcial /
 * saldo a favor. El precio lo pone el servidor (cotización); aquí solo se eligen productos.
 */
export function CambiarProductosDialog({ order, organizationId, abierto, onAbiertoChange, cambios, onAplicado }: Props) {
  const t = useTranslations('pedidoWeb.cambio');
  const { toast } = useToast();
  const { formatear } = useMonedaOrganizacion();
  const { formatDateTime, formatTime, timezone } = useFormatDate(order.branch_id);
  const inicial = useMemo<Linea[]>(
    () => (order.items ?? []).filter((i) => i.product_id).map((i) => ({ product_id: Number(i.product_id), nombre: i.product_name, quantity: Number(i.quantity) })),
    [order.items],
  );
  const [lineas, setLineas] = useState<Linea[]>(inicial);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Array<{ id: number; name: string; sku: string | null }>>([]);
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [errorCot, setErrorCot] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [reembolso, setReembolso] = useState<'refund' | 'customer_credit'>('refund');
  const [enviando, setEnviando] = useState(false);
  const [confirmarReenvio, setConfirmarReenvio] = useState(false);
  const pendiente = cambios.abierto?.estado === 'pending_payment' ? cambios.abierto : null;

  useEffect(() => {
    if (abierto) {
      setLineas(inicial);
      setMotivo('');
      setCot(null);
    }
  }, [abierto, inicial]);

  // Buscador de productos de la organización (la RLS del usuario filtra).
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    let vivo = true;
    const limpio = q.replace(/[%,()]/g, ' ');
    void supabase
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .or(`name.ilike.%${limpio}%,sku.ilike.%${limpio}%`)
      .limit(8)
      .then(({ data }) => vivo && setResultados((data as Array<{ id: number; name: string; sku: string | null }>) ?? []));
    return () => {
      vivo = false;
    };
  }, [busqueda, organizationId]);

  // Cotización del servidor (precios vigentes, IVA, envío) con cada cambio del carrito.
  const { cotizar } = cambios;
  useEffect(() => {
    if (!abierto || pendiente) return;
    const items = lineas.filter((l) => l.quantity > 0).map((l) => ({ product_id: l.product_id, quantity: l.quantity }));
    if (items.length === 0) {
      setCot(null);
      setErrorCot(t('sinItems'));
      return;
    }
    const id = setTimeout(async () => {
      const r = await cotizar(items);
      setCot(r.ok ? r.data?.cotizacion ?? null : null);
      setErrorCot(r.ok ? null : r.error ?? t('errorCotizar'));
    }, 350);
    return () => clearTimeout(id);
  }, [lineas, abierto, pendiente, cotizar, t]);

  const cambiarQty = (pid: number, qty: number | null) =>
    setLineas((ls) => ls.map((l) => (l.product_id === pid ? { ...l, quantity: Math.max(0, Math.min(999, Math.round(qty ?? 0))) } : l)));
  const agregar = (p: { id: number; name: string }) => {
    setLineas((ls) => (ls.some((l) => l.product_id === p.id) ? ls.map((l) => (l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { product_id: p.id, nombre: p.name, quantity: 1 }]));
    setBusqueda('');
  };

  const sentido = cot ? sentidoDelta(cot.delta.total) : 'igual';
  const sinCambios = lineas.every((l) => inicial.find((i) => i.product_id === l.product_id)?.quantity === l.quantity) && lineas.length === inicial.length;

  const confirmar = async () => {
    if (!cot) return;
    setEnviando(true);
    try {
      const items = lineas.filter((l) => l.quantity > 0).map((l) => ({ product_id: l.product_id, quantity: l.quantity }));
      const creado = await cambios.crear(items, motivo);
      if (!creado.ok || !creado.data) {
        toast({ title: creado.error ?? t('error'), variant: 'destructive' });
        return;
      }
      const ap = await cambios.aplicar(creado.data.change.id, sentido === 'devolver' ? { reembolso } : {});
      if (!ap.ok) {
        await cambios.cancelar(creado.data.change.id);
        toast({ title: ap.error ?? t('error'), variant: 'destructive' });
        return;
      }
      await cambios.recargar();
      if (ap.data?.accion !== 'link') {
        toast({ title: t('aplicado') });
        onAbiertoChange(false);
        onAplicado();
      }
    } finally {
      setEnviando(false);
    }
  };

  const datosPlantilla = pendiente
    ? {
        negocio: cambios.negocio,
        numeroPedido: order.order_number,
        nombreCliente: order.customer_name ?? '',
        montoTexto: formatear(Number(pendiente.delta_total)),
        url: pendiente.payment_link_url ?? '',
        vence: pendiente.expires_at ? formatDateTime(pendiente.expires_at) : null,
      }
    : null;

  const enviarCorreo = async () => {
    if (!pendiente) return;
    setEnviando(true);
    const r = await cambios.enviarCorreo(pendiente.id);
    setEnviando(false);
    toast(r.ok ? { title: t('correoEnviado') } : { title: r.code === 'REMITENTE_BLOQUEADO' ? t('remitenteBloqueado') : r.error ?? t('error'), variant: 'destructive' });
    if (r.ok) await cambios.recargar();
  };

  if (pendiente && datosPlantilla) {
    return (
      <Dialogo
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={t('linkTitulo')}
        descripcion={t('linkDescripcion', { monto: datosPlantilla.montoTexto })}
        ancho={520}
        textoCancelar={t('cerrar')}
        secundarios={[{ etiqueta: t('cancelarCambio'), destructiva: true, cargando: enviando, onClick: async () => {
          setEnviando(true);
          const r = await cambios.cancelar(pendiente.id);
          setEnviando(false);
          toast(r.ok ? { title: t('cancelado') } : { title: r.error ?? t('error'), variant: 'destructive' });
          await cambios.recargar();
        } }]}
        primario={{ etiqueta: t('copiar'), onClick: () => void navigator.clipboard.writeText(datosPlantilla.url).then(() => toast({ title: t('copiado') })) }}
      >
        <div className="space-y-3">
          <p className="break-all rounded-lg bg-subtle px-3 py-2 text-sm text-fg">{datosPlantilla.url}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void navigator.clipboard.writeText(datosPlantilla.url).then(() => toast({ title: t('copiado') }))}>
              <Copy className="size-4" aria-hidden="true" />
              {t('copiar')}
            </button>
            <a className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} href={urlWhatsappCambio(order.customer_phone, datosPlantilla)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" aria-hidden="true" />
              {t('whatsapp')}
            </a>
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              disabled={!order.customer_email || enviando}
              title={!order.customer_email ? t('sinCorreo') : undefined}
              onClick={() => (pendiente.email_sent_at ? setConfirmarReenvio(true) : void enviarCorreo())}
            >
              <Mail className="size-4" aria-hidden="true" />
              {t('email')}
            </button>
          </div>
          {pendiente.email_sent_at && (
            <p className="text-xs text-fg-secondary" role="status">
              {t('correoEnviadoA', {
                correo: pendiente.email_sent_to_masked ?? '',
                fecha: formatDateInTz(pendiente.email_sent_at, timezone, { day: '2-digit', month: '2-digit' }),
                hora: formatTime(pendiente.email_sent_at),
              })}
              {' · '}
              {t('correoVeces', { n: Number(pendiente.email_sent_count ?? 1) })}
            </p>
          )}
          {datosPlantilla.vence && <p className="text-xs text-fg-secondary">{t('vence', { fecha: datosPlantilla.vence })}</p>}
        </div>
        <ConfirmDialog
          abierto={confirmarReenvio}
          onAbiertoChange={setConfirmarReenvio}
          titulo={t('reenviarTitulo')}
          descripcion={t('reenviarDescripcion', { correo: pendiente.email_sent_to_masked ?? '', n: Number(pendiente.email_sent_count ?? 1) })}
          textoConfirmar={t('reenviar')}
          textoCancelar={t('cerrar')}
          tono="marca"
          icono={Mail}
          cargando={enviando}
          onConfirmar={async () => {
            await enviarCorreo();
            setConfirmarReenvio(false);
          }}
        />
      </Dialogo>
    );
  }

  const etiquetaPrimario = sentido === 'cobrar' ? t('generarLink') : sentido === 'devolver' ? t('aplicarYDevolver') : t('aplicar');
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion', { pedido: order.order_number })}
      ancho={672}
      primario={{
        etiqueta: etiquetaPrimario,
        onClick: () => void confirmar(),
        cargando: enviando,
        deshabilitada: !cot || sinCambios || (sentido === 'devolver' && !cambios.puedeReembolsar),
        motivo: sinCambios ? t('sinCambios') : sentido === 'devolver' && !cambios.puedeReembolsar ? t('sinPermisoReembolso') : undefined,
      }}
      pie={cot ? <span className="text-sm text-fg-secondary">{t('diferencia')}: <strong className="text-fg">{formatear(cot.delta.total)}</strong></span> : undefined}
    >
      <div className="space-y-4">
        <div className="relative">
          <SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} atajo={false} />
          {resultados.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-subtle" onClick={() => agregar(p)}>
                    <span className="text-fg">{p.name}</span>
                    <span className="text-xs text-fg-secondary">{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ul className="divide-y divide-line rounded-lg border border-line">
          {lineas.map((l) => {
            const antes = inicial.find((i) => i.product_id === l.product_id)?.quantity ?? 0;
            return (
              <li key={l.product_id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${l.quantity === 0 ? 'text-fg-secondary line-through' : 'text-fg'}`}>{l.nombre}</p>
                  {antes !== l.quantity && <p className="text-xs text-fg-secondary">{t('antesDespues', { antes, despues: l.quantity })}</p>}
                </div>
                <button type="button" aria-label={t('menos')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => cambiarQty(l.product_id, l.quantity - 1)}>
                  <Minus className="size-4" aria-hidden="true" />
                </button>
                <div className="w-16">
                  <CampoNumero valor={l.quantity} onValorChange={(v) => cambiarQty(l.product_id, v)} minimo={0} maximo={999} decimales={0} alinear="derecha" tamano="sm" />
                </div>
                <button type="button" aria-label={t('mas')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => cambiarQty(l.product_id, l.quantity + 1)}>
                  <Plus className="size-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label={t('quitar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => cambiarQty(l.product_id, 0)}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>

        {errorCot && <AvisoTonal tono="peligro" titulo={errorCot} />}

        {cot && (
          <ListaDatos className="rounded-lg bg-subtle px-3 py-2">
            <FilaDato etiqueta={t('subtotal')} valor={`${formatear(cot.antes.subtotal)} → ${formatear(cot.totales.subtotal)}`} />
            <FilaDato etiqueta={t('iva')} valor={`${formatear(cot.antes.tax_total)} → ${formatear(cot.totales.tax_total)}`} />
            {(cot.antes.delivery_fee > 0 || cot.totales.delivery_fee > 0) && (
              <FilaDato etiqueta={t('envio')} valor={`${formatear(cot.antes.delivery_fee)} → ${formatear(cot.totales.delivery_fee)}`} />
            )}
            <FilaDato etiqueta={t('total')} valor={`${formatear(cot.antes.total)} → ${formatear(cot.totales.total)}`} tono="fuerte" />
            <FilaDato
              etiqueta={sentido === 'cobrar' ? t('clientePaga') : sentido === 'devolver' ? t('aFavorCliente') : t('sinDiferencia')}
              valor={formatear(Math.abs(cot.delta.total))}
              tono="fuerte"
            />
          </ListaDatos>
        )}

        {sentido === 'cobrar' && cambios.pasarelas.length === 0 && <AvisoTonal tono="advertencia" titulo={t('sinPasarela')} />}

        {sentido === 'devolver' && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">{t('comoDevolver')}</legend>
            {(['refund', 'customer_credit'] as const).map((m) => (
              <label key={m} className="flex items-start gap-2 text-sm text-fg">
                <input type="radio" name="reembolso" className="mt-1" checked={reembolso === m} disabled={m === 'customer_credit' && !order.customer_id} onChange={() => setReembolso(m)} />
                <span>
                  {t(m === 'refund' ? 'reembolsoParcial' : 'saldoAFavor')}
                  <span className="block text-xs text-fg-secondary">{t(m === 'refund' ? 'reembolsoParcialAyuda' : order.customer_id ? 'saldoAFavorAyuda' : 'saldoSinCliente')}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t('motivo')} maxLength={500} rows={2} />
      </div>
    </Dialogo>
  );
}
