import type { GiroSitio } from '@/lib/website/onboardingSitio';

/** Giro del sitio en una frase corta para la sugerencia sin IA («Restaurante»). `otro` → sin giro. */
const GIRO: Record<GiroSitio, string | null> = {
  restaurante: 'Restaurante',
  tienda: 'Tienda',
  hotel: 'Hotel',
  servicios: 'Servicios',
  gimnasio: 'Gimnasio',
  otro: null,
};

export function giroEnTexto(giro: GiroSitio | null | undefined): string | null {
  return giro ? GIRO[giro] ?? null : null;
}
