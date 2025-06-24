'use client';

import { useState, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase/config';
import OrganizationList from './OrganizationList';

const CreateOrganizationForm = lazy(() => import('./CreateOrganizationForm'));

export default function ManageOrganizationsTab() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState('');

  const handleCreateSuccess = () => {
    setShowCreateForm(false);
    window.location.reload();
  };

  const handleDeleteOrganization = async (orgId: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta organización? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      // Check if user is admin of the organization
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No se encontró sesión de usuario');

      const { data: memberData, error: memberError } = await supabase
        .from('profiles')
        .select('role_id')
        .eq('id', session.user.id)
        .eq('organization_id', orgId)
        .single();

      if (memberError) throw memberError;
      if (memberData.role_id !== 2) throw new Error('No tienes permisos para eliminar esta organización');

      // Delete organization
      const { error: deleteError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId);

      if (deleteError) throw deleteError;

      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900">Administrar Organizaciones</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Crear Nueva Organización
        </button>
      </div>

      {error && (
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
      )}

      {showCreateForm ? (
        <Suspense fallback={<div>Cargando formulario...</div>}>
          <CreateOrganizationForm
            onSuccess={handleCreateSuccess}
            onCancel={() => setShowCreateForm(false)}
          />
        </Suspense>
      ) : (
        <div>
          <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
            <p className="text-sm text-blue-700">
              Aquí puedes gestionar todas tus organizaciones. Las organizaciones inactivas no aparecerán en el selector de organizaciones durante el inicio de sesión.
            </p>
          </div>
          {/* Mostrar todas las organizaciones con capacidad de filtrado */}
          <OrganizationList
            showActions={true}
            onDelete={handleDeleteOrganization}
            filterActive={false}
            showFilters={true}
          />
        </div>
      )}
    </div>
  );
}
