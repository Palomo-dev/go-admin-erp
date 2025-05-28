import { createClient } from '@supabase/supabase-js'

// Creación del cliente de Supabase
export const createSupabaseClient = () => {
  // Usamos una URL por defecto para modo desarrollo cuando no hay variables de entorno configuradas
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jgmgphmzusbluqhuqihj.supabase.co'
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbWdwaG16dXNibHVxaHVxaWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwMzQ1MjIsImV4cCI6MjA2MTYxMDUyMn0.yr5TLl2nhevIzNdPnjVkcdn049RB2t2OgqPG0HryVR4'
  
  // Creamos el cliente con los valores reales o los de demostración
  return createClient(supabaseUrl, supabaseKey)
}

// Cliente para uso en el lado del cliente
export const supabase = createSupabaseClient()
