'use client';

/**
 * «Miembros (n) · Invitaciones (n)» bajo la cabecera de Equipo (Figma 08,
 * sección 5). Son dos páginas del menú: la pestaña navega. Los contadores salen
 * de `GET /api/me/plan` (miembros activos e invitaciones vigentes), la misma
 * fuente del cupo, así no hay otra consulta ni otra cifra.
 */
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TabBar } from '@/components/kit';
import { usePlanSesion } from '@/components/shell/sesion/usePlanSesion';

type Pestana = 'miembros' | 'invitaciones';

const RUTAS: Record<Pestana, string> = {
  miembros: '/app/organizacion/miembros',
  invitaciones: '/app/organizacion/invitaciones',
};

export function PestanasEquipo({ activa, miembros, invitaciones }: { activa: Pestana; miembros?: number; invitaciones?: number }) {
  const t = useTranslations('org.acceso.equipo');
  const router = useRouter();
  const { datos } = usePlanSesion();
  const nMiembros = miembros ?? datos?.uso.usuarios.actual;
  const nInvitaciones = invitaciones ?? datos?.uso.usuarios.invitacionesVigentes;
  return (
    <TabBar<Pestana>
      id="equipo"
      etiqueta={t('pestanas')}
      valor={activa}
      onValorChange={(v) => v !== activa && router.push(RUTAS[v])}
      pestanas={[
        { valor: 'miembros', etiqueta: t('miembros'), contador: nMiembros },
        { valor: 'invitaciones', etiqueta: t('invitaciones'), contador: nInvitaciones },
      ]}
      className="w-full"
    />
  );
}
