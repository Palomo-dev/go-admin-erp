'use client';

/**
 * «Mi perfil › Organización y roles» (Figma 346:21440, §A.4 + §A.6): las
 * antiguas «Organización predeterminada» y «Roles asignados» en una sola
 * sección.
 *
 * - Una tarjeta por organización: avatar, nombre, rol, cargo y las sucursales
 *   asignadas (`member_branches`), que antes quedaban enterradas.
 * - La predeterminada (`profiles.last_org_id`) lleva su insignia; las demás,
 *   «Usar por defecto». Antes bastaba un clic en cualquier punto de la
 *   tarjeta, sin aviso, para cambiarla.
 * - «Permisos efectivos» los resuelve el servidor (`/api/me/permisos`).
 * - Sin organizaciones: estado vacío con acción (344:10091).
 *
 * «Gestionar sucursales» solo se ofrece a quien administra alguna
 * organización, decidido por `role_id` e `is_super_admin` (`isOrgAdminLike`,
 * nunca por el nombre del rol). Esa pantalla vuelve a validar en el servidor.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Building2, Settings2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';
import { EmptyState } from '@/components/kit/EmptyState';
import { FormSection } from '@/components/kit/FormSection';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { BranchBadge } from '@/components/kit/BranchBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { AvatarOrganizacion } from '@/components/shell/marca/AvatarOrganizacion';
import { cn } from '@/utils/Utils';
import PermisosEfectivos from './PermisosEfectivos';

export interface MembresiaPerfil {
  organizacionId: number;
  nombre: string;
  logoUrl?: string | null;
  rol: string | null;
  roleId: number | null;
  esSuperAdmin: boolean;
  cargo: string | null;
  sucursales: string[];
}

export default function OrganizacionRolesSection({
  userId,
  membresias,
  predeterminadaId,
  organizacionActiva,
  onPredeterminada,
  onEditarDatos,
}: {
  userId: string | null;
  membresias: MembresiaPerfil[];
  predeterminadaId: number | null;
  organizacionActiva: string | null;
  onPredeterminada: (id: number) => void;
  onEditarDatos: () => void;
}) {
  const t = useTranslations('perfil.organizacion');
  const tp = useTranslations('perfil');
  const [guardando, setGuardando] = useState<number | null>(null);
  const administra = membresias.some((m) => isOrgAdminLike({ isSuperAdmin: m.esSuperAdmin === true, roleId: Number(m.roleId ?? 0) }));

  const usarPorDefecto = async (m: MembresiaPerfil) => {
    if (!userId) return;
    setGuardando(m.organizacionId);
    const { error } = await supabase
      .from('profiles')
      .update({ last_org_id: m.organizacionId, updated_at: new Date().toISOString() })
      .eq('id', userId);
    setGuardando(null);
    if (error) {
      toast.error(tp('toasts.errorTitulo'), { description: tp('toasts.errorRed') });
      return;
    }
    onPredeterminada(m.organizacionId);
    toast.success(t('predeterminadaGuardada', { organizacion: m.nombre }));
  };

  if (membresias.length === 0) {
    return (
      <FormSection titulo={t('titulo')} descripcion={t('descripcion')} id="perfil-organizacion">
        <EmptyState
          titulo={t('vacioTitulo')}
          descripcion={t('vacioDesc')}
          icono={Building2}
          accion={{ etiqueta: t('cambiarOrganizacion'), href: '/auth/select-organization' }}
          accionSecundaria={{ etiqueta: t('editarDatos'), onClick: onEditarDatos, icono: UserRound }}
        />
      </FormSection>
    );
  }

  return (
    <FormSection
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      id="perfil-organizacion"
      accion={
        administra ? (
          <Link href="/app/organizacion/sucursales" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
            <Settings2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('gestionarSucursales')}
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-fg">{t('conLaQueEntras')}</h3>
        <ul className="flex flex-col gap-3">
          {membresias.map((m) => {
            const predeterminada = m.organizacionId === predeterminadaId;
            return (
              <li
                key={m.organizacionId}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
                  predeterminada ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface',
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <AvatarOrganizacion id={m.organizacionId} nombre={m.nombre} logoUrl={m.logoUrl} className="size-8 text-xs" px={32} />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="truncate text-sm font-semibold text-fg">{m.nombre}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {m.rol && <StatusBadge estado="rol" etiqueta={m.rol} tono="informacion" apariencia="suave" />}
                      {m.cargo && m.cargo !== m.rol && <StatusBadge estado="cargo" etiqueta={m.cargo} tono="neutro" apariencia="suave" />}
                      {m.sucursales.length > 0 ? (
                        m.sucursales.map((s) => <BranchBadge key={s} alcance="una" nombre={s} />)
                      ) : (
                        <BranchBadge alcance="sinAsignar" />
                      )}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  {predeterminada ? (
                    <StatusBadge estado="predeterminada" etiqueta={t('predeterminada')} tono="marca" apariencia="solido" />
                  ) : (
                    <button
                      type="button"
                      disabled={guardando !== null}
                      aria-busy={guardando === m.organizacionId || undefined}
                      onClick={() => void usarPorDefecto(m)}
                      className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'h-12 w-full sm:h-8 sm:w-auto' })}
                    >
                      {t('usarPorDefecto')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="my-1 border-t border-line" aria-hidden="true" />
        <PermisosEfectivos organizacion={organizacionActiva} />
      </div>
    </FormSection>
  );
}
