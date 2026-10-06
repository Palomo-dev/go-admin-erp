/**
 * Cliente ÚNICO de la API de Vercel para los dominios de los sitios (SOLO
 * servidor). Endpoints confirmados en la documentación de Vercel (2026-10-06):
 *
 * - Proyecto: POST /v10/projects/{p}/domains · GET|PATCH|DELETE /v9/projects/{p}/domains/{d}
 *   · POST /v9/projects/{p}/domains/{d}/verify
 * - Configuración DNS: GET /v6/domains/{d}/config?projectIdOrName={p}
 *   (recommendedIPv4, recommendedCNAME, misconfigured)
 * - Registrador: PATCH /v1/registrar/domains/{d}/auto-renew · GET /v1/registrar/domains/{d}/auth-code
 *
 * Configuración por entorno, sin valores por defecto cableados:
 * - `VERCEL_API_TOKEN`
 * - `VERCEL_TEAM_ID`
 * - `VERCEL_SITIOS_PROJECT_ID`: el proyecto que SIRVE los sitios públicos
 *   (goadmin-websites). No se usa `VERCEL_PROJECT_ID`, que Vercel inyecta con
 *   el id del proyecto del ERP y apuntaría los dominios al lugar equivocado.
 *
 * Sin configuración, `configuracionVercel()` es `null` y las rutas responden
 * con el estado honesto (verificación solo de propiedad, 503 al renovar).
 */
import { esHostValido } from '@/components/sitio-web/dominios/nombreDns';

export interface ConfigVercel {
  token: string;
  teamId: string;
  proyecto: string;
}

export function configuracionVercel(entorno: NodeJS.ProcessEnv = process.env): ConfigVercel | null {
  const token = entorno.VERCEL_API_TOKEN?.trim();
  const teamId = entorno.VERCEL_TEAM_ID?.trim();
  const proyecto = entorno.VERCEL_SITIOS_PROJECT_ID?.trim();
  if (!token || !teamId || !proyecto) return null;
  return { token, teamId, proyecto };
}

/** Solo el registrador (compra, renovación, código): no necesita el proyecto. */
export function configuracionRegistrador(entorno: NodeJS.ProcessEnv = process.env): Omit<ConfigVercel, 'proyecto'> | null {
  const token = entorno.VERCEL_API_TOKEN?.trim();
  const teamId = entorno.VERCEL_TEAM_ID?.trim();
  if (!token || !teamId) return null;
  return { token, teamId };
}

export class ErrorVercel extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorVercel';
  }
}

type Fetch = typeof fetch;

/** Desafío de propiedad que Vercel pide cuando el dominio está en otra cuenta (TXT `_vercel`). */
export interface DesafioVercel {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

export interface DominioProyecto {
  name: string;
  apexName: string;
  verified: boolean;
  redirect?: string | null;
  redirectStatusCode?: number | null;
  verification?: DesafioVercel[];
}

export interface ConfigDns {
  misconfigured: boolean;
  /** Primer IPv4 recomendado para un registro A en la raíz. */
  ipv4: string | null;
  /** Primer CNAME recomendado para un subdominio (www). */
  cname: string | null;
}

/** Host validado antes de meterlo en una URL autenticada (sin `../`, `?` ni `#`). */
function ruta(host: string): string {
  if (!esHostValido(host)) throw new ErrorVercel(400, 'host_invalido', 'Dominio no válido');
  return encodeURIComponent(host);
}

async function llamar<T>(cfg: Omit<ConfigVercel, 'proyecto'>, metodo: string, camino: string, cuerpo?: unknown, f: Fetch = fetch): Promise<T | null> {
  const sep = camino.includes('?') ? '&' : '?';
  const respuesta = await f(`https://api.vercel.com${camino}${sep}teamId=${encodeURIComponent(cfg.teamId)}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    cache: 'no-store',
  });
  if (respuesta.status === 404) return null;
  const json = (await respuesta.json().catch(() => ({}))) as { error?: { code?: string; message?: string } } & Record<string, unknown>;
  if (!respuesta.ok) {
    throw new ErrorVercel(respuesta.status, json.error?.code ?? 'vercel_error', json.error?.message ?? `Vercel respondió ${respuesta.status}`);
  }
  return json as T;
}

export function crearClienteVercel(cfg: ConfigVercel, f: Fetch = fetch) {
  const p = encodeURIComponent(cfg.proyecto);
  return {
    /** Añade el host al proyecto de sitios. Si ya estaba, devuelve el existente. */
    async agregar(host: string, redireccion?: { hacia: string; codigo: number }): Promise<DominioProyecto> {
      try {
        const r = await llamar<DominioProyecto>(
          cfg,
          'POST',
          `/v10/projects/${p}/domains`,
          { name: host, ...(redireccion ? { redirect: redireccion.hacia, redirectStatusCode: redireccion.codigo } : {}) },
          f,
        );
        if (r) return r;
      } catch (e) {
        // 400/409 «ya existe en el proyecto»: se lee el existente.
        if (!(e instanceof ErrorVercel) || (e.estado !== 400 && e.estado !== 409)) throw e;
        const existente = await this.leer(host);
        if (existente) return existente;
        throw e;
      }
      throw new ErrorVercel(502, 'vercel_vacio', 'Vercel no devolvió el dominio');
    },
    leer(host: string): Promise<DominioProyecto | null> {
      return llamar<DominioProyecto>(cfg, 'GET', `/v9/projects/${p}/domains/${ruta(host)}`, undefined, f);
    },
    verificar(host: string): Promise<DominioProyecto | null> {
      return llamar<DominioProyecto>(cfg, 'POST', `/v9/projects/${p}/domains/${ruta(host)}/verify`, undefined, f).catch((e: unknown) => {
        // 400 = «aún no se puede verificar»: no es un fallo, es el estado.
        if (e instanceof ErrorVercel && e.estado === 400) return null;
        throw e;
      });
    },
    async redirigir(host: string, hacia: string | null, codigo = 308): Promise<void> {
      await llamar(cfg, 'PATCH', `/v9/projects/${p}/domains/${ruta(host)}`, hacia ? { redirect: hacia, redirectStatusCode: codigo } : { redirect: null }, f);
    },
    async quitar(host: string): Promise<void> {
      await llamar(cfg, 'DELETE', `/v9/projects/${p}/domains/${ruta(host)}`, undefined, f);
    },
    async configuracion(host: string): Promise<ConfigDns> {
      const r = await llamar<{
        misconfigured?: boolean;
        recommendedIPv4?: { rank?: number; value?: string[] | string }[];
        recommendedCNAME?: { rank?: number; value?: string }[];
      }>(cfg, 'GET', `/v6/domains/${ruta(host)}/config?projectIdOrName=${p}`, undefined, f);
      const primero = <T extends { rank?: number }>(xs: T[] | undefined) => [...(xs ?? [])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0];
      const v4 = primero(r?.recommendedIPv4)?.value;
      const cname = primero(r?.recommendedCNAME)?.value;
      return {
        misconfigured: r?.misconfigured !== false,
        ipv4: Array.isArray(v4) ? v4[0] ?? null : typeof v4 === 'string' ? v4 : null,
        cname: typeof cname === 'string' ? cname.replace(/\.+$/, '') : null,
      };
    },
  };
}

export type ClienteVercel = ReturnType<typeof crearClienteVercel>;

export function crearClienteRegistrador(cfg: Omit<ConfigVercel, 'proyecto'>, f: Fetch = fetch) {
  return {
    async autoRenovar(host: string, encender: boolean): Promise<void> {
      await llamar(cfg, 'PATCH', `/v1/registrar/domains/${ruta(host)}/auto-renew`, { autoRenew: encender }, f);
    },
    async codigoAutorizacion(host: string): Promise<string> {
      const r = await llamar<{ authCode?: string }>(cfg, 'GET', `/v1/registrar/domains/${ruta(host)}/auth-code`, undefined, f);
      if (!r?.authCode) throw new ErrorVercel(502, 'sin_codigo', 'El registrador no devolvió el código');
      return r.authCode;
    },
  };
}

export type ClienteRegistrador = ReturnType<typeof crearClienteRegistrador>;
