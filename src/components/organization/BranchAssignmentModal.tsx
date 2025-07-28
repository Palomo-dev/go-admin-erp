'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';

interface Branch {
  id: string;
  name: string;
}

interface BranchAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string | number; // Permitir tanto string (UUID) como number (ID numérico)
  memberName: string;
  organizationId: number;
}

export default function BranchAssignmentModal({ isOpen, onClose, memberId, memberName, organizationId }: BranchAssignmentModalProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [assignedBranches, setAssignedBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchBranches();
      fetchAssignedBranches();
    }
  }, [isOpen, memberId]);

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) throw error;
      // Convert branch IDs to strings for consistency with assignedBranches
      const branchesWithStringIds = (data || []).map(branch => ({
        ...branch,
        id: branch.id.toString()
      }));
      setBranches(branchesWithStringIds);
    } catch (err: any) {
      console.error('Error al obtener sucursales:', err);
      setError('No se pudieron cargar las sucursales');
    }
  };

  const fetchAssignedBranches = async () => {
    try {
      setLoading(true);
      
      // Aceptar tanto IDs numéricos como UUIDs
      const memberIdValue = memberId.toString();
      
      if (!memberIdValue) {
        console.error('ID inválido o vacío:', memberId);
        setError('El ID del miembro no es válido');
        setLoading(false);
        return;
      }
      
      // El memberId ya es directamente el id de organization_members
      const organizationMemberId = memberId;
        
      // Obtenemos las asignaciones de sucursales
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('member_branches')
        .select('branch_id')
        .eq('organization_member_id', organizationMemberId);

      if (assignmentsError) throw assignmentsError;
        
      // Convertimos a array de IDs
      const assignedIds = assignmentsData?.map(item => item.branch_id.toString()) || [];
      setAssignedBranches(assignedIds);
    } catch (err: any) {
      console.error('Error al obtener asignaciones:', err);
      setError('No se pudieron cargar las asignaciones de sucursales');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckboxChange = (branchId: string) => {
    setAssignedBranches(prev => {
      if (prev.includes(branchId)) {
        return prev.filter(id => id !== branchId);
      } else {
        return [...prev, branchId];
      }
    });
  };

  const handleSaveAssignments = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      // El memberId ya es directamente el id de organization_members
      const organizationMemberId = memberId;
      
      // Verificar permisos del usuario actual antes de proceder
      const { data: currentUserPerms, error: permsError } = await supabase
        .from('organization_members')
        .select(`
          id,
          organization_id,
          role_id,
          is_super_admin,
          roles!inner(name)
        `)
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .single();
        
      if (permsError || !currentUserPerms) {
        throw new Error('No tienes permisos para asignar sucursales en esta organización');
      }
      
      console.log('Current user permissions:', currentUserPerms);
        
      // Primero eliminamos todas las asignaciones actuales
      const { error: deleteError } = await supabase
        .from('member_branches')
        .delete()
        .eq('organization_member_id', organizationMemberId);

      if (deleteError) throw deleteError;
        
      // Luego creamos las nuevas asignaciones
      if (assignedBranches.length > 0) {
        const assignmentsToInsert = assignedBranches.map(branchId => ({
          organization_member_id: organizationMemberId,
          branch_id: branchId
        }));
          
        const { error: insertError } = await supabase
          .from('member_branches')
          .insert(assignmentsToInsert);

        if (insertError) throw insertError;
      }
        
      setSuccess('Asignaciones actualizadas correctamente');
        
      // Cerrar modal después de un breve delay
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error al guardar asignaciones:', err);
      console.error('Error details:', {
        code: err.code,
        message: err.message,
        details: err.details,
        hint: err.hint,
        memberId,
        assignedBranches,
        organizationId
      });
      setError(err.message || 'Error al actualizar las asignaciones de sucursales');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-1">Asignación de Sucursales</h3>
          <p className="text-sm text-gray-600 mb-6">
            {memberName}
          </p>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
              {error}
            </div>
          )}
          
          {success && (
            <div className="bg-green-50 text-green-600 p-3 rounded-md mb-4">
              {success}
            </div>
          )}
          
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="loading loading-spinner text-primary"></div>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {branches.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay sucursales disponibles</p>
              ) : (
                <div className="space-y-3">
                  {branches.map((branch) => (
                    <div key={branch.id} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`branch-${branch.id}`}
                        checked={assignedBranches.includes(branch.id)}
                        onChange={() => handleCheckboxChange(branch.id)}
                        className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary mr-3"
                      />
                      <label htmlFor={`branch-${branch.id}`} className="text-gray-700">
                        {branch.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveAssignments}
              disabled={loading || saving}
              className="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
