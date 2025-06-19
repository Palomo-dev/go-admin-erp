'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { getUserRole, getUserOrganization, supabase } from '@/lib/supabase/config';

// Componente de fallback para las cargas dinámicas
const LoadingFallback = () => (
  <div className="p-4 flex justify-center items-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
  </div>
);

// Componente para manejar errores de carga
const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Error capturado por boundary:', event.error);
      setHasError(true);
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">Ocurrió un error al cargar el componente.</p>
        <button 
          onClick={() => setHasError(false)}
          className="mt-2 px-4 py-2 bg-purple-500 text-white rounded-md"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

// Use dynamic imports con manejo de errores mejorado y prefetching
const MembersTab = lazy(() => {
  // Utilizamos import con prefetch para mejorar la carga
  return import('../../../components/organization/MembersTab')
    .catch(err => {
      console.error('Error al cargar MembersTab:', JSON.stringify(err));
      return { 
        default: () => (
          <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
            <h3 className="font-medium text-lg mb-2">Error al cargar componente de miembros</h3>
            <p>No se pudo cargar la lista de miembros. Por favor, intente recargar la página.</p>
          </div>
        ) 
      };
    });
});

const InvitationsTab = lazy(() => {
  return import('../../../components/organization/InvitationsTab')
    .catch(err => {
      console.error('Error al cargar InvitationsTab:', JSON.stringify(err));
      return { 
        default: () => (
          <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
            <h3 className="font-medium text-lg mb-2">Error al cargar componente de invitaciones</h3>
            <p>No se pudo cargar la lista de invitaciones. Por favor, intente recargar la página.</p>
          </div>
        ) 
      };
    });
});

const OrganizationInfoTab = lazy(() => {
  return import('../../../components/organization/OrganizationInfoTab')
    .catch(err => {
      console.error('Error al cargar OrganizationInfoTab:', JSON.stringify(err));
      return { 
        default: () => (
          <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
            <h3 className="font-medium text-lg mb-2">Error al cargar información de la organización</h3>
            <p>No se pudo cargar la información. Por favor, intente recargar la página.</p>
          </div>
        ) 
      };
    });
});

const CreateOrganizationForm = lazy(() => {
  return import('../../../components/organization/CreateOrganizationForm')
    .catch(err => {
      console.error('Error al cargar CreateOrganizationForm:', JSON.stringify(err));
      return { 
        default: () => (
          <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
            <h3 className="font-medium text-lg mb-2">Error al cargar formulario</h3>
            <p>No se pudo cargar el formulario de creación. Por favor, intente recargar la página.</p>
          </div>
        ) 
      };
    });
});

const OrganizationList = lazy(() => {
  return import('../../../components/organization/OrganizationList')
    .catch(err => {
      console.error('Error al cargar OrganizationList:', JSON.stringify(err));
      return { 
        default: () => (
          <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
            <h3 className="font-medium text-lg mb-2">Error al cargar lista de organizaciones</h3>
            <p>No se pudo cargar la lista. Por favor, intente recargar la página.</p>
          </div>
        ) 
      };
    });
});

const ManageOrganizationsTab = lazy(() => {
  return import('../../../components/organization/ManageOrganizationsTab')
    .catch(err => {
      console.error('Error al cargar ManageOrganizationsTab:', JSON.stringify(err));
      return { 
        default: () => (
          <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
            <h3 className="font-medium text-lg mb-2">Error al cargar gestor de organizaciones</h3>
            <p>No se pudo cargar el gestor. Por favor, intente recargar la página.</p>
          </div>
        ) 
      };
    });
});

const BranchesTab = lazy(() => {
  return import('../../../components/organization/BranchesTab')
    .catch(err => {
      console.error('Error al cargar BranchesTab:', JSON.stringify(err));
      return { 
        default: () => (
          <div className="p-6 rounded-lg border border-red-200 bg-red-50 text-red-700">
            <h3 className="font-medium text-lg mb-2">Error al cargar componente de sucursales</h3>
            <p>No se pudo cargar la lista de sucursales. Por favor, intente recargar la página.</p>
          </div>
        ) 
      };
    });
});

// El componente SettingsTab no existe actualmente en el proyecto
// Cuando se implemente, usar la misma estructura de importación dinámica

export default function OrganizacionPage() {
  const [activeTab, setActiveTab] = useState('members');
  const [orgData, setOrgData] = useState<any>(null);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

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
        .from('organization_members')
        .select('role_id, organization_id')
        .eq('user_id', userId)
        .eq('organization_id', localStorage.getItem('currentOrganizationId'))
        .single();
        
        if (memberError) {
          console.error('Error al obtener información de miembro:', memberError);
          setError('Error al cargar información de usuario');
          return;
        }

        // Verificar si hay resultados
        if (!memberDataList || memberDataList.length === 0) {
          console.error('No se encontró información de membresía para este usuario');
          setError('Usuario no pertenece a ninguna organización');
          return;
        }

        // Utilizar el primer registro por defecto
        const memberData = memberDataList[0];
        console.log('Información de miembro encontrada:', memberData);
        
        // Set role directly from organization_members
        setUserRole(memberData.role_id || memberData.role || 'Sin rol');  
        
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
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-gray-900">Administración de Organización</h1>
        </div>
        <p className="mt-2 text-gray-600">Gestiona miembros, invitaciones y configuración de tu organización</p>
      </div>
      {showCreateForm ? (
        <Suspense fallback={<div>Cargando formulario...</div>}>
          <CreateOrganizationForm
            onSuccess={() => setShowCreateForm(false)}
            onCancel={() => setShowCreateForm(false)}
          />
        </Suspense>
      ) : (
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('members')}
                className={`${activeTab === 'members' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Miembros
              </button>
              <button
                onClick={() => setActiveTab('invitations')}
                className={`${activeTab === 'invitations' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Invitaciones
              </button>
              <button
                onClick={() => setActiveTab('info')}
                className={`${activeTab === 'info' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Información
              </button>
              <button
                onClick={() => setActiveTab('branches')}
                className={`${activeTab === 'branches' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Sucursales
              </button>
              <button
                onClick={() => setActiveTab('manage')}
                className={`${activeTab === 'manage' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Mis Organizaciones
              </button>
            </nav>
          </div>
          <div className="px-4 py-6">
            {activeTab === 'members' && (
              <ErrorBoundary>
                <Suspense fallback={<LoadingFallback />}>
                  <MembersTab orgId={orgData} />
                </Suspense>
              </ErrorBoundary>
            )}
            {activeTab === 'invitations' && (
              <ErrorBoundary>
                <Suspense fallback={<LoadingFallback />}>
                  <InvitationsTab orgId={orgData} />
                </Suspense>
              </ErrorBoundary>
            )}
            {activeTab === 'info' && (
              <ErrorBoundary>
                <Suspense fallback={<LoadingFallback />}>
                  <OrganizationInfoTab orgData={orgData} />
                </Suspense>
              </ErrorBoundary>
            )}
            {activeTab === 'branches' && (
              <ErrorBoundary>
                <Suspense fallback={<LoadingFallback />}>
                  <BranchesTab orgId={orgData} />
                </Suspense>
              </ErrorBoundary>
            )}
            {activeTab === 'manage' && (
              <ErrorBoundary>
                <Suspense fallback={<LoadingFallback />}>
                  <ManageOrganizationsTab />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
        </div>
      )}
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
