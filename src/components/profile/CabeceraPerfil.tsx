'use client';

/**
 * Cabecera de «Mi perfil» (Figma 344:9281 escritorio, 348:12239 móvil):
 * avatar (abre «Cambiar foto de perfil»), nombre, cargo, correo · fecha de
 * alta, y la organización activa con las sucursales asignadas. En escritorio,
 * «Editar» (lleva a Datos personales) y «Cerrar sesión».
 *
 * - El cargo sale de `organization_members.job_position_id → job_positions.name`.
 *   Sin cargo no se pinta el badge.
 * - La fecha de alta es un instante (`profiles.created_at`): se formatea con
 *   la zona de la organización.
 * - «Cerrar sesión» va a `/auth/logout`, la ruta única de cierre (reutiliza
 *   `signOut()`); no se duplica la lógica de `AppLayout`.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Camera, LogOut } from 'lucide-react';
import { AvatarUsuario } from '@/components/shell/sesion/AvatarUsuario';
import { AvatarOrganizacion } from '@/components/shell/marca/AvatarOrganizacion';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { BranchBadge } from '@/components/kit/BranchBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

export interface CabeceraPerfilProps {
  nombre: string;
  correo: string | null;
  avatarUrl?: string | null;
  /** `profiles.created_at` (timestamptz). */
  creadoEn?: string | null;
  cargo?: string | null;
  organizacion?: { id: number; nombre: string; logoUrl?: string | null } | null;
  sucursales: string[];
  onEditar: () => void;
  onCambiarFoto: () => void;
}

export function CabeceraPerfil({ nombre, correo, avatarUrl, creadoEn, cargo, organizacion, sucursales, onEditar, onCambiarFoto }: CabeceraPerfilProps) {
  const t = useTranslations('perfil');
  const { formatDate } = useFormatDate();
  const alta = creadoEn ? formatDate(creadoEn) : '';

  const avatar = (tamano: 48 | 80, clase: string) => (
    <button
      type="button"
      onClick={onCambiarFoto}
      aria-label={t('foto.titulo')}
      className={`group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${clase}`}
    >
      <AvatarUsuario nombre={nombre} correo={correo} foto={avatarUrl} tamano={tamano} />
      <span
        aria-hidden="true"
        className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full border-2 border-surface bg-surface text-fg-secondary shadow-sm group-hover:text-fg"
      >
        <Camera className="size-3.5" strokeWidth={1.75} />
      </span>
    </button>
  );

  return (
    <section aria-labelledby="perfil-nombre" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-5">
        {avatar(48, 'sm:hidden')}
        {avatar(80, 'hidden sm:block')}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id="perfil-nombre" className="truncate text-lg font-semibold leading-6 text-fg sm:text-[22px] sm:leading-7">
              {nombre || correo || '—'}
            </h1>
            {cargo && <StatusBadge estado="cargo" etiqueta={cargo} tono="informacion" apariencia="suave" />}
          </div>
          <p className="hidden truncate text-[13px] leading-[18px] text-fg-secondary sm:block">
            {correo}
            {alta && ` · ${t('seUnio', { fecha: alta })}`}
          </p>
          {(organizacion || sucursales.length > 0) && (
            <div className="hidden flex-wrap items-center gap-1.5 text-[13px] text-fg-secondary sm:flex">
              <Contexto organizacion={organizacion} sucursales={sucursales} />
            </div>
          )}
        </div>
      </div>
      {(organizacion || sucursales.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-secondary sm:hidden">
          <Contexto organizacion={organizacion} sucursales={sucursales} />
        </div>
      )}
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <button type="button" onClick={onEditar} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          {t('editar')}
        </button>
        <Link href="/auth/logout" className={clasesBoton({ variante: 'fantasma', tamano: 'md' })}>
          <LogOut aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('cerrarSesion')}
        </Link>
      </div>
    </section>
  );
}

function Contexto({ organizacion, sucursales }: Pick<CabeceraPerfilProps, 'organizacion' | 'sucursales'>) {
  return (
    <>
      {organizacion && (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-fg">
          <AvatarOrganizacion id={organizacion.id} nombre={organizacion.nombre} logoUrl={organizacion.logoUrl} />
          <span className="truncate">{organizacion.nombre}</span>
        </span>
      )}
      {organizacion && sucursales.length > 0 && (
        <span aria-hidden="true" className="text-fg-muted">
          ·
        </span>
      )}
      {sucursales.map((s) => (
        <BranchBadge key={s} alcance="una" nombre={s} />
      ))}
    </>
  );
}
