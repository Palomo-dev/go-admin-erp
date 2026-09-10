/**
 * Reglas puras de dominio (sin BD ni Resend): mapeo de estado del proveedor y
 * cálculo del registro DMARC sugerido.
 *
 * Separado de `domainsService.ts` en la ronda 2 para mantener los módulos por
 * debajo de 300 líneas. `domainsService` lo reexporta, así que los imports
 * existentes (`import { dmarcRecord, mapProviderStatus } from './domainsService'`)
 * siguen funcionando.
 */

import type { DnsRecord, EmailDomainStatus } from './types';

export function mapProviderStatus(status: string | null | undefined, requestedVerify = false): EmailDomainStatus {
  switch (status) {
    case 'verified': return 'verified';
    case 'failed':
    case 'partially_failed': return 'failed';
    case 'pending':
    case 'partially_verified':
    case 'temporary_failure': return requestedVerify ? 'verifying' : 'pending';
    default: return 'pending';
  }
}

/**
 * Sufijos públicos de segundo nivel. Con `slice(-2)` a secas, `crm.acme.com.co`
 * daba `_dmarc.com.co` — un registro DNS imposible de publicar para toda org
 * colombiana (tester r1 #12).
 *
 * DECISIÓN CONSCIENTE (ronda 3): NO se añade la Public Suffix List completa.
 * Razones: (a) supondría una dependencia nueva y `package.json` es archivo
 * compartido y este entorno no permite `npm install`; (b) la PSL son ~9.000
 * entradas que hay que mantener al día, y un fichero congelado envejece peor
 * que esta lista; (c) el único uso es SUGERIR el registro DMARC en la UI: si el
 * sufijo no está, se sugiere un `_dmarc` de más nivel — el usuario lo ve y lo
 * corrige, no se pierde correo ni se degrada la seguridad de nada.
 * La lista se amplió en la ronda 3 con los sufijos que reportó el tester
 * (com.pl, co.in, com.tr) y con el resto de mercados hispanohablantes/UE.
 * Si algún día se quiere exactitud total: `psl` o `tldts` en REG.
 */
const MULTI_LABEL_SUFFIXES = new Set([
  'com.co', 'net.co', 'org.co', 'edu.co', 'gov.co', 'mil.co', 'nom.co',
  'com.mx', 'org.mx', 'net.mx', 'edu.mx', 'gob.mx',
  'com.ar', 'com.br', 'com.pe', 'com.ec', 'com.ve', 'com.uy', 'com.bo', 'com.py',
  'com.gt', 'com.pa', 'com.do', 'com.sv', 'com.hn', 'com.ni', 'com.cr', 'com.cu',
  'net.ar', 'org.ar', 'gob.ar', 'net.br', 'org.br', 'gov.br', 'net.pe', 'org.pe', 'gob.pe',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'co.jp', 'ne.jp', 'or.jp',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'co.nz', 'net.nz', 'org.nz',
  'co.za', 'org.za', 'net.za', 'com.es', 'org.es', 'nom.es', 'gob.es', 'edu.es',
  'com.pl', 'net.pl', 'org.pl', 'edu.pl', 'gov.pl',
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in',
  'com.tr', 'net.tr', 'org.tr', 'gov.tr', 'edu.tr',
  'com.pt', 'com.gr', 'com.ua', 'com.ru', 'com.cn', 'com.hk', 'com.sg', 'com.my',
  'com.ph', 'com.vn', 'com.tw', 'co.kr', 'co.id', 'co.il', 'co.th', 'com.sa', 'com.eg',
  'co.cr', 'com.ng', 'com.gh', 'com.ke', 'co.ke',
]);

/** Dominio registrable (`acme.com.co` a partir de `crm.acme.com.co`). */
export function registrableDomain(domain: string): string {
  const labels = (domain ?? '').trim().toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return MULTI_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

export function dmarcRecord(domain: string): DnsRecord {
  const root = registrableDomain(domain);
  return { record: 'DMARC', name: `_dmarc.${root}`, type: 'TXT', value: `v=DMARC1; p=none; rua=mailto:dmarc@${root}`, ttl: 'Auto', status: 'recommended', recommended: true };
}
