'use client';

/**
 * ChipOrigen (Figma «Roles y permisos — componentes»): de dónde sale un permiso
 * de una persona. Rol (gris) · Cargo (marca) · Sucursal (información) · Admin
 * (advertencia: acceso total, no depende de los permisos).
 */
import { useTranslations } from 'next-intl';
import { Briefcase, Crown, MapPin, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TonoBadge } from '@/components/kit/estadoTono';

export type OrigenChip = 'rol' | 'cargo' | 'sucursal' | 'admin';

const ESTILO: Record<OrigenChip, { icono: LucideIcon; tono: TonoBadge }> = {
  rol: { icono: ShieldCheck, tono: 'neutro' },
  cargo: { icono: Briefcase, tono: 'marca' },
  sucursal: { icono: MapPin, tono: 'informacion' },
  admin: { icono: Crown, tono: 'advertencia' },
};

export interface ChipOrigenProps {
  origen: OrigenChip;
  /** Texto en lugar de «Rol»/«Cargo»… (p. ej. el nombre del rol). */
  etiqueta?: string;
  tamano?: 'sm' | 'md';
  className?: string;
}

export function ChipOrigen({ origen, etiqueta, tamano = 'sm', className }: ChipOrigenProps) {
  const t = useTranslations('roles.origen');
  const { icono, tono } = ESTILO[origen];
  return (
    <Badge tono={tono} apariencia="suave" tamano={tamano} icono={icono} className={className} data-origen={origen}>
      {etiqueta ?? t(origen)}
    </Badge>
  );
}
