/** Confirmación de publicación en cada despliegue público. Solo servidor. */
async function confirmarEnWebs(
  organizationId: number,
  payload: Record<string, unknown>,
  confirmar: (ack: Record<string, unknown>) => boolean,
): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const urls = [...new Set((process.env.WEBSITES_BASE_URLS || '').split(',').map((u) => u.trim().replace(/\/+$/, '')).filter((u) => /^https?:\/\//.test(u)))];
  if (!secret || urls.length === 0) return false;
  const resultados = await Promise.all(urls.map(async (base) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${base}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
        body: JSON.stringify({ organization_id: organizationId, ...payload }),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) return false;
      const ack = await res.json() as Record<string, unknown> | null;
      return ack?.ok === true && confirmar(ack);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }));
  return resultados.every(Boolean);
}

/** V2: el lector público debe servir el mismo sitio y la misma revisión. */
export function revalidarPublicacionWeb(organizationId: number, sitioId: string, revisionId: string, branchId: number | null): Promise<boolean> {
  return confirmarEnWebs(organizationId, { publicacion: { sitioId, revisionId, branchId } }, (ack) => ack.revisionId === revisionId && ack.sitioId === sitioId);
}

/** Legacy no tiene revisiones: confirma la invalidación de ajustes, páginas y menús de la org. */
export function revalidarEstructuraWeb(organizationId: number): Promise<boolean> {
  return confirmarEnWebs(organizationId, { estructura: true }, (ack) => ack.estructura === true && ack.organizationId === organizationId);
}
