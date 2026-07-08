'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase, updatePassword } from '@/lib/supabase/config';
import { User } from '@supabase/supabase-js';
import { ChevronRight, Lock, Edit2, Save, Users, Bell, LogOut, UserX, Globe, Shield, PhoneCall, Mail, AlertTriangle, TrendingUp, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import Image from 'next/image';
import Link from 'next/link';
import { getAvatarUrl } from '@/lib/supabase/imageUtils';

// Componentes para las diferentes secciones
import DatosPersonalesSection from '../../../components/profile/DatosPersonalesSection';
import SeguridadSection from '../../../components/profile/SeguridadSection';
import { DeviceSessions } from '../../../components/profile/DeviceSessions';
import OrganizacionDefaultSection from '../../../components/profile/OrganizacionDefaultSection';
import NotificacionesSection from '../../../components/profile/NotificacionesSection';
import RolesSection from '../../../components/profile/RolesSection';
import EliminarCuentaSection from '../../../components/profile/EliminarCuentaSection';

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

interface UserSession {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string;
  is_current: boolean;
  user_agent: string;
  ip: string;
  location?: string;
  device_type: string;
}

interface UserRole {
  id: string;
  role_name: string;
  description: string;
  organization_id: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
  };
  branch_id?: string | null;
  branch?: {
    id: string;
    name: string;
  } | null;
}

interface MfaMethod {
  id: string;
  factor_type: string;
  status: string;
  created_at: string;
}

export default function PerfilUsuarioPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [mfaMethods, setMfaMethods] = useState<MfaMethod[]>([]);
  const [isSeller, setIsSeller] = useState<boolean>(false);
  const [currentSection, setCurrentSection] = useState<string>('datos-personales');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Referencia al formulario para datos personales
  const formRef = useRef<HTMLFormElement>(null);

  // Obtener los datos del usuario al cargar la página
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        
        // Obtener sesión del usuario
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast.error('No se encontró sesión de usuario');
          return;
        }
        
        setUser(session.user);
        
        // Obtener perfil del usuario
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
          
        if (profileError) {
          console.error('Error al obtener perfil:', profileError);
          toast.error('Error al cargar datos de perfil');
        } else {
          setProfile(profileData);
        }
        
        // Obtener sesiones del usuario
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('user_devices')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .order('last_active_at', { ascending: false });
          
        if (sessionsError) {
          console.error('Error al obtener sesiones:', sessionsError);
        } else {
          // Adaptamos los datos al formato esperado por el componente SesionesSection
          const formattedSessions: UserSession[] = (sessionsData || []).map(device => ({
            id: device.id,
            user_id: device.user_id,
            created_at: device.created_at || new Date().toISOString(),
            updated_at: device.updated_at || new Date().toISOString(),
            last_sign_in_at: device.last_active_at, // Usamos last_active_at
            is_current: device.is_current || false,
            user_agent: device.user_agent || '',
            ip: device.ip_address || '',
            location: device.location || undefined,
            device_type: device.device_type || ''
          }));
          
          setUserSessions(formattedSessions);
        }
        
        // Obtener roles del usuario
        const { data: rolesData, error: rolesError } = await supabase
          .from('organization_members')
          .select(`
            role_id,
            organization_id,
            roles!inner(
              name,
              description
            ),
            organizations(
              name
            )
          `)
          .eq('user_id', session.user.id)
          .eq('is_active', true);
          
        if (rolesError) {
          console.error('Error al obtener roles:', rolesError);
        } else {
          // Adaptamos los datos al formato esperado por la interfaz UserRole
          const formattedRoles: UserRole[] = (rolesData || []).map((role, index) => {
            // Aseguramos que todas las propiedades tengan valores válidos
            const roleObj = role as any; // Usamos any para evitar errores de typescript
            return {
              id: `${roleObj.role_id}_${roleObj.organization_id}_${index}`, // ID único combinando role_id, org_id e índice
              role_name: roleObj.roles?.name || 'Sin nombre',
              description: roleObj.roles?.description || '',
              organization_id: roleObj.organization_id?.toString() || '',
              organization: {
                id: roleObj.organization_id?.toString() || '',
                name: roleObj.organizations?.name || 'Sin nombre de organización',
                slug: roleObj.organizations?.slug || roleObj.organization_id?.toString() || ''
              },
              branch_id: null,
              branch: null
            };
          });
          
          setUserRoles(formattedRoles);
        }
        
        // Obtener organizaciones a las que pertenece el usuario
        const { data: orgs, error: orgsError } = await supabase
          .from('organization_members')
          .select(`
            organizations(
              id,
              name
            )
          `)
          .eq('user_id', session.user.id);

        //extract organizations to have an array of organizations ids and names
        const orgsData = orgs?.map((org: any) => ({
          id: org.organizations?.id,
          name: org.organizations?.name
        })).filter(org => org.id && org.name);

        console.log(orgsData);



        if (orgsError) {
          console.error('Error al obtener organizaciones:', orgsError);
        } else {
          setOrganizations(orgsData || []);
        }
        
        // Obtener métodos MFA configurados
        try {
          const { data } = await supabase.auth.mfa.listFactors();
          
          // Unificamos los diferentes tipos de factores en una sola lista
          const allFactors = [...(data?.totp || []), ...(data?.phone || [])];
          
          setMfaMethods(
            allFactors.map((factor: any) => ({
              id: factor.id,
              factor_type: factor.factor_type || 'totp',
              status: factor.status || 'verified',
              created_at: factor.created_at || new Date().toISOString()
            })) || []
          );
        } catch (mfaError) {
          console.error('Error al obtener métodos MFA:', mfaError);
          // No interrumpir el flujo si falla MFA
        }

        // Verificar si el usuario es vendedor
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
        toast.error('Error al cargar datos del usuario');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleSectionChange = (section: string) => {
    setCurrentSection(section);
  };

  // Secciones de la página de perfil
  const sections = [
    { id: 'datos-personales', label: 'Datos personales', icon: <Edit2 size={18} /> },
    { id: 'seguridad', label: 'Seguridad', icon: <Lock size={18} /> },
    { id: 'sesiones', label: 'Sesiones y dispositivos', icon: <Globe size={18} /> },
    { id: 'organizacion-default', label: 'Organización por defecto', icon: <Users size={18} /> },
    { id: 'notificaciones', label: 'Preferencias de notificación', icon: <Bell size={18} /> },
    { id: 'roles', label: 'Roles asignados', icon: <Shield size={18} /> },
    { id: 'panel-vendedor', label: 'Panel de Vendedor', icon: <TrendingUp size={18} /> },
    { id: 'eliminar-cuenta', label: 'Eliminar cuenta', icon: <UserX size={18} /> },
  ];

  if (loading) {
    return (
      <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Skeleton sidebar */}
          <aside className="w-full lg:w-64 shrink-0">
            <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4">
              <div className="flex flex-col items-center mb-6 p-4">
                <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse mb-4" />
                <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
                <div className="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700/50 rounded-md animate-pulse" />
                ))}
              </div>
            </div>
          </aside>
          {/* Skeleton content */}
          <main className="flex-grow bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6">
            <div className="h-7 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
            <div className="h-4 w-72 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-8" />
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse" />
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Barra lateral con opciones */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg p-4">
            <div className="flex flex-col items-center mb-6 p-4">
              <div className="relative w-20 h-20 mb-4">
                {profile?.avatar_url && getAvatarUrl(profile.avatar_url) ? (
                  <Image 
                    src={getAvatarUrl(profile.avatar_url)} 
                    alt="Avatar" 
                    fill 
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <span className="text-xl font-bold text-gray-500 dark:text-gray-300">
                      {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 
                       profile?.first_name ? profile.first_name.charAt(0).toUpperCase() : '?'}
                    </span>
                  </div>
                )}
              </div>
              <h3 className="text-lg font-semibold dark:text-gray-200">
                {profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
            </div>

            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSectionChange(section.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-left
                    ${
                      currentSection === section.id
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`}
                >
                  <div className="flex items-center">
                    <span className="mr-3">{section.icon}</span>
                    <span className="text-sm">{section.label}</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Contenido principal */}
        <main className="flex-grow bg-white dark:bg-gray-800 shadow-sm rounded-lg p-6">
          {currentSection === 'datos-personales' && (
            <DatosPersonalesSection 
              profile={profile} 
              user={user}
              onProfileUpdated={setProfile}
            />
          )}
          
          {currentSection === 'seguridad' && (
            <SeguridadSection 
              user={user}
              mfaMethods={mfaMethods}
              onMfaUpdated={setMfaMethods}
            />
          )}
          
          {currentSection === 'sesiones' && (
            <DeviceSessions />
          )}
          
          {currentSection === 'organizacion-default' && (
            <OrganizacionDefaultSection 
              user={user}
              profile={profile}
              organizations={organizations}
              onProfileUpdated={setProfile}
            />
          )}
          
          {currentSection === 'notificaciones' && (
            <NotificacionesSection 
              user={user}
            />
          )}
          
          {currentSection === 'roles' && (
            <RolesSection 
              roles={userRoles as any}
              user={user}
            />
          )}
          
          {currentSection === 'eliminar-cuenta' && (
            <EliminarCuentaSection 
              user={user}
            />
          )}

          {currentSection === 'panel-vendedor' && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Panel de Vendedor</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Vende con nosotros y genera comisiones por cada referencia.
              </p>

              {isSeller ? (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                      <TrendingUp className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-green-900 dark:text-green-300 mb-1">
                        Ya eres vendedor
                      </h3>
                      <p className="text-sm text-green-700 dark:text-green-400 mb-4">
                        Tu cuenta está vinculada al panel de vendedores. Accede para ver tus comisiones, pagos y referidos.
                      </p>
                      <a
                        href={process.env.NEXT_PUBLIC_SELLERS_URL || 'https://sellers.goadmin.io'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Abrir Panel de Vendedor
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <BecomeSellerSection
                  user={user}
                  profile={profile}
                  onBecameSeller={() => setIsSeller(true)}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function BecomeSellerSection({ user, profile, onBecameSeller }: {
  user: User | null;
  profile: Profile | null;
  onBecameSeller: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sellersUrl = process.env.NEXT_PUBLIC_SELLERS_URL || 'https://sellers.goadmin.io';

  const handleBecomeSeller = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${sellersUrl}/api/become-seller`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_user_id: user?.id,
          name: profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || user?.email?.split('@')[0],
          email: user?.email,
          phone: profile?.phone || null,
          avatar_url: profile?.avatar_url || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear cuenta de vendedor');
      }

      toast.success('¡Ya eres vendedor! Tu cuenta ha sido vinculada.');
      onBecameSeller();
    } catch (err: any) {
      setError(err.message || 'Error al procesar la solicitud');
      toast.error('Error al convertirse en vendedor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-medium text-blue-900 dark:text-blue-300 mb-1">
            Conviértete en vendedor
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">
            Activa tu cuenta de vendedor y empieza a generar comisiones por cada cliente que refieras. Usarás las mismas credenciales, mismo correo y mismo avatar que en el ERP.
          </p>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
          )}
          <button
            onClick={handleBecomeSeller}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Activando...
              </>
            ) : (
              <>
                Activar cuenta de vendedor
                <TrendingUp className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
