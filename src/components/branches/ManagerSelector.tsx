import React, { useState, useEffect } from 'react';
import { Member, memberService } from '@/lib/services/memberService';
import { UserIcon } from '@heroicons/react/24/outline';
import { getAvatarUrl } from '@/lib/supabase/imageUtils';

interface ManagerSelectorProps {
  organizationId: number;
  currentManagerId?: string | null;
  onManagerSelect: (managerId: string | null) => void;
  disabled?: boolean;
}

export const ManagerSelector: React.FC<ManagerSelectorProps> = ({
  organizationId,
  currentManagerId,
  onManagerSelect,
  disabled = false
}) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchAvailableManagers();
  }, [organizationId]);

  const fetchAvailableManagers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await memberService.getAvailableManagers(organizationId);
      setMembers(data);
    } catch (err: any) {
      console.error('Error fetching available managers:', err);
      setError(err.message || 'Error al cargar empleados disponibles');
    } finally {
      setLoading(false);
    }
  };

  const handleManagerSelect = (managerId: string | null) => {
    onManagerSelect(managerId);
    setIsOpen(false);
  };

  const getCurrentManager = () => {
    if (!currentManagerId) return null;
    return members.find(member => member.user_id === currentManagerId);
  };

  const currentManager = getCurrentManager();

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <span className="loading loading-spinner loading-sm"></span>
        <span className="text-sm text-gray-500">Cargando empleados...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 flex items-center">
        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        {error}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={`relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
          disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'hover:bg-gray-50'
        }`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="flex items-center">
          {currentManager ? (
            <>
              {currentManager.profiles[0]?.avatar_url && getAvatarUrl(currentManager.profiles[0].avatar_url) ? (
                <img
                  className="flex-shrink-0 h-6 w-6 rounded-full"
                  src={getAvatarUrl(currentManager.profiles[0].avatar_url)}
                  alt=""
                />
              ) : (
                <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center">
                  <UserIcon className="h-4 w-4 text-gray-500" />
                </div>
              )}
              <span className="ml-3 block truncate">
                {currentManager.profiles[0]?.first_name} {currentManager.profiles[0]?.last_name}
                <span className="text-gray-500 text-xs ml-2">
                  ({currentManager.roles[0]?.name})
                </span>
              </span>
            </>
          ) : (
            <>
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center">
                <UserIcon className="h-4 w-4 text-gray-500" />
              </div>
              <span className="ml-3 block truncate text-gray-500">
                Seleccionar gerente...
              </span>
            </>
          )}
        </span>
        <span className="ml-3 absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-56 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {/* Option to clear selection */}
          <div
            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-50"
            onClick={() => handleManagerSelect(null)}
          >
            <div className="flex items-center">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center">
                <UserIcon className="h-4 w-4 text-gray-500" />
              </div>
              <span className="ml-3 block truncate text-gray-500">
                Sin gerente asignado
              </span>
            </div>
            {!currentManagerId && (
              <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                <svg className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </div>

          {/* Available managers */}
          {members.map((member) => (
            <div
              key={member.id}
              className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-50"
              onClick={() => handleManagerSelect(member.user_id)}
            >
              <div className="flex items-center">
                {member.profiles[0]?.avatar_url && getAvatarUrl(member.profiles[0].avatar_url) ? (
                  <img
                    className="flex-shrink-0 h-6 w-6 rounded-full"
                    src={getAvatarUrl(member.profiles[0].avatar_url)}
                    alt=""
                  />
                ) : (
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center">
                    <UserIcon className="h-4 w-4 text-gray-500" />
                  </div>
                )}
                <span className="ml-3 block truncate">
                  {member.profiles[0]?.first_name} {member.profiles[0]?.last_name}
                  <span className="text-gray-500 text-xs ml-2">
                    ({member.roles[0]?.name})
                  </span>
                </span>
              </div>
              {currentManagerId === member.user_id && (
                <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                  <svg className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </div>
          ))}

          {members.length === 0 && (
            <div className="relative py-2 pl-3 pr-9 text-gray-500 text-sm">
              No hay empleados disponibles para asignar como gerentes
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
