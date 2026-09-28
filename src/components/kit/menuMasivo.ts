/**
 * Lógica de la barra masiva sin JSX (el repo corre jest en `node` sin
 * transformar .tsx): convertir una acción masiva en entradas de la hoja
 * móvil, aplanando los menús («Roles ▾» → «Agregar rol: Cliente»).
 */
import type { LucideIcon } from 'lucide-react';
import type { AccionFila } from './acciones';

export interface GrupoMenuMasivo {
  titulo?: string;
  acciones: readonly AccionFila[];
}

export interface AccionMasiva {
  id: string;
  etiqueta: string;
  icono: LucideIcon;
  onClick: () => void;
  destructiva?: boolean;
  cargando?: boolean;
  deshabilitada?: boolean;
  /** Si está deshabilitada, por qué (tooltip nativo y lector de pantalla). */
  motivo?: string;
  /**
   * El botón abre un menú en lugar de ejecutar `onClick` («Roles ▾» de
   * Clientes: grupos «Agregar rol» / «Quitar rol»). En móvil los grupos se
   * aplanan en la hoja con el título del grupo delante («Agregar rol: Cliente»).
   */
  menu?: readonly GrupoMenuMasivo[];
}

export function aAccionFila(a: AccionMasiva): AccionFila {
  return {
    id: a.id,
    etiqueta: a.etiqueta,
    icono: a.icono,
    onSelect: a.onClick,
    destructiva: a.destructiva,
    deshabilitada: a.deshabilitada || a.cargando,
    motivo: a.motivo,
  };
}

/** Móvil: un botón con menú se aplana en entradas de la hoja («Agregar rol: Cliente»). */
export function aplanarMenuMasivo(a: AccionMasiva): AccionFila[] {
  if (!a.menu || a.menu.length === 0) return [aAccionFila(a)];
  return a.menu.flatMap((grupo, i) =>
    grupo.acciones.map((accion, j) => ({
      ...accion,
      etiqueta: grupo.titulo ? `${grupo.titulo}: ${accion.etiqueta}` : accion.etiqueta,
      separadorAntes: accion.separadorAntes || (i > 0 && j === 0),
      deshabilitada: accion.deshabilitada || a.deshabilitada || a.cargando,
      motivo: accion.motivo ?? a.motivo,
    })),
  );
}
