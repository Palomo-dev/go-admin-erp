/**
 * Importar proveedores: del archivo a las filas que revisa y aplica
 * `fn_proveedores_importar` (sin React ni Supabase; se prueba en node).
 *
 * Paso «Columnas»: cada columna del archivo se asigna a un campo por alias
 * (sin tildes ni mayúsculas) y el usuario puede corregirlo. Tipo y tipo de
 * cuenta se traducen a los valores de la base («Empresa» → `company`,
 * «Ahorros» → `savings`); lo que no se reconoce viaja tal cual y el servidor
 * lo marca como error con su motivo.
 */
import { normalizarCabecera, normalizarNombre, parseBooleano, parseNumero, textoCelda } from '@/lib/inventario/importacion/texto';

export const CAMPOS_PROVEEDOR = [
  'name',
  'supplier_type',
  'nit',
  'doc_type',
  'trade_name',
  'contact',
  'phone',
  'email',
  'address',
  'city',
  'state',
  'country',
  'postal_code',
  'tax_regime',
  'fiscal_responsibilities',
  'payment_terms',
  'credit_days',
  'website',
  'bank_name',
  'bank_account',
  'account_type',
  'description',
  'notes',
  'is_active',
] as const;
export type CampoProveedor = (typeof CAMPOS_PROVEEDOR)[number];
export const CAMPOS_OBLIGATORIOS: readonly CampoProveedor[] = ['name', 'nit'];

const ALIAS: Record<CampoProveedor, readonly string[]> = {
  name: ['nombre', 'name', 'razonsocial', 'proveedor'],
  supplier_type: ['tipo', 'suppliertype', 'tipodeproveedor', 'tipopersona'],
  nit: ['nit', 'documento', 'numerodocumento', 'identificacion', 'cedula', 'cc', 'rut'],
  doc_type: ['tipodoc', 'doctype', 'tipodocumento', 'tipodeidentificacion'],
  trade_name: ['nombrecomercial', 'tradename'],
  contact: ['contacto', 'contact', 'personadecontacto'],
  phone: ['telefono', 'phone', 'celular', 'movil'],
  email: ['email', 'correo', 'correoelectronico', 'mail'],
  address: ['direccion', 'address'],
  city: ['ciudad', 'city', 'municipio'],
  state: ['departamento', 'state', 'estadoregion', 'provincia'],
  country: ['pais', 'country'],
  postal_code: ['codigopostal', 'postalcode'],
  tax_regime: ['regimentributario', 'regimen', 'taxregime'],
  fiscal_responsibilities: ['responsabilidadesfiscales', 'fiscalresponsibilities', 'responsabilidades'],
  payment_terms: ['terminosdepago', 'paymentterms', 'condiciondepago'],
  credit_days: ['diascredito', 'creditdays', 'plazo', 'diasdecredito'],
  website: ['sitioweb', 'website', 'web'],
  bank_name: ['banco', 'bankname'],
  bank_account: ['cuentabancaria', 'bankaccount', 'numerodecuenta'],
  account_type: ['tipocuenta', 'accounttype', 'tipodecuenta'],
  description: ['descripcion', 'description'],
  notes: ['notas', 'notes', 'observaciones'],
  is_active: ['activo', 'isactive', 'active', 'estado'],
};

export type Mapeo = (CampoProveedor | null)[];

export function autoMapear(cabecera: readonly unknown[]): Mapeo {
  const usados = new Set<CampoProveedor>();
  return cabecera.map((c) => {
    const n = normalizarCabecera(c);
    const campo = CAMPOS_PROVEEDOR.find((k) => !usados.has(k) && ALIAS[k].includes(n)) ?? null;
    if (campo) usados.add(campo);
    return campo;
  });
}

/**
 * Fila de cabecera: entre las 10 primeras, la que más columnas reconoce; si
 * ninguna reconoce nada, la primera con al menos dos celdas.
 */
export function filaCabeceraProveedores(matriz: readonly (readonly unknown[])[]): number {
  let mejor = -1;
  let puntos = 0;
  matriz.slice(0, 10).forEach((f, i) => {
    const p = autoMapear(f ?? []).filter(Boolean).length;
    if (p > puntos) {
      puntos = p;
      mejor = i;
    }
  });
  if (mejor >= 0) return mejor;
  const primera = matriz.findIndex((f) => (f ?? []).filter((c) => textoCelda(c) !== undefined).length >= 2);
  return Math.max(0, primera);
}

/** Asignar un campo a una columna lo quita de la columna que lo tuviera. */
export function reasignar(mapeo: Mapeo, columna: number, campo: CampoProveedor | null): Mapeo {
  return mapeo.map((c, i) => (i === columna ? campo : campo && c === campo ? null : c));
}

export function faltantes(mapeo: Mapeo): CampoProveedor[] {
  return CAMPOS_OBLIGATORIOS.filter((c) => !mapeo.includes(c));
}

export function tipoProveedor(texto: string | undefined): string | undefined {
  const n = normalizarNombre(texto);
  if (!n) return undefined;
  if (['company', 'empresa', 'juridica', 'persona juridica', 'sociedad', 'entreprise', 'societe'].includes(n)) return 'company';
  if (['person', 'persona', 'natural', 'persona natural', 'personne', 'pessoa'].includes(n)) return 'person';
  return n;
}

export function tipoCuenta(texto: string | undefined): string | undefined {
  const n = normalizarNombre(texto);
  if (!n) return undefined;
  if (['savings', 'ahorros', 'ahorro', 'cuenta de ahorros', 'poupanca', 'epargne'].includes(n)) return 'savings';
  if (['checking', 'corriente', 'cuenta corriente', 'courant', 'conta corrente'].includes(n)) return 'checking';
  if (['other', 'otra', 'otro', 'autre', 'outra'].includes(n)) return 'other';
  return n;
}

export type FilaProveedor = { fila: number } & Partial<Record<CampoProveedor, string | boolean>>;

export function filasDesdeMatriz(matriz: readonly (readonly unknown[])[], filaCabecera: number, mapeo: Mapeo): FilaProveedor[] {
  const filas: FilaProveedor[] = [];
  for (let i = filaCabecera + 1; i < matriz.length; i++) {
    const f = matriz[i] ?? [];
    if (f.every((c) => textoCelda(c) === undefined)) continue;
    const fila: FilaProveedor = { fila: i + 1 };
    mapeo.forEach((campo, col) => {
      if (!campo) return;
      const valor = f[col];
      if (campo === 'is_active') {
        const b = parseBooleano(valor);
        if (b !== undefined) fila.is_active = b;
        return;
      }
      const texto = textoCelda(valor);
      if (texto === undefined) return;
      if (campo === 'supplier_type') fila.supplier_type = tipoProveedor(texto);
      else if (campo === 'account_type') fila.account_type = tipoCuenta(texto);
      else if (campo === 'credit_days') {
        const n = parseNumero(texto);
        fila.credit_days = n !== null && Number.isInteger(n) && n >= 0 ? String(n) : texto;
      } else fila[campo] = texto;
    });
    filas.push(fila);
  }
  return filas;
}

export const PLANTILLA_PROVEEDORES =
  'Nombre,Tipo,NIT,Tipo doc,Nombre comercial,Contacto,Teléfono,Email,Dirección,Ciudad,Departamento,País,Régimen tributario,Responsabilidades fiscales,Días crédito,Banco,Cuenta bancaria,Tipo cuenta,Notas\n' +
  'Distribuidora de ejemplo S.A.S.,Empresa,900123456-7,NIT,Distribuciones de ejemplo,Laura Méndez,3105550142,compras@ejemplo.com,Cra. 45 # 12-30,Medellín,Antioquia,Colombia,Responsable de IVA,O-13;O-15,30,Banco de ejemplo,000123456789,Ahorros,\n' +
  'Carlos Ejemplo,Persona,80123456,CC,,,3001234567,,,Bogotá,Cundinamarca,Colombia,No responsable de IVA,R-99-PN,0,,,,\n';

// ─── Revisión del servidor ─────────────────────────────────────────────────

export type AccionProveedor = 'crear' | 'actualizar' | 'error';
export type MotivoProveedor =
  | 'nombre_obligatorio'
  | 'documento_obligatorio'
  | 'tipo_invalido'
  | 'correo_invalido'
  | 'plazo_invalido'
  | 'cuenta_invalida'
  | 'documento_repetido';

export interface FilaRevisada {
  fila: number;
  accion: AccionProveedor;
  motivo: MotivoProveedor | null;
  fila_repetida: number | null;
  existente_id: number | null;
  id: number | null;
}

export interface RevisionProveedores {
  total: number;
  crear: number;
  actualizar: number;
  con_error: number;
  creados: number;
  actualizados: number;
  filas: FilaRevisada[];
}

export function aRevision(data: unknown): RevisionProveedores {
  const r = (data ?? {}) as Partial<RevisionProveedores>;
  return {
    total: Number(r.total) || 0,
    crear: Number(r.crear) || 0,
    actualizar: Number(r.actualizar) || 0,
    con_error: Number(r.con_error) || 0,
    creados: Number(r.creados) || 0,
    actualizados: Number(r.actualizados) || 0,
    filas: (r.filas ?? []).map((f) => ({
      fila: Number(f.fila),
      accion: f.accion === 'crear' || f.accion === 'actualizar' ? f.accion : 'error',
      motivo: (f.motivo as MotivoProveedor | null) ?? null,
      fila_repetida: f.fila_repetida == null ? null : Number(f.fila_repetida),
      existente_id: f.existente_id == null ? null : Number(f.existente_id),
      id: f.id == null ? null : Number(f.id),
    })),
  };
}

export type FiltroMostrar = 'todas' | 'crear' | 'actualizar' | 'error';

/** Filas de la tabla «Revisar» según búsqueda y «Mostrar». */
export function filtrarRevision<T extends { accion: AccionProveedor; nombre: string; documento: string }>(
  filas: readonly T[],
  busqueda: string,
  mostrar: FiltroMostrar,
): T[] {
  const q = normalizarNombre(busqueda);
  return filas.filter((f) => {
    if (mostrar !== 'todas' && f.accion !== mostrar) return false;
    if (!q) return true;
    return normalizarNombre(f.nombre).includes(q) || normalizarNombre(f.documento).includes(q);
  });
}
