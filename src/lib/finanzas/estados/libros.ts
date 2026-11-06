/**
 * Libros exportables. Las sumas salen de la base; aquí se arma el libro diario
 * por fecha y los auxiliares por cuenta con saldo corrido.
 */
import type { FilaResumenLibro, LibroInventarios, LibroMayor, LineaLibro } from './tipos';

export const LIBROS = ['diario', 'mayor', 'inventarios', 'auxiliar_cuenta', 'tercero', 'centro'] as const;
export type IdLibro = (typeof LIBROS)[number];

export const esLibro = (valor: string | null): valor is IdLibro => LIBROS.includes(valor as IdLibro);

export function ordenarDiario(lineas: readonly LineaLibro[]): LineaLibro[] {
  return [...lineas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.asiento - b.asiento || a.id - b.id);
}

export interface FilaAuxiliar extends LineaLibro {
  saldo: number;
}

/** Saldo corrido por cuenta, en débito menos crédito, dentro del periodo. */
export function auxiliarPorCuenta(lineas: readonly LineaLibro[]): FilaAuxiliar[] {
  const saldos = new Map<string, number>();
  return [...lineas]
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta) || a.fecha.localeCompare(b.fecha) || a.id - b.id)
    .map((l) => {
      const saldo = (saldos.get(l.cuenta) ?? 0) + l.debito - l.credito;
      saldos.set(l.cuenta, saldo);
      return { ...l, saldo: Math.round(saldo * 100) / 100 };
    });
}

export interface TablaLibro {
  /** Claves de `estadosFinancieros.libros.columna`. */
  columnas: string[];
  filas: (string | number)[][];
  truncado: boolean;
}

/**
 * Filas de cada libro para Excel y PDF. `fecha` convierte el instante del
 * asiento al día de la organización: nunca se recorta el texto del timestamptz.
 */
export function tablaDeLibro(libro: IdLibro, datos: unknown, fecha: (instante: string) => string): TablaLibro {
  if (libro === 'mayor') {
    const d = datos as LibroMayor;
    return {
      columnas: ['codigo', 'cuenta', 'inicial', 'debitos', 'creditos', 'final'],
      filas: d.filas.map((f) => [f.codigo, f.nombre ?? '', f.inicial, f.debitos, f.creditos, f.final]),
      truncado: false,
    };
  }
  if (libro === 'inventarios') {
    const d = datos as LibroInventarios;
    return {
      columnas: ['codigo', 'cuenta', 'saldo'],
      filas: d.filas.map((f) => [f.codigo, f.nombre ?? '', f.saldo]),
      truncado: false,
    };
  }
  if (libro === 'tercero' || libro === 'centro') {
    const d = datos as FilaResumenLibro[];
    return {
      columnas: ['codigo', 'cuenta', 'inicial', 'debitos', 'creditos', 'final'],
      filas: d.map((f) => [f.clave, f.nombre ?? '', f.inicial, f.debitos, f.creditos, f.final]),
      truncado: false,
    };
  }
  const d = datos as { filas: LineaLibro[]; truncado: boolean };
  if (libro === 'diario') {
    return {
      columnas: ['fecha', 'asiento', 'codigo', 'cuenta', 'tercero', 'detalle', 'debitos', 'creditos'],
      filas: ordenarDiario(d.filas).map((l) => [fecha(l.fecha), l.asiento, l.cuenta, l.nombre ?? '', l.tercero ?? '', l.memo ?? '', l.debito, l.credito]),
      truncado: d.truncado,
    };
  }
  return {
    columnas: ['codigo', 'cuenta', 'fecha', 'asiento', 'detalle', 'debitos', 'creditos', 'saldo'],
    filas: auxiliarPorCuenta(d.filas).map((l) => [l.cuenta, l.nombre ?? '', fecha(l.fecha), l.asiento, l.memo ?? '', l.debito, l.credito, l.saldo]),
    truncado: d.truncado,
  };
}
