/**
 * Botones de compra de la ficha de producto (Figma «16 Sitio web», sección 2779:65038, aprobada
 * por el dueño el 2026-11-22).
 *
 * Vive en el contenido del bloque `product_actions` de la plantilla de la ficha, dentro del
 * documento del sitio (sin columnas nuevas ni migraciones, ADR-002):
 * - `actions`: lista ORDENADA de botones `{ tipo, visible, tamano, estilo, texto?, textoCorto?,
 *   compartirFila? }`. Es lo que pinta la tienda.
 * - `preset`: la distribución lista que coincide con `actions` (o `personalizada`). La escribe el
 *   editor; la tienda solo la usa cuando no hay `actions`.
 *
 * Sin ninguna de las dos claves → «Clásica»: cantidad; «Agregar al carrito» largo + corazón
 * pequeño en la misma fila; «Comprar ahora» largo con borde. Compatibilidad: `buttons_layout:
 * 'inline'` se lee como «Dos a la mitad»; `stacked` y `split`, como «Clásica».
 * `show_price_in_button` y `button_hint` siguen igual y aplican a «Agregar».
 *
 * Regla de filas (frame E, 2789:383652), en {@link armarFilas}.
 *
 * Código puro: lo usan el editor (ERP), la tienda y sus pruebas. goadmin-websites guarda una copia
 * IDÉNTICA en `lib/website/v2/accionesFicha.ts` (`npm run verify:copias` allá compara las dos).
 */

// ─── Catálogo ───────────────────────────────────────────────────────────────────────────────

export const TIPOS_ACCION_FICHA = ['cantidad', 'agregar', 'comprar', 'favorito', 'whatsapp', 'compartir'] as const;
export type TipoAccionFicha = (typeof TIPOS_ACCION_FICHA)[number];

/** Largo ocupa la fila · Mitad comparte con otra Mitad · Pequeño es un cuadrado de 48 px (solo ícono). */
export const TAMANOS_ACCION_FICHA = ['largo', 'mitad', 'pequeno'] as const;
export type TamanoAccionFicha = (typeof TAMANOS_ACCION_FICHA)[number];

export const ESTILOS_ACCION_FICHA = ['relleno', 'borde', 'enlace'] as const;
export type EstiloAccionFicha = (typeof ESTILOS_ACCION_FICHA)[number];

export const DISTRIBUCIONES_FICHA = ['clasica', 'dos_mitad', 'compacta', 'solo_agregar', 'comprar_primero', 'con_whatsapp'] as const;
export type DistribucionFicha = (typeof DISTRIBUCIONES_FICHA)[number];

export const PRESETS_FICHA = [...DISTRIBUCIONES_FICHA, 'personalizada'] as const;
export type PresetFicha = (typeof PRESETS_FICHA)[number];

/** Clave de cada parte en el contenido de `product_actions`. */
export const CLAVE_ACCIONES_FICHA = 'actions' as const;
export const CLAVE_PRESET_FICHA = 'preset' as const;

export const MAX_TEXTO_ACCION_FICHA = 40;
export const MAX_TEXTO_CORTO_ACCION_FICHA = 20;
/** Regla 6: el cuarto elemento empieza fila nueva. */
export const MAX_POR_FILA_FICHA = 3;

export interface AccionFicha {
  tipo: TipoAccionFicha;
  visible: boolean;
  /** En «cantidad» no se usa (toma su ancho). */
  tamano: TamanoAccionFicha;
  /** En «cantidad» no se usa. */
  estilo: EstiloAccionFicha;
  /** Vacío = el texto por defecto. */
  texto?: string;
  /** Texto en el celular cuando el botón comparte fila (vacío = el corto por defecto). */
  textoCorto?: string;
  /** Une este elemento con el siguiente aunque la regla no los uniría (cantidad + Agregar). */
  compartirFila?: boolean;
}

/** Lo que dice la tienda sin texto propio (el sitio público está en español). */
export const TEXTOS_ACCION_FICHA: Readonly<Record<TipoAccionFicha, { texto: string; corto: string }>> = {
  cantidad: { texto: 'Cantidad', corto: 'Cantidad' },
  agregar: { texto: 'Agregar al carrito', corto: 'Agregar' },
  comprar: { texto: 'Comprar ahora', corto: 'Comprar' },
  favorito: { texto: 'Guardar', corto: 'Guardar' },
  whatsapp: { texto: 'Pedir por WhatsApp', corto: 'WhatsApp' },
  compartir: { texto: 'Compartir', corto: 'Compartir' },
};

/** «Agregar al carrito» no se puede ocultar (decisión del dueño, 2026-11-22). */
export const TIPOS_SIEMPRE_VISIBLES: readonly TipoAccionFicha[] = ['agregar'];

// ─── Distribuciones listas (frames B, 2782:65852 a 2782:66263) ─────────────────────────────

const a = (
  tipo: TipoAccionFicha,
  tamano: TamanoAccionFicha,
  estilo: EstiloAccionFicha,
  extra: { visible?: boolean; compartirFila?: boolean } = {},
): AccionFicha => ({
  tipo,
  visible: extra.visible ?? true,
  tamano,
  estilo,
  ...(extra.compartirFila ? { compartirFila: true } : {}),
});

const CANTIDAD = a('cantidad', 'largo', 'borde');
const FAVORITO = a('favorito', 'pequeno', 'borde');
const WHATSAPP_OCULTO = a('whatsapp', 'mitad', 'borde', { visible: false });
const COMPARTIR_OCULTO = a('compartir', 'pequeno', 'borde', { visible: false });

export const DISTRIBUCIONES: Readonly<Record<DistribucionFicha, readonly AccionFicha[]>> = {
  // 1 · Cantidad arriba · Agregar (Largo) + corazón (Pequeño) · Comprar ahora con borde (Largo).
  clasica: [CANTIDAD, a('agregar', 'largo', 'relleno'), FAVORITO, a('comprar', 'largo', 'borde'), WHATSAPP_OCULTO, COMPARTIR_OCULTO],
  // 2 · Corazón al lado de la cantidad · Agregar y Comprar ahora a la mitad.
  dos_mitad: [CANTIDAD, FAVORITO, a('agregar', 'mitad', 'relleno'), a('comprar', 'mitad', 'borde'), WHATSAPP_OCULTO, COMPARTIR_OCULTO],
  // 3 · Cantidad + Agregar + corazón en una fila · Comprar ahora como enlace debajo.
  compacta: [
    a('cantidad', 'largo', 'borde', { compartirFila: true }),
    a('agregar', 'largo', 'relleno'),
    FAVORITO,
    a('comprar', 'largo', 'enlace'),
    WHATSAPP_OCULTO,
    COMPARTIR_OCULTO,
  ],
  // 4 · Sin «Comprar ahora».
  solo_agregar: [CANTIDAD, a('agregar', 'largo', 'relleno'), FAVORITO, a('comprar', 'largo', 'borde', { visible: false }), WHATSAPP_OCULTO, COMPARTIR_OCULTO],
  // 5 · Comprar ahora es el principal (relleno) con el corazón al lado · Agregar con borde debajo.
  comprar_primero: [CANTIDAD, a('comprar', 'largo', 'relleno'), FAVORITO, a('agregar', 'largo', 'borde'), WHATSAPP_OCULTO, COMPARTIR_OCULTO],
  // 6 · Agregar + corazón · Comprar ahora y «Pedir por WhatsApp» a la mitad.
  con_whatsapp: [CANTIDAD, a('agregar', 'largo', 'relleno'), FAVORITO, a('comprar', 'mitad', 'borde'), a('whatsapp', 'mitad', 'borde'), COMPARTIR_OCULTO],
};

// ─── Lectura ────────────────────────────────────────────────────────────────────────────────

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const unoDe = <T extends string>(lista: readonly T[], v: unknown): T | null =>
  typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : null;

/** Texto recortado y con espacios simples; `null` si queda vacío. Pasado de `max`, se corta. */
function textoLimpio(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const limpio = v.trim().replace(/\s+/g, ' ');
  if (!limpio) return null;
  return limpio.length <= max ? limpio : limpio.slice(0, max).trimEnd();
}

const copia = (lista: readonly AccionFicha[]): AccionFicha[] => lista.map((x) => ({ ...x }));

/** Lo de la «Clásica» para un tipo (lo que se completa cuando falta o viene mal). */
function porDefecto(tipo: TipoAccionFicha): AccionFicha {
  return { ...(DISTRIBUCIONES.clasica.find((x) => x.tipo === tipo) as AccionFicha) };
}

/** Un botón guardado → botón válido. `null` si no se reconoce el tipo. */
export function leerAccion(crudo: unknown): AccionFicha | null {
  const o = objeto(crudo);
  if (!o) return null;
  const tipo = unoDe(TIPOS_ACCION_FICHA, o.tipo);
  if (!tipo) return null;
  const base = porDefecto(tipo);
  const accion: AccionFicha = {
    tipo,
    visible: TIPOS_SIEMPRE_VISIBLES.includes(tipo) ? true : typeof o.visible === 'boolean' ? o.visible : true,
    tamano: unoDe(TAMANOS_ACCION_FICHA, o.tamano) ?? base.tamano,
    estilo: unoDe(ESTILOS_ACCION_FICHA, o.estilo) ?? base.estilo,
  };
  const texto = textoLimpio(o.texto, MAX_TEXTO_ACCION_FICHA);
  const corto = textoLimpio(o.textoCorto, MAX_TEXTO_CORTO_ACCION_FICHA);
  if (texto) accion.texto = texto;
  if (corto) accion.textoCorto = corto;
  if (o.compartirFila === true) accion.compartirFila = true;
  return accion;
}

/**
 * Lista guardada → lista válida: descarta lo que no se reconoce y los tipos repetidos (gana el
 * primero), y agrega al final los tipos que falten como en la «Clásica» (ocultos, salvo «Agregar»).
 * `null` si no hay ningún botón reconocible.
 */
export function leerListaAcciones(crudo: unknown): AccionFicha[] | null {
  if (!Array.isArray(crudo)) return null;
  const lista: AccionFicha[] = [];
  for (const item of crudo) {
    const accion = leerAccion(item);
    if (accion && !lista.some((x) => x.tipo === accion.tipo)) lista.push(accion);
  }
  if (lista.length === 0) return null;
  for (const tipo of TIPOS_ACCION_FICHA) {
    if (!lista.some((x) => x.tipo === tipo)) {
      lista.push({ ...porDefecto(tipo), visible: TIPOS_SIEMPRE_VISIBLES.includes(tipo) });
    }
  }
  return lista;
}

/** Misma forma (orden, visibilidad, tamaño, estilo y unión de filas), sin mirar los textos. */
function mismaForma(x: readonly AccionFicha[], y: readonly AccionFicha[]): boolean {
  if (x.length !== y.length) return false;
  return x.every((p, i) => {
    const q = y[i];
    if (p.tipo !== q.tipo || p.visible !== q.visible || !!p.compartirFila !== !!q.compartirFila) return false;
    // La cantidad no tiene tamaño ni estilo propios.
    return p.tipo === 'cantidad' || (p.tamano === q.tamano && p.estilo === q.estilo);
  });
}

/** La distribución lista que coincide con la lista (los textos no cuentan) o `personalizada`. */
export function presetDe(acciones: readonly AccionFicha[]): PresetFicha {
  return DISTRIBUCIONES_FICHA.find((d) => mismaForma(DISTRIBUCIONES[d], acciones)) ?? 'personalizada';
}

export interface AccionesFichaLeidas {
  preset: PresetFicha;
  acciones: AccionFicha[];
  /** `false` = no hay nada nuevo guardado (se pinta la «Clásica» o la compatibilidad). */
  configurado: boolean;
}

/** Contenido de `product_actions` → botones de la ficha. Nunca lanza. */
export function leerAccionesFicha(contenido: Record<string, unknown> | null | undefined): AccionesFichaLeidas {
  const c = objeto(contenido) ?? {};
  const lista = leerListaAcciones(c[CLAVE_ACCIONES_FICHA]);
  if (lista) return { preset: presetDe(lista), acciones: lista, configurado: true };
  const preset = unoDe(DISTRIBUCIONES_FICHA, c[CLAVE_PRESET_FICHA]);
  if (preset) return { preset, acciones: copia(DISTRIBUCIONES[preset]), configurado: true };
  // Compatibilidad con la «Disposición de botones» de antes (page_settings.buttons_layout).
  const viejo: DistribucionFicha = c.buttons_layout === 'inline' ? 'dos_mitad' : 'clasica';
  return { preset: viejo, acciones: copia(DISTRIBUCIONES[viejo]), configurado: false };
}

// ─── Cambios del editor ─────────────────────────────────────────────────────────────────────

/** Elegir una distribución lista CONSERVA los textos escritos (decisión del dueño). */
export function aplicarDistribucion(actuales: readonly AccionFicha[], distribucion: DistribucionFicha): AccionFicha[] {
  return DISTRIBUCIONES[distribucion].map((base) => {
    const previa = actuales.find((x) => x.tipo === base.tipo);
    const accion: AccionFicha = { ...base };
    if (previa?.texto) accion.texto = previa.texto;
    if (previa?.textoCorto) accion.textoCorto = previa.textoCorto;
    return accion;
  });
}

/** Mueve `tipo` al lugar de `sobre` (arrastrar y soltar). */
export function moverAccion(acciones: readonly AccionFicha[], tipo: TipoAccionFicha, sobre: TipoAccionFicha): AccionFicha[] {
  const desde = acciones.findIndex((x) => x.tipo === tipo);
  const hasta = acciones.findIndex((x) => x.tipo === sobre);
  if (desde < 0 || hasta < 0 || desde === hasta) return [...acciones];
  const lista = [...acciones];
  const [movida] = lista.splice(desde, 1);
  lista.splice(hasta, 0, movida);
  return lista;
}

/** Cambia un botón. «Agregar» nunca queda oculto y los textos vacíos se quitan. */
export function cambiarAccion(acciones: readonly AccionFicha[], tipo: TipoAccionFicha, cambio: Partial<Omit<AccionFicha, 'tipo'>>): AccionFicha[] {
  return acciones.map((x) => {
    if (x.tipo !== tipo) return x;
    const crudo = { ...x, ...cambio };
    return leerAccion(crudo) ?? x;
  });
}

/** Lista limpia para guardar: sin claves vacías ni `compartirFila: false`. */
export function serializarAcciones(acciones: readonly AccionFicha[]): AccionFicha[] {
  return acciones.map((x) => leerAccion(x) ?? x);
}

/** El contenido del bloque con la lista nueva y su `preset`. El resto de claves no se toca. */
export function contenidoConAcciones(contenido: Record<string, unknown>, acciones: readonly AccionFicha[]): Record<string, unknown> {
  const lista = serializarAcciones(acciones);
  return { ...contenido, [CLAVE_ACCIONES_FICHA]: lista, [CLAVE_PRESET_FICHA]: presetDe(lista) };
}

// ─── Regla de filas (frame E) ───────────────────────────────────────────────────────────────

/** Cómo ocupa la fila: la cantidad y el Pequeño toman su ancho; Largo y Mitad reparten el resto. */
export type FormaAccionFicha = 'cantidad' | 'largo' | 'mitad' | 'pequeno';

/** Regla 7: un Enlace (no pequeño) ocupa la fila como un Largo. */
export function formaDe(accion: AccionFicha): FormaAccionFicha {
  if (accion.tipo === 'cantidad') return 'cantidad';
  if (accion.tamano === 'pequeno') return 'pequeno';
  if (accion.estilo === 'enlace') return 'largo';
  return accion.tamano;
}

/**
 * Qué botones existen en esta ficha. `false` = no se pinta y no cuenta para las filas (regla 9):
 * el corazón con «Corazón en la ficha» apagado o en un restaurante, WhatsApp sin número…
 */
export type DisponibilidadAcciones = Partial<Record<TipoAccionFicha, boolean>>;

/** Los que se pintan: visibles y disponibles. */
export function accionesVisibles(acciones: readonly AccionFicha[], disponibles: DisponibilidadAcciones = {}): AccionFicha[] {
  return acciones.filter((x) => (x.visible || TIPOS_SIEMPRE_VISIBLES.includes(x.tipo)) && disponibles[x.tipo] !== false);
}

/**
 * Arma las filas (frame E). Los botones se leen en orden; cada uno entra en la fila actual o
 * empieza una nueva:
 * 1. Largo ocupa la fila; un Pequeño justo después se le pega (el Largo se encoge).
 * 2. Dos Mitad seguidos comparten la fila; una Mitad sola se estira a todo el ancho.
 * 3. Pequeño se pega al anterior. Si empieza la fila, el siguiente se le pega a él.
 * 4. «Compartir fila con el siguiente» une dos que no se unirían solos.
 * 5. Máximo {@link MAX_POR_FILA_FICHA} por fila.
 * Igual en escritorio y celular. Recibe solo los que se pintan ({@link accionesVisibles}).
 */
export function armarFilas(acciones: readonly AccionFicha[]): AccionFicha[][] {
  const filas: AccionFicha[][] = [];
  let fila: AccionFicha[] | null = null;
  for (const accion of acciones) {
    const forma = formaDe(accion);
    const previa = fila ? fila[fila.length - 1] : null;
    let unir = false;
    if (fila && previa && fila.length < MAX_POR_FILA_FICHA) {
      const formaPrevia = formaDe(previa);
      if (forma === 'pequeno') unir = true;
      else if (previa.compartirFila) unir = true;
      else if (fila.length === 1 && formaPrevia === 'pequeno') unir = true;
      else if (
        forma === 'mitad' &&
        formaPrevia === 'mitad' &&
        fila.filter((x) => formaDe(x) === 'mitad').length === 1 &&
        fila.every((x) => formaDe(x) === 'mitad' || formaDe(x) === 'pequeno')
      ) {
        unir = true;
      }
    }
    if (fila && unir) {
      fila.push(accion);
    } else {
      fila = [accion];
      filas.push(fila);
    }
  }
  return filas;
}

/** Celular (regla 8): un botón que comparte su fila con otro que no es Pequeño usa su texto corto. */
export function usaTextoCorto(fila: readonly AccionFicha[], accion: AccionFicha): boolean {
  if (accion.tipo === 'cantidad' || formaDe(accion) === 'pequeno') return false;
  return fila.filter((x) => formaDe(x) !== 'pequeno').length > 1;
}

/** La cantidad lleva su etiqueta «Cantidad» cuando no comparte la fila con un botón de texto. */
export function cantidadConEtiqueta(fila: readonly AccionFicha[]): boolean {
  return fila.every((x) => x.tipo === 'cantidad' || formaDe(x) === 'pequeno');
}

export function textoDeAccion(accion: AccionFicha): string {
  return accion.texto || TEXTOS_ACCION_FICHA[accion.tipo].texto;
}

export function textoCortoDeAccion(accion: AccionFicha): string {
  return accion.textoCorto || TEXTOS_ACCION_FICHA[accion.tipo].corto;
}

// ─── WhatsApp ───────────────────────────────────────────────────────────────────────────────

/** Número del sitio (Configuración › Contacto) → dígitos para wa.me. 10 dígitos = Colombia. `null` si no sirve. */
export function numeroWhatsappFicha(numero: unknown): string | null {
  if (typeof numero !== 'string') return null;
  const digitos = numero.replace(/\D/g, '');
  if (digitos.length < 7) return null;
  return digitos.length === 10 ? `57${digitos}` : digitos;
}

/** «Hola, me interesa Audífonos X200 (Color: Negro). https://…» */
export function mensajeWhatsappFicha(producto: string, variante: string | null | undefined, enlace: string): string {
  const nombre = producto.trim().replace(/\s+/g, ' ');
  const detalle = (variante ?? '').trim();
  return `Hola, me interesa ${nombre}${detalle ? ` (${detalle})` : ''}. ${enlace}`.trim();
}

/** Enlace wa.me con el mensaje. `null` sin número válido (el botón no sale). */
export function enlaceWhatsappFicha(numero: unknown, mensaje: string): string | null {
  const n = numeroWhatsappFicha(numero);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}` : null;
}
