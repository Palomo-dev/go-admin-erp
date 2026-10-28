'use client';

/**
 * Datos de la tienda que dan destino a Llamar, Cómo llegar y Reservar cuando el botón no tiene uno
 * escrito (como los lee la tienda en vivo: sede principal publicada o, si no, la organización).
 * WhatsApp y Pedir salen de los ajustes del editor. Solo lectura; null mientras carga o si falla.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { DatosDestinoTienda } from './menuInferiorLogica';

type Lugar = { phone?: string | null; address?: string | null; city?: string | null; latitude?: number | null; longitude?: number | null };
const conReserva = (pg: { sections?: unknown }) => Array.isArray(pg.sections) && pg.sections.some((x: { type?: string; visible?: boolean } | null) =>
  !!x && (x.type === 'reservation' || x.type === 'reservation_cta') && x.visible !== false);
const texto = (v: unknown) => typeof v === 'string' && v.trim() !== '';

export function useDestinosTienda(a: Record<string, unknown>, restaurante: boolean): DatosDestinoTienda | null {
  const [base, setBase] = useState<{ telefono: boolean; direccion: boolean; reservar: boolean } | null>(null);
  useEffect(() => {
    let vivo = true;
    const org = getOrganizationId();
    if (!org) return;
    (async () => {
      const [o, s, p, m, r] = await Promise.all([
        supabase.from('organizations').select('phone, address, city').eq('id', org).maybeSingle(),
        supabase.from('branches').select('phone, address, city, latitude, longitude, is_main').eq('organization_id', org).eq('is_web_published', true),
        restaurante ? supabase.from('website_pages').select('sections').eq('organization_id', org).eq('is_published', true).is('branch_id', null) : Promise.resolve({ data: [] }),
        restaurante ? supabase.from('restaurant_tables').select('id', { count: 'exact', head: true }).eq('organization_id', org) : Promise.resolve({ count: 0 }),
        restaurante ? supabase.from('restaurant_booking_settings').select('is_enabled').eq('organization_id', org) : Promise.resolve({ data: [] }),
      ]);
      if (!vivo) return;
      const sedes = (s.data ?? []) as (Lugar & { is_main?: boolean })[];
      const sede: Lugar | undefined = sedes.find((x) => x.is_main) ?? sedes[0];
      const og = (o.data ?? {}) as Lugar;
      const tel = sede?.phone ?? og.phone;
      const dir = (sede && ((sede.latitude != null && sede.longitude != null) || texto(sede.address))) || texto(og.address);
      const reservasOn = ((r as { data: { is_enabled?: boolean }[] | null }).data ?? []).some((x) => x.is_enabled !== false);
      setBase({
        telefono: texto(tel),
        direccion: !!dir,
        reservar: ((p as { data: { sections?: unknown }[] | null }).data ?? []).some(conReserva) && ((m as { count: number | null }).count ?? 0) > 0 && reservasOn,
      });
    })().catch(() => vivo && setBase(null));
    return () => { vivo = false; };
  }, [restaurante]);
  if (!base) return null;
  const wa = typeof a.whatsapp_number === 'string' ? a.whatsapp_number.replace(/\D/g, '') : '';
  return { ...base, whatsapp: wa.length >= 7, pedir: a.enable_online_ordering === true };
}
