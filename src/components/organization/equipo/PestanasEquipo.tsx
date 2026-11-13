'use client';

/**
 * Pestañas de Organización › Equipo, iguales en las cuatro pantallas (Figma
 * sección 91, 2026-11-13): Miembros · Invitaciones · Roles y permisos · Cargos.
 * Son páginas: la pestaña navega (Cargos es `/app/roles?vista=cargos`).
 *
 * - Contadores: Miembros e Invitaciones salen de `GET /api/me/plan` (la misma
 *   fuente del cupo); Roles y Cargos, de `GET /api/organizacion/roles/resumen`.
 *   Quien ya tiene la cifra en pantalla la pasa por props.
 * - Solo se muestran las pestañas que la persona puede abrir, según el
 *   servidor: Miembros e Invitaciones con `gestionarMiembros` (la guarda de
 *   esas pantallas), Roles con roles.view, Cargos con roles.view o
 *   hr.positions.edit. La pestaña activa siempre se ve.
 * - `onCambiar`: la pantalla que pinta varias pestañas a la vez (Roles y
 *   Cargos viven en PantallaRoles) cambia de vista sin navegar; devuelve
 *   `true` si se encargó.
 */
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TabBar, type PestanaTab } from '@/components/kit';
import { usePlanSesion } from '@/components/shell/sesion/usePlanSesion';
import { useAccesoOrganizacion } from '../acceso/useAccesoOrganizacion';
import { useResumenEquipo } from './useResumenEquipo';

export type PestanaEquipo = 'miembros' | 'invitaciones' | 'roles' | 'cargos';

/** Prefijo de los ids de pestañas y paneles (`idPanel('equipo', …)`). */
export const ID_PESTANAS_EQUIPO = 'equipo';

export const RUTAS_EQUIPO: Record<PestanaEquipo, string> = {
  miembros: '/app/organizacion/miembros',
  invitaciones: '/app/organizacion/invitaciones',
  roles: '/app/roles',
  cargos: '/app/roles?vista=cargos',
};

export interface PestanasEquipoProps {
  activa: PestanaEquipo;
  miembros?: number;
  invitaciones?: number;
  roles?: number;
  cargos?: number;
  onCambiar?: (pestana: PestanaEquipo) => boolean;
}

export function PestanasEquipo({ activa, miembros, invitaciones, roles, cargos, onCambiar }: PestanasEquipoProps) {
  const t = useTranslations('org.acceso.equipo');
  const router = useRouter();
  const { datos } = usePlanSesion();
  const acceso = useAccesoOrganizacion();
  const resumen = useResumenEquipo(acceso.organizationId);

  const visible: Record<PestanaEquipo, boolean> = {
    miembros: acceso.puede.miembros,
    invitaciones: acceso.puede.miembros,
    roles: resumen?.verRoles === true,
    cargos: resumen?.verCargos === true,
  };
  const contador: Record<PestanaEquipo, number | undefined> = {
    miembros: miembros ?? datos?.uso.usuarios.actual,
    invitaciones: invitaciones ?? datos?.uso.usuarios.invitacionesVigentes,
    roles: roles ?? resumen?.roles ?? undefined,
    cargos: cargos ?? resumen?.cargos ?? undefined,
  };

  const orden: PestanaEquipo[] = ['miembros', 'invitaciones', 'roles', 'cargos'];
  const pestanas: PestanaTab<PestanaEquipo>[] = orden
    .filter((p) => p === activa || visible[p])
    .map((p) => ({ valor: p, etiqueta: t(p), contador: contador[p] }));

  const cambiar = (p: PestanaEquipo) => {
    if (onCambiar?.(p)) return;
    if (p !== activa) router.push(RUTAS_EQUIPO[p]);
  };

  return (
    <TabBar<PestanaEquipo>
      id={ID_PESTANAS_EQUIPO}
      etiqueta={t('pestanas')}
      valor={activa}
      onValorChange={cambiar}
      pestanas={pestanas}
      className="w-full"
    />
  );
}
