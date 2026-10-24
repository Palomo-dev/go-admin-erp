'use client';

/**
 * Pide al servidor del ERP que invalide el documento publicado en la tienda.
 * Resuelve true solo cuando la tienda confirma que descartó la caché.
 */
export async function pedirRevalidacionSitio(siteStateId: string | null): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  try {
    const res = await fetch('/api/website/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sitio: true, site_state_id: siteStateId }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { confirmado?: boolean };
    return data.confirmado === true;
  } catch {
    return false;
  }
}
