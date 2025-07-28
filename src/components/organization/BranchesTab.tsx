import React, { useEffect, useState } from 'react';
import { Branch } from '@/types/branch';
import { branchService } from '@/lib/services/branchService';
import { BranchForm } from '@/components/branches/BranchForm';

interface BranchAssignment {
  branch_id: number;
  branch_name?: string;
  role_id?: number;
}

interface BranchesTabProps {
  orgId: number;
  userBranches?: BranchAssignment[];
}

const BranchesTab: React.FC<BranchesTabProps> = ({ orgId, userBranches = [] }) => {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const fetchBranches = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await branchService.getBranches(orgId);
      setBranches(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar sucursales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) fetchBranches();
  }, [orgId]);

  const handleCreate = () => {
    setEditingBranch(null);
    setError(null);
    setShowForm(true);
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setError(null);
    setShowForm(true);
  };

  const handleDelete = async (branchId: number) => {
    if (!window.confirm('¿Eliminar esta sucursal?')) return;
    setFormLoading(true);
    try {
      await branchService.deleteBranch(branchId);
      await fetchBranches();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar sucursal');
    } finally {
      setFormLoading(false);
    }
  };

  const handleFormSubmit = async (formData: any) => {
    setFormLoading(true);
    setError(null);
    try {
      if (editingBranch) {
        await branchService.updateBranch(editingBranch.id!, formData);
        setSuccessMessage('Sucursal actualizada exitosamente.');
      } else {
        await branchService.createBranch({ ...formData, organization_id: orgId });
        setSuccessMessage('Sucursal creada exitosamente.');
      }
      setShowForm(false);
      setEditingBranch(null);
      await fetchBranches();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Error al guardar sucursal');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Sucursales</h2>
          <p className="text-sm text-gray-500 mt-1">{branches.length} {branches.length === 1 ? 'sucursal' : 'sucursales'} registradas</p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2 px-5 py-2 text-base font-semibold rounded-lg shadow hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-colors"
          onClick={handleCreate}
          aria-label="Crear nueva sucursal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-5 h-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Nueva Sucursal
        </button>
      </div>
      
      {successMessage && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 text-green-800 border border-green-200 shadow-sm flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      )}
      
      {userBranches && userBranches.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Tus Sucursales Asignadas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {userBranches.map((branch) => (
              <div key={branch.branch_id} className="bg-white overflow-hidden shadow-sm rounded-lg border border-blue-100">
                <div className="px-4 py-4 flex items-center">
                  <div className="flex-shrink-0 h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                    {branch.branch_name ? branch.branch_name.substring(0, 2).toUpperCase() : 'BR'}
                  </div>
                  <div className="ml-4">
                    <div className="font-medium text-gray-900">
                      {branch.branch_name || `Sucursal #${branch.branch_id}`}
                    </div>
                    <div className="text-sm text-blue-600">
                      Miembro asignado
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center items-center">
            <div className="flex flex-col items-center">
              <span className="loading loading-spinner loading-lg text-primary"></span>
              <p className="mt-4 text-gray-600">Cargando sucursales...</p>
            </div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-red-500 font-medium">{error}</p>
          </div>
        ) : branches.length === 0 ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium mb-2">No hay sucursales registradas</p>
            <p className="text-gray-500 text-sm">Crea una nueva sucursal para comenzar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] table-auto">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Sucursal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Ubicación</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Contacto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Asignación</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {branches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                          {branch.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="font-medium text-gray-900 flex items-center">
                            {branch.name}
                            {branch.is_main && (
                              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                                Principal
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{branch.branch_code || 'Sin código'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="font-medium">{branch.city || 'N/A'}</div>
                        <div className="text-gray-500 truncate max-w-[200px]">{branch.address || 'Sin dirección'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="font-medium">{branch.phone || 'N/A'}</div>
                        <div className="text-gray-500">{branch.email || 'Sin email'}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {branch.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <svg className="mr-1.5 h-2 w-2 text-green-500" fill="currentColor" viewBox="0 0 8 8">
                            <circle cx="4" cy="4" r="3" />
                          </svg>
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          <svg className="mr-1.5 h-2 w-2 text-gray-500" fill="currentColor" viewBox="0 0 8 8">
                            <circle cx="4" cy="4" r="3" />
                          </svg>
                          Inactiva
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {userBranches?.some(ub => ub.branch_id === branch.id) ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          <svg className="mr-1.5 h-2 w-2 text-blue-500" fill="currentColor" viewBox="0 0 8 8">
                            <circle cx="4" cy="4" r="3" />
                          </svg>
                          Asignado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          No asignado
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button 
                          className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          onClick={() => handleEdit(branch)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Editar
                        </button>
                        <button 
                          className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          onClick={() => handleDelete(branch.id!)}
                          disabled={formLoading}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Modal for create/edit form */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
          <div className="min-h-screen px-2 sm:px-4 py-4 sm:py-8 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden relative animate-in fade-in-0 zoom-in-95 duration-300">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {editingBranch ? 'Modifica la información de la sucursal' : 'Completa la información para crear una nueva sucursal'}
                  </p>
                </div>
                <button 
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors" 
                  onClick={() => setShowForm(false)}
                  disabled={formLoading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Error Message */}
              {error && (
                <div className="mx-4 sm:mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}
              
              {/* Form Content */}
              <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
                <BranchForm
                  initialData={editingBranch ? editingBranch : { organization_id: orgId }}
                  onSubmit={handleFormSubmit}
                  isLoading={formLoading}
                  submitLabel={editingBranch ? 'Actualizar Sucursal' : 'Crear Sucursal'}
                  noFormWrapper={true}
                />
              </div>
              
              {/* Footer with actions */}
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  disabled={formLoading}
                >
                  Cancelar
                </button>
                <div className="flex items-center gap-3">
                  {formLoading && (
                    <div className="flex items-center text-sm text-gray-500">
                      <span className="loading loading-spinner loading-sm mr-2"></span>
                      Guardando...
                    </div>
                  )}
                  <button
                    type="submit"
                    form="branch-form"
                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    disabled={formLoading}
                  >
                    {editingBranch ? 'Actualizar Sucursal' : 'Crear Sucursal'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchesTab;