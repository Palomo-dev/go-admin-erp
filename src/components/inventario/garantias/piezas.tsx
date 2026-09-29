'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { ESTADOS_RECLAMO, type EstadoReclamo } from '@/lib/services/seriales/contrato';
import { TONO_ESTADO_RECLAMO } from './logica';

/** Estado de un reclamo (Figma «BadgeEstadoReclamo»): Pendiente · Aprobado · En proceso · Resuelto · Rechazado. */
export function BadgeEstadoReclamo({ estado, tamano = 'sm' }: { estado: string; tamano?: 'sm' | 'md' }) {
  const t = useTranslations('inventarioGarantias.estados');
  const conocido = (ESTADOS_RECLAMO as readonly string[]).includes(estado);
  return (
    <Badge tono={conocido ? TONO_ESTADO_RECLAMO[estado as EstadoReclamo] : 'neutro'} tamano={tamano} className="whitespace-nowrap">
      {conocido ? t(estado) : estado}
    </Badge>
  );
}
