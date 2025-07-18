'use client';

import { useState, useEffect, lazy, Suspense } from 'react';
import { getUserRole, getUserOrganization, supabase } from '@/lib/supabase/config';

// Use dynamic imports to fix TypeScript module not found errors
const MembersTab = lazy(() => import('../../../components/organization/MembersTab'));
const InvitationsTab = lazy(() => import('../../../components/organization/InvitationsTab'));
const OrganizationInfoTab = lazy(() => import('../../../components/organization/OrganizationInfoTab'));
const BranchesTab = lazy(() => import('../../../components/organization/BranchesTab'));
const OrganizationList = lazy(() => import('../../../components/organization/OrganizationList'));
const ManageOrganizationsTab = lazy(() => import('../../../components/organization/ManageOrganizationsTab'));
const CreateOrganizationForm = lazy(() => import('../../../components/organization/CreateOrganizationForm'));

// Definir interfaces para los tipos de datos
interface BranchAssignment {
  branch_id: number;
  branch_name?: string;
  role_id?: number;
}

export default function OrganizacionPage() {
  const [activeTab, setActiveTab] = useState('members');
  const [orgData, setOrgData] = useState<any>(null);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [userBranches, setUserBranches] = useState<BranchAssignment[]>([]);
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
        const currentOrgId = localStorage.getItem('currentOrganizationId');
        
        // Get user's organization and role from organization_members
        const { data: memberData, error: memberError } = await supabase
          .from('organization_members')
          .select('id, role_id, organization_id')
          .eq('user_id', userId)
          .eq('organization_id', currentOrgId)
          .single();
        
        if (memberError) {
          console.error('Error al obtener información de miembro:', memberError);
          setError('Error al cargar información de usuario');
          return;
        }
        
        // Set role directly from organization_members (rol general en la organización)
        setUserRole(memberData.role_id || null);
        
        // Extract organization data
        if (memberData?.organization_id) {
          setOrgData(memberData.organization_id);
          
          // Obtener las sucursales asignadas al miembro
          const { data: branchAssignments, error: branchError } = await supabase
            .from('member_branches')
            .select(`
              branch_id,
              branches:branch_id(name)
            `)
            .eq('organization_member_id', memberData.id);
          
          if (branchError) {
            console.error('Error al obtener sucursales del miembro:', branchError);
          } else if (branchAssignments) {
            // Formatear los datos para establecer en el estado
            const formattedBranches: BranchAssignment[] = branchAssignments.map(item => ({
              branch_id: item.branch_id,
              branch_name: item.branches && typeof item.branches === 'object' ? (item.branches as any).name : undefined
            }));
            
            setUserBranches(formattedBranches);
            console.log('Sucursales del usuario:', formattedBranches);
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

  // If user has no current organization selected, show organization list
  if (!orgData && !error) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Mis Organizaciones
            </h2>
            <p className="mt-4 text-lg leading-6 text-gray-500">
              Selecciona una organización para administrar
            </p>
          </div>
          
          <Suspense fallback={<div>Cargando organizaciones...</div>}>
            <OrganizationList showActions={true} filterActive={true} />
          </Suspense>
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
        
        {userBranches.length > 0 && (
          <div className="mt-4">
            <h2 className="text-lg font-medium text-gray-900">Tus Sucursales</h2>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {userBranches.map((branch) => (
                <div key={branch.branch_id} className="bg-white overflow-hidden shadow rounded-lg border">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg font-medium text-gray-900 truncate">{branch.branch_name || `Sucursal #${branch.branch_id}`}</h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
                Información de la organización
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
            <Suspense fallback={<div className="text-center py-10"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div><p className="mt-2">Cargando...</p></div>}>
              {activeTab === 'members' && <MembersTab orgId={orgData} />}
              {activeTab === 'invitations' && <InvitationsTab orgId={orgData} />}
              {activeTab === 'info' && <OrganizationInfoTab orgData={orgData} />}
              {activeTab === 'branches' && <BranchesTab orgId={orgData} userBranches={userBranches} />}
              {activeTab === 'manage' && <ManageOrganizationsTab />}
            </Suspense>
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

type BranchesTabProps = {
  orgId: string;
  userBranches?: BranchAssignment[];
};