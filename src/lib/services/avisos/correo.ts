/**
 * Correo de aviso al miembro. Sigue el manual de marca:
 * isotipo Azul GO, firma GO Admin sobre superficie, boton Azul accion.
 */

const AZUL_GO = '#4361EE';
const AZUL_ACCION = '#3651D4';
const TINTA = '#0F172A';
const PIZARRA = '#475569';
const FONDO = '#F8FAFF';
const SUPERFICIE = '#FFFFFF';
const LINEA = '#E2E8F0';

export interface ContenidoCorreoAviso {
  titulo: string;
  cuerpo: string;
  enlace: string;
}

export function urlAbsoluta(href: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.goadmin.io').replace(/\/$/, '');
  if (/^https?:\/\//i.test(href)) return href;
  return `${base}${href.startsWith('/') ? href : `/${href}`}`;
}

function escapar(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function htmlAviso(contenido: ContenidoCorreoAviso): string {
  const titulo = escapar(contenido.titulo);
  const cuerpo = escapar(contenido.cuerpo);
  const enlace = escapar(contenido.enlace);
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:24px;background:${FONDO};font-family:Inter,Arial,sans-serif;color:${TINTA};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:${SUPERFICIE};border:1px solid ${LINEA};border-radius:12px;">
    <tr>
      <td style="padding:20px 24px;border-bottom:1px solid ${LINEA};">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;background:${AZUL_GO};border-radius:9px;color:#ffffff;font-weight:700;font-size:11px;line-height:32px;font-family:Inter,Arial,sans-serif;">GO</td>
            <td style="padding-left:11px;font-size:19px;line-height:32px;font-family:Inter,Arial,sans-serif;color:${TINTA};"><span style="font-weight:700;">GO</span><span style="font-weight:500;"> Admin</span></td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;font-weight:700;color:${TINTA};">${titulo}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${PIZARRA};">${cuerpo}</p>
        <a href="${enlace}" style="display:inline-block;background:${AZUL_ACCION};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;">Ver en GO Admin</a>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px;border-top:1px solid ${LINEA};font-size:12px;line-height:1.4;color:${PIZARRA};">
        Puede silenciar estos avisos en su perfil.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function textoPlanoAviso(contenido: ContenidoCorreoAviso): string {
  return `${contenido.titulo}\n\n${contenido.cuerpo}\n\nVer en GO Admin: ${contenido.enlace}\n\nPuede silenciar estos avisos en su perfil.`;
}

export function textoContacto(nombre: string): { titulo: string; cuerpo: string } {
  const limpio = nombre.trim() || 'Sin nombre';
  return { titulo: 'Hoy toca contactar', cuerpo: `«${limpio}» tiene seguimiento hoy.` };
}

/** Un solo correo cuando el seguimiento y el cierre caen el mismo día. */
export function unirSeguimientoYCierre(cuerpoContacto: string, clase: 'vence' | 'atrasada'): string {
  const base = cuerpoContacto.replace(/\.$/, '');
  if (clase === 'vence') return `${base} y también llega hoy a su fecha de cierre.`;
  return `${base} y su fecha de cierre ya pasó.`;
}

export function textoCartera(entrada: {
  porCobrar: number;
  saldoCobrar: string;
  porPagar: number;
  saldoPagar: string;
}): { titulo: string; cuerpo: string } | null {
  if (entrada.porCobrar <= 0 && entrada.porPagar <= 0) return null;
  return {
    titulo: 'Cartera vencida de hoy',
    cuerpo: `Hay ${entrada.porCobrar} cuentas por cobrar vencidas (${entrada.saldoCobrar}) y ${entrada.porPagar} por pagar (${entrada.saldoPagar}).`,
  };
}

/** Hasta 8 nombres en total. El resto se cuenta, no se enumera. */
export function textoInventarioCero(grupos: { sucursal: string; nombres: string[] }[]): { titulo: string; cuerpo: string } | null {
  const total = grupos.reduce((suma, grupo) => suma + grupo.nombres.length, 0);
  if (total === 0) return null;
  const tope = 8;
  const partes: string[] = [];
  let mostrados = 0;
  let ocultos = 0;
  for (const grupo of grupos) {
    const cupo = tope - mostrados;
    if (cupo <= 0) {
      ocultos += grupo.nombres.length;
      continue;
    }
    const visibles = grupo.nombres.slice(0, cupo);
    mostrados += visibles.length;
    const resto = grupo.nombres.length - visibles.length;
    const lista = visibles.map((nombre) => `«${nombre.trim() || 'Sin nombre'}»`).join(', ');
    partes.push(`En ${grupo.sucursal}: ${lista}${resto > 0 ? ` y ${resto} más` : ''}.`);
  }
  const cierre = ocultos > 0 ? ` Y ${ocultos} más en otras sucursales.` : '';
  return {
    titulo: 'Productos en cero',
    cuerpo: `Hay ${total} productos sin existencias. ${partes.join(' ')}${cierre}`,
  };
}

export function copiaVencimiento(evento: string, nombre: string): { titulo: string; cuerpo: string } | null {
  const limpio = nombre.trim() || 'Sin nombre';
  switch (evento) {
    case 'tarea.atrasada':
      return { titulo: 'Una tarea se atrasó', cuerpo: `La tarea «${limpio}» venció y sigue abierta.` };
    case 'tarea.vence':
      return { titulo: 'Una tarea vence hoy', cuerpo: `La tarea «${limpio}» vence hoy.` };
    case 'oportunidad.atrasada':
      return { titulo: 'La oportunidad se atrasó', cuerpo: `«${limpio}» pasó su fecha de cierre y sigue abierta.` };
    case 'oportunidad.vence':
      return { titulo: 'La oportunidad llega a su cierre', cuerpo: `«${limpio}» llega hoy a su fecha de cierre.` };
    default:
      return null;
  }
}
