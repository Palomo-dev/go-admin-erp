'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/config'
import Link from 'next/link'

export default function RegisterPage() {
  // Estados para formulario de usuario
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  
  // Estados para formulario de organización
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState('')
  const [orgDescription, setOrgDescription] = useState('')
  
  // Estados para UI
  const [step, setStep] = useState(1) // Paso 1: Datos usuario, Paso 2: Datos organización
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [organizationTypes, setOrganizationTypes] = useState<any[]>([])
  const router = useRouter()

  // Cargar tipos de organizaciones al iniciar
  useEffect(() => {
    const fetchOrganizationTypes = async () => {
      try {
        const { data, error } = await supabase
          .from('organization_types')
          .select('id, name, description')
          .order('name', { ascending: true })
        
        if (error) throw error
        setOrganizationTypes(data || [])
      } catch (err) {
        console.error('Error al cargar tipos de organización:', err)
      }
    }
    
    fetchOrganizationTypes()
  }, [])

  // Función para avanzar al siguiente paso
  const goToNextStep = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    // Validar que las contraseñas coincidan
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    
    // Validar campos obligatorios
    if (!email || !password || !firstName || !lastName) {
      setError('Por favor completa todos los campos obligatorios')
      return
    }
    
    setStep(2)
  }
  
  // Función para volver al paso anterior
  const goToPreviousStep = () => {
    setStep(1)
    setError(null)
  }

  // Función para registrar usuario y organización
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    // Validar campos obligatorios de organización
    if (!orgName || !orgType) {
      setError('Por favor completa el nombre y tipo de organización')
      setLoading(false)
      return
    }

    try {
      // 1. Registrar usuario en auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/login`,
          data: {
            first_name: firstName,
            last_name: lastName
          }
        },
      })

      if (authError) throw authError
      
      if (authData.user) {
        // 2. Crear organización
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .insert([
            { 
              name: orgName, 
              description: orgDescription,
              type_id: parseInt(orgType),
              status: 'active',
            }
          ])
          .select('id')
          .single()
        
        if (orgError) throw orgError
        
        // 3. Crear perfil vinculando usuario y organización
        if (orgData) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([
              {
                id: authData.user.id,
                email: email,
                first_name: firstName,
                last_name: lastName,
                role_id: 2, // org_admin por defecto
                organization_id: orgData.id
              }
            ])
          
          if (profileError) throw profileError
        }
      }

      router.push('/auth/login?registered=true')
    } catch (err: any) {
      setError(err.message || 'Error al registrar usuario')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-light-background dark:bg-dark-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-dark-card rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary-600 dark:text-primary-400">GoAdmin ERP</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            {step === 1 ? 'Datos de usuario' : 'Datos de organización'}
          </p>
          
          {/* Indicador de paso */}
          <div className="flex justify-center mt-4 space-x-2">
            <div className={`w-3 h-3 rounded-full ${step === 1 ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
            <div className={`w-3 h-3 rounded-full ${step === 2 ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 rounded">
            {error}
          </div>
        )}

        {/* Paso 1: Formulario de datos de usuario */}
        {step === 1 && (
          <form className="mt-6 space-y-4" onSubmit={goToNextStep}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  id="firstName"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white dark:bg-dark-background border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Apellido <span className="text-red-500">*</span>
                </label>
                <input
                  id="lastName"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white dark:bg-dark-background border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Correo electrónico <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-dark-background border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Contraseña <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-dark-background border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirmar contraseña <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-dark-background border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Continuar
              </button>
            </div>
          </form>
        )}
        
        {/* Paso 2: Formulario de datos de organización */}
        {step === 2 && (
          <form className="mt-6 space-y-4" onSubmit={handleRegister}>
            <div>
              <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nombre de la organización <span className="text-red-500">*</span>
              </label>
              <input
                id="orgName"
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-dark-background border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div>
              <label htmlFor="orgType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Tipo de organización <span className="text-red-500">*</span>
              </label>
              <select
                id="orgType"
                required
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-dark-background border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Selecciona un tipo</option>
                {organizationTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name.charAt(0).toUpperCase() + type.name.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="orgDescription" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Descripción
              </label>
              <textarea
                id="orgDescription"
                rows={3}
                value={orgDescription}
                onChange={(e) => setOrgDescription(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-dark-background border border-gray-300 dark:border-dark-border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            <div className="flex space-x-4">
              <button
                type="button"
                onClick={goToPreviousStep}
                className="flex-1 flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-background hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Anterior
              </button>
              
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {loading ? 'Procesando...' : 'Registrarse'}
              </button>
            </div>
          </form>
        )}

        <div className="text-center mt-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            ¿Ya tienes una cuenta?{' '}
            <Link href="/auth/login" className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
