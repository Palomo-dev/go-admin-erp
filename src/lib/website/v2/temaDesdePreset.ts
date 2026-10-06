/**
 * Escribe en el documento V2 la plantilla, el estilo o el color del logo que se
 * eligen en el asistente (Figma A/03b-03c) —y que reutilizan Plantillas y
 * Diseño—: solo `documento.tema` (y `identidad`/`contenido` en el paso de
 * datos). Puro e inmutable: devuelve un documento nuevo, que se guarda con
 * `useSitioV2().guardar` (compare-and-swap por versión).
 *
 * La estructura (páginas y secciones) NO cambia al elegir plantilla: el
 * contenido existente se conserva (ADR-002 D4). Solo cambia `plantillaBase` y
 * el tema de esa plantilla.
 */
import { valorPropio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { ajustarHastaContraste, normalizarHex } from '@/lib/utils/contrasteColor';

/** Lo que el documento necesita de un preset (catálogo de plantillas y estilos). */
export interface PresetTema {
  id: string;
  modo: 'light' | 'dark';
  primario: string;
  secundario: string;
  fuenteTitulos: string;
  fuenteCuerpo: string;
}

/** Fondo que pinta el sitio según el modo (para verificar el contraste del acento). */
export function fondoDelModo(modo: 'light' | 'dark', secundario: string): string {
  return modo === 'dark' ? secundario : '#FFFFFF';
}

function conTema(documento: DocumentoSitio, cambiar: (tema: DocumentoSitio['tema']) => DocumentoSitio['tema']): DocumentoSitio {
  return { ...documento, tema: cambiar({ ...documento.tema, colores: { ...documento.tema.colores }, tipografia: { ...documento.tema.tipografia } }) };
}

/** Estilo: modo, colores y par tipográfico del preset. No toca la plantilla base. */
export function aplicarEstilo(documento: DocumentoSitio, preset: PresetTema): DocumentoSitio {
  return conTema(documento, (tema) => ({
    ...tema,
    modo: valorPropio(preset.modo),
    colores: { ...tema.colores, primario: valorPropio(preset.primario), secundario: valorPropio(preset.secundario) },
    tipografia: { ...tema.tipografia, titulos: valorPropio(preset.fuenteTitulos), cuerpo: valorPropio(preset.fuenteCuerpo) },
  }));
}

/** Plantilla: `plantillaBase` y, como punto de partida, el estilo de esa plantilla. */
export function aplicarPlantilla(documento: DocumentoSitio, preset: PresetTema): DocumentoSitio {
  const conEstilo = aplicarEstilo(documento, preset);
  return { ...conEstilo, tema: { ...conEstilo.tema, plantillaBase: valorPropio(preset.id) } };
}

/**
 * Acento tomado del logo, corregido hasta AA contra el fondo del modo actual.
 * `null` si el color no es un hex válido.
 */
export function acentoDesdeLogo(color: string, fondo: string): string | null {
  const hex = normalizarHex(color);
  return hex ? ajustarHastaContraste(hex, fondo) : null;
}

export function aplicarAcento(documento: DocumentoSitio, acento: string): DocumentoSitio {
  return conTema(documento, (tema) => ({ ...tema, colores: { ...tema.colores, primario: valorPropio(acento) } }));
}

export interface DatosNegocioSitio {
  nombre: string;
  logoUrl: string | null;
  /** Enlace `https://wa.me/<dígitos>` o `null` para no tocarlo. */
  whatsapp: string | null;
}

/** Paso «Datos del negocio»: solo el sitio (identidad y redes), nunca la organización. */
export function aplicarDatosNegocio(documento: DocumentoSitio, datos: DatosNegocioSitio): DocumentoSitio {
  const redesActuales = documento.contenido.redesSociales?.mode === 'value' ? documento.contenido.redesSociales.value : {};
  const redes = { ...redesActuales };
  if (datos.whatsapp) redes.whatsapp = datos.whatsapp;
  else delete redes.whatsapp;
  return {
    ...documento,
    identidad: {
      ...documento.identidad,
      nombre: valorPropio(datos.nombre.trim()),
      ...(datos.logoUrl ? { logoUrl: valorPropio(datos.logoUrl) } : {}),
    },
    contenido: { ...documento.contenido, redesSociales: valorPropio(redes) },
  };
}

/**
 * WhatsApp escrito por la persona → `https://wa.me/<dígitos>`. Acepta «+57 300
 * 000 0000», «573000000000» o un enlace wa.me. Entre 8 y 15 dígitos (E.164).
 * Vacío → `''`; inválido → `null`.
 */
export function enlaceWhatsapp(texto: string): string | null | '' {
  const limpio = texto.trim();
  if (!limpio) return '';
  const digitos = limpio.replace(/^https?:\/\/(wa\.me|api\.whatsapp\.com\/send\?phone=)\/?/i, '').replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 15 ? `https://wa.me/${digitos}` : null;
}

/** `https://wa.me/573000000000` → `+573000000000` (para mostrarlo en el campo). */
export function whatsappLegible(enlace: string | null | undefined): string {
  if (!enlace) return '';
  const digitos = enlace.replace(/\D/g, '');
  return digitos ? `+${digitos}` : '';
}
