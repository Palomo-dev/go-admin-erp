'use client';

import { useState, useEffect, memo, useRef } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Organization, organizationService } from '@/lib/services/organizationService';
import { supabase } from '@/lib/supabase/config';
import { guardarOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { getOrganizationLogoUrl } from '@/lib/supabase/imageUtils';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import CreateOrganizationDialog from '../organization/CreateOrganizationDialog';

interface OrganizationSelectorProps {
  userId?: string;
  className?: string;
  showCreateOption?: boolean;
}

const OrganizationSelector = memo(({ userId, className = '', showCreateOption = true }: OrganizationSelectorProps) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Obtener ID del usuario actual si no se proporciona
  useEffect(() => {
    const fetchUserId = async () => {
      if (userId) return;
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          fetchOrganizations(user.id);
        }
      } catch (error) {
        console.error('Error al obtener usuario:', error);
      }
    };

    if (!userId) {
      fetchUserId();
    } else {
      fetchOrganizations(userId);
    }
  }, [userId]);

  // Cargar organizaciones del usuario
  const fetchOrganizations = async (uid: string) => {
    try {
      setIsLoading(true);
      const orgData = await organizationService.getUserOrganizations(uid);
      setOrganizations(orgData);
      
      // Obtener organización de localStorage o configurar predeterminada
      let savedOrgId: string | null = null;
      
      try {
        savedOrgId = localStorage.getItem('currentOrganizationId');
      } catch (error) {
        console.error('Error al acceder a localStorage:', error);
      }
      
      if (savedOrgId && orgData.some(org => org.id === parseInt(savedOrgId!))) {
        const org = orgData.find(org => org.id === parseInt(savedOrgId!)) || null;
        setSelectedOrg(org);
      } else if (orgData.length > 0) {
        // Definir organización por defecto
        setSelectedOrg(orgData[0]);
        
        // Guardar en localStorage
        try {
          if (orgData[0]?.id) {
            localStorage.setItem('currentOrganizationId', orgData[0].id.toString());
            guardarOrganizacionActiva({
              id: orgData[0].id,
              name: orgData[0].name,
              logo_url: orgData[0].logo_url
            });
          }
        } catch (error) {
          console.error('Error al guardar en localStorage:', error);
        }
      }
    } catch (error) {
      console.error('Error al obtener organizaciones:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar selección de organización
  const handleSelectOrganization = (org: Organization) => {
    setSelectedOrg(org);
    setIsOpen(false);
    
    // Guardar en localStorage
    try {
      if (org.id) {
        localStorage.setItem('currentOrganizationId', org.id.toString());
        
        // Usar la función centralizada para guardar
        guardarOrganizacionActiva({
          id: org.id,
          name: org.name,
          logo_url: org.logo_url,
          slug: org.subdomain
        });
        
        // También guardar en sessionStorage como respaldo
        sessionStorage.setItem('currentOrganizationId', org.id.toString());
        
        // Recargar la página para aplicar los cambios
        window.location.reload();
      }
    } catch (error) {
      console.error('Error al guardar en localStorage:', error);
    }
  };

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Si está cargando, mostrar indicador
  if (isLoading) {
    return (
      <div className={`relative inline-block ${className}`}>
        <div className="flex items-center p-2 rounded-md bg-gray-100 dark:bg-gray-800">
          <span className="animate-pulse bg-gray-200 dark:bg-gray-700 w-24 h-5 rounded"></span>
        </div>
      </div>
    );
  }

  // Si no hay organizaciones, mostrar mensaje
  if (organizations.length === 0) {
    return (
      <div className={`relative w-full ${className}`}>
        <button
          onClick={() => setIsDialogOpen(true)}
          className="w-full flex items-center p-2 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-800/30 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition-all duration-200"
        >
          <Plus size={16} className="mr-2" />
          <span className="text-sm font-medium">Crear Organización</span>
        </button>
        
        <CreateOrganizationDialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          onSuccess={(data) => {
            // Recargar organizaciones después de crear una nueva
            fetchOrganizations(userId || '');
            // Establecer la nueva organización como activa
            if (data && data.id) {
              handleSelectOrganization(data as Organization);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className={`relative w-full ${className}`}>
      {/* Botón del selector */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 shadow-sm hover:shadow"
      >
        {selectedOrg?.logo_url && getOrganizationLogoUrl(selectedOrg.logo_url) ? (
          <div className="w-6 h-6 relative rounded-full overflow-hidden border-2 border-blue-200 dark:border-blue-700 shadow-sm">
            <Image 
              src={getOrganizationLogoUrl(selectedOrg.logo_url)}
              alt={selectedOrg.name || 'Logo organización'}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="w-6 h-6 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-900 text-white text-sm font-medium shadow-sm border-2 border-blue-200 dark:border-blue-700">
            {selectedOrg?.name && selectedOrg.name.charAt(0).toUpperCase()}
          </div>
        )}
        
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1 truncate">
          {selectedOrg?.name || 'Seleccionar'}
        </span>
        
        <ChevronDown size={14} className="text-gray-500 dark:text-gray-400 ml-2" />
      </button>
      
      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 overflow-hidden">
          <div className="py-1 max-h-60 overflow-y-auto">
            {organizations.map(org => (
              <div
                key={org.id}
                onClick={() => handleSelectOrganization(org)}
                className={`flex items-center px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  selectedOrg?.id === org.id ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
              >
                {org.logo_url && getOrganizationLogoUrl(org.logo_url) ? (
                  <div className="w-6 h-6 relative rounded-full overflow-hidden border-2 border-blue-200 dark:border-blue-700 shadow-sm">
                    <Image 
                      src={getOrganizationLogoUrl(org.logo_url)}
                      alt={org.name || 'Logo organización'}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-6 h-6 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-900 text-white text-sm font-medium shadow-sm border-2 border-blue-200 dark:border-blue-700">
                    {org.name && org.name.charAt(0).toUpperCase()}
                  </div>
                )}
                
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {org.name}
                  </p>
                  {org.role && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {org.is_super_admin ? 'Super Admin' : org.role}
                    </p>
                  )}
                </div>
              </div>
            ))}
            
            {showCreateOption && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsDialogOpen(true);
                }}
                className="flex items-center px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 w-full text-left"
              >
                <Plus size={16} className="mr-2" />
                Crear Organización
              </button>
            )}
            
          </div>
        </div>
      )}
      {/* Diálogo de creación de organización accesible desde cualquier punto del componente */}
      <CreateOrganizationDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={(data) => {
          // Recargar organizaciones después de crear una nueva
          fetchOrganizations(userId || '');
          // Establecer la nueva organización como activa
          if (data && data.id) {
            handleSelectOrganization(data as Organization);
          }
        }}
      />
    </div>
  );
});

OrganizationSelector.displayName = 'OrganizationSelector';

export default OrganizationSelector;
