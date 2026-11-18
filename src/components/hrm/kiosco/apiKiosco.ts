/**
 * Llamadas del kiosco a `/api/hrm/kiosco/**` con la clave del equipo. Solo navegador.
 * Un 401 significa «equipo sin vincular o clave revocada»: el kiosco vuelve a 20.29.7.
 */
export class ErrorKiosco extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string
  ) {
    super(codigo);
    this.name = 'ErrorKiosco';
  }
}

/** Sin red o el servidor no respondió: la marca va a la cola. */
export function esFalloDeRed(e: unknown): boolean {
  return !(e instanceof ErrorKiosco) || e.status >= 500 || e.status === 0;
}

export async function pedirKiosco<T>(ruta: string, llave: string | null, init?: { metodo?: 'GET' | 'POST'; cuerpo?: unknown; timeoutMs?: number }): Promise<T> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), init?.timeoutMs ?? 15_000);
  let r: Response;
  try {
    r = await fetch(ruta, {
      method: init?.metodo ?? 'GET',
      cache: 'no-store',
      signal: control.signal,
      headers: {
        ...(llave ? { Authorization: `Bearer ${llave}` } : {}),
        ...(init?.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.cuerpo !== undefined ? JSON.stringify(init.cuerpo) : undefined,
    });
  } catch {
    throw new ErrorKiosco(0, 'sin_red');
  } finally {
    clearTimeout(reloj);
  }
  const datos = (await r.json().catch(() => null)) as (T & { code?: string }) | null;
  if (!r.ok) throw new ErrorKiosco(r.status, datos?.code ?? 'error');
  return datos as T;
}
