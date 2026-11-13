/**
 * Canales del módulo Chat: el valor que usa la interfaz y su apariencia.
 * Figma sección 91 (`91-chat-00-componentes`): cuadro de color de la marca del
 * canal con el ícono en blanco. Funciones puras, sin React.
 *
 * Los colores de marca de terceros (WhatsApp, Instagram…) son la única
 * excepción a los tokens: se toman de la paleta de Tailwind, nunca hex sueltos,
 * y viven SOLO aquí.
 */

/** Canal tal como lo nombra la interfaz (API de `<CanalIcono canal=…>`). */
export type Canal = 'whatsapp' | 'instagram' | 'facebook' | 'web' | 'telegram' | 'correo';

export const CANALES: readonly Canal[] = ['whatsapp', 'instagram', 'facebook', 'web', 'telegram', 'correo'];

/**
 * Canal de la interfaz a partir de `channels.type` (BD: `website`, `whatsapp`,
 * `instagram`, `facebook`) o de cualquier alias conocido. Lo desconocido se
 * muestra como «web» (el widget del sitio es el canal genérico).
 */
export function canalDeTipo(tipo: string | null | undefined): Canal {
  switch ((tipo ?? '').toLowerCase()) {
    case 'whatsapp':
      return 'whatsapp';
    case 'instagram':
      return 'instagram';
    case 'facebook':
    case 'messenger':
      return 'facebook';
    case 'telegram':
      return 'telegram';
    case 'email':
    case 'correo':
      return 'correo';
    default:
      return 'web';
  }
}

/** Fondo del cuadro del ícono. */
export const FONDO_CANAL: Record<Canal, string> = {
  whatsapp: 'bg-green-500',
  instagram: 'bg-pink-600',
  facebook: 'bg-blue-600',
  web: 'bg-brand',
  telegram: 'bg-sky-500',
  correo: 'bg-gray-500',
};
