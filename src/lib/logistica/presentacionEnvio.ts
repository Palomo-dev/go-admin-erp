/**
 * Presentación de zonas, cotización y peso (logística Fase 1). Puro: sin Supabase ni React.
 *
 * Lo usan la página Logística › Configuración (zonas, reglas y peso), el cobro del POS y el pedido
 * manual de Pedidos online. NO calcula el envío: el precio, la zona, el mínimo y el envío gratis
 * salen siempre de `logistica_cotizar_envio` (cotizacion.ts / cotizacionEnvioService). Aquí solo se
 * decide qué se muestra con lo que devolvió el servidor y cómo se busca el peso de un ítem.
 */
import { promesaEntrega, type CotizacionEnvio, type PromesaEntrega } from './cotizacion';
import type { UbicacionZona, ZonaEnvio, TipoUbicacion } from './zonas';

// ── Promesa y cobertura de una zona ─────────────────────────────────────────────────────────────

/** Cómo se escribe una promesa ya resuelta (sin texto libre). La pantalla pasa uno traducido. */
export type FormatoPromesa = (p: PromesaEntrega & { hasta: number }) => string;

/** Formato en español: «45–60 min», «2–4 horas», «3–15 días», «hasta 15 días». */
export const formatoPromesaEs: FormatoPromesa = (p) => {
  const palabra = (n: number) =>
    p.unidad === 'minutos' ? 'min' : p.unidad === 'horas' ? (n === 1 ? 'hora' : 'horas') : n === 1 ? 'día' : 'días';
  if (p.desde === null) return `${p.unidad === 'minutos' ? '' : 'hasta '}${p.hasta} ${palabra(p.hasta)}`;
  if (p.desde === p.hasta) return `${p.hasta} ${palabra(p.hasta)}`;
  return `${p.desde}–${p.hasta} ${palabra(p.hasta)}`;
};

/**
 * «30–45 min», «2–4 horas», «3–15 días», el texto libre de la zona o null. La unidad la decide
 * `promesaEntrega` (contrato compartido con la tienda): un envío nacional no se muestra en minutos.
 */
export function textoPromesa(
  z: Pick<ZonaEnvio, 'promise_min_minutes' | 'promise_max_minutes' | 'promise_text'> | null | undefined,
  formato: FormatoPromesa = formatoPromesaEs,
): string | null {
  if (!z) return null;
  const p = promesaEntrega({ min_minutos: z.promise_min_minutes, max_minutos: z.promise_max_minutes, texto: z.promise_text });
  if (!p) return null;
  if (p.texto) return p.texto;
  return p.hasta === null ? null : formato({ ...p, hasta: p.hasta });
}

/** Igual que `textoPromesa`, con el `tiempo` de una cotización. */
export function textoTiempoCotizacion(
  c: Pick<CotizacionEnvio, 'tiempo'> | null | undefined,
  formato: FormatoPromesa = formatoPromesaEs,
): string | null {
  if (!c?.tiempo) return null;
  return textoPromesa(
    { promise_min_minutes: c.tiempo.min_minutos, promise_max_minutes: c.tiempo.max_minutos, promise_text: c.tiempo.texto },
    formato,
  );
}

export interface GrupoCobertura {
  tipo: TipoUbicacion;
  cantidad: number;
  /** Etiquetas legibles (barrio, «25754 Soacha», código postal o la etiqueta del polígono). */
  muestra: string[];
}

/** Etiqueta legible de una ubicación. */
export function etiquetaUbicacion(u: Pick<UbicacionZona, 'location_type' | 'label' | 'neighborhood' | 'municipality_code' | 'postal_code'>): string {
  const label = (u.label ?? '').trim();
  switch (u.location_type) {
    case 'neighborhood':
      return (u.neighborhood ?? label).trim();
    case 'municipality':
      return [u.municipality_code, label].filter(Boolean).join(' ');
    case 'postal_code':
      return (u.postal_code ?? label).trim();
    case 'polygon':
      return label;
  }
}

/** Cobertura agrupada por tipo, en el orden de precisión de la base (polígono > barrio > CP > municipio). */
export function resumenCobertura(ubicaciones: readonly UbicacionZona[] | null | undefined): GrupoCobertura[] {
  const orden: TipoUbicacion[] = ['polygon', 'neighborhood', 'postal_code', 'municipality'];
  const lista = ubicaciones ?? [];
  return orden
    .map((tipo) => {
      const delTipo = lista.filter((u) => u.location_type === tipo);
      return {
        tipo,
        cantidad: delTipo.length,
        muestra: delTipo.map(etiquetaUbicacion).filter((s) => s !== ''),
      };
    })
    .filter((g) => g.cantidad > 0);
}

/** Busca en nombre, barrios, municipios y códigos postales (minúsculas y sin tildes). */
export function zonaCoincideBusqueda(
  zona: Pick<ZonaEnvio, 'name' | 'description'> & { ubicaciones?: readonly UbicacionZona[] | null },
  termino: string,
): boolean {
  const t = normalizarTexto(termino);
  if (!t) return true;
  const textos = [zona.name, zona.description ?? '', ...(zona.ubicaciones ?? []).map(etiquetaUbicacion)];
  return textos.some((s) => normalizarTexto(s).includes(t));
}

// ── Municipios por nombre (dirección escrita a mano en el POS) ──────────────────────────────────

/** Minúsculas, sin tildes, sin signos y con espacios simples. */
export function normalizarTexto(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «Bogotá, D.C.», «Bogota DC» y «bogotá» → «bogota». */
export function normalizarMunicipio(nombre: string | null | undefined): string {
  return normalizarTexto(nombre)
    .replace(/\b(d c|dc|distrito capital)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * El código DANE de la ciudad escrita, si un solo municipio del país la nombra así. Con dos
 * municipios homónimos (hay varios «La Unión») no se adivina: null.
 */
export function municipioPorNombre(
  ciudad: string | null | undefined,
  municipios: readonly { code: string; name: string }[],
): string | null {
  const buscado = normalizarMunicipio(ciudad);
  if (!buscado) return null;
  const iguales = municipios.filter((m) => normalizarMunicipio(m.name) === buscado);
  return iguales.length === 1 ? iguales[0].code : null;
}

// ── Cotización en el POS y en el pedido manual ──────────────────────────────────────────────────

export type EstadoCotizacion =
  /** La dirección cae en una zona y cumple el mínimo. */
  | 'en_zona'
  /** No llega al pedido mínimo de su zona. */
  | 'bajo_minimo'
  /** Fuera de toda zona, con tarifa general. */
  | 'fuera_tarifa_general'
  /** Fuera de toda zona: solo transportadora. */
  | 'fuera_transportadora'
  /** Fuera de toda zona y sin alternativa. */
  | 'sin_cobertura'
  /** La organización no tiene zonas: se queda lo de siempre. */
  | 'sin_zonas';

export function estadoCotizacion(c: CotizacionEnvio | null | undefined): EstadoCotizacion | null {
  if (!c) return null;
  if (c.motivo === 'sin_zonas_configuradas') return 'sin_zonas';
  if (!c.en_zona || c.zona?.es_tarifa_general) {
    if (c.alternativa === 'tarifa_general' && c.precio !== null) return c.cumple_minimo ? 'fuera_tarifa_general' : 'bajo_minimo';
    if (c.alternativa === 'transportadora') return 'fuera_transportadora';
    return 'sin_cobertura';
  }
  return c.cumple_minimo ? 'en_zona' : 'bajo_minimo';
}

/**
 * El cargo de domicilio que llena la zona sola; null si no hay que llenarlo. Fuera de zona no se
 * llena: el cajero elige «Cobrar tarifa general» o «Usar transportadora» (Figma 2830:74984).
 */
export function cargoDeCotizacion(c: CotizacionEnvio | null | undefined): number | null {
  return estadoCotizacion(c) === 'en_zona' ? c!.precio : null;
}

/**
 * Tarifa general que se ofrece fuera de zona («Cobrar tarifa general $ 15.000»). En la respuesta
 * de la base, fuera de zona con tarifa general, `precio` ya es el de la tarifa general.
 */
export function tarifaGeneralDe(c: CotizacionEnvio | null | undefined): number | null {
  if (!c || c.alternativa !== 'tarifa_general') return null;
  return c.precio;
}

/** «Zona 2 · Chapinero» o el nombre de la zona tal cual. */
export function nombreZona(c: CotizacionEnvio | null | undefined): string | null {
  return c?.zona?.nombre?.trim() || null;
}

/**
 * ¿Se cambió el cargo que llenó la zona? Una diferencia de menos de un peso no cuenta (redondeo de
 * la moneda); sin cotización no hay nada que comparar.
 */
export function cargoEditado(cotizado: number | null, cobrado: number): boolean {
  if (cotizado === null) return false;
  return Math.abs(Number(cobrado) - Number(cotizado)) >= 1;
}

// ── Peso y medidas ──────────────────────────────────────────────────────────────────────────────

/** Divisor del peso volumétrico (cm³ por kg) que usan las transportadoras en Colombia. */
export const DIVISOR_VOLUMETRICO = 5000;

export interface Medidas {
  largo: number | null;
  ancho: number | null;
  alto: number | null;
}

const positivo = (n: unknown): number | null => {
  const v = typeof n === 'string' ? Number(n) : n;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
};

/** Peso volumétrico en kg (dos decimales); null si falta una medida. */
export function pesoVolumetrico(m: Medidas | null | undefined, divisor = DIVISOR_VOLUMETRICO): number | null {
  const l = positivo(m?.largo);
  const a = positivo(m?.ancho);
  const h = positivo(m?.alto);
  if (l === null || a === null || h === null) return null;
  return Math.round(((l * a * h) / divisor) * 100) / 100;
}

export type FuentePeso = 'producto' | 'categoria' | 'organizacion';

export interface PesoResuelto {
  /** Peso real que se usa (kg) o null si no hay ninguno. */
  peso: number | null;
  fuente: FuentePeso | null;
  medidas: Medidas | null;
  fuenteMedidas: FuentePeso | null;
  volumetrico: number | null;
  /** Lo que cobra la transportadora: el mayor entre real y volumétrico. */
  cobrado: number | null;
}

interface FuentePesoEntrada {
  peso?: number | string | null;
  largo?: number | string | null;
  ancho?: number | string | null;
  alto?: number | string | null;
}

function medidasDe(f: FuentePesoEntrada | null | undefined): Medidas | null {
  const m = { largo: positivo(f?.largo), ancho: positivo(f?.ancho), alto: positivo(f?.alto) };
  return m.largo !== null && m.ancho !== null && m.alto !== null ? m : null;
}

/**
 * Peso de un ítem (Figma 2800:3649): 1) el del producto, 2) el por defecto de su categoría,
 * 3) el de la organización, 4) ninguno. Las medidas siguen la misma cadena por separado.
 */
export function resolverPeso(
  producto: FuentePesoEntrada | null | undefined,
  categoria: FuentePesoEntrada | null | undefined,
  organizacion: FuentePesoEntrada | null | undefined,
): PesoResuelto {
  const cadena: [FuentePeso, FuentePesoEntrada | null | undefined][] = [
    ['producto', producto],
    ['categoria', categoria],
    ['organizacion', organizacion],
  ];
  let peso: number | null = null;
  let fuente: FuentePeso | null = null;
  let medidas: Medidas | null = null;
  let fuenteMedidas: FuentePeso | null = null;
  for (const [f, valores] of cadena) {
    if (peso === null) {
      const p = positivo(valores?.peso);
      if (p !== null) {
        peso = p;
        fuente = f;
      }
    }
    if (medidas === null) {
      const m = medidasDe(valores);
      if (m) {
        medidas = m;
        fuenteMedidas = f;
      }
    }
  }
  const volumetrico = pesoVolumetrico(medidas);
  const cobrado = peso === null && volumetrico === null ? null : Math.max(peso ?? 0, volumetrico ?? 0);
  return { peso, fuente, medidas, fuenteMedidas, volumetrico, cobrado };
}

/** «35 × 25 × 14» → medidas; vacío → todo null; texto ilegible → null (error). */
export function leerMedidas(texto: string): Medidas | null {
  const limpio = texto.trim();
  if (!limpio) return { largo: null, ancho: null, alto: null };
  const partes = limpio.split(/\s*[x×*]\s*/i).map((s) => Number(s.replace(',', '.')));
  if (partes.length !== 3 || partes.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  return { largo: partes[0], ancho: partes[1], alto: partes[2] };
}

/** «35 × 25 × 14» o cadena vacía. */
export function textoMedidas(m: Partial<Medidas> | null | undefined): string {
  const l = positivo(m?.largo);
  const a = positivo(m?.ancho);
  const h = positivo(m?.alto);
  if (l === null || a === null || h === null) return '';
  return `${l} × ${a} × ${h}`;
}

// ── Envío que guarda el servidor (pedido manual) ─────────────────────────────────────────────────

export type FuenteEnvioServidor = 'zona' | 'editado' | 'cliente' | 'sin_zonas';

export type DecisionEnvio =
  | { ok: true; envio: number; fuente: FuenteEnvioServidor; cotizado: number | null }
  | { ok: false; codigo: 'FUERA_DE_COBERTURA' | 'PEDIDO_MINIMO_DOMICILIO' };

/**
 * Qué envío se guarda con un pedido creado por el personal (pedido manual), con la cotización que
 * el SERVIDOR acaba de pedir. El valor que mandó el navegador solo cuenta sin zonas (como antes),
 * si la cotización falló, o si la persona tiene permiso de cambiar el cargo (y entonces se
 * registra). Fuera de cobertura o bajo el mínimo, solo con ese permiso.
 */
export function decidirEnvioServidor(e: {
  cotizacion: CotizacionEnvio | null;
  enviado: number | null | undefined;
  puedeEditar: boolean;
}): DecisionEnvio {
  const enviado = typeof e.enviado === 'number' && Number.isFinite(e.enviado) && e.enviado >= 0 ? e.enviado : null;
  const estado = estadoCotizacion(e.cotizacion);
  if (estado === null) return { ok: true, envio: enviado ?? 0, fuente: 'cliente', cotizado: null };
  if (estado === 'sin_zonas') return { ok: true, envio: enviado ?? 0, fuente: 'sin_zonas', cotizado: null };
  const cotizado = estado === 'en_zona' || estado === 'fuera_tarifa_general' ? e.cotizacion!.precio : null;
  if (e.puedeEditar && enviado !== null && (cotizado === null || cargoEditado(cotizado, enviado))) {
    return { ok: true, envio: enviado, fuente: 'editado', cotizado };
  }
  if (cotizado !== null) return { ok: true, envio: cotizado, fuente: 'zona', cotizado };
  return { ok: false, codigo: estado === 'bajo_minimo' ? 'PEDIDO_MINIMO_DOMICILIO' : 'FUERA_DE_COBERTURA' };
}
