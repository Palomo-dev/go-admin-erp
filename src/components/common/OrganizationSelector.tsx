'use client';

import { useState, useEffect, memo, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, Search, Check, X } from 'lucide-react';
import { Organization, organizationService } from '@/lib/services/organizationService';
import { supabase } from '@/lib/supabase/config';
import { guardarOrganizacionActiva, obtenerOrganizacionActiva, cambiarOrganizacionActiva } from '@/lib/hooks/useOrganization';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Renderizamos el panel fuera del árbol del sidebar (portal) para que nunca
  // pueda afectar el ancho/layout de sus contenedores padres.
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleOpen = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setAnchorRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 260) });
    }
    setIsOpen((prev) => !prev);
  };

  // Filtrado por búsqueda (usado en el panel móvil con buscador)
  const filteredOrganizations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return organizations;
    return organizations.filter((org) => org.name?.toLowerCase().includes(q));
  }, [organizations, query]);

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
      
      // Obtener organización guardada — intentar ambas claves de localStorage
      let resolvedOrg: Organization | null = null;
      
      try {
        // 1. Intentar clave primaria
        const savedOrgId = localStorage.getItem('currentOrganizationId');
        if (savedOrgId) {
          resolvedOrg = orgData.find(org => org.id === parseInt(savedOrgId)) || null;
        }
        
        // 2. Fallback: clave del hook useOrganization
        if (!resolvedOrg) {
          const savedOrg = obtenerOrganizacionActiva();
          if (savedOrg?.id) {
            resolvedOrg = orgData.find(org => org.id === savedOrg.id) || null;
          }
        }
      } catch (error) {
        console.error('Error al acceder a localStorage:', error);
      }
      
      if (resolvedOrg) {
        setSelectedOrg(resolvedOrg);
        // Sincronizar ambas claves para evitar desincronización
        try {
          localStorage.setItem('currentOrganizationId', resolvedOrg.id.toString());
          guardarOrganizacionActiva({
            id: resolvedOrg.id,
            name: resolvedOrg.name,
            logo_url: resolvedOrg.logo_url
          });
        } catch { /* silencioso */ }
      } else if (orgData.length > 0) {
        // Solo defaultear a orgData[0] si NO hay nada guardado
        setSelectedOrg(orgData[0]);
        try {
          localStorage.setItem('currentOrganizationId', orgData[0].id.toString());
          guardarOrganizacionActiva({
            id: orgData[0].id,
            name: orgData[0].name,
            logo_url: orgData[0].logo_url
          });
        } catch { /* silencioso */ }
      }
    } catch (error) {
      console.error('Error al obtener organizaciones:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar selección de organización
  const handleSelectOrganization = (org: Organization) => {
    if (!org.id) return;
    setSelectedOrg(org);
    setIsOpen(false);
    setQuery('');

    // Limpia el estado dependiente de la organización anterior (sucursal,
    // modo "todas las sucursales", caché de usuario) y recarga la página
    cambiarOrganizacionActiva({
      id: org.id,
      name: org.name,
      logo_url: org.logo_url,
      slug: org.subdomain
    });
  };

  // Cerrar dropdown al hacer clic fuera (considera también el panel, que se
  // renderiza en un portal fuera del árbol de dropdownRef)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideButton = dropdownRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideButton && !insidePanel) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Cuerpo común del panel (buscador + lista), usado tanto en el modal móvil
  // como en el panel anclado de desktop
  const renderPanelBody = () => (
    <>
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar organización..."
            className="w-full pl-7 pr-2 py-2 text-sm rounded-md bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain py-1" role="menu" aria-orientation="vertical">
        {filteredOrganizations.length === 0 ? (
          <p className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
            No se encontraron organizaciones.
          </p>
        ) : (
          filteredOrganizations.map(org => (
            <div
              key={org.id}
              role="menuitem"
              onClick={() => handleSelectOrganization(org)}
              className={`flex items-center px-4 py-3 sm:py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                selectedOrg?.id === org.id ? 'bg-gray-100 dark:bg-gray-700' : ''
              }`}
            >
              {org.logo_url && getOrganizationLogoUrl(org.logo_url) ? (
                <div className="w-6 h-6 relative rounded-full overflow-hidden border-2 border-blue-200 dark:border-blue-700 shadow-sm flex-shrink-0">
                  <Image
                    src={getOrganizationLogoUrl(org.logo_url)}
                    alt={org.name || 'Logo organización'}
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="w-6 h-6 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 dark:from-blue-600 dark:to-blue-900 text-white text-sm font-medium shadow-sm border-2 border-blue-200 dark:border-blue-700 flex-shrink-0">
                  {org.name && org.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {org.name}
                </p>
                {org.role && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {org.role}
                  </p>
                )}
              </div>

              {selectedOrg?.id === org.id && (
                <Check size={14} className="ml-auto text-blue-600 dark:text-blue-400 flex-shrink-0" />
              )}
            </div>
          ))
        )}

        {showCreateOption && (
          <button
            onClick={() => {
              setIsOpen(false);
              setQuery('');
              setIsDialogOpen(true);
            }}
            className="flex items-center px-4 py-3 sm:py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 w-full text-left border-t border-gray-100 dark:border-gray-700"
          >
            <Plus size={16} className="mr-2" />
            Crear Organización
          </button>
        )}
      </div>
    </>
  );

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
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
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
      
      {/* Panel de selección: renderizado en portal (fuera del árbol del sidebar)
          para que nunca afecte el layout/ancho de sus contenedores padres.
          Móvil: modal centrado a pantalla completa. Desktop: panel anclado al botón. */}
      {isOpen && mounted && createPortal(
        isMobile ? (
          <div data-org-selector-portal className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50">
            <div
              ref={panelRef}
              className="w-full sm:w-96 sm:rounded-lg rounded-t-2xl bg-white dark:bg-gray-800 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Seleccionar organización</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X size={18} className="text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              {renderPanelBody()}
            </div>
          </div>
        ) : (
          <div
            ref={panelRef}
            className="fixed rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-[9999] max-h-80 flex flex-col overflow-hidden"
            style={{
              top: anchorRect?.top ?? 0,
              left: anchorRect?.left ?? 0,
              width: anchorRect?.width ?? 260,
            }}
          >
            {renderPanelBody()}
          </div>
        ),
        document.body
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
