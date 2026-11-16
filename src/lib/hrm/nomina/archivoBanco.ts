/**
 * Archivo de pago para el banco (ADR-003 §5). Cada banco tiene su formato: aquí
 * vive la interfaz del adaptador y un formato genérico CSV validado. Los formatos
 * reales por banco se agregan después como nuevos adaptadores, sin tocar la base.
 *
 * Puro: recibe las filas de `fn_hr_nomina_archivo_banco` y devuelve el archivo o
 * los errores. Nunca escribe datos sensibles en el registro.
 */

export interface FilaPagoBanco {
  colilla_id: string;
  vinculo_id: string;
  nombre: string | null;
  tipo_documento: string | null;
  documento: string | null;
  banco_codigo: string | null;
  banco: string | null;
  tipo_cuenta: string | null;
  cuenta: string | null;
  titular: string | null;
  valor: number;
}

export interface ErrorFilaBanco {
  vinculo_id: string;
  nombre: string | null;
  codigo: 'sin_cuenta' | 'sin_documento' | 'valor_invalido' | 'tipo_cuenta_invalido' | 'cuenta_invalida';
}

export interface ArchivoBanco {
  formato: string;
  nombre_archivo: string;
  tipo_contenido: string;
  contenido: string;
  registros: number;
  total: number;
}

export interface AdaptadorBanco {
  /** Código del formato (`csv_generico`, y luego uno por banco). */
  codigo: string;
  nombre: string;
  validar(filas: readonly FilaPagoBanco[]): ErrorFilaBanco[];
  generar(filas: readonly FilaPagoBanco[], meta: { periodo: string; fecha_pago: string | null }): ArchivoBanco;
}

const TIPOS_CUENTA: Record<string, string> = {
  savings: 'AHORROS',
  ahorros: 'AHORROS',
  checking: 'CORRIENTE',
  corriente: 'CORRIENTE',
};

/** Escapa un campo CSV (RFC 4180) y neutraliza fórmulas de hoja de cálculo. */
export function campoCsv(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_GENERICO: AdaptadorBanco = {
  codigo: 'csv_generico',
  nombre: 'CSV genérico',
  validar(filas) {
    const errores: ErrorFilaBanco[] = [];
    for (const f of filas) {
      const base = { vinculo_id: f.vinculo_id, nombre: f.nombre };
      if (!f.cuenta) errores.push({ ...base, codigo: 'sin_cuenta' });
      else if (!/^[0-9-]{4,20}$/.test(f.cuenta)) errores.push({ ...base, codigo: 'cuenta_invalida' });
      if (f.cuenta && !TIPOS_CUENTA[(f.tipo_cuenta ?? '').toLowerCase()]) errores.push({ ...base, codigo: 'tipo_cuenta_invalido' });
      if (!f.documento || !f.tipo_documento) errores.push({ ...base, codigo: 'sin_documento' });
      if (!Number.isFinite(f.valor) || f.valor <= 0 || Math.round(f.valor) !== f.valor) errores.push({ ...base, codigo: 'valor_invalido' });
    }
    return errores;
  },
  generar(filas, meta) {
    const cab = ['tipo_documento', 'documento', 'nombre', 'banco_codigo', 'banco', 'tipo_cuenta', 'cuenta', 'valor', 'referencia'];
    const lineas = [cab.join(',')];
    let total = 0;
    for (const f of filas) {
      total += f.valor;
      lineas.push(
        [f.tipo_documento, f.documento, f.titular || f.nombre, f.banco_codigo, f.banco, TIPOS_CUENTA[(f.tipo_cuenta ?? '').toLowerCase()], f.cuenta, f.valor, `NOMINA ${meta.periodo}`]
          .map(campoCsv)
          .join(',')
      );
    }
    return {
      formato: 'csv_generico',
      nombre_archivo: `nomina-${meta.periodo}.csv`,
      tipo_contenido: 'text/csv; charset=utf-8',
      contenido: `${lineas.join('\r\n')}\r\n`,
      registros: filas.length,
      total,
    };
  },
};

export const ADAPTADORES_BANCO: Readonly<Record<string, AdaptadorBanco>> = { [CSV_GENERICO.codigo]: CSV_GENERICO };

/** Valida y genera; con errores no hay archivo (un archivo con cuentas malas rebota en el banco). */
export function generarArchivoBanco(
  formato: string,
  filas: readonly FilaPagoBanco[],
  meta: { periodo: string; fecha_pago: string | null }
): { archivo: ArchivoBanco | null; errores: ErrorFilaBanco[] } {
  const a = ADAPTADORES_BANCO[formato];
  if (!a) throw new Error('formato_banco_no_soportado');
  if (filas.length === 0) return { archivo: null, errores: [] };
  const errores = a.validar(filas);
  return errores.length ? { archivo: null, errores } : { archivo: a.generar(filas, meta), errores: [] };
}
