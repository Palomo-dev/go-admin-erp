'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/config'
import { useRouter } from 'next/navigation'

// Tipos para representar la información del usuario
interface UserProfile {
  id: string
  email: string
  first_name: string
  last_name: string
  role_id: number
  organization_id: number
  avatar_url?: string
}

interface Organization {
  id: number
  name: string
  description?: string
  logo_url?: string
  type_id: number
  status: string
}

interface OrganizationType {
  id: number
  name: string
  description?: string
}

// Definición de módulos disponibles por tipo de organización
const modulesByOrgType: Record<string, {title: string, description: string, icon: string}[]> = {
  'restaurant': [
    { title: 'Punto de Venta', description: 'Gestiona tus ventas y órdenes', icon: '🧾' },
    { title: 'Inventario', description: 'Control de ingredientes y productos', icon: '📦' },
    { title: 'Reservas', description: 'Gestión de mesas y reservaciones', icon: '📅' },
    { title: 'Empleados', description: 'Administra tu personal', icon: '👥' },
  ],
  'hotel': [
    { title: 'Gestión de Reservas', description: 'Administra las habitaciones y disponibilidad', icon: '🏨' },
    { title: 'Servicios', description: 'Control de servicios adicionales', icon: '🛎️' },
    { title: 'Inventario', description: 'Gestión de suministros e insumos', icon: '📦' },
    { title: 'Empleados', description: 'Administración de personal', icon: '👥' },
  ],
  'retail': [
    { title: 'Ventas', description: 'Registra ventas y devoluciones', icon: '💰' },
    { title: 'Inventario', description: 'Control de stock y productos', icon: '📦' },
    { title: 'Clientes', description: 'Gestión de clientes y fidelización', icon: '👥' },
    { title: 'Proveedores', description: 'Administra tus proveedores', icon: '🚚' },
  ],
  'saas': [
    { title: 'Suscripciones', description: 'Gestión de planes y suscripciones', icon: '📊' },
    { title: 'Clientes', description: 'Administración de usuarios y cuentas', icon: '👥' },
    { title: 'Facturación', description: 'Control de facturación recurrente', icon: '💵' },
    { title: 'Soporte', description: 'Gestión de tickets e incidencias', icon: '🔧' },
  ],
  'gym': [
    { title: 'Membresías', description: 'Gestión de miembros y planes', icon: '💪' },
    { title: 'Clases', description: 'Organización de clases y horarios', icon: '🏋️' },
    { title: 'Empleados', description: 'Administración de entrenadores y personal', icon: '👥' },
    { title: 'Inventario', description: 'Control de equipos e insumos', icon: '📦' },
  ],
  'transport': [
    { title: 'Flota', description: 'Gestión de vehículos y mantenimiento', icon: '🚗' },
    { title: 'Rutas', description: 'Planificación y seguimiento de rutas', icon: '🗺️' },
    { title: 'Conductores', description: 'Administración de conductores', icon: '👥' },
    { title: 'Reservas', description: 'Control de reservas y servicios', icon: '📅' },
  ],
  'parking': [
    { title: 'Estacionamientos', description: 'Gestión de espacios y ubicaciones', icon: '🅿️' },
    { title: 'Tarifas', description: 'Configuración de precios y tiempos', icon: '💰' },
    { title: 'Suscripciones', description: 'Planes de estacionamiento recurrentes', icon: '📊' },
    { title: 'Clientes', description: 'Administración de usuarios regulares', icon: '👥' },
  ],
  'default': [
    { title: 'Ventas', description: 'Gestión de ventas y facturación', icon: '💰' },
    { title: 'Clientes', description: 'Administración de clientes', icon: '👥' },
    { title: 'Inventario', description: 'Control de productos y stock', icon: '📦' },
    { title: 'Empleados', description: 'Gestión de personal', icon: '👤' },
  ]
};

export default function InicioPage() {
  // Estados para almacenar información
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [orgType, setOrgType] = useState<OrganizationType | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const loadUserData = async () => {
      try {
        // 1. Verificar sesión de usuario
        const { data: sessionData } = await supabase.auth.getSession()
        
        if (!sessionData.session) {
          router.push('/auth/login')
          return
        }
        
        setUser(sessionData.session.user)
        
        // 2. Obtener perfil del usuario
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sessionData.session.user.id)
          .single()
        
        if (profileError || !profileData) {
          console.error('Error al cargar perfil:', profileError)
          setLoading(false)
          return
        }
        
        setProfile(profileData)
        
        // 3. Obtener datos de la organización
        if (profileData.organization_id) {
          const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', profileData.organization_id)
            .single()
          
          if (orgError || !orgData) {
            console.error('Error al cargar organización:', orgError)
            setLoading(false)
            return
          }
          
          setOrganization(orgData)
          
          // 4. Obtener tipo de organización
          if (orgData.type_id) {
            const { data: typeData, error: typeError } = await supabase
              .from('organization_types')
              .select('*')
              .eq('id', orgData.type_id)
              .single()
            
            if (!typeError && typeData) {
              setOrgType(typeData)
            }
          }
        }
      } catch (error) {
        console.error('Error al cargar datos:', error)
      } finally {
        setLoading(false)
      }
    }

    loadUserData()
  }, [router])

  // Pantalla de carga
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-light-background dark:bg-dark-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  // Obtener los módulos según el tipo de organización
  const getModules = () => {
    if (!orgType) return modulesByOrgType.default
    return modulesByOrgType[orgType.name as keyof typeof modulesByOrgType] || modulesByOrgType.default
  }

  const modules = getModules()

  return (
    <div className="min-h-screen bg-light-background dark:bg-dark-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Cabecera de bienvenida */}
        <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                Bienvenido, {profile?.first_name || 'Usuario'}
              </h1>
              <p className="text-gray-600 dark:text-gray-300 mt-1">
                {organization?.name || 'Tu organización'} - 
                {orgType ? (
                  <span className="capitalize">{orgType.name}</span>
                ) : 'Organización'}
              </p>
            </div>
            <div className="bg-primary-50 dark:bg-primary-900/30 p-3 rounded-full">
              {orgType?.name === 'restaurant' && '🍽️'}
              {orgType?.name === 'hotel' && '🏨'}
              {orgType?.name === 'retail' && '🛒'}
              {orgType?.name === 'saas' && '💻'}
              {orgType?.name === 'gym' && '💪'}
              {orgType?.name === 'transport' && '🚗'}
              {orgType?.name === 'parking' && '🅿️'}
              {!orgType?.name && '🏢'}
            </div>
          </div>
        </div>
        
        {/* Tarjetas de resumen */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg border border-primary-100 dark:border-primary-800">
            <h3 className="text-lg font-medium text-primary-700 dark:text-primary-300">
              {orgType?.name === 'restaurant' ? 'Ventas del día' : 
               orgType?.name === 'hotel' ? 'Reservas activas' :
               orgType?.name === 'gym' ? 'Miembros activos' :
               'Ventas del día'}
            </h3>
            <p className="text-3xl font-bold text-primary-800 dark:text-primary-200 mt-2">$0.00</p>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
            <h3 className="text-lg font-medium text-blue-700 dark:text-blue-300">Clientes nuevos</h3>
            <p className="text-3xl font-bold text-blue-800 dark:text-blue-200 mt-2">0</p>
          </div>
          
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
            <h3 className="text-lg font-medium text-indigo-700 dark:text-indigo-300">Tareas pendientes</h3>
            <p className="text-3xl font-bold text-indigo-800 dark:text-indigo-200 mt-2">0</p>
          </div>
        </div>
        
        {/* Módulos del sistema */}
        <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Módulos disponibles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {modules.map((module, index) => (
              <div 
                key={index} 
                className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all cursor-pointer"
                onClick={() => console.log(`Módulo seleccionado: ${module.title}`)}
              >
                <div className="text-3xl mb-2">{module.icon}</div>
                <h3 className="text-lg font-medium text-gray-800 dark:text-white">{module.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{module.description}</p>
              </div>
            ))}
          </div>
        </div>
        
        {/* Actividad reciente */}
        <div className="bg-white dark:bg-dark-card shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Actividad reciente</h2>
          <div className="mt-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
            No hay actividad reciente para mostrar
          </div>
        </div>
      </div>
    </div>
  )
}
