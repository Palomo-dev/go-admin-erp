'use client';

import { useState, useEffect } from 'react';
import { Building, ChevronDown } from 'lucide-react';
import { Branch } from '@/types/branch';
import { branchService } from '@/lib/services/branchService';
import { getOrganizationId, guardarOrganizacionActiva } from '@/lib/utils/useOrganizacion';

interface BranchSelectorProps {
  organizationId?: number;
  className?: string;
}

const BranchSelector = ({ organizationId, className = '' }: BranchSelectorProps) => {
  // Si no se proporciona organizationId, usar la organización activa de la utilidad centralizada
  // El operador de aserción no nulo (!) asegura que orgId sea siempre un número válido
  const orgId = organizationId !== undefined ? organizationId : getOrganizationId();
  
  // Guardamos la organización activa para asegurar consistencia
  if (orgId) {
    guardarOrganizacionActiva({ id: orgId });
  }
  
  console.log('BranchSelector usando organization_id:', orgId);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch branches when component mounts
  useEffect(() => {
    const fetchBranches = async () => {
      if (!orgId) return;
      
      try {
        setIsLoading(true);
        const branchData = await branchService.getBranches(orgId);
        setBranches(branchData);
        
        // Get branch from localStorage or set default
        let savedBranchId: string | null = null;
        
        // Safe localStorage access
        try {
          savedBranchId = localStorage.getItem('currentBranchId');
        } catch (error) {
          console.error('Error accessing localStorage:', error);
        }
        
        if (savedBranchId && branchData.some(b => b.id === parseInt(savedBranchId))) {
          const branch = branchData.find(b => b.id === parseInt(savedBranchId)) || null;
          setSelectedBranch(branch);
        } else if (branchData.length > 0) {
          // Try to find main branch first
          const mainBranch = branchData.find(b => b.is_main === true);
          const defaultBranch = mainBranch || branchData[0];
          setSelectedBranch(defaultBranch);
          
          // Save to localStorage
          try {
            if (defaultBranch?.id) {
              localStorage.setItem('currentBranchId', defaultBranch.id.toString());
            }
          } catch (error) {
            console.error('Error saving to localStorage:', error);
          }
        }
      } catch (error) {
        console.error('Error fetching branches:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBranches();
  }, [orgId]); // Dependencia actualizada a orgId

  // Handle branch selection
  const handleSelectBranch = (branch: Branch) => {
    setSelectedBranch(branch);
    setIsOpen(false);
    
    // Save branch to localStorage
    try {
      if (branch.id) {
        localStorage.setItem('currentBranchId', branch.id.toString());
        
        // Asegurar que la organización también está guardada correctamente
        guardarOrganizacionActiva({ id: orgId });
        
        // También guardarla en sessionStorage por duplicado para mayor seguridad
        sessionStorage.setItem('currentBranchId', branch.id.toString());
      }
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (isOpen) setIsOpen(false);
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 ${className}`}>
        <Building size={16} className="text-gray-500 dark:text-gray-400" />
        <span className="text-xs text-gray-500 dark:text-gray-400">Cargando...</span>
      </div>
    );
  }

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`flex items-center space-x-1 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 ${className}`}
        title="Seleccionar sucursal"
      >
        <Building size={16} className="text-gray-700 dark:text-gray-300" />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 max-w-[100px] truncate">
          {selectedBranch?.name || 'Seleccionar sucursal'}
        </span>
        <ChevronDown size={14} className="text-gray-500" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-1 max-h-60 overflow-auto" role="menu" aria-orientation="vertical">
            {branches.map((branch) => (
              <button
                key={branch.id}
                className={`block w-full text-left px-4 py-2 text-sm ${
                  selectedBranch?.id === branch.id
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectBranch(branch);
                }}
              >
                <div className="flex items-center">
                  <Building size={14} className="mr-2" />
                  <div>
                    <p className="font-medium">{branch.name}</p>
                    {branch.address && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {branch.address}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchSelector;
