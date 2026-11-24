/**
 * «En palabras» (Figma A2 / A3): la promoción contada en una o dos frases para quien la
 * configura. Pura: recibe el traductor y los formateadores, así se prueba sin React.
 */
import { normalizarEscalones, type Escalon } from '@/lib/promotions/precioVolumen';
import type { CreatePromotionData, PromotionTier } from '../types';

type T = (clave: string, valores?: Record<string, string | number>) => string;

/**
 * Día calendario 'YYYY-MM-DD' en palabras («1 de diciembre») en el idioma pedido. Es un día
 * de la organización, no un instante: se pinta a mediodía UTC con zona UTC, así nunca se corre.
 */
export function diaEnPalabras(dia: string, localeIntl: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dia);
  if (!m) return dia;
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat(localeIntl, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(fecha);
}

export interface ContextoPalabras {
  t: T;
  formatear: (n: number) => string;
  /** Día calendario 'YYYY-MM-DD' → «1 de diciembre». */
  fecha: (dia: string) => string;
  /** Nombres del alcance («Bebidas», «Snacks»), vacío = todos los productos. */
  nombresAlcance: readonly string[];
  /** Nombres de las sedes elegidas; vacío = todas. */
  sucursales: readonly string[];
  /** Nombre del grupo de clientes, si es solo para un grupo. */
  segmento: string | null;
  /** Une una lista («Bebidas y Snacks»). */
  unir: (xs: readonly string[]) => string;
}

/** «de 6 a 11 unidades a $ 9.500 c/u y desde 12 a $ 8.800 c/u». */
export function textoEscalones(escalones: readonly Escalon[], ctx: Pick<ContextoPalabras, 't' | 'formatear' | 'unir'>): string {
  const { t, formatear } = ctx;
  const partes = escalones.map((e, i) => {
    const valor = e.precioUnidad !== null
      ? t('v2.palabras.precioUnidad', { precio: formatear(e.precioUnidad) })
      : t('v2.palabras.porcentajeMenos', { n: e.porcentaje ?? 0 });
    const siguiente = escalones[i + 1];
    return siguiente
      ? t('v2.palabras.escalonRango', { desde: e.desde, hasta: siguiente.desde - 1, valor })
      : t('v2.palabras.escalonDesde', { desde: e.desde, valor });
  });
  return ctx.unir(partes);
}

export function textoDescuento(d: CreatePromotionData, tiers: readonly PromotionTier[], ctx: ContextoPalabras): string {
  const { t, formatear } = ctx;
  const valor = Number(d.discount_value) || 0;
  switch (d.promotion_type) {
    case 'percentage':
      return t('v2.palabras.porcentaje', { n: valor });
    case 'fixed_amount':
      return t('v2.palabras.valorFijo', { monto: formatear(valor) });
    case 'buy_x_get_y':
      return t('v2.palabras.llevaPaga', { x: d.buy_quantity ?? 0, y: d.get_quantity ?? 0 });
    case 'bundle':
      return (Number(d.bundle_price) || 0) > 0
        ? t('v2.palabras.combo', { precio: formatear(Number(d.bundle_price)) })
        : t('v2.palabras.comboPorcentaje', { n: valor });
    case 'volume_tiers': {
      const escalones = normalizarEscalones(tiers);
      return escalones.length > 0 ? textoEscalones(escalones, ctx) : t('v2.palabras.sinEscalones');
    }
    default:
      return '';
  }
}

export function textoEnPalabras(d: CreatePromotionData, tiers: readonly PromotionTier[], ctx: ContextoPalabras): string {
  const { t } = ctx;
  const frases: string[] = [];

  const canales = [
    d.applies_to_web !== false ? t('v2.palabras.canalWeb') : null,
    d.applies_to_pos !== false ? t('v2.palabras.canalPos') : null,
    d.applies_to_finances === true ? t('v2.palabras.canalFacturas') : null,
  ].filter((x): x is string => !!x);
  const donde = ctx.sucursales.length > 0
    ? t('v2.palabras.sedes', { sedes: ctx.unir(ctx.sucursales) })
    : t('v2.palabras.todasLasSedes');
  const cuando = d.start_date && d.end_date
    ? t('v2.palabras.delAl', { desde: ctx.fecha(d.start_date), hasta: ctx.fecha(d.end_date) })
    : d.start_date
      ? t('v2.palabras.desdeSinFin', { desde: ctx.fecha(d.start_date) })
      : '';
  frases.push(t('v2.palabras.vigencia', { cuando, canales: ctx.unir(canales), donde }));

  const alcance = ctx.nombresAlcance.length > 0 ? ctx.unir(ctx.nombresAlcance) : t('v2.palabras.todosLosProductos');
  frases.push(t('v2.palabras.alcance', { alcance, descuento: textoDescuento(d, tiers, ctx) }));

  if (ctx.segmento) frases.push(t('v2.palabras.soloGrupo', { grupo: ctx.segmento }));
  if (d.usage_limit_per_customer && d.usage_limit_per_customer > 0) {
    frases.push(t('v2.palabras.usosCliente', { n: d.usage_limit_per_customer }));
  }
  frases.push(d.is_combinable ? t('v2.palabras.seSuma') : t('v2.palabras.noSeSuma'));
  return frases.join(' ');
}
