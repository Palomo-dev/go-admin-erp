// ============================================================
// Analítica web — bloques de tráfico (Figma B/09-01, E-analitica/16):
// «De dónde llegan», «Páginas más vistas», «Conversión a pedido» y
// «Conversión a reserva». Lógica pura sobre la RPC `fn_analitica_web_trafico`
// (migración pendiente 20261008090100). Sin React ni red.
//
// Definiciones:
//   - Fuente de una sesión: la de su primera visita del periodo; utm_source
//     manda sobre el referrer; los hosts propios y las pasarelas son «directo».
//   - Conversión de una página: sesiones que la vieron y llegaron a una
//     confirmación (/pedido/…, /checkout/resultado, /reservas/confirmada).
//   - Conversión a pedido: pedidos web pagados / sesiones que vieron un producto.
//   - Conversión a reserva: reservas web confirmadas / sesiones en /reservas.
// ============================================================
import { fraccion } from './analiticaWeb';

export const FUENTES_TRAFICO = ['google', 'instagram', 'whatsapp', 'directo', 'facebook', 'tiktok', 'otros'] as const;
export type FuenteTrafico = (typeof FUENTES_TRAFICO)[number];

export interface FilaFuente {
  fuente: FuenteTrafico;
  sesiones: number;
}

export interface FilaPagina {
  ruta: string;
  visitas: number;
  sesiones: number;
  conversiones: number;
}

export interface TraficoAnalitica {
  fuentes: FilaFuente[];
  paginas: FilaPagina[];
  conversionPedido: { sesiones: number; productos: number; carrito: number; pago: number; pagados: number };
  conversionReserva: { visitas: number; creadas: number; confirmadas: number };
}

type Crudo = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const obj = (v: unknown): Crudo => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Crudo) : {});
const lista = (v: unknown): Crudo[] => (Array.isArray(v) ? (v as Crudo[]) : []);

const esFuente = (v: unknown): v is FuenteTrafico => typeof v === 'string' && (FUENTES_TRAFICO as readonly string[]).includes(v);

/** Respuesta de la RPC → forma del cliente. Una fuente desconocida suma a «otros». */
export function mapearTrafico(crudo: unknown): TraficoAnalitica {
  const o = obj(crudo);
  const porFuente = new Map<FuenteTrafico, number>();
  for (const f of lista(o.fuentes)) {
    const clave: FuenteTrafico = esFuente(f.fuente) ? f.fuente : 'otros';
    porFuente.set(clave, (porFuente.get(clave) ?? 0) + num(f.sesiones));
  }
  const pedido = obj(o.conversion_pedido);
  const reserva = obj(o.conversion_reserva);
  return {
    fuentes: Array.from(porFuente, ([fuente, sesiones]) => ({ fuente, sesiones }))
      .filter((f) => f.sesiones > 0)
      .sort((a, b) => b.sesiones - a.sesiones || FUENTES_TRAFICO.indexOf(a.fuente) - FUENTES_TRAFICO.indexOf(b.fuente)),
    paginas: lista(o.paginas)
      .map((p) => ({ ruta: String(p.ruta ?? '/') || '/', visitas: num(p.visitas), sesiones: num(p.sesiones), conversiones: num(p.conversiones) }))
      .sort((a, b) => b.visitas - a.visitas),
    conversionPedido: {
      sesiones: num(pedido.sesiones),
      productos: num(pedido.productos),
      carrito: num(pedido.carrito),
      pago: num(pedido.pago),
      pagados: num(pedido.pagados),
    },
    conversionReserva: { visitas: num(reserva.visitas), creadas: num(reserva.creadas), confirmadas: num(reserva.confirmadas) },
  };
}

/** «Otros» siempre al final, como en el diseño; el resto por sesiones. */
export function fuentesConPorcentaje(fuentes: readonly FilaFuente[]): Array<FilaFuente & { pct: number }> {
  const total = fuentes.reduce((n, f) => n + f.sesiones, 0);
  const ordenadas = [...fuentes].sort((a, b) => Number(a.fuente === 'otros') - Number(b.fuente === 'otros') || b.sesiones - a.sesiones);
  return ordenadas.map((f) => ({ ...f, pct: fraccion(f.sesiones, total) }));
}

/** Conversión de una página (fracción) o `null` si nadie la vio en una sesión. */
export function conversionPagina(p: FilaPagina): number | null {
  return p.sesiones > 0 ? fraccion(p.conversiones, p.sesiones) : null;
}

export interface PasoEmbudo {
  clave: string;
  valor: number;
  /** Ancho relativo al primer paso (0–1). */
  ancho: number;
  final: boolean;
}

function pasos(valores: Array<[string, number]>): PasoEmbudo[] {
  const base = Math.max(1, valores[0]?.[1] ?? 0);
  return valores.map(([clave, valor], i) => ({ clave, valor, ancho: Math.min(1, valor / base), final: i === valores.length - 1 }));
}

export function embudoPedido(t: TraficoAnalitica): { pasos: PasoEmbudo[]; tasa: number } {
  const c = t.conversionPedido;
  return {
    pasos: pasos([
      ['productos', c.productos],
      ['carrito', c.carrito],
      ['pago', c.pago],
      ['pagados', c.pagados],
    ]),
    tasa: fraccion(c.pagados, c.productos),
  };
}

/**
 * Embudo de reserva con los pasos que tienen dato: el sitio no registra
 * «eligieron hora» ni «dejaron sus datos» como eventos, así que se muestran
 * las solicitudes creadas desde la web y las confirmadas.
 */
export function embudoReserva(t: TraficoAnalitica): { pasos: PasoEmbudo[]; tasa: number } {
  const c = t.conversionReserva;
  return {
    pasos: pasos([
      ['visitas', c.visitas],
      ['creadas', c.creadas],
      ['confirmadas', c.confirmadas],
    ]),
    tasa: fraccion(c.confirmadas, c.visitas),
  };
}
