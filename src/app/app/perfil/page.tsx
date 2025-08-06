'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase, updatePassword } from '@/lib/supabase/config';
import { User } from '@supabase/supabase-js';
import { ChevronRight, Lock, Edit2, Save, Users, Bell, LogOut, UserX, Globe, Shield, PhoneCall, Mail, AlertTriangle } from 'lucide-react';
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
import { id } from 'date-fns/locale';

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

interface NotificationPreference {
  user_id: string;
  channel?: string;
  mute?: boolean;
  allowed_types?: string[];
  dnd_start?: string;
  dnd_end?: string;
  created_at?: string;
  updated_at?: string;
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
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreference | null>(null);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [mfaMethods, setMfaMethods] = useState<MfaMethod[]>([]);
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
        
        // Obtener preferencias de notificación
        try {
          // Usamos la nueva función RPC para obtener preferencias
          const { data: notifData, error: notifError } = await supabase.rpc('get_user_notification_preferences', {
            p_user_id: session.user.id,
            p_channel: 'email'
          });
            
          if (!notifError && notifData) {
            // La función RPC ya maneja el caso donde no existe el registro,
            // devolviendo valores predeterminados
            setNotificationPrefs({
              user_id: notifData.user_id,
              channel: notifData.channel,
              mute: notifData.mute,
              allowed_types: notifData.allowed_types,
              dnd_start: notifData.dnd_start,
              dnd_end: notifData.dnd_end,
              created_at: notifData.created_at,
              updated_at: notifData.updated_at
            });
            console.log('Preferencias de notificación cargadas correctamente:', notifData);
          } else {
            console.error('Error al obtener preferencias de notificación:', notifError);
            // Usar valores predeterminados como último recurso
            setNotificationPrefs({
              user_id: session.user.id,
              channel: 'email',
              mute: false,
              allowed_types: ['all'],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error('Excepción al obtener preferencias de notificación:', err);
          // Usar valores predeterminados en caso de excepción
          setNotificationPrefs({
            user_id: session.user.id,
            channel: 'email',
            mute: false,
            allowed_types: ['all']
          });
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
    { id: 'eliminar-cuenta', label: 'Eliminar cuenta', icon: <UserX size={18} /> },
  ];

  if (loading) {
    return (
      <div className="w-full flex justify-center items-center p-8 min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600"></div>
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
                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
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
              preferences={{
                // Adaptamos los datos al formato que espera el componente
                id: 'preferences', // ID genérico ya que no existe en la tabla
                user_id: notificationPrefs?.user_id || (user?.id || ''),
                email_enabled: notificationPrefs?.channel === 'email' && !notificationPrefs?.mute,
                push_enabled: notificationPrefs?.channel === 'push' && !notificationPrefs?.mute,
                whatsapp_enabled: notificationPrefs?.channel === 'whatsapp' && !notificationPrefs?.mute,
                do_not_disturb_start: notificationPrefs?.dnd_start || '',
                do_not_disturb_end: notificationPrefs?.dnd_end || '',
                do_not_disturb_enabled: notificationPrefs?.dnd_start !== undefined && notificationPrefs?.dnd_end !== undefined,
                created_at: notificationPrefs?.created_at || new Date().toISOString(),
                updated_at: notificationPrefs?.updated_at || new Date().toISOString()
              } as any}
              onPreferencesUpdated={async (prefs: any) => {
                try {
                  // Determinamos el canal activo basado en las opciones seleccionadas
                  const channel = prefs.email_enabled ? 'email' : prefs.push_enabled ? 'push' : 'whatsapp';
                  const mute = !(prefs.email_enabled || prefs.push_enabled || prefs.whatsapp_enabled);
                  
                  // Guardamos usando la nueva función RPC
                  const { data: savedPrefs, error } = await supabase.rpc('save_user_notification_preferences', {
                    p_user_id: prefs.user_id,
                    p_channel: channel,
                    p_mute: mute,
                    p_allowed_types: ['all'],
                    p_dnd_start: prefs.do_not_disturb_enabled ? prefs.do_not_disturb_start : null,
                    p_dnd_end: prefs.do_not_disturb_enabled ? prefs.do_not_disturb_end : null
                  });
                  
                  if (error) {
                    console.error('Error al guardar preferencias:', error);
                    toast.error('No se pudieron guardar las preferencias de notificación');
                  } else {
                    console.log('Preferencias guardadas correctamente:', savedPrefs);
                    setNotificationPrefs(savedPrefs);
                    toast.success('Preferencias de notificación actualizadas');
                  }
                } catch (err) {
                  console.error('Excepción al guardar preferencias:', err);
                  toast.error('Error al procesar la actualización de preferencias');
                }
              }}
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
        </main>
      </div>
    </div>
  );
}
