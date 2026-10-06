/**
 * Formato de las filas y resúmenes del tablero de Ventas en línea en el idioma
 * y la moneda de la organización. Puro (recibe el traductor y la moneda): lo
 * usan la tarjeta de escritorio, la ListCard de móvil y los tests.
 */
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import type { FilaVenta, ResumenTarjeta, TarjetaVenta, ValorFila } from './estadoVentas';
import type { DiaSemana, SegmentoHorario } from './sedesWeb';

export type Traductor = (clave: string, valores?: Record<string, string | number>) => string;

/** «hace 2 h», «hace 3 d»: tiempo relativo corto en español (el idioma del módulo). */
export function haceCuanto(iso: string | null, ahora: Date = new Date(), locale = 'es'): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const seg = Math.round((t - ahora.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  const abs = Math.abs(seg);
  if (abs < 60) return rtf.format(seg, 'second');
  if (abs < 3600) return rtf.format(Math.round(seg / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seg / 3600), 'hour');
  return rtf.format(Math.round(seg / 86400), 'day');
}

export function formatoValor(v: ValorFila, t: Traductor, moneda: ContextoMoneda, ahora: Date = new Date()): string {
  switch (v.tipo) {
    case 'si_no':
      return t(v.valor ? 'ventas.valores.si' : 'ventas.valores.no');
    case 'importe':
      return v.valor === null ? t('ventas.valores.sinMinimo') : formatMoneda(v.valor, moneda);
    case 'numero':
      return new Intl.NumberFormat(moneda.locale).format(v.valor);
    case 'visible':
      return t(v.valor ? 'ventas.valores.visible' : 'ventas.valores.oculto');
    case 'pedidos_hoy':
      return t('ventas.valores.pedidosHoy', { cantidad: v.cantidad, total: formatMoneda(v.total, moneda) });
    case 'estado_sede':
      return t(v.recibiendo ? 'ventas.valores.recibiendo' : 'ventas.valores.apagada');
    case 'entorno':
      return v.valor === 'production' ? t('ventas.valores.produccion') : v.valor ? t('ventas.valores.pruebas') : '';
    case 'firma': {
      const base =
        v.veredicto === 'verificada'
          ? t('ventas.valores.firmaVerificada')
          : v.veredicto === 'no_coincide'
            ? t('ventas.valores.firmaNoCoincide')
            : t('ventas.valores.firmaSinEventos');
      const cuando = haceCuanto(v.ultimoPago, ahora);
      return cuando ? `${base} · ${t('ventas.valores.ultimoPago', { cuando })}` : base;
    }
    case 'texto':
      return v.valor;
    case 'avisos':
      return v.canales.length === 0
        ? t('ventas.valores.ninguno')
        : v.canales.map((c) => t(`ventas.valores.canales.${c}`)).join(` ${t('ventas.valores.o')} `);
  }
}

/** Valor de «Envío gratis desde» y «Tarifa plana»: sin dato es «No aplica», no «Sin mínimo». */
export function formatoFila(f: FilaVenta, t: Traductor, moneda: ContextoMoneda, ahora?: Date): string {
  if (f.valor.tipo === 'importe' && f.valor.valor === null && f.clave !== 'pedidoMinimo') return t('ventas.valores.noAplica');
  return formatoValor(f.valor, t, moneda, ahora);
}

export function etiquetaFila(f: FilaVenta, t: Traductor): string {
  if (f.clave === 'conectada') return t('ventas.filas.conectada', { proveedor: f.etiquetaLibre ?? '' });
  if (f.etiquetaLibre) return f.etiquetaLibre;
  return t(`ventas.filas.${f.clave}`);
}

/** Resumen de una línea para la ListCard de móvil (B/10-02). */
export function resumenTarjeta(r: ResumenTarjeta, t: Traductor, moneda: ContextoMoneda): string {
  switch (r.tipo) {
    case 'checkout':
      return t('ventas.resumen.checkout', {
        invitado: t(r.invitado ? 'ventas.resumen.invitado' : 'ventas.resumen.conCuenta'),
        minimo: r.minimo ? t('ventas.resumen.minimo', { valor: formatMoneda(r.minimo, moneda) }) : t('ventas.valores.sinMinimo').toLowerCase(),
      });
    case 'pagos':
      return r.nombres.length > 0 ? r.nombres.slice(0, 3).join(', ') : t('ventas.resumen.pagosVacio');
    case 'envios':
      return r.zonas > 0 ? t('ventas.resumen.enviosZonas', { n: r.zonas }) : t('ventas.resumen.enviosSinZonas');
    case 'cupones':
      return t('ventas.resumen.cupones', { n: r.activos });
    case 'pedidos':
      return t('ventas.resumen.pedidos', { n: r.pendientes });
    case 'reservas':
      return r.recibiendo.length > 0 ? t('ventas.resumen.reservasRecibiendo', { sedes: r.recibiendo.join(', ') }) : t('ventas.resumen.reservasApagadas');
    case 'pasarela':
      if (!r.proveedor) return t('ventas.resumen.sinPasarela');
      return t(r.firmaVerificada ? 'ventas.resumen.pasarela' : 'ventas.resumen.pasarelaSinFirma', { proveedor: r.proveedor });
  }
}

/** «Falta: tarifas de envío por zona (hoy solo tarifa plana).» */
export function lineaFalta(faltan: readonly string[], t: Traductor): string | null {
  if (faltan.length === 0) return null;
  return t('ventas.progreso.falta', { lista: faltan.map((f) => t(`ventas.faltan.${f}`)).join(', ') });
}

/** Texto del badge de una tarjeta. `modulo` ya traducido («Transporte»). */
export function etiquetaEstado(tarjeta: Pick<TarjetaVenta, 'estado'>, t: Traductor, modulo: string): string {
  return tarjeta.estado === 'disponible' ? t('ventas.estados.disponible', { modulo }) : t(`ventas.estados.${tarjeta.estado}`);
}

/** «Lun–Sáb 08:00–20:00 · Dom cerrado» (horario de la sucursal, solo lectura). */
export function textoHorario(segmentos: readonly SegmentoHorario[], t: Traductor): string {
  if (segmentos.length === 0) return t('sedes.tabla.sinHorario');
  const dia = (d: DiaSemana) => t(`sedes.dias.${d}`);
  return segmentos
    .map((s) => {
      const dias = s.desde === s.hasta ? dia(s.desde) : `${dia(s.desde)}–${dia(s.hasta)}`;
      return s.abre && s.cierra ? `${dias} ${s.abre}–${s.cierra}` : `${dias} ${t('sedes.tabla.cerrado')}`;
    })
    .join(' · ');
}

/** «$» de la moneda de la organización (prefijo de los campos de importe). */
export function simboloMoneda(moneda: ContextoMoneda): string {
  try {
    const partes = new Intl.NumberFormat(moneda.locale, { style: 'currency', currency: moneda.code }).formatToParts(0);
    return partes.find((p) => p.type === 'currency')?.value ?? moneda.code;
  } catch {
    return moneda.code;
  }
}
