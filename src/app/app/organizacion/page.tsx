'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { getUserRole, getUserOrganization, supabase } from '@/lib/supabase/config';

// Use dynamic imports to fix TypeScript module not found errors
const MembersTab = lazy(() => import('./components/MembersTab'));
const InvitationsTab = lazy(() => import('./components/InvitationsTab'));
const OrganizationInfoTab = lazy(() => import('./components/OrganizationInfoTab'));
const BranchesTab = lazy(() => import('./components/BranchesTab'));

export default function OrganizacionPage() {
  const [activeTab, setActiveTab] = useState('members');
  const [orgData, setOrgData] = useState<any>(null);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgData = async () => {
      try {
        setLoading(true);
        
        // Get current user session
        const { data: { session } } = await supabase.auth.getSession();
        

        if (!session) {
          setError('No se encontró sesión de usuario');
          return;
        }
        
        // Get user ID
        const userId = session.user.id;

        console.log(userId);
        
        // Get user's organization and role from organization_members
        const { data: memberData, error: memberError } = await supabase
        .from('profiles')
        .select('role_id, organization_id')
        .eq('id', userId)
        .single();
        
        if (memberError) {
          console.error('Error al obtener información de miembro:', memberError);
          setError('Error al cargar información de usuario');
          return;
        }

        console.log(memberData);
        
        // Set role directly from organization_members
        setUserRole(memberData.role_id || 'Sin rol');

        console.log(memberData);  
        
        // Extract organization data safely
        if (memberData?.organization_id) {
          try {
            // Use type assertion to tell TypeScript about the shape of organizations
            setOrgData(memberData.organization_id);
            console.log(orgData);
          } catch (error) {
            console.error('Error parsing organization data:', error);
          }
        }
      } catch (err: any) {
        console.error('Error:', err);
        setError(err.message || 'Error al cargar datos');
      } finally {
        setLoading(false);
      }
    };
    
    fetchOrgData();
  }, []);

  // Verificar si el usuario tiene permisos de admin
  const isOrgAdmin = userRole === 2;

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">No tienes permisos para administrar la organización. Contacta a un administrador.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Administración de Organización</h1>
        <p className="mt-2 text-gray-600">Gestiona miembros, invitaciones y configuración de tu organización</p>
      </div>
      
      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('members')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'members' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Miembros
          </button>
          <button
            onClick={() => setActiveTab('invitations')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'invitations' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Invitaciones
          </button>
          <button
            onClick={() => setActiveTab('orgInfo')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'orgInfo' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Información de Organización
          </button>
          <button
            onClick={() => setActiveTab('branches')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'branches' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Sucursales
          </button>
        </nav>
      </div>
      
      {/* Tab Content */}
      <div className="px-4 py-6">
        <Suspense fallback={<div className="text-center py-10"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div><p className="mt-2">Cargando...</p></div>}>
          {activeTab === 'members' && (
            <MembersTab orgId={orgData || 0} />
          )}
          {activeTab === 'invitations' && (
            <InvitationsTab orgId={orgData || 0} />
          )}
          {activeTab === 'orgInfo' && (
            <OrganizationInfoTab orgData={orgData} />
          )}
          {activeTab === 'branches' && (
            <BranchesTab orgId={orgData || 0} />
          )}
        </Suspense>
      </div>
    </div>
  );
}

// These types ensure the component imports are properly recognized
type MembersTabProps = {
  orgId: string;
};

type InvitationsTabProps = {
  orgId: string;
};

type OrganizationInfoTabProps = {
  orgData: any;
};
