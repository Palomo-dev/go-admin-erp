/**
 * Aviso al cliente cuando el equipo decide su solicitud de reserva (Figma
 * 1807:25, paso 5 de 1801:169066): «Tu mesa en Sede Norte está confirmada ·
 * R-7Q2K» o «No pudimos confirmar tu reserva» con el motivo y, si el equipo la
 * ofreció, otra hora. Módulo PURO (asunto, HTML y texto): el envío lo hace
 * `/api/pos/reservas-mesas/[id]/aviso` con el Resend de la plataforma, igual
 * que el recordatorio (`recordatorioReserva.ts`).
 *
 * WhatsApp: necesita la plantilla aprobada en CRM › Canales; hasta entonces
 * solo correo (mismo criterio que la configuración de reservas).
 */
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { escaparHtml } from '@/lib/documents/escape';

export interface DatosAviso {
  id: string;
  customer_name: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  status: string;
  cancellation_reason: string | null;
  mesa: string | null;
  sede: string | null;
  sede_direccion: string | null;
  organizacion: string;
  politica: string | null;
}

export type TipoAviso = 'confirmada' | 'rechazada';

export function tipoAviso(status: string): TipoAviso | null {
  if (status === 'confirmed') return 'confirmada';
  if (status === 'cancelled') return 'rechazada';
  return null;
}

/** «7:30 p. m.» desde «19:30:00» (hora de pared de la sede). */
function hora12(hhmm: string): string {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  if (h === 12 && m === 0) return '12:00 m.';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** El mismo código que muestran el sitio y su correo (8 primeros del uuid). */
export function codigoReserva(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function correoAvisoReserva(
  d: DatosAviso,
  tipo: TipoAviso,
  opciones: { enlaceGestion: string | null; enlaceReservar: string | null; otraHora: string | null },
): { asunto: string; html: string; texto: string } {
  const dia = formatPlainDate(d.reservation_date, { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = hora12(d.reservation_time);
  const nombre = d.customer_name.split(' ')[0] || d.customer_name;
  const lugar = [d.sede, d.sede_direccion].filter(Boolean).join(' · ');
  const codigo = codigoReserva(d.id);

  const filas: Array<[string, string]> = [
    ['Día', dia],
    ['Hora', hora],
    ['Personas', `${d.party_size} ${d.party_size === 1 ? 'persona' : 'personas'}${d.mesa ? ` · ${d.mesa}` : ''}`],
    ...(lugar ? ([['Lugar', lugar]] as Array<[string, string]>) : []),
    ...(tipo === 'confirmada' && d.politica ? ([['Política', d.politica]] as Array<[string, string]>) : []),
  ];

  const asunto =
    tipo === 'confirmada'
      ? `Tu mesa en ${d.sede ?? d.organizacion} está confirmada · ${codigo}`
      : `No pudimos confirmar tu reserva en ${d.sede ?? d.organizacion}`;

  const frase =
    tipo === 'confirmada'
      ? `¡Listo, ${nombre}! Tu mesa está confirmada.`
      : `Hola ${nombre}, no tenemos mesa para ${d.party_size} el ${dia} a las ${hora}.` +
        (d.cancellation_reason ? ` Motivo: ${d.cancellation_reason}.` : '') +
        (opciones.otraHora ? ` ¿Te sirve a las ${hora12(opciones.otraHora)}? Reserva de nuevo y te la guardamos.` : '');

  const boton = (href: string | null, texto: string) =>
    href
      ? `<p><a href="${escaparHtml(href)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111;color:#fff;text-decoration:none">${escaparHtml(texto)}</a></p>`
      : '';

  const html = `<!doctype html><html lang="es"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
<p>${escaparHtml(frase)}</p>
<table style="border-collapse:collapse;margin:16px 0">${filas
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${escaparHtml(k)}</td><td style="padding:4px 0;font-weight:600">${escaparHtml(v)}</td></tr>`)
    .join('')}</table>
${tipo === 'confirmada' ? boton(opciones.enlaceGestion, 'Consultar o cancelar') : boton(opciones.enlaceReservar, 'Reservar de nuevo')}
<p style="color:#555;font-size:13px">Código de la reserva: ${escaparHtml(codigo)} · ${escaparHtml(d.organizacion)}</p>
</body></html>`;

  const texto = [
    frase,
    '',
    ...filas.map(([k, v]) => `${k}: ${v}`),
    '',
    ...(tipo === 'confirmada'
      ? opciones.enlaceGestion
        ? [`Consultar o cancelar: ${opciones.enlaceGestion}`]
        : []
      : opciones.enlaceReservar
        ? [`Reservar de nuevo: ${opciones.enlaceReservar}`]
        : []),
    `Código de la reserva: ${codigo} · ${d.organizacion}`,
  ].join('\n');

  return { asunto, html, texto };
}
