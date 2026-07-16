'use client';

import { useState, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase/config';
import OrganizationList from './OrganizationList';
import { useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';

const CreateOrganizationForm = lazy(() => import('./CreateOrganizationForm'));

export default function ManageOrganizationsTab() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState('');
  const t = useTranslations('org.manageOrgs');
  const [orgToDelete, setOrgToDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  const handleCreateSuccess = () => {
    setShowCreateForm(false);
    setRefetchKey(k => k + 1);
  };

  const handleDeleteOrganization = (orgId: number) => {
    setOrgToDelete(orgId);
  };

  const confirmDelete = async () => {
    if (!orgToDelete) return;
    setDeleting(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('noSession'));

      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('role_id, is_super_admin')
        .eq('user_id', session.user.id)
        .eq('organization_id', orgToDelete)
        .single();

      if (memberError) throw memberError;
      if (memberData.role_id !== 2 && !memberData.is_super_admin) {
        throw new Error(t('noPermissionsDelete'));
      }

      const { error: deleteError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgToDelete);

      if (deleteError) throw deleteError;

      // Verificar si el usuario aún tiene organizaciones
      const { data: remainingOrgs, error: orgCheckError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', session.user.id);

      if (orgCheckError) throw orgCheckError;

      if (!remainingOrgs || remainingOrgs.length === 0) {
        // No tiene más organizaciones, redirigir a selección de organización
        localStorage.removeItem('currentOrganizationId');
        localStorage.removeItem('currentOrganizationName');
        localStorage.removeItem('currentOrganizationType');
        window.location.href = '/auth/select-organization';
      } else {
        // Si la org eliminada era la actual, cambiar a otra
        const currentOrgId = localStorage.getItem('currentOrganizationId');
        if (currentOrgId && parseInt(currentOrgId) === orgToDelete) {
          localStorage.setItem('currentOrganizationId', String(remainingOrgs[0].organization_id));
        }
        setRefetchKey(k => k + 1);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
      setOrgToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900">{t('title')}</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {t('createNew')}
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
        <Suspense fallback={<div>{t('loadingForm')}</div>}>
          <CreateOrganizationForm
            onSuccess={handleCreateSuccess}
            onCancel={() => setShowCreateForm(false)}
            isSignupMode={false}
          />
        </Suspense>
      ) : (
        <div>
          <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
            <p className="text-sm text-blue-700">
              {t('infoMessage')}
            </p>
          </div>
          {/* Mostrar todas las organizaciones con capacidad de filtrado */}
          <OrganizationList
            showActions={true}
            onDelete={handleDeleteOrganization}
            filterActive={false}
            showFilters={true}
            refetchKey={refetchKey}
          />
        </div>
      )}

      <AlertDialog open={orgToDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setOrgToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              {t('confirmDelete')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmDeleteDescription') || 'Esta acción eliminará la organización, sus sucursales y todos los datos asociados. No se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} onClick={() => setOrgToDelete(null)}>
              {t('cancel') || 'Cancelar'}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('deleting') || 'Eliminando...'}
                </>
              ) : (
                t('delete') || 'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
