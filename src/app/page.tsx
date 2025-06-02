'use client';
import Link from 'next/link';
import { signOut } from '@/lib/supabase/config';
import { useState } from 'react';

export default function Home() {
  const [loading, setLoading] = useState(false);

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
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="absolute top-4 right-4">
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
        >
          {loading ? 'Cerrando...' : 'Cerrar Sesión'}
        </button>
      </div>
      <h1 className="text-4xl font-bold mb-8">GO Admin ERP</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <ModuleCard name="Inicio" path="/app/inicio" />
        <ModuleCard name="Login" path="/auth/login" />
        <ModuleCard name="Reset Password" path="/auth/reset-password" />
        <ModuleCard name="Forgot Password" path="/auth/forgot-password" />
        <ModuleCard name="CRM" path="/app/crm" />
        <ModuleCard name="HRM" path="/app/hrm" />
        <ModuleCard name="Finanzas" path="/app/finanzas" />
        <ModuleCard name="Inventario" path="/app/inventario" />
        <ModuleCard name="POS" path="/app/pos" />
        <ModuleCard name="PMS" path="/app/pms" />
        <ModuleCard name="Calendario" path="/app/calendario" />
        <ModuleCard name="Organización" path="/app/organizacion" />
        <ModuleCard name="Reportes" path="/app/reportes" />
        <ModuleCard name="Timeline" path="/app/timeline" />
        <ModuleCard name="Transporte" path="/app/transporte" />
        <ModuleCard name="Notificaciones" path="/app/notificaciones" />
        <ModuleCard name="Integraciones" path="/app/integraciones" />
      </div>
    </main>
  );
}

function ModuleCard({ name, path }: { name: string; path: string }) {
  return (
    <Link href={path} className="block">
      <div className="p-6 bg-white border border-gray-200 rounded-lg shadow hover:bg-gray-100">
        <h2 className="text-lg font-semibold">{name}</h2>
      </div>
    </Link>
  );
}
