'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase/config'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import Link from 'next/link'
import { 
  Home, 
  ShoppingCart, 
  Hotel, 
  Users, 
  Package, 
  FileText, 
  Menu, 
  X,
  ChevronDown,
  LogOut,
  Settings,
  User,
  Building2
} from 'lucide-react'

interface Organization {
  id: string
  name: string
  type: string
}

interface UserProfile {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  organization_id: string
}

interface Module {
  id: string
  module: string
  is_active: boolean
}

const moduleIcons = {
  pos: ShoppingCart,
  pms: Hotel,
  crm: Users,
  hr: User,
  inventory: Package,
  billing: FileText
}

const moduleNames = {
  pos: 'Punto de Venta',
  pms: 'Gestión de Propiedades',
  crm: 'CRM',
  hr: 'Recursos Humanos',
  inventory: 'Inventario',
  billing: 'Facturación'
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const loadUserData = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      
      if (!sessionData.session) {
        router.push('/auth/login')
        return
      }
      
      setUser(sessionData.session.user)

      // Cargar perfil del usuario
      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', sessionData.session.user.id)
        .single()

      if (profileData) {
        setUserProfile(profileData)

        // Cargar organización
        const { data: orgData } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profileData.organization_id)
          .single()

        if (orgData) {
          setOrganization(orgData)

          // Cargar módulos activos
          const { data: modulesData } = await supabase
            .from('organization_modules')
            .select('*')
            .eq('organization_id', orgData.id)
            .eq('is_active', true)

          if (modulesData) {
            setModules(modulesData)
          }
        }
      }

      setLoading(false)
    }

    loadUserData()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          router.push('/auth/login')
        }
      }
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar móvil */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? '' : 'hidden'}`}>
        <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-800 shadow-xl">
          <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {organization?.name}
            </h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="p-4 space-y-1">
            <Link
              href="/app/inicio"
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                pathname === '/app/inicio'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Home className="w-5 h-5 mr-3" />
              <span>Inicio</span>
            </Link>

            {modules.map((module) => {
              const Icon = moduleIcons[module.module as keyof typeof moduleIcons]
              const name = moduleNames[module.module as keyof typeof moduleNames]
              const href = `/app/${module.module}`

              return (
                <Link
                  key={module.id}
                  href={href}
                  className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                    pathname.startsWith(href)
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  <span>{name}</span>
                </Link>
              )
            })}

            <Link
              href="/app/configuracion"
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                pathname === '/app/configuracion'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Settings className="w-5 h-5 mr-3" />
              <span>Configuración</span>
            </Link>
          </nav>
        </div>
      </div>

      {/* Sidebar desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:bg-white lg:dark:bg-gray-800 lg:shadow-xl lg:flex lg:flex-col">
        <div className="flex items-center p-4 border-b dark:border-gray-700">
          <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400 mr-3" />
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {organization?.name}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {organization?.type === 'restaurant' && 'Restaurante'}
              {organization?.type === 'hotel' && 'Hotel'}
              {organization?.type === 'store' && 'Tienda'}
              {organization?.type === 'saas' && 'SaaS'}
              {organization?.type === 'gym' && 'Gimnasio'}
              {organization?.type === 'transport' && 'Transporte'}
              {organization?.type === 'parking' && 'Parqueadero'}
            </p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/app/inicio"
            className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
              pathname === '/app/inicio'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Home className="w-5 h-5 mr-3" />
            <span>Inicio</span>
          </Link>

          {modules.map((module) => {
            const Icon = moduleIcons[module.module as keyof typeof moduleIcons]
            const name = moduleNames[module.module as keyof typeof moduleNames]
            const href = `/app/${module.module}`

            return (
              <Link
                key={module.id}
                href={href}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                  pathname.startsWith(href)
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                <span>{name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t dark:border-gray-700">
          <Link
            href="/app/configuracion"
            className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
              pathname === '/app/configuracion'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <Settings className="w-5 h-5 mr-3" />
            <span>Configuración</span>
          </Link>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex-1" />

            <div className="flex items-center space-x-4">
              <ThemeToggle />

              {/* Menú de usuario */}
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white">
                    {userProfile?.first_name?.[0]}{userProfile?.last_name?.[0]}
                  </div>
                  <span className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {userProfile?.first_name} {userProfile?.last_name}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 py-1">
                    <div className="px-4 py-2 border-b dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {userProfile?.first_name} {userProfile?.last_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {userProfile?.email}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 capitalize">
                        {userProfile?.role === 'admin' && 'Administrador'}
                        {userProfile?.role === 'manager' && 'Gerente'}
                        {userProfile?.role === 'employee' && 'Empleado'}
                        {userProfile?.role === 'accountant' && 'Contador'}
                      </p>
                    </div>
                    <Link
                      href="/app/perfil"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <User className="w-4 h-4 inline mr-2" />
                      Mi Perfil
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <LogOut className="w-4 h-4 inline mr-2" />
                      Cerrar Sesión
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Contenido */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
