/**
 * Selector de método de pago con buscador (Figma «07 Finanzas» › Tesorería v2, 2714:150934 y
 * 2714:151166; aprobado por el dueño el 2026-11-21): la lista de métodos ya no cabía en un
 * select. Aquí, sin React ni Supabase: qué opciones hay, de qué tipo es cada una (para los
 * chips de filtro), si la organización ya la tiene, si la pasarela está conectada, y el filtro
 * por texto (sin tildes) y por chips.
 */

export type GrupoMetodoPago = 'manual' | 'pasarela';
export type FiltroMetodoPago = 'efectivo_bancos' | 'billeteras' | 'pasarelas' | 'qr';
export const FILTROS_METODO_PAGO: readonly FiltroMetodoPago[] = ['efectivo_bancos', 'billeteras', 'pasarelas', 'qr'];

export interface OpcionMetodoPago {
  /** Valor que entiende el formulario: el código del método o `integration_<código>`. */
  valor: string;
  codigo: string;
  nombre: string;
  grupo: GrupoMetodoPago;
  tipo: FiltroMetodoPago;
  /** La organización ya tiene este método (no se agrega dos veces). */
  yaLoTiene: boolean;
  /** Solo pasarelas: hay una conexión activa del proveedor. */
  conectada: boolean | null;
}

/** Código de conector (`integration_connectors.code`) → código de integración del formulario. */
export const INTEGRACION_DE_CONECTOR: Readonly<Record<string, string>> = {
  wompi_co: 'wompi',
  mp_checkout: 'mercadopago',
  payu_co: 'payu',
  stripe_payments: 'stripe',
  paypal_checkout: 'paypal',
  bancolombia_qr: 'bancolombia_qr',
  breb_mono: 'breb_qr',
  redeban_qr: 'redeban_qr',
  bold_link: 'bold_link',
  bold_pos: 'bold_qr',
};

const BILLETERAS = new Set(['nequi', 'daviplata', 'wallet', 'billetera']);

export function tipoDeMetodo(codigo: string, grupo: GrupoMetodoPago): FiltroMetodoPago {
  const c = codigo.toLowerCase();
  if (c.endsWith('_qr') || c === 'qr') return 'qr';
  if (grupo === 'pasarela') return 'pasarelas';
  if (BILLETERAS.has(c)) return 'billeteras';
  return 'efectivo_bancos';
}

export function construirOpcionesMetodoPago(entrada: {
  manuales: readonly { code: string; name: string }[];
  integraciones: readonly { code: string; name: string }[];
  codigosOrganizacion: readonly string[];
  conectoresConectados: readonly string[];
}): OpcionMetodoPago[] {
  const propios = new Set(entrada.codigosOrganizacion.map((c) => c.toLowerCase()));
  const conectadas = new Set(entrada.conectoresConectados.map((c) => INTEGRACION_DE_CONECTOR[c]).filter(Boolean));
  const manuales: OpcionMetodoPago[] = entrada.manuales.map((m) => ({
    valor: m.code,
    codigo: m.code,
    nombre: m.name,
    grupo: 'manual',
    tipo: tipoDeMetodo(m.code, 'manual'),
    yaLoTiene: propios.has(m.code.toLowerCase()),
    conectada: null,
  }));
  const pasarelas: OpcionMetodoPago[] = entrada.integraciones.map((i) => ({
    valor: `integration_${i.code}`,
    codigo: i.code,
    nombre: i.name,
    grupo: 'pasarela',
    tipo: tipoDeMetodo(i.code, 'pasarela'),
    yaLoTiene: false,
    conectada: conectadas.has(i.code),
  }));
  // Primero lo que se puede agregar; lo que ya tiene, al final de su grupo.
  const orden = (a: OpcionMetodoPago, b: OpcionMetodoPago) => Number(a.yaLoTiene) - Number(b.yaLoTiene);
  return [...manuales.sort(orden), ...pasarelas];
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Coincide con el nombre o el código, sin tildes; los chips encendidos se suman (cualquiera). */
export function filtrarOpcionesMetodoPago(opciones: readonly OpcionMetodoPago[], texto: string, filtros: readonly string[]): OpcionMetodoPago[] {
  const q = normalizar(texto);
  const activos = filtros.filter((f): f is FiltroMetodoPago => (FILTROS_METODO_PAGO as readonly string[]).includes(f));
  return opciones.filter(
    (o) => (activos.length === 0 || activos.includes(o.tipo)) && (!q || normalizar(o.nombre).includes(q) || normalizar(o.codigo).includes(q)),
  );
}
