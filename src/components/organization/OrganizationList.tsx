'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';

interface Organization {
  id: number;
  name: string;
  type_id: { name: string };
  role_id?: number;
  is_current?: boolean;
}

interface OrganizationListProps {
  showActions?: boolean;
  onDelete?: (orgId: number) => void;
}

export default function OrganizationList({ showActions = false, onDelete }: OrganizationListProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUserOrganizations();
  }, []);

  const fetchUserOrganizations = async () => {
    try {
      setLoading(true);
      
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No se encontró sesión de usuario');

      // Get user's organizations with role information and current organization
      const { data: organizations, error } = await supabase
  .from('organizations')
  .select(`
    id,
    name,
    type_id,
    organization_types!fk_organizations_organization_type(name),
    owner_user_id
  `)
  .eq('owner_user_id', session.user.id);

      if (error) throw error;

      const { data: memberships, error: memError } = await supabase
  .from('profiles')
  .select('organization_id, role_id')
  .eq('id', session.user.id);

      if (memError) throw memError;

      const orgs = organizations.map(org => ({
        id: org.id,
        name: org.name,
        type_id: { name: org.type_id.name },
        role_id: memberships.find(m => m.organization_id === org.id)?.role_id,
        is_current: memberships.find(m => m.organization_id === org.id)?.role_id === 2,
      }));

      setOrganizations(orgs);
    } catch (err: any) {
      console.error('Error fetching organizations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrganization = async (orgId: number) => {
    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No se encontró sesión de usuario');

      // Update user's current organization
      const { error } = await supabase
        .from('profiles')
        .update({ current_organization_id: orgId })
        .eq('id', session.user.id);

      if (error) throw error;

      // Reload page to reflect changes
      window.location.reload();
    } catch (err: any) {
      console.error('Error selecting organization:', err);
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">{error}</h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {organizations.map((org) => (
          <li key={org.id}>
            <div
              onClick={() => handleSelectOrganization(org.id)}
              className="w-full hover:bg-gray-50 p-4 focus:outline-none cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleSelectOrganization(org.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-blue-600 truncate">{org.name}</p>
                      {org.is_current && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Actual
                        </span>
                      )}
                    </div>
                    <div className="ml-2 flex-shrink-0 flex">
                      <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {org.type_id.name}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      {org.role_id === 2 ? 'Administrador' : 'Miembro'}
                    </p>
                  </div>
                </div>
                <div className="ml-5 flex space-x-3 items-center">
                  {showActions && org.role_id === 2 && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.(org.id);
                      }}
                      className="text-red-600 hover:text-red-900 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Space') {
                          e.stopPropagation();
                          onDelete?.(org.id);
                        }
                      }}
                    >
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
