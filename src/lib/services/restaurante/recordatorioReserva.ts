/**
 * Correo de recordatorio de la reserva de mesa (migración D5 +
 * `/api/cron/reservas-mesas`). Módulo puro: arma asunto, HTML y texto; el envío
 * lo hace la ruta de cron con el Resend de la plataforma.
 *
 * - Fecha: `reservation_date` es `date` y la hora es hora de pared de la sede:
 *   se formatean SIN convertir de zona (`formatPlainDate`).
 * - El enlace «Consultar o cancelar» es el de la página por token del sitio
 *   (`/reserva/mesa/<manage_token>`, goadmin-websites), en el host publicado.
 */
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { escaparHtml } from '@/lib/pos/mesas/qrMesa';

export interface DatosRecordatorio {
  customer_name: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  manage_token: string | null;
  sede: string | null;
  sede_direccion: string | null;
  organizacion: string;
}

export function enlaceGestionReserva(host: string | null, token: string | null): string | null {
  if (!host || !token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  return `https://${host}/reserva/mesa/${token}`;
}

export function correoRecordatorioReserva(d: DatosRecordatorio, enlace: string | null): { asunto: string; html: string; texto: string } {
  const dia = formatPlainDate(d.reservation_date, { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = d.reservation_time.slice(0, 5);
  const personas = `${d.party_size} ${d.party_size === 1 ? 'persona' : 'personas'}`;
  const lugar = [d.sede, d.sede_direccion].filter(Boolean).join(' · ');
  const asunto = `Recordatorio: tu reserva en ${d.organizacion} · ${dia} ${hora}`;
  const nombre = d.customer_name.split(' ')[0] || d.customer_name;

  const filas = [
    ['Día', dia],
    ['Hora', hora],
    ['Personas', personas],
    ...(lugar ? [['Lugar', lugar]] : []),
  ];

  const html = `<!doctype html><html lang="es"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px">
<p>Hola ${escaparHtml(nombre)}:</p>
<p>Te recordamos tu reserva en <strong>${escaparHtml(d.organizacion)}</strong>.</p>
<table style="border-collapse:collapse;margin:16px 0">${filas
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${escaparHtml(k)}</td><td style="padding:4px 0;font-weight:600">${escaparHtml(v)}</td></tr>`)
    .join('')}</table>
${enlace ? `<p><a href="${escaparHtml(enlace)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#111;color:#fff;text-decoration:none">Consultar o cancelar mi reserva</a></p>` : ''}
<p style="color:#555;font-size:13px">Si no puedes venir, cancélala con tiempo para que otra persona pueda usar la mesa.</p>
</body></html>`;

  const texto = [
    `Hola ${nombre}:`,
    '',
    `Te recordamos tu reserva en ${d.organizacion}.`,
    ...filas.map(([k, v]) => `${k}: ${v}`),
    '',
    ...(enlace ? [`Consultar o cancelar: ${enlace}`, ''] : []),
    'Si no puedes venir, cancélala con tiempo para que otra persona pueda usar la mesa.',
  ].join('\n');

  return { asunto, html, texto };
}
