'use client';
import Link from 'next/link';
import { signOut } from '@/lib/supabase/config';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState<string>('');
  const router = useRouter();
  
  useEffect(() => {
    // Obtener el nombre de la organización del localStorage si existe
    const storedOrgName = localStorage.getItem('currentOrganizationName');
    if (storedOrgName) {
      setOrgName(storedOrgName);
    }
  }, []);
  
  const handleSignOut = async () => {
    try {
      setLoading(true);
      await signOut();
      
      // Limpiar localStorage
      localStorage.removeItem('currentOrganizationId');
      localStorage.removeItem('currentOrganizationName');
      localStorage.removeItem('userRole');
      localStorage.removeItem('supabase.auth.token');
      
      // Redireccionar a la página de login
      window.location.replace('/auth/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-100 border-r border-gray-200 p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold">GO Admin ERP</h1>
        </div>
        
        {orgName && (
          <div className="mb-4 p-2 bg-white rounded-md shadow-sm">
            <p className="text-sm font-medium text-gray-900">{orgName}</p>
          </div>
        )}
        
        <nav className="space-y-1">
          <NavLink href="/app/inicio">Inicio</NavLink>
          <NavLink href="/app/crm">CRM</NavLink>
          <NavLink href="/app/hrm">HRM</NavLink>
          <NavLink href="/app/finanzas">Finanzas</NavLink>
          <NavLink href="/app/inventario">Inventario</NavLink>
          <NavLink href="/app/pos">POS</NavLink>
          <NavLink href="/app/pos/parking" className="pl-4 text-sm">Parking</NavLink>
          <NavLink href="/app/pms">PMS</NavLink>
          <NavLink href="/app/calendario">Calendario</NavLink>
          <NavLink href="/app/organizacion">Organización</NavLink>
          <NavLink href="/app/reportes">Reportes</NavLink>
          <NavLink href="/app/timeline">Timeline</NavLink>
          <NavLink href="/app/transporte">Transporte</NavLink>
          <NavLink href="/app/notificaciones">Notificaciones</NavLink>
          <NavLink href="/app/integraciones">Integraciones</NavLink>
          
          <div className="pt-4 mt-4 border-t border-gray-200">
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="w-full flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
            >
              {loading ? 'Cerrando...' : 'Cerrar Sesión'}
            </button>
          </div>
        </nav>
      </div>
      
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 bg-white shadow-sm flex justify-end">
          <button
            onClick={handleSignOut}
            disabled={loading}
            className="px-3 py-1 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
          >
            {loading ? 'Cerrando...' : 'Cerrar Sesión'}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NavLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link 
      href={href}
      className={`block px-3 py-2 rounded-md hover:bg-gray-200 transition-colors ${className}`}
    >
      {children}
    </Link>
  );
}
