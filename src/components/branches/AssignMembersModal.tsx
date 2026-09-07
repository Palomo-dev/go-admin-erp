'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { memberService } from '@/lib/services/memberService';
import { getAvatarUrl } from '@/lib/supabase/imageUtils';
import { XMarkIcon, UserIcon } from '@heroicons/react/24/outline';

interface AssignMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchId: number;
  branchName: string;
  organizationId: number;
  onSuccess?: () => void;
}

export default function AssignMembersModal({
  isOpen,
  onClose,
  branchId,
  branchName,
  organizationId,
  onSuccess,
}: AssignMembersModalProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [assignedMemberIds, setAssignedMemberIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      fetchAssigned();
    }
  }, [isOpen, branchId]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const data = await memberService.getAvailableManagers(organizationId);
      setMembers(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar miembros');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssigned = async () => {
    try {
      const { data, error } = await supabase
        .from('member_branches')
        .select('organization_member_id')
        .eq('branch_id', branchId);

      if (error) throw error;
      setAssignedMemberIds((data || []).map((item: any) => item.organization_member_id));
    } catch (err: any) {
      console.error('Error fetching assigned:', err);
    }
  };

  const toggleMember = (memberId: number) => {
    setAssignedMemberIds(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      // 1. Eliminar los que ya no están asignados
      const { error: deleteError } = await supabase
        .from('member_branches')
        .delete()
        .eq('branch_id', branchId)
        .not('organization_member_id', 'in', `(${assignedMemberIds.join(',')})`);

      if (deleteError) throw deleteError;

      // 2. Insertar los nuevos (verificando que no existan)
      for (const memberId of assignedMemberIds) {
        const { data: existing } = await supabase
          .from('member_branches')
          .select('id')
          .eq('organization_member_id', memberId)
          .eq('branch_id', branchId)
          .maybeSingle();

        if (!existing) {
          await supabase
            .from('member_branches')
            .insert({
              organization_member_id: memberId,
              branch_id: branchId,
            });
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar asignaciones');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const getProfile = (member: any) =>
    Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col dark:bg-gray-800">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200 dark:from-gray-700 dark:to-gray-700 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 flex items-center">
                <UserIcon className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
                Asignar Miembros
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{branchName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/60 rounded-lg transition-colors dark:hover:bg-gray-600"
              disabled={saving}
            >
              <XMarkIcon className="h-5 w-5 text-gray-500 dark:text-gray-300" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/30 dark:border-red-700">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No hay miembros disponibles en la organización
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Selecciona los miembros que tendrán acceso a esta sucursal
              </p>
              {members.map((member) => {
                const profile = getProfile(member);
                const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Sin nombre';
                const isChecked = assignedMemberIds.includes(member.id);

                return (
                  <label
                    key={member.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
                        : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleMember(member.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center dark:bg-gray-600">
                      {profile?.avatar_url && getAvatarUrl(profile.avatar_url) ? (
                        <img
                          src={getAvatarUrl(profile.avatar_url)!}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                          {fullName.substring(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                        {fullName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {profile?.email}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:text-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Guardando...
              </span>
            ) : (
              'Guardar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
