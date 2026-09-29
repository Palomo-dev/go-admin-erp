'use client';

/**
 * Cabecera de «Mi perfil» (Figma `03 Navegación y shell` › «Perfil de usuario»,
 * frames 344:9281 y hermanos): avatar, nombre, cargo, correo · fecha de alta,
 * y la organización activa con las sucursales asignadas. «Editar» lleva a
 * Datos personales.
 *
 * El cargo sale de `organization_members.job_position_id → job_positions.name`
 * (marcado «Nuevo» en el diseño: antes no se mostraba en ningún sitio). Sin
 * cargo no se pinta el badge. La fecha de alta es un instante: se formatea con
 * la zona de la organización.
 *
 * «Cerrar sesión» de la cabecera (también «Nuevo») queda fuera hasta que el
 * cierre de sesión salga de `AppLayout` a un módulo propio: duplicarlo aquí
 * divergiría (docs/design/SHELL-FIGMA-A-CODIGO.md §5).
 */
import { useTranslations } from 'next-intl';
import { Building2, Store } from 'lucide-react';
import { AvatarUsuario } from '@/components/shell/sesion/AvatarUsuario';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

export interface CabeceraPerfilProps {
  nombre: string;
  correo: string | null;
  avatarUrl?: string | null;
  /** `profiles.created_at` (timestamptz). */
  creadoEn?: string | null;
  cargo?: string | null;
  organizacion?: string | null;
  sucursales: string[];
  onEditar: () => void;
}

export function CabeceraPerfil({ nombre, correo, avatarUrl, creadoEn, cargo, organizacion, sucursales, onEditar }: CabeceraPerfilProps) {
  const t = useTranslations('perfil');
  const { formatDate } = useFormatDate();
  const alta = creadoEn ? formatDate(creadoEn) : '';

  return (
    <section
      aria-labelledby="perfil-nombre"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <AvatarUsuario nombre={nombre} correo={correo} foto={avatarUrl} tamano={80} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 id="perfil-nombre" className="truncate text-[22px] font-semibold leading-7 text-fg">
            {nombre || correo || '—'}
          </h1>
          {cargo && <StatusBadge estado="cargo" etiqueta={cargo} tono="informacion" apariencia="suave" />}
        </div>
        <p className="truncate text-[13px] leading-[18px] text-fg-secondary">
          {correo}
          {alta && ` · ${t('seUnio', { fecha: alta })}`}
        </p>
        {(organizacion || sucursales.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg-secondary">
            {organizacion && (
              <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-fg">
                <Building2 aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <span className="truncate">{organizacion}</span>
              </span>
            )}
            {organizacion && sucursales.length > 0 && <span aria-hidden="true">·</span>}
            {sucursales.map((s) => (
              <span
                key={s}
                className="inline-flex h-6 items-center gap-1 rounded-full bg-brand px-2.5 text-xs font-semibold text-fg-on-brand"
              >
                <Store aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onEditar} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          {t('editar')}
        </button>
      </div>
    </section>
  );
}
