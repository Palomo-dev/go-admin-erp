'use client';

/**
 * Textos de la tarjeta «Pagos» con intentos (namespace `pagosIntentos`): motivo, medio, método
 * elegido, tiempo que falta, título y línea de cada intento y el mensaje de WhatsApp. La lógica
 * vive en `@/lib/pos/pedidosWeb/intentosPago` (pura); aquí solo se traduce.
 */
import { useTranslations } from 'next-intl';
import { metodoDePago } from '@/lib/pos/pedidosWeb/metodoDePago';
import { NOMBRE_PASARELA, textoSubmetodo, type Submetodo } from '@/lib/pos/pedidosWeb/pagosDelPedido';
import {
  claveMensajeWhatsApp,
  medioDelIntento,
  motivoDelIntento,
  nombrePasarela,
  partesTiempo,
  referenciaCorta,
  valoresMensaje,
  type ConceptoIntento,
  type EstadoTarjetaPagos,
  type IntentoPago,
  type MedioPago,
  type MetodoElegido,
  type MotivoIntento,
} from '@/lib/pos/pedidosWeb/intentosPago';

export function useTextosPago() {
  const t = useTranslations('pagosIntentos');
  const tm = useTranslations('detallesMarca.pagos');
  const traducirSubmetodo = (s: Submetodo) => tm(`submetodos.${s}`);

  const motivo = (m: MotivoIntento): string => {
    if (m.tipo === 'texto') return m.texto;
    if (m.tipo === 'codigo') return t(m.clave, { codigo: m.codigo });
    return m.pasarela ? t('motivos.noInforma', { pasarela: m.pasarela }) : t('motivos.noInformaGenerico');
  };

  const medio = (m: Pick<MedioPago, 'submetodo' | 'marcaTarjeta' | 'ultimos4'>): string | null => textoSubmetodo(m, traducirSubmetodo);

  /** «Wompi · Visa ••4417», «Bold (link)», «Wompi · PSE»; sin pasarela reconocida, el método del pedido. */
  const metodo = (e: MetodoElegido, order: { payment_method?: string | null; payment_method_detail?: string | null }): string => {
    if (!e.pasarela) return metodoDePago({ payment_method: order.payment_method ?? undefined, payment_method_detail: order.payment_method_detail ?? undefined });
    const nombre = NOMBRE_PASARELA[e.pasarela];
    if (e.enlace) return t('valores.metodoEnlace', { pasarela: nombre });
    return [nombre, medio(e)].filter(Boolean).join(' · ');
  };

  /** «18 min», «1 h 20 min», «24 h». */
  const tiempo = (minutos: number): string => {
    const { h, m } = partesTiempo(minutos);
    if (h === 0) return t('tiempo.min', { m });
    return m === 0 ? t('tiempo.horas', { h }) : t('tiempo.horasMin', { h, m });
  };

  /** «Enlace de pago creado», «Pago rechazado: Fondos insuficientes», «Venció sin pagar»… */
  const tituloIntento = (i: IntentoPago, concepto: ConceptoIntento): string => {
    if (i.event === 'link_created') return t(concepto === 'advance' ? 'intentos.eventos.enlaceAnticipo' : 'intentos.eventos.link_created');
    if (i.event === 'declined' || i.event === 'error') {
      const m = motivoDelIntento(i);
      // Sin motivo, el título queda corto; «Bold no envía el motivo» va en la línea de abajo.
      if (m && m.tipo !== 'noInforma') return t(`intentos.eventos.${i.event}Motivo`, { motivo: motivo(m) });
    }
    return t(`intentos.eventos.${i.event}`);
  };

  /**
   * Línea gris de un intento: pasarela en el enlace creado; medio, banco y referencia en los
   * avisos; «No hubo intentos · plazo de la tienda: 30 min» en el vencimiento.
   */
  const lineaIntento = (
    i: IntentoPago,
    ctx: { concepto: ConceptoIntento; intentosReales: number; plazoMinutos: number | null; formatear: (n: number) => string },
  ): string | null => {
    const partes: string[] = [];
    if (i.event === 'expired') {
      partes.push(ctx.intentosReales === 0 ? t('intentos.sinIntentos') : t('intentos.nIntentos', { n: ctx.intentosReales }));
      if (ctx.plazoMinutos) partes.push(t('intentos.plazoTienda', { plazo: tiempo(ctx.plazoMinutos) }));
      return partes.join(' · ');
    }
    const pasarela = nombrePasarela(i.gateway);
    const m = medioDelIntento(i);
    const textoMedio = medio(m);
    if (i.event === 'link_created') {
      if (pasarela) partes.push(pasarela);
      if (ctx.concepto === 'advance' && i.reference) partes.push(i.reference);
      if (ctx.concepto === 'advance' && i.amount != null && Number.isFinite(Number(i.amount))) partes.push(ctx.formatear(Number(i.amount)));
      return partes.join(' · ') || null;
    }
    if (textoMedio) partes.push(textoMedio);
    else if (pasarela) partes.push(pasarela);
    if (i.bank) partes.push(i.bank);
    if (i.event === 'pending') {
      partes.push(t('intentos.bancoNoResponde'));
      return partes.join(' · ');
    }
    const ref = referenciaCorta(i.reference);
    if (ref) partes.push(t('intentos.ref', { ref }));
    if ((i.event === 'declined' || i.event === 'error') && motivoDelIntento(i)?.tipo === 'noInforma') {
      partes.push(pasarela ? t('intentos.noEnviaMotivo', { pasarela }) : t('motivos.noInformaGenerico'));
    }
    return partes.join(' · ') || null;
  };

  /** Mensaje de WhatsApp del estado (A, C, C2, E) o `null`. */
  const mensaje = (
    estado: EstadoTarjetaPagos | null,
    datos: { nombre: string | null | undefined; numero: string; motivo?: string | null; hora?: string | null; url?: string | null },
  ): string | null => {
    const clave = claveMensajeWhatsApp(estado);
    return clave ? t(clave, valoresMensaje(datos)) : null;
  };

  return { t, motivo, medio, metodo, tiempo, tituloIntento, lineaIntento, mensaje };
}
