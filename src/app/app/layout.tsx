import Link from 'next/link';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-100 border-r border-gray-200 p-4">
        <h1 className="text-xl font-bold mb-6">GO Admin ERP</h1>
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
        </nav>
      </div>
      
      {/* Main content */}
      <div className="flex-1 overflow-auto">
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
