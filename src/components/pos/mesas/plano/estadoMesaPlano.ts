/**
 * Estado visual de una mesa en la cuadrícula y el plano (Figma «POS — Mesas:
 * cuadrícula y plano (propuesta)», 870:98618; `MesaTile`, `MesaCard`,
 * `MesaPlano` y `LeyendaEstadosMesa`). Puro, para Jest.
 *
 * Cinco estados (la leyenda): libre, ocupada, por cobrar (pidió la cuenta),
 * reservada (una reserva confirmada aparta la mesa en su ventana) y por limpiar
 * (cobrada, hasta que alguien la marca lista). Encima, avisos: plato listo
 * (campana) y mesa abierta sin movimiento (triángulo).
 */
import type { TableWithSession } from '../types';
import { estadoVisualMesa, horaDeReserva, type ReservaActivaMesa } from '../reservasProximas';
import { UMBRAL_MESA_ABANDONADA_MIN, minutosDesde } from '../cuenta/cuentaMesaLogica';

export type EstadoMesaPlano = 'libre' | 'ocupada' | 'por_cobrar' | 'reservada' | 'por_limpiar';

export const ORDEN_ESTADOS: readonly EstadoMesaPlano[] = ['libre', 'ocupada', 'por_cobrar', 'reservada', 'por_limpiar'];

export type FormaMesa = 'cuadrada' | 'redonda' | 'larga' | 'barra';

export interface VistaMesaPlano {
  id: string;
  nombre: string;
  /** «4» de «Mesa 4» (la cuadrícula compacta muestra solo el número). */
  numero: string;
  zona: string | null;
  estado: EstadoMesaPlano;
  capacidad: number;
  comensales: number;
  minutos: number | null;
  importe: number;
  /** Líneas de la cuenta («7 productos»). */
  productos: number;
  mesero: string | null;
  /** «20:30» de la reserva que aparta la mesa. */
  reservaHora: string | null;
  reservaNombre: string | null;
  platosListos: number;
  abandonada: boolean;
  forma: FormaMesa;
  tamano: 's' | 'm' | 'l';
  x: number | null;
  y: number | null;
  rotacion: number;
}

const FORMAS: Record<string, FormaMesa> = { square: 'cuadrada', round: 'redonda', long: 'larga', bar: 'barra' };

/** «Mesa 14» → «14»; «Terraza 3» → «3»; sin número, el nombre. */
export function numeroDeMesa(nombre: string): string {
  const m = nombre.match(/(\d+[A-Za-z]?)\s*$/);
  return m ? m[1] : nombre;
}

/** Forma por defecto (sin `shape`): 2 o menos redonda, hasta 4 cuadrada, más larga. */
export function formaPorCapacidad(capacidad: number): FormaMesa {
  if (capacidad <= 2) return 'redonda';
  if (capacidad <= 4) return 'cuadrada';
  return 'larga';
}

export function vistaMesaPlano(
  mesa: TableWithSession & { shape?: string | null; size?: string | null; readyKitchenItems?: number; lastActivityAt?: string | null },
  reserva: ReservaActivaMesa | undefined,
  ahora: Date = new Date(),
): VistaMesaPlano {
  const visual = estadoVisualMesa(mesa, reserva);
  const estado: EstadoMesaPlano =
    mesa.state === ('cleaning' as string) && !mesa.session
      ? 'por_limpiar'
      : visual === 'bill_requested'
        ? 'por_cobrar'
        : visual === 'occupied'
          ? 'ocupada'
          : visual === 'reserved'
            ? 'reservada'
            : 'libre';
  const minutos = mesa.session ? minutosDesde(mesa.session.opened_at, ahora) : null;
  const ultimo = mesa.lastActivityAt ?? mesa.session?.opened_at ?? null;
  const sinMovimiento = mesa.session ? minutosDesde(ultimo, ahora) : null;
  return {
    id: mesa.id,
    nombre: mesa.name,
    numero: numeroDeMesa(mesa.name),
    zona: mesa.zone ?? null,
    estado,
    capacidad: Number(mesa.capacity) || 0,
    comensales: mesa.session?.customers ?? 0,
    minutos,
    importe: Number(mesa.totalAmount) || 0,
    productos: mesa.session?.sale_items?.length ?? 0,
    mesero: mesa.session?.serverName ?? null,
    reservaHora: estado === 'reservada' && reserva ? horaDeReserva(reserva) : null,
    reservaNombre: estado === 'reservada' && reserva ? reserva.reserva.customer_name : null,
    platosListos: Number(mesa.readyKitchenItems) || 0,
    abandonada: sinMovimiento != null && sinMovimiento >= UMBRAL_MESA_ABANDONADA_MIN,
    forma: FORMAS[mesa.shape ?? ''] ?? formaPorCapacidad(Number(mesa.capacity) || 0),
    tamano: mesa.size === 's' || mesa.size === 'l' ? mesa.size : 'm',
    x: mesa.position_x ?? null,
    y: mesa.position_y ?? null,
    rotacion: Number(mesa.rotation) || 0,
  };
}

/** Tamaño de la mesa en el plano (px a escala 1, sin girar). */
export function tamanoEnPlanoBase(forma: FormaMesa, tamano: 's' | 'm' | 'l'): { w: number; h: number } {
  const base = forma === 'redonda' ? { w: 110, h: 110 } : forma === 'larga' ? { w: 184, h: 102 } : forma === 'barra' ? { w: 184, h: 60 } : { w: 110, h: 110 };
  const f = tamano === 's' ? 0.8 : tamano === 'l' ? 1.25 : 1;
  return { w: Math.round(base.w * f), h: Math.round(base.h * f) };
}

/** «Mesero» corto: «Ana Gómez» → «Ana G.». */
export function nombreCorto(nombre: string | null): string | null {
  if (!nombre) return null;
  const p = nombre.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1].charAt(0)}.` : p[0];
}

export interface ResumenZona {
  total: number;
  libres: number;
  ocupadas: number;
  porCobrar: number;
}

export function resumenZona(vistas: readonly VistaMesaPlano[]): ResumenZona {
  return {
    total: vistas.length,
    libres: vistas.filter((v) => v.estado === 'libre').length,
    ocupadas: vistas.filter((v) => v.estado === 'ocupada').length,
    porCobrar: vistas.filter((v) => v.estado === 'por_cobrar').length,
  };
}

export function conteoEstados(vistas: readonly VistaMesaPlano[]): Record<EstadoMesaPlano, number> {
  const c: Record<EstadoMesaPlano, number> = { libre: 0, ocupada: 0, por_cobrar: 0, reservada: 0, por_limpiar: 0 };
  for (const v of vistas) c[v.estado] += 1;
  return c;
}

/** Clases por estado (tinte suave + borde del color; poco color, manual v2). */
export const CLASES_ESTADO: Record<EstadoMesaPlano, { caja: string; texto: string; punto: string; borde: string }> = {
  libre: { caja: 'border-line-success bg-success-subtle', texto: 'text-success-text', punto: 'border-line-success bg-success-subtle', borde: 'border-line-success' },
  ocupada: { caja: 'border-line-brand bg-brand-tint', texto: 'text-brand-deep', punto: 'border-line-brand bg-brand-tint', borde: 'border-line-brand' },
  por_cobrar: { caja: 'border-line-warning bg-warning-subtle', texto: 'text-warning-text', punto: 'border-line-warning bg-warning-subtle', borde: 'border-line-warning' },
  reservada: { caja: 'border-line-info bg-info-subtle', texto: 'text-info-text', punto: 'border-line-info bg-info-subtle', borde: 'border-line-info' },
  por_limpiar: { caja: 'border-dashed border-line-strong bg-subtle', texto: 'text-fg-secondary', punto: 'border-dashed border-line-strong bg-subtle', borde: 'border-line-strong' },
};
