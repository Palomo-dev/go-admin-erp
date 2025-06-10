'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase, updatePassword } from '@/lib/supabase/config';
import { User } from '@supabase/supabase-js';
import { ChevronRight, Lock, Edit2, Save, Users, Bell, LogOut, UserX, Globe, Shield, PhoneCall, Mail, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import Image from 'next/image';
import Link from 'next/link';

// Componentes para las diferentes secciones
import DatosPersonalesSection from '../../../components/profile/DatosPersonalesSection';
import SeguridadSection from '../../../components/profile/SeguridadSection';
import SesionesSection from '../../../components/profile/SesionesSection';
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

interface NotificationPreference {
  id: string;
  user_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  whatsapp_enabled: boolean;
  do_not_disturb_start?: string;
  do_not_disturb_end?: string;
}

interface UserSession {
  id: string;
  user_id: string;
  browser: string;
  os: string;
  ip_address: string;
  last_active: string;
  is_current: boolean;
}

interface UserRole {
  role_id: number;
  organization_id: string;
  branch_id?: string;
  roles: {
    name: string;
  };
  organizations: {
    name: string;
  };
  branches?: {
    name: string;
  };
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
        const { data: notifData, error: notifError } = await supabase
          .from('user_notification_preferences')
          .select('*')
          .eq('user_id', session.user.id)
          .single();
          
        if (notifError && notifError.code !== 'PGRST116') { // No se encontró el registro
          console.error('Error al obtener preferencias de notificación:', notifError);
        } else {
          setNotificationPrefs(notifData || {
            user_id: session.user.id,
            email_enabled: true,
            push_enabled: false,
            whatsapp_enabled: false
          });
        }
        
        // Obtener sesiones del usuario
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('user_devices')
          .select('*')
          .eq('user_id', session.user.id)
          .order('last_active', { ascending: false });
          
        if (sessionsError) {
          console.error('Error al obtener sesiones:', sessionsError);
        } else {
          setUserSessions(sessionsData || []);
        }
        
        // Obtener roles del usuario
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select(`
            role_id,
            organization_id,
            branch_id,
            roles(name),
            organizations(name),
            branches(name)
          `)
          .eq('user_id', session.user.id);
          
        if (rolesError) {
          console.error('Error al obtener roles:', rolesError);
        } else {
          setUserRoles(rolesData || []);
        }
        
        // Obtener organizaciones a las que pertenece el usuario
        const { data: orgsData, error: orgsError } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('status', 'active');
          
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
                {profile?.avatar_url ? (
                  <Image 
                    src={profile.avatar_url} 
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
            <SesionesSection 
              sessions={userSessions}
              onSessionsUpdated={setUserSessions}
            />
          )}
          
          {currentSection === 'organizacion-default' && (
            <OrganizacionDefaultSection 
              profile={profile}
              organizations={organizations}
              onProfileUpdated={setProfile}
            />
          )}
          
          {currentSection === 'notificaciones' && (
            <NotificacionesSection 
              preferences={notificationPrefs}
              user={user}
              onPreferencesUpdated={setNotificationPrefs}
            />
          )}
          
          {currentSection === 'roles' && (
            <RolesSection 
              roles={userRoles}
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
