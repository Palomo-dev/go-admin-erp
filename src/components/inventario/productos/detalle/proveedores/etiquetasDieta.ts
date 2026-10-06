/**
 * Etiquetas de dieta, alérgenos y picante del producto para la Carta QR (Figma «Restaurante ·
 * Carta QR en la mesa», 2032:75742, lámina 20): la carta filtra por `product_tags.kind` 'dieta' y
 * 'picante', y la ficha del plato avisa los de kind 'alergeno' («Contiene lácteos y mostaza»).
 *
 * Convención (contrato `seccionesMesa.ts`, `KIND_ETIQUETA`; CHECK product_tags_kind_valido):
 * kind sin tilde, nombres libres por organización. Las sugerencias son atajos: si la etiqueta no
 * existe se crea con su kind; si existe sin kind (o «general»), marcarla le pone el kind.
 * Puro, para Jest.
 */
import { KIND_ETIQUETA } from '@/lib/website/contrato/seccionesMesa';

export type KindCarta = typeof KIND_ETIQUETA.dieta | typeof KIND_ETIQUETA.alergeno | typeof KIND_ETIQUETA.picante;

export const KINDS_CARTA: readonly KindCarta[] = [KIND_ETIQUETA.dieta, KIND_ETIQUETA.alergeno, KIND_ETIQUETA.picante];

/** Sugerencias acordadas con el sitio (no es una lista cerrada). */
export const SUGERENCIAS_KIND: Record<KindCarta, readonly string[]> = {
  dieta: ['Vegetariano', 'Vegano', 'Sin gluten', 'Sin lácteos'],
  alergeno: ['Gluten', 'Lácteos', 'Huevo', 'Maní', 'Frutos secos', 'Mariscos', 'Pescado', 'Soya', 'Mostaza', 'Sésamo'],
  picante: ['Picante'],
};

/** Color por defecto de las etiquetas que se crean desde aquí (hex, como el resto). */
export const COLOR_KIND: Record<KindCarta, string> = {
  dieta: '#16a34a',
  alergeno: '#dc2626',
  picante: '#ea580c',
};

export interface EtiquetaConKind {
  id: number;
  name: string;
  color: string | null;
  kind?: string | null;
}

export interface ChipKind {
  nombre: string;
  /** Etiqueta existente (null = se crea al marcarla). */
  id: number | null;
  marcada: boolean;
  /** Existe con otro kind o sin kind: marcarla le pone este. */
  cambiaKind: boolean;
}

const clave = (s: string) => s.trim().toLocaleLowerCase('es');

export function esKindCarta(kind: unknown): kind is KindCarta {
  return typeof kind === 'string' && (KINDS_CARTA as readonly string[]).includes(kind);
}

/**
 * Chips de un kind: las etiquetas de la organización con ese kind y las sugerencias que aún no
 * existen con él. Una sugerencia que existe con OTRO kind de la carta no se ofrece aquí (sería la
 * misma etiqueta en dos grupos). Orden: primero las existentes, luego las sugerencias.
 */
export function chipsDeKind(kind: KindCarta, etiquetas: readonly EtiquetaConKind[], asignadas: readonly number[]): ChipKind[] {
  const porNombre = new Map(etiquetas.map((e) => [clave(e.name), e]));
  const propias = etiquetas
    .filter((e) => e.kind === kind)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((e) => ({ nombre: e.name, id: e.id, marcada: asignadas.includes(e.id), cambiaKind: false }));
  const vistas = new Set(propias.map((c) => clave(c.nombre)));
  const sugeridas: ChipKind[] = [];
  for (const nombre of SUGERENCIAS_KIND[kind]) {
    if (vistas.has(clave(nombre))) continue;
    const existente = porNombre.get(clave(nombre));
    if (existente && esKindCarta(existente.kind)) continue;
    sugeridas.push({
      nombre: existente?.name ?? nombre,
      id: existente?.id ?? null,
      // Sin el kind la carta no la ve: aunque esté asignada, se ofrece sin marcar.
      marcada: false,
      cambiaKind: !!existente,
    });
  }
  return [...propias, ...sugeridas];
}
