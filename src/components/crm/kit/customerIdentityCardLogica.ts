/**
 * Lógica de `CustomerIdentityCard` (Figma 329:108665, sección Clientes; el
 * CRM la reutiliza en la ficha con las acciones rápidas `Variant=cliente`).
 * Sin React.
 *
 * Columnas de `customers` (verificadas por MCP el 2026-09-29): `full_name`,
 * `doc_type`, `doc_number` (GENERATED), `customer_type`, `email`, `phone`,
 * `city`, `address`, `tags`, `avatar_url`, `lifecycle_stage` (CHECK
 * `lead|opportunity|customer|churned`), `health_score`, `created_at`.
 */
import type { TonoBadge } from '@/components/kit/estadoTono';
import { diasDesde } from './fechasCrm';

export const ETAPAS_CICLO = ['lead', 'opportunity', 'customer', 'churned'] as const;
export type EtapaCiclo = (typeof ETAPAS_CICLO)[number];

export interface ClienteIdentidad {
  id: string;
  full_name: string | null;
  customer_type: 'person' | 'company' | string | null;
  doc_type?: string | null;
  doc_number?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  tags?: string[] | null;
  avatar_url?: string | null;
  lifecycle_stage?: string | null;
  health_score?: number | null;
  created_at?: string | null;
}

export function etapaCicloValida(v: string | null | undefined): EtapaCiclo | null {
  return (ETAPAS_CICLO as readonly string[]).includes(v ?? '') ? (v as EtapaCiclo) : null;
}

export const TONO_CICLO: Record<EtapaCiclo, TonoBadge> = { lead: 'informacion', opportunity: 'advertencia', customer: 'marca', churned: 'neutro' };

/** Salud 70–100 éxito · 40–69 advertencia · 0–39 peligro. */
export function tonoSalud(score: number | null | undefined): TonoBadge | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return score >= 70 ? 'exito' : score >= 40 ? 'advertencia' : 'peligro';
}

/** «Nuevo»: creado hace menos de `dias` días (en la zona de la organización). */
export function esClienteNuevo(creado: string | null | undefined, ahora: Date, zona: string, dias = 30): boolean {
  const d = diasDesde(creado, ahora, zona);
  return d !== null && d < dias;
}

export function documento(c: Pick<ClienteIdentidad, 'doc_type' | 'doc_number'>): string {
  return [c.doc_type, c.doc_number].filter(Boolean).join(' ');
}

/** «Bogotá D.C. · Calle 93 #12-04». */
export function ubicacion(c: Pick<ClienteIdentidad, 'city' | 'address'>): string {
  return [c.city?.trim(), c.address?.trim()].filter(Boolean).join(' · ');
}
