/**
 * Proveedor DNS de un dominio (Figma B/07-07: «Detectamos que tumarca.com.co
 * está en GoDaddy») y enlaces a sus guías. La detección se hace en el servidor
 * con los nameservers de la zona; la tabla de patrones es pura y la comparte
 * la interfaz (pestaña preseleccionada de `ProviderGuideTabs`).
 */
import type { ProveedorDns } from '@/components/sitio-web/ui/ProviderGuideTabs';

/** Nameservers conocidos por proveedor (sufijos). */
const PATRONES_NS: readonly [ProveedorDns, RegExp][] = [
  ['godaddy', /(^|\.)domaincontrol\.com$/],
  ['cloudflare', /(^|\.)ns\.cloudflare\.com$/],
  ['namecheap', /(^|\.)(registrar-servers\.com|namecheaphosting\.com)$/],
  ['hostinger', /(^|\.)(dns-parking\.com|hostinger\.(com|co|es|com\.co|mx))$/],
];

/** Proveedor a partir de los nameservers; `otro` si no se reconoce ninguno. Puro. */
export function proveedorPorNameservers(nameservers: readonly string[]): ProveedorDns {
  for (const ns of nameservers) {
    const n = ns.toLowerCase().replace(/\.+$/, '');
    for (const [proveedor, re] of PATRONES_NS) if (re.test(n)) return proveedor;
  }
  return 'otro';
}

export type ResolverNs = (zona: string) => Promise<string[]>;

/** Detecta el proveedor; cualquier fallo de DNS cuenta como «Otro proveedor» (no bloquea el flujo). */
export async function detectarProveedor(zona: string, resolverNs: ResolverNs): Promise<ProveedorDns> {
  try {
    return proveedorPorNameservers(await resolverNs(zona));
  } catch {
    return 'otro';
  }
}

/**
 * Guías públicas de cada proveedor para crear registros A y CNAME
 * («Ver guía con capturas en …»). Son páginas de ayuda de terceros: si una
 * cambia de dirección se corrige aquí, en un solo lugar.
 */
export const GUIAS_PROVEEDOR: Readonly<Partial<Record<ProveedorDns, string>>> = {
  godaddy: 'https://www.godaddy.com/help/add-an-a-record-19238',
  cloudflare: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/',
  namecheap: 'https://www.namecheap.com/support/knowledgebase/article.aspx/319/2237/how-can-i-set-up-an-a-address-record-for-my-domain/',
  hostinger: 'https://support.hostinger.com/en/articles/1583227-how-to-manage-dns-records-at-hostinger',
};
