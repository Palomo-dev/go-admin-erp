/** Read every server page before exposing totals or exporting the list. */
export async function readRedPages<T>(url: string): Promise<{data: T[]; body: Record<string, unknown>}> {
  const data: T[] = [];
  let first: Record<string, unknown> = {};
  for (let offset = 0; ; offset += 200) {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}limit=200&offset=${offset}`, {cache: 'no-store'});
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'No se pudo actualizar la lista');
    if (!Array.isArray(body.data) || typeof body.count !== 'number' || !Number.isSafeInteger(body.count) || body.count < 0) throw new Error('No se pudo actualizar la lista');
    if (offset === 0) first = body;
    data.push(...body.data as T[]);
    if (data.length >= body.count) return {data, body: first};
    if (body.data.length === 0) throw new Error('No se pudo actualizar la lista');
  }
}
