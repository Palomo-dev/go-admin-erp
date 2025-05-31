import { createClient } from '@supabase/supabase-js'

// Creación del cliente de Supabase
export const createSupabaseClient = () => {
  // Usamos una URL por defecto para modo desarrollo cuando no hay variables de entorno configuradas
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  // Creamos el cliente con los valores reales o los de demostración
  return createClient(supabaseUrl, supabaseKey)
}

// Cliente para uso en el lado del cliente
export const supabase = createSupabaseClient()