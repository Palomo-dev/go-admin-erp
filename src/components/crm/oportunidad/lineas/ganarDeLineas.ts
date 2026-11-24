/**
 * Reglas puras de las líneas que no dependen de React: el rango corto de
 * fechas («12–15 nov») y los pasos de «Ganar» derivados de las líneas.
 */
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import type { PasoGanarVista } from '@/components/crm/kit/winDialogLogica';
import type { Lineas } from '../lineasLogica';

const FECHA_CORTA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

/** Texto «12–15 nov» de un rango de fechas planas. */
export function rangoCorto(entrada: string, salida: string): string {
  const a = formatPlainDate(entrada, FECHA_CORTA);
  const b = formatPlainDate(salida, FECHA_CORTA);
  const [da, ma] = a.split(' ');
  const [db, mb] = b.split(' ');
  return ma === mb ? `${da}–${db} ${mb ?? ''}`.trim() : `${a} – ${b}`;
}

/**
 * «Qué hacer al ganar», derivado de las líneas (Figma 1787:900392): solo los
 * pasos que piden. Factura si hay productos, servicios o conceptos; su
 * emisión (opcional, descuenta stock y activa membresías); membresía; reserva
 * del hospedaje; cupo de clase; cita. Onboarding y renovación como siempre.
 * Sin React: `pasosDeLineas` recibe los textos ya traducidos.
 */
export function pasosDeLineas(l: Lineas, tx: (clave: string, valores?: Record<string, string | number>) => string, fmt: { fecha: (d: string) => string; instante: (d: string) => string; rango: (a: string, b: string) => string }, cliente: string | null): PasoGanarVista[] {
  const pasos: PasoGanarVista[] = [];
  const facturables = l.products.length + l.custom.length;
  const conStock = l.products.filter((x) => x.controla_stock === true);
  if (facturables > 0) {
    pasos.push({ accion: 'factura', titulo: tx('factura.titulo'), detalle: tx('factura.detalle', { n: facturables }), tecnico: tx('factura.tecnico') });
    pasos.push({
      accion: 'emitir',
      titulo: tx('emitir.titulo'),
      detalle: conStock.length ? tx('emitir.detalleStock', { lista: conStock.map((x) => `${x.quantity} ${x.sku ?? x.nombre ?? ''}`.trim()).join(', ') }) : tx('emitir.detalle'),
      tecnico: tx('emitir.tecnico'),
      interruptor: true,
      requiere: 'factura',
    });
  }
  for (const m of l.products.filter((x) => x.tipo_servicio === 'membership').slice(0, 1)) {
    const inicio = typeof m.service_config?.start_date === 'string' ? m.service_config.start_date : null;
    pasos.push({
      accion: 'membresia',
      titulo: tx('membresia.titulo'),
      detalle: inicio ? tx('membresia.detalleInicio', { plan: m.nombre ?? '', cliente: cliente ?? '', fecha: fmt.fecha(inicio) }) : tx('membresia.detalle', { plan: m.nombre ?? '', cliente: cliente ?? '' }),
      tecnico: tx('membresia.tecnico'),
      requiere: 'emitir',
    });
  }
  if (l.spaces.length > 0) {
    const s = l.spaces[0];
    const huespedes = [s.adults ? tx('huespedes.adultos', { n: s.adults }) : null, s.children ? tx('huespedes.ninos', { n: s.children }) : null].filter(Boolean).join(', ');
    pasos.push({
      accion: 'reserva',
      titulo: tx('reserva.titulo'),
      detalle: [l.spaces.length > 1 ? tx('reserva.varias', { n: l.spaces.length }) : s.nombre, s.checkin_date && s.checkout_date ? fmt.rango(s.checkin_date, s.checkout_date) : null, huespedes || null].filter(Boolean).join(' · ') + '. ' + tx('reserva.revalida'),
      tecnico: tx('reserva.tecnico'),
    });
  }
  const clase = l.products.find((x) => x.tipo_servicio === 'class' && x.service_config?.gym_class_id);
  if (clase) {
    const c = clase.service_config as Record<string, unknown>;
    pasos.push({ accion: 'cupo', titulo: tx('cupo.titulo'), detalle: tx('cupo.detalle', { clase: String(c.class_title ?? clase.nombre ?? ''), fecha: typeof c.class_start === 'string' ? fmt.instante(c.class_start) : '' }), tecnico: tx('cupo.tecnico') });
  }
  const cita = l.products.find((x) => x.tipo_servicio === 'appointment' && x.service_config?.start_at);
  if (cita) {
    const c = cita.service_config as Record<string, unknown>;
    pasos.push({ accion: 'cita', titulo: tx('cita.titulo'), detalle: tx('cita.detalle', { servicio: cita.nombre ?? '', profesional: String(c.professional_name ?? ''), fecha: fmt.instante(String(c.start_at)) }), tecnico: tx('cita.tecnico') });
  }
  pasos.push({ accion: 'onboarding', titulo: tx('onboarding.titulo'), detalle: tx('comoHoy'), tecnico: 'startOnboardingForWonOpportunity' });
  pasos.push({ accion: 'renovacion', titulo: tx('renovacion.titulo'), detalle: tx('comoHoy'), tecnico: 'scheduleRenewal', marcado: false });
  return pasos;
}

