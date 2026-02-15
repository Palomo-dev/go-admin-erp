/**
 * Supabase client para el WS Server standalone (Node.js puro).
 * NO usa localStorage, document ni window — compatible con Node.js.
 *
 * Exporta `supabase` con la misma interfaz que config.ts para que
 * los servicios compartidos funcionen sin cambios.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://jgmgphmzusbluqhuqihj.supabase.co';

const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbWdwaG16dXNibHVxaHVxaWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwMzQ1MjIsImV4cCI6MjA2MTYxMDUyMn0.yr5TLl2nhevIzNdPnjVkcdn049RB2t2OgqPG0HryVR4';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
