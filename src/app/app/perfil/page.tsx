'use client';

/**
 * «Mi perfil» (Figma `03 Navegación y shell` › «Perfil de usuario», 344:9278).
 *
 * Contenedor del diseño: cabecera con avatar, nombre, cargo, correo · alta y
 * la organización activa con sus sucursales; debajo, la navegación de
 * secciones (texto, en el orden del frame) y el contenido. En móvil la lista
 * es la entrada y cada sección se abre con «Volver».
 *
 * Cambios frente al contenedor anterior (docs/design/SHELL-FIGMA-A-CODIGO.md):
 * - «Organización por defecto» y «Roles asignados» son una sola sección,
 *   «Organización y roles», como en el frame 346:21440.
 * - Sección nueva «Preferencias» (346:20440): tema, idioma y zona horaria.
 * - Ya no se consultaba nada con la lista de `user_devices` que cargaba esta
 *   página (la sección de sesiones lee la suya): se quitó esa consulta.
 * - Textos del contenedor en los cuatro idiomas (`perfil.*`).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import type { User } from '@supabase/supabase-js';
import { ChevronLeft, TrendingUp, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import toast from 'react-hot-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

// Componentes para las diferentes secciones
import DatosPersonalesSection from '../../../components/profile/DatosPersonalesSection';
import SeguridadSection from '../../../components/profile/SeguridadSection';
import { DeviceSessions } from '../../../components/profile/DeviceSessions';
import OrganizacionDefaultSection from '../../../components/profile/OrganizacionDefaultSection';
import NotificacionesSection from '../../../components/profile/NotificacionesSection';
import RolesSection from '../../../components/profile/RolesSection';
import EliminarCuentaSection from '../../../components/profile/EliminarCuentaSection';
import PreferenciasSection from '../../../components/profile/PreferenciasSection';
import PermisosEfectivos from '../../../components/profile/PermisosEfectivos';
import { CabeceraPerfil } from '../../../components/profile/CabeceraPerfil';
import { NavPerfil, type SeccionPerfil } from '../../../components/profile/NavPerfil';

// Interfaces para los tipos de datos
interface Profile {
  id: string;
  email: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  lang?: string;
  last_org_id?: string;
  status: string;
  created_at: string;
}

interface UserRole {
  id: string;
  role_name: string;
  /** Decide «admin» con `is_super_admin` en RolesSection (nunca el nombre del rol). */
  role_id?: number | null;
  is_super_admin?: boolean | null;
  description: string;
  organization_id: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
  };
}

interface SucursalMiembro {
  id: number;
  name: string;
  organization_id: number;
  is_active: boolean;
}

interface OrganizacionMiembro {
  id: string;
  name: string;
  slug: string;
}

interface MfaMethod {
  id: string;
  factor_type: string;
  status: string;
  created_at: string;
}

/** Fila de `organization_members` con los embebidos que pide esta página. */
interface FilaMiembro {
  role_id: number | null;
  is_super_admin?: boolean | null;
  organization_id: number;
  roles?: { name?: string | null; description?: string | null } | null;
  organizations?: { id?: number; name?: string | null } | null;
  member_branches?: { branch_id: number; branches?: { id: number; name: string; is_active: boolean } | null }[] | null;
  job_positions?: { name?: string | null } | null;
}

/** Un embebido muchos-a-uno llega como objeto; con tipos generados viejos, como lista. */
function uno<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export default function PerfilUsuarioPage() {
  const t = useTranslations('perfil');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [userBranches, setUserBranches] = useState<SucursalMiembro[]>([]);
  const [organizations, setOrganizations] = useState<OrganizacionMiembro[]>([]);
  const [cargo, setCargo] = useState<string | null>(null);
  const [orgActivaId, setOrgActivaId] = useState<number | null>(null);
  const [mfaMethods, setMfaMethods] = useState<MfaMethod[]>([]);
  const [isSeller, setIsSeller] = useState<boolean>(false);
  const [currentSection, setCurrentSection] = useState<SeccionPerfil>('datos-personales');
  // En móvil controla si se muestra la lista de secciones o el contenido
  const [mobileShowContent, setMobileShowContent] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Obtener los datos del usuario al cargar la página
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error(t('errores.sinSesion'));
          return;
        }

        setUser(session.user);
        const orgActiva = getOrganizationId() || null;
        setOrgActivaId(orgActiva);

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          console.error('Error al obtener perfil:', profileError);
          toast.error(t('errores.cargarPerfil'));
        } else {
          // `profiles` NO tiene `full_name` ni `lang`: los nombres reales son
          // `first_name`/`last_name` y `preferred_language`. La página leía
          // `profile.lang`, que llegaba siempre `undefined`, así que el
          // selector de idioma arrancaba en «Español» aunque el usuario
          // hubiera guardado otro (auditoría de perfil y cajas, 2026-09-22).
          setProfile(
            profileData
              ? {
                  ...profileData,
                  lang: (profileData as { preferred_language?: string }).preferred_language,
                  full_name:
                    (profileData as { full_name?: string }).full_name ||
                    [profileData.first_name, profileData.last_name]
                      .filter(Boolean)
                      .join(' ')
                      .trim() ||
                    undefined,
                }
              : profileData
          );
        }

        // Membresías activas: rol, organización, sucursales asignadas y cargo,
        // en una sola consulta (antes eran dos sobre la misma tabla).
        const { data: miembros, error: miembrosError } = await supabase
          .from('organization_members')
          .select(`
            role_id,
            is_super_admin,
            organization_id,
            roles(name, description),
            organizations(id, name),
            member_branches(branch_id, branches!inner(id, name, is_active)),
            job_positions(name)
          `)
          .eq('user_id', session.user.id)
          .eq('is_active', true);

        if (miembrosError) {
          console.error('Error al obtener roles:', miembrosError);
        } else {
          const filas = (miembros ?? []) as unknown as FilaMiembro[];
          // Solo las membresías con rol (antes, `roles!inner` en su propia consulta).
          setUserRoles(
            filas.filter((m) => !!uno(m.roles)).map((m, i) => {
              const rol = uno(m.roles);
              const org = uno(m.organizations);
              const orgId = String(m.organization_id ?? '');
              return {
                id: `${m.role_id}_${m.organization_id}_${i}`,
                role_name: rol?.name || t('sinNombre'),
                role_id: m.role_id,
                is_super_admin: m.is_super_admin === true,
                description: rol?.description || '',
                organization_id: orgId,
                organization: { id: orgId, name: org?.name || t('sinNombre'), slug: orgId },
              };
            })
          );
          setUserBranches(
            filas.flatMap((m) =>
              (m.member_branches ?? []).flatMap((mb) => {
                const b = uno(mb.branches);
                return b ? [{ id: b.id, name: b.name, organization_id: m.organization_id, is_active: b.is_active }] : [];
              })
            )
          );
          const activa = filas.find((m) => m.organization_id === orgActiva) ?? null;
          setCargo(uno(activa?.job_positions)?.name ?? null);
        }

        // Organizaciones a las que pertenece (también las inactivas: la
        // sección «Eliminar cuenta» las necesita todas).
        const { data: orgs, error: orgsError } = await supabase
          .from('organization_members')
          .select('organizations(id, name)')
          .eq('user_id', session.user.id);
        if (orgsError) {
          console.error('Error al obtener organizaciones:', orgsError);
        } else {
          setOrganizations(
            ((orgs ?? []) as unknown as { organizations?: { id?: number; name?: string | null } | null }[])
              .map((o) => uno(o.organizations))
              .filter((o): o is { id: number; name: string } => !!o?.id && !!o.name)
              .map((o) => ({ id: String(o.id), name: o.name, slug: String(o.id) }))
          );
        }

        // Métodos MFA configurados
        try {
          const { data } = await supabase.auth.mfa.listFactors();
          const allFactors = [...(data?.totp || []), ...(data?.phone || [])];
          setMfaMethods(
            allFactors.map((factor) => ({
              id: factor.id,
              factor_type: factor.factor_type || 'totp',
              status: factor.status || 'verified',
              created_at: factor.created_at || new Date().toISOString(),
            }))
          );
        } catch (mfaError) {
          console.error('Error al obtener métodos MFA:', mfaError);
        }

        // ¿Es vendedor?
        try {
          const { data: sellerData } = await supabase
            .from('sellers')
            .select('id, status')
            .eq('auth_user_id', session.user.id)
            .single();
          setIsSeller(!!sellerData);
        } catch {
          setIsSeller(false);
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
        toast.error(t('errores.cargarDatos'));
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
    // Solo al montar: `t` cambia de identidad con el idioma y no debe recargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSectionChange = (section: SeccionPerfil) => {
    setCurrentSection(section);
    // En móvil, al seleccionar una sección mostramos solo el contenido
    setMobileShowContent(true);
  };

  const nombre = profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim();
  const organizacionActiva = organizations.find((o) => Number(o.id) === orgActivaId)?.name ?? null;
  const sucursalesActivas = userBranches.filter((b) => b.organization_id === orgActivaId && b.is_active !== false).map((b) => b.name);

  if (loading) {
    return (
      <div className="w-full space-y-4 bg-canvas p-3 sm:p-4 md:p-6" aria-busy="true">
        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-5 w-56" />
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="w-full shrink-0 space-y-2 rounded-xl border border-line bg-surface p-2 lg:w-64">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
          <div className="flex-1 space-y-4 rounded-xl border border-line bg-surface p-6">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 bg-canvas p-3 sm:p-4 md:p-6">
      <div className={mobileShowContent ? 'hidden lg:block' : 'block'}>
        <CabeceraPerfil
          nombre={nombre}
          correo={user?.email ?? profile?.email ?? null}
          avatarUrl={profile?.avatar_url}
          creadoEn={profile?.created_at}
          cargo={cargo}
          organizacion={organizacionActiva}
          sucursales={sucursalesActivas}
          onEditar={() => handleSectionChange('datos-personales')}
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className={`w-full shrink-0 lg:w-64 ${mobileShowContent ? 'hidden lg:block' : 'block'}`}>
          <NavPerfil activa={currentSection} onElegir={handleSectionChange} />
        </aside>

        <main className={`min-w-0 flex-grow rounded-xl border border-line bg-surface p-4 sm:p-6 ${mobileShowContent ? 'block' : 'hidden lg:block'}`}>
          {/* Volver a la lista de secciones (solo móvil) */}
          <button
            type="button"
            onClick={() => setMobileShowContent(false)}
            className="mb-4 flex items-center gap-1 rounded-md text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:hidden"
          >
            <ChevronLeft aria-hidden="true" size={18} />
            {t('volver')}
          </button>

          {currentSection === 'datos-personales' && (
            <DatosPersonalesSection profile={profile} user={user} onProfileUpdated={setProfile} />
          )}

          {currentSection === 'seguridad' && (
            <SeguridadSection user={user} mfaMethods={mfaMethods} onMfaUpdated={setMfaMethods} />
          )}

          {currentSection === 'preferencias' && <PreferenciasSection />}

          {currentSection === 'sesiones' && <DeviceSessions />}

          {currentSection === 'organizacion-roles' && (
            <div className="flex flex-col gap-6">
              <OrganizacionDefaultSection
                user={user}
                profile={profile}
                organizations={organizations}
                onProfileUpdated={setProfile}
              />
              <div className="border-t border-line" aria-hidden="true" />
              <PermisosEfectivos organizacion={organizacionActiva} />
              <div className="border-t border-line" aria-hidden="true" />
              <RolesSection roles={userRoles} user={user} branches={userBranches} />
            </div>
          )}

          {currentSection === 'notificaciones' && <NotificacionesSection user={user} />}

          {currentSection === 'eliminar-cuenta' && (
            <EliminarCuentaSection user={user} organizations={organizations} profileName={nombre || undefined} />
          )}

          {currentSection === 'panel-vendedor' && (
            <PanelVendedor user={user} profile={profile} isSeller={isSeller} onBecameSeller={() => setIsSeller(true)} />
          )}
        </main>
      </div>
    </div>
  );
}

function PanelVendedor({
  user,
  profile,
  isSeller,
  onBecameSeller,
}: {
  user: User | null;
  profile: Profile | null;
  isSeller: boolean;
  onBecameSeller: () => void;
}) {
  const t = useTranslations('perfil.vendedor');

  const abrirPanel = async () => {
    const sellersUrl = process.env.NEXT_PUBLIC_SELLERS_URL || 'https://sellers.goadmin.io';
    try {
      // Refrescar sesión para garantizar tokens frescos
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const params = new URLSearchParams({ at: session.access_token, rt: session.refresh_token, dest: '/dashboard' });
        window.open(`${sellersUrl}/auth/bridge?${params.toString()}`, '_blank', 'noopener,noreferrer');
      } else {
        window.open(sellersUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      window.open(sellersUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold text-fg">{t('titulo')}</h2>
      <p className="mb-6 text-sm text-fg-secondary">{t('descripcion')}</p>

      {isSeller ? (
        <div className="rounded-xl border border-line-success bg-success-subtle p-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-surface">
              <TrendingUp aria-hidden="true" className="h-6 w-6 text-success-text" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1 text-base font-medium text-success-text">{t('yaEresTitulo')}</h3>
              <p className="mb-4 text-sm text-fg-secondary">{t('yaEresDesc')}</p>
              <button
                type="button"
                onClick={abrirPanel}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-action px-4 py-2 text-sm font-medium text-fg-on-brand transition-colors hover:bg-brand-action-hover"
              >
                {t('abrir')}
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <BecomeSellerSection user={user} profile={profile} onBecameSeller={onBecameSeller} />
      )}
    </div>
  );
}

function BecomeSellerSection({ user, profile, onBecameSeller }: {
  user: User | null;
  profile: Profile | null;
  onBecameSeller: () => void;
}) {
  const t = useTranslations('perfil.vendedor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBecomeSeller = async () => {
    if (!user?.id || !user?.email) {
      setError(t('errorSinSesion'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/become-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_user_id: user.id,
          name: profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || user.email.split('@')[0],
          email: user.email,
          phone: profile?.phone || null,
          avatar_url: profile?.avatar_url || null,
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        throw new Error(data.error || t('errorCrear'));
      }

      toast.success(t('exito'));
      onBecameSeller();
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : '';
      setError(mensaje.includes('Failed to fetch') ? t('errorConexion') : mensaje || t('errorProcesar'));
      toast.error(t('errorToast'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-line-brand bg-brand-tint p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-surface">
          <TrendingUp aria-hidden="true" className="h-6 w-6 text-brand-deep" />
        </div>
        <div className="flex-1">
          <h3 className="mb-1 text-base font-medium text-brand-deep">{t('convierteteTitulo')}</h3>
          <p className="mb-4 text-sm text-fg-secondary">{t('convierteteDesc')}</p>
          {error && <p className="mb-3 text-sm text-danger-text">{error}</p>}
          <button
            type="button"
            onClick={handleBecomeSeller}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-action px-4 py-2 text-sm font-medium text-fg-on-brand transition-colors hover:bg-brand-action-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t('activando') : t('activar')}
            {!loading && <TrendingUp aria-hidden="true" className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
