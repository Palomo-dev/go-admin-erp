/**
 * A quién se le escribe al agendar una reunión, y el texto del correo.
 * El envío está en `reunionCorreo.server.ts`.
 */

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type RolCorreoReunion = 'cliente' | 'responsable' | 'participante';

export interface DestinatarioReunion {
  correo: string;
  rol: RolCorreoReunion;
}

export interface AvisoReunion {
  cliente: boolean;
  responsable: boolean;
}

/** Vacío o inválido no es un correo. */
export function correoValido(valor: string | null | undefined): string | null {
  const limpio = (valor ?? '').trim().toLowerCase();
  return CORREO.test(limpio) ? limpio : null;
}

/**
 * El cliente entra solo si tiene correo. El responsable entra igual.
 * Si los dos comparten dirección, queda como cliente: así se respeta
 * si pidió no recibir correos. Un participante repetido no se escribe dos veces.
 */
export function destinatariosReunion(entrada: {
  correoCliente?: string | null;
  correoResponsable?: string | null;
  otros?: readonly string[] | null;
}): DestinatarioReunion[] {
  const salida: DestinatarioReunion[] = [];
  const vistos = new Set<string>();
  const poner = (valor: string | null | undefined, rol: RolCorreoReunion) => {
    const correo = correoValido(valor);
    if (!correo || vistos.has(correo)) return;
    vistos.add(correo);
    salida.push({ correo, rol });
  };
  poner(entrada.correoCliente, 'cliente');
  poner(entrada.correoResponsable, 'responsable');
  for (const otro of entrada.otros ?? []) poner(otro, 'participante');
  return salida;
}

/** Clave de `crm.accionesRapidas.toast`. */
export function claveToastReunion(aviso: { cliente?: boolean; responsable?: boolean } | null | undefined): 'reunion' | 'reunionCorreo' | 'reunionCorreoCliente' | 'reunionCorreoResponsable' {
  if (aviso?.cliente && aviso?.responsable) return 'reunionCorreo';
  if (aviso?.cliente) return 'reunionCorreoCliente';
  if (aviso?.responsable) return 'reunionCorreoResponsable';
  return 'reunion';
}

/** Texto del diálogo que no pasa por los archivos de idioma. */
export function detalleAvisoReunion(aviso: { cliente?: boolean; responsable?: boolean } | null | undefined): string {
  if (aviso?.cliente && aviso?.responsable) return 'Enviamos el correo al cliente y al responsable.';
  if (aviso?.cliente) return 'Enviamos el correo al cliente.';
  if (aviso?.responsable) return 'Enviamos el correo al responsable.';
  return 'Visible en el timeline y en el calendario.';
}

function escapar(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** El render del correo trata `{{ }}` como variable. Un título no debe dispararlo. */
export function sinMarcasDeVariable(valor: string): string {
  return valor.replace(/\{\{/g, '{').replace(/\}\}/g, '}');
}

export function textoReunion(entrada: {
  titulo: string;
  cuando: string;
  zona: string;
  cliente?: string | null;
  lugar?: string | null;
  agenda?: string | null;
  conArchivo: boolean;
}): { asunto: string; texto: string; html: string } {
  const titulo = sinMarcasDeVariable(entrada.titulo.trim() || 'Reunión');
  const lineas = [`Quedó agendada la reunión «${titulo}».`, `Cuándo: ${entrada.cuando} (${entrada.zona}).`];
  const cliente = (entrada.cliente ?? '').trim();
  const lugar = (entrada.lugar ?? '').trim();
  const agenda = (entrada.agenda ?? '').trim();
  if (cliente) lineas.push(`Cliente: ${sinMarcasDeVariable(cliente)}.`);
  if (lugar) lineas.push(`Lugar: ${sinMarcasDeVariable(lugar)}.`);
  if (agenda) lineas.push(sinMarcasDeVariable(agenda));
  if (entrada.conArchivo) lineas.push('El archivo adjunto se abre en el calendario.');
  const texto = lineas.join('\n\n');
  const html = lineas.map((linea) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#475569;">${escapar(linea)}</p>`).join('');
  return { asunto: `Reunión: ${titulo}`, texto, html: `<div style="font-family:Inter,Arial,sans-serif;color:#0F172A;">${html}</div>` };
}
