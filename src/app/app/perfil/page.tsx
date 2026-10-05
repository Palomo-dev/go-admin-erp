'use client';

/**
 * «Mi perfil» (Figma `03 Navegación y shell` › «Perfil de usuario», 344:9278).
 *
 * Escritorio (344:9281): cabecera con avatar, nombre, cargo, correo · alta y
 * la organización activa con sus sucursales; debajo, la navegación de
 * secciones y la sección abierta. Móvil (348:12239): la lista de secciones es
 * la entrada y cada sección se abre a pantalla completa con «←».
 *
 * - La sección vive en la URL (`?seccion=seguridad`, `useParametrosUrl` del
 *   kit): sobrevive a recargar, se comparte y «atrás» la recorre. En móvil,
 *   sin `?seccion=` se ve la lista.
 * - Estados del diseño: cargando (344:9761, Skeleton), error (344:10460,
 *   EmptyState con «Reintentar») y sin organización (344:10091, dentro de
 *   «Organización y roles»).
 * - Avisos con `sonner` (el único `Toaster` montado): los de `react-hot-toast`
 *   que usaba el perfil nunca se veían porque su contenedor no estaba montado.
 *
 * La organización activa solo decide qué se resalta (cabecera, permisos);
 * los permisos los resuelve el servidor en `/api/me/permisos`.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { ExternalLink, LogOut, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { PageHeader } from '@/components/kit/PageHeader';
import { clasesBoton } from '@/components/kit/botonClases';
import { useParametrosUrl } from '@/components/kit/useParametroUrl';

import DatosPersonalesSection from '@/components/profile/DatosPersonalesSection';
import SeguridadSection from '@/components/profile/SeguridadSection';
import { DeviceSessions } from '@/components/profile/DeviceSessions';
import NotificacionesSection from '@/components/profile/NotificacionesSection';
import EliminarCuentaSection from '@/components/profile/EliminarCuentaSection';
import PreferenciasSection from '@/components/profile/PreferenciasSection';
import OrganizacionRolesSection, { type MembresiaPerfil } from '@/components/profile/OrganizacionRolesSection';
import { CabeceraPerfil } from '@/components/profile/CabeceraPerfil';
import { NavPerfil } from '@/components/profile/NavPerfil';
import { DialogoFotoPerfil } from '@/components/profile/DialogoFotoPerfil';
import { nombreCompleto, PARAMETRO_SECCION, seccionPerfilDe, vistaMovil, type SeccionPerfil } from '@/components/profile/perfilLogica';

interface Perfil {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  last_org_id?: number | null;
  created_at: string;
}

/** Fila de `organization_members` con los embebidos que pide esta página. */
interface FilaMiembro {
  role_id: number | null;
  is_super_admin?: boolean | null;
  organization_id: number;
  roles?: { name?: string | null } | null;
  organizations?: { id?: number; name?: string | null; logo_url?: string | null } | null;
  member_branches?: { branch_id: number; branches?: { id: number; name: string; is_active: boolean } | null }[] | null;
  job_positions?: { name?: string | null } | null;
}

/** Un embebido muchos-a-uno llega como objeto; con tipos generados viejos, como lista. */
function uno<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

interface DatosPerfil {
  user: User;
  perfil: Perfil | null;
  membresias: MembresiaPerfil[];
  /** Todas, también las inactivas: «Eliminar cuenta» las necesita. */
  organizaciones: { id: string; name: string; slug: string }[];
  esVendedor: boolean;
}

async function cargarDatosPerfil(sinNombre: string): Promise<DatosPerfil | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const userId = session.user.id;

  const [perfilRes, miembrosRes, orgsRes, vendedorRes] = await Promise.all([
    supabase.from('profiles').select('id, email, first_name, last_name, phone, avatar_url, last_org_id, created_at').eq('id', userId).maybeSingle(),
    supabase
      .from('organization_members')
      .select(
        `role_id, is_super_admin, organization_id,
         roles(name),
         organizations(id, name, logo_url),
         member_branches(branch_id, branches!inner(id, name, is_active)),
         job_positions(name)`,
      )
      .eq('user_id', userId)
      .eq('is_active', true),
    supabase.from('organization_members').select('organizations(id, name)').eq('user_id', userId),
    supabase.from('sellers').select('id').eq('auth_user_id', userId).maybeSingle(),
  ]);
  // Sin perfil ni membresías no hay pantalla que mostrar: es el estado de error.
  if (perfilRes.error) throw perfilRes.error;
  if (miembrosRes.error) throw miembrosRes.error;

  const filas = (miembrosRes.data ?? []) as unknown as FilaMiembro[];
  const membresias: MembresiaPerfil[] = filas.map((m) => {
    const org = uno(m.organizations);
    return {
      organizacionId: m.organization_id,
      nombre: org?.name || sinNombre,
      logoUrl: org?.logo_url ?? null,
      rol: uno(m.roles)?.name ?? null,
      roleId: m.role_id,
      esSuperAdmin: m.is_super_admin === true,
      cargo: uno(m.job_positions)?.name ?? null,
      sucursales: (m.member_branches ?? [])
        .map((mb) => uno(mb.branches))
        .filter((b): b is { id: number; name: string; is_active: boolean } => !!b && b.is_active !== false)
        .map((b) => b.name),
    };
  });

  const organizaciones = orgsRes.error
    ? []
    : ((orgsRes.data ?? []) as unknown as { organizations?: { id?: number; name?: string | null } | null }[])
        .map((o) => uno(o.organizations))
        .filter((o): o is { id: number; name: string } => !!o?.id && !!o.name)
        .map((o) => ({ id: String(o.id), name: o.name, slug: String(o.id) }));

  return {
    user: session.user,
    perfil: (perfilRes.data as Perfil | null) ?? null,
    membresias,
    organizaciones,
    esVendedor: !vendedorRes.error && !!vendedorRes.data,
  };
}

function PerfilUsuario() {
  const t = useTranslations('perfil');
  const { leer, fijar } = useParametrosUrl();
  const crudo = leer(PARAMETRO_SECCION);
  const seccion = seccionPerfilDe(crudo);
  const vista = vistaMovil(crudo);

  const [estado, setEstado] = useState<'cargando' | 'error' | 'listo'>('cargando');
  const [datos, setDatos] = useState<DatosPerfil | null>(null);
  const [orgActivaId, setOrgActivaId] = useState<number | null>(null);
  const [foto, setFoto] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      setOrgActivaId(getOrganizationId() || null);
      const d = await cargarDatosPerfil(t('sinNombre'));
      if (!d) {
        setEstado('error');
        return;
      }
      setDatos(d);
      setEstado('listo');
    } catch (e) {
      console.error('[perfil] no se pudo cargar', e);
      setEstado('error');
    }
    // `t` cambia de identidad con el idioma y no debe recargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const elegir = (s: SeccionPerfil) => fijar({ [PARAMETRO_SECCION]: s });
  const actualizarPerfil = (cambios: Partial<Perfil>) =>
    setDatos((d) => (d ? { ...d, perfil: d.perfil ? { ...d.perfil, ...cambios } : d.perfil } : d));

  const user = datos?.user ?? null;
  const perfil = datos?.perfil ?? null;
  const nombre = nombreCompleto(perfil?.first_name, perfil?.last_name);
  const activa = datos?.membresias.find((m) => m.organizacionId === orgActivaId) ?? datos?.membresias[0] ?? null;
  const tituloMovil = vista === 'seccion' ? t(`secciones.${seccion}`) : t('titulo');

  const cabeceraMovil = (
    <PageHeader titulo={tituloMovil} variante={vista === 'seccion' ? 'form' : 'list'} volverA={vista === 'seccion' ? '/app/perfil' : undefined} className="lg:hidden" />
  );

  if (estado === 'cargando') {
    return (
      <div className="w-full space-y-4 bg-canvas p-4 lg:space-y-5 lg:p-6" aria-busy="true">
        {cabeceraMovil}
        <span className="sr-only" role="status">
          {t('cargando')}
        </span>
        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
          <Skeleton className="size-12 rounded-full sm:size-20" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full max-w-72" />
            <Skeleton className="h-5 w-56" />
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
          <div className="w-full shrink-0 space-y-2 rounded-xl border border-line bg-surface p-2 lg:w-[260px]">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
          <div className="hidden flex-1 space-y-4 rounded-xl border border-line bg-surface p-6 lg:block">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (estado === 'error' || !datos) {
    return (
      <div className="w-full bg-canvas p-4 lg:p-6">
        {cabeceraMovil}
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" titulo={t('errorTitulo')} descripcion={t('errorDesc')} onReintentar={() => void cargar()} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 bg-canvas p-4 lg:space-y-5 lg:p-6">
      {cabeceraMovil}

      <div className={vista === 'seccion' ? 'hidden lg:block' : 'block'}>
        <CabeceraPerfil
          nombre={nombre}
          correo={user?.email ?? perfil?.email ?? null}
          avatarUrl={perfil?.avatar_url}
          creadoEn={perfil?.created_at}
          cargo={activa?.cargo ?? null}
          organizacion={activa ? { id: activa.organizacionId, nombre: activa.nombre, logoUrl: activa.logoUrl } : null}
          sucursales={activa?.sucursales ?? []}
          onEditar={() => elegir('datos-personales')}
          onCambiarFoto={() => setFoto(true)}
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <aside className={`w-full shrink-0 lg:w-[260px] ${vista === 'seccion' ? 'hidden lg:block' : 'block'}`}>
          <NavPerfil activa={seccion} onElegir={elegir} />
          <Link href="/auth/logout" className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true, className: 'mt-4 lg:hidden' })}>
            <LogOut aria-hidden="true" className="size-5" strokeWidth={1.5} />
            {t('cerrarSesion')}
          </Link>
        </aside>

        <main className={`min-w-0 flex-1 ${vista === 'seccion' ? 'block' : 'hidden lg:block'}`} aria-label={t(`secciones.${seccion}`)}>
          {seccion === 'datos-personales' && (
            <DatosPersonalesSection profile={perfil} user={user} cargo={activa?.cargo ?? null} onProfileUpdated={actualizarPerfil} />
          )}

          {seccion === 'seguridad' && <SeguridadSection user={user} />}

          {seccion === 'preferencias' && <PreferenciasSection onIrANotificaciones={() => elegir('notificaciones')} />}

          {seccion === 'sesiones' && <DeviceSessions />}

          {seccion === 'organizacion-roles' && (
            <OrganizacionRolesSection
              userId={user?.id ?? null}
              membresias={datos.membresias}
              predeterminadaId={perfil?.last_org_id ?? null}
              organizacionActiva={activa?.nombre ?? null}
              onPredeterminada={(id) => actualizarPerfil({ last_org_id: id })}
              onEditarDatos={() => elegir('datos-personales')}
            />
          )}

          {seccion === 'notificaciones' && (
            <div className="rounded-xl border border-line bg-surface p-4 sm:p-6">
              <NotificacionesSection user={user} />
            </div>
          )}

          {seccion === 'eliminar-cuenta' && (
            <div className="rounded-xl border border-line bg-surface p-4 sm:p-6">
              <EliminarCuentaSection user={user} organizations={datos.organizaciones} profileName={nombre || undefined} />
            </div>
          )}

          {seccion === 'panel-vendedor' && (
            <div className="rounded-xl border border-line bg-surface p-4 sm:p-6">
              <PanelVendedor
                user={user}
                perfil={perfil}
                nombre={nombre}
                isSeller={datos.esVendedor}
                onBecameSeller={() => setDatos((d) => (d ? { ...d, esVendedor: true } : d))}
              />
            </div>
          )}
        </main>
      </div>

      <DialogoFotoPerfil
        abierto={foto}
        onAbiertoChange={setFoto}
        userId={user?.id ?? null}
        nombre={nombre}
        correo={user?.email ?? null}
        fotoActual={perfil?.avatar_url ?? null}
        onGuardada={({ avatar_url }) => actualizarPerfil({ avatar_url })}
      />
    </div>
  );
}

export default function PerfilUsuarioPage() {
  // `useSearchParams` (sección en la URL) necesita un límite de Suspense en el App Router.
  return (
    <Suspense fallback={null}>
      <PerfilUsuario />
    </Suspense>
  );
}

function PanelVendedor({
  user,
  perfil,
  nombre,
  isSeller,
  onBecameSeller,
}: {
  user: User | null;
  perfil: Perfil | null;
  nombre: string;
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
              <button type="button" onClick={abrirPanel} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
                {t('abrir')}
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <BecomeSellerSection user={user} perfil={perfil} nombre={nombre} onBecameSeller={onBecameSeller} />
      )}
    </div>
  );
}

function BecomeSellerSection({ user, perfil, nombre, onBecameSeller }: { user: User | null; perfil: Perfil | null; nombre: string; onBecameSeller: () => void }) {
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
          name: nombre || user.email.split('@')[0],
          email: user.email,
          phone: perfil?.phone || null,
          avatar_url: perfil?.avatar_url || null,
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
          <button type="button" onClick={handleBecomeSeller} disabled={loading} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
            {loading ? t('activando') : t('activar')}
            {!loading && <TrendingUp aria-hidden="true" className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
