/**
 * Cambiar el idioma de la persona: en este dispositivo al instante y en su
 * perfil (`profiles.preferred_language`) para que viaje a los demás.
 *
 * Una sola implementación para el panel de sesión y la sección
 * «Preferencias» del perfil (regla 7 de CLAUDE.md). Si guardar en el perfil
 * falla, el idioma cambia igual en este dispositivo y se avisa en consola.
 */
import { supabase } from '@/lib/supabase/config';
import { changeLanguage } from '@/i18n/provider';
import type { Locale } from '@/i18n/config';

export async function guardarIdiomaPreferido(nuevo: Locale): Promise<void> {
  changeLanguage(nuevo);
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase.from('profiles').update({ preferred_language: nuevo }).eq('id', data.user.id);
  if (error) console.warn('[idioma] no se guardó el idioma en el perfil', error.message);
}
