import React, { useState } from 'react';
import { Branch } from '@/types/branch';
import { ManagerSelector } from './ManagerSelector';
import { branchService } from '@/lib/services/branchService';
import { XMarkIcon, UserIcon } from '@heroicons/react/24/outline';

interface AssignManagerModalProps {
  branch: Branch;
  organizationId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedBranch: Branch) => void;
}

export const AssignManagerModal: React.FC<AssignManagerModalProps> = ({
  branch,
  organizationId,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(
    branch.manager_id || null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedBranch = await branchService.assignManager(
        branch.id!,
        selectedManagerId
      );
      
      onSuccess(updatedBranch);
      onClose();
    } catch (err: any) {
      console.error('Error assigning manager:', err);
      setError(err.message || 'Error al asignar gerente');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedManagerId(branch.manager_id || null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in-0 zoom-in-95 duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <UserIcon className="h-5 w-5 mr-2 text-blue-600" />
                Asignar Gerente
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {branch.name}
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="p-2 hover:bg-white/60 rounded-lg transition-colors"
              disabled={loading}
            >
              <XMarkIcon className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleccionar Gerente
              </label>
              <ManagerSelector
                organizationId={organizationId}
                currentManagerId={selectedManagerId}
                onManagerSelect={setSelectedManagerId}
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">
                Solo empleados con roles de Admin, Manager o Empleado pueden ser asignados como gerentes.
              </p>
            </div>

            {/* Current vs New Manager Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Resumen del cambio:</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Gerente actual:</span>
                  <span className="font-medium">
                    {branch.manager_id ? 'Asignado' : 'Sin asignar'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Nuevo gerente:</span>
                  <span className="font-medium">
                    {selectedManagerId ? 'Se asignará' : 'Sin asignar'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            disabled={loading}
          >
            {loading && (
              <span className="loading loading-spinner loading-sm mr-2"></span>
            )}
            {loading ? 'Asignando...' : 'Asignar Gerente'}
          </button>
        </div>
      </div>
    </div>
  );
};
