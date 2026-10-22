/**
 * Excel del plan de cuentas. La validación ocurre entera antes de escribir:
 * un código que no cuelga de su padre rechaza el archivo.
 */
import {
  esCodigoPuc,
  naturalezaDe,
  nivelDe,
  validarHijo,
  type NaturalezaPuc,
  type TipoCuentaPuc,
} from './pucJerarquia';

export const COLUMNAS_PLAN = [
  'codigo',
  'nombre',
  'tipo',
  'padre',
  'naturaleza',
  'es_movimiento',
  'requiere_tercero',
  'requiere_centro_costo',
  'activa',
  'descripcion',
] as const;

const TIPOS = new Set<TipoCuentaPuc>(['asset', 'liability', 'equity', 'income', 'expense', 'order']);
const NATURALEZAS = new Set<NaturalezaPuc>(['debito', 'credito', 'orden']);

export interface FilaImportada {
  codigo: string;
  nombre: string;
  tipo: TipoCuentaPuc;
  padre: string | null;
  naturaleza: NaturalezaPuc;
  esMovimiento: boolean;
  requiereTercero: boolean;
  requiereCentroCosto: boolean;
  activa: boolean;
  descripcion: string | null;
}

export interface ResultadoImportacion {
  filas: FilaImportada[];
  errores: string[];
}

function texto(valor: unknown): string {
  return String(valor ?? '').trim();
}

function bandera(valor: unknown, porDefecto: boolean): boolean {
  const crudo = texto(valor).toLowerCase();
  if (!crudo) return porDefecto;
  if (['si', 'sí', 'true', '1', 'verdadero', 'yes'].includes(crudo)) return true;
  if (['no', 'false', '0', 'falso'].includes(crudo)) return false;
  return porDefecto;
}

export function interpretarFilas(
  crudas: readonly Record<string, unknown>[],
  existentes: readonly string[],
  padresActuales: Readonly<Record<string, string | null>> = {},
): ResultadoImportacion {
  const errores: string[] = [];
  const vistas: Array<{ fila: number; codigo: string; nombre: string; tipo: string; padre: string; naturaleza: string; esMovimiento: boolean; requiereTercero: boolean; requiereCentroCosto: boolean; activa: boolean; descripcion: string }> = [];
  const enArchivo = new Set<string>();

  crudas.forEach((cruda, indice) => {
    const fila = indice + 2;
    const codigo = texto(cruda.codigo);
    if (!codigo) {
      errores.push(`Fila ${fila}: falta el código.`);
      return;
    }
    if (enArchivo.has(codigo)) {
      errores.push(`Fila ${fila}: el código ${codigo} está repetido.`);
      return;
    }
    enArchivo.add(codigo);
    const nombre = texto(cruda.nombre);
    if (!nombre) errores.push(`Fila ${fila}: ${codigo} no tiene nombre.`);
    const tipo = texto(cruda.tipo);
    if (!TIPOS.has(tipo as TipoCuentaPuc)) errores.push(`Fila ${fila}: ${codigo} tiene un tipo desconocido.`);
    const padre = texto(cruda.padre);
    const naturaleza = texto(cruda.naturaleza);
    if (naturaleza && !NATURALEZAS.has(naturaleza as NaturalezaPuc)) {
      errores.push(`Fila ${fila}: ${codigo} tiene una naturaleza desconocida.`);
    }
    if (!esCodigoPuc(codigo) && !existentes.includes(codigo)) {
      errores.push(`Fila ${fila}: ${codigo} no tiene la longitud de un nivel del PUC.`);
    }
    vistas.push({
      fila,
      codigo,
      nombre,
      tipo,
      padre,
      naturaleza,
      esMovimiento: bandera(cruda.es_movimiento, nivelDe(codigo) !== 'clase' && nivelDe(codigo) !== 'grupo'),
      requiereTercero: bandera(cruda.requiere_tercero, false),
      requiereCentroCosto: bandera(cruda.requiere_centro_costo, false),
      activa: bandera(cruda.activa, true),
      descripcion: texto(cruda.descripcion),
    });
  });

  const conocidos = new Set([...existentes, ...enArchivo]);
  for (const vista of vistas) {
    if (!esCodigoPuc(vista.codigo)) continue;
    if (Object.prototype.hasOwnProperty.call(padresActuales, vista.codigo)
      && (padresActuales[vista.codigo] ?? '') === vista.padre) {
      continue;
    }
    if (nivelDe(vista.codigo) === 'clase') {
      if (vista.padre) errores.push(`Fila ${vista.fila}: la clase ${vista.codigo} no lleva padre.`);
      continue;
    }
    if (!vista.padre) {
      errores.push(`Fila ${vista.fila}: ${vista.codigo} necesita la cuenta padre.`);
      continue;
    }
    if (!conocidos.has(vista.padre)) {
      errores.push(`Fila ${vista.fila}: el padre ${vista.padre} de ${vista.codigo} no existe.`);
      continue;
    }
    const error = validarHijo(vista.padre, vista.codigo);
    if (error) {
      errores.push(`Fila ${vista.fila}: ${vista.codigo} no cuelga de ${vista.padre} en el nivel siguiente.`);
    }
  }

  if (errores.length > 0) return { filas: [], errores };

  const filas = vistas
    .sort((a, b) => a.codigo.length - b.codigo.length || a.codigo.localeCompare(b.codigo))
    .map((vista) => ({
      codigo: vista.codigo,
      nombre: vista.nombre,
      tipo: vista.tipo as TipoCuentaPuc,
      padre: vista.padre || null,
      naturaleza: (vista.naturaleza || naturalezaDe(vista.codigo, null) || 'debito') as NaturalezaPuc,
      esMovimiento: nivelDe(vista.codigo) === 'clase' || nivelDe(vista.codigo) === 'grupo' ? false : vista.esMovimiento,
      requiereTercero: vista.requiereTercero,
      requiereCentroCosto: vista.requiereCentroCosto,
      activa: vista.activa,
      descripcion: vista.descripcion || null,
    }));

  return { filas, errores };
}
