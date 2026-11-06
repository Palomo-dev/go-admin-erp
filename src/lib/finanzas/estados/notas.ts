/**
 * Notas a los estados financieros y certificación. Los saldos salen del libro
 * de inventarios y balances; el texto lo escribe el Contador. Porta del PR 460
 * la regla de la certificación: generar el documento no firma por nadie.
 */
import type { Certificacion, ClaveNota, ConfiguracionEstados, LibroInventarios } from './tipos';

export type OrigenNota = 'empresa' | 'contador' | 'mayor' | 'activos';
export type EstadoNota = 'completa' | 'por_revisar' | 'sin_datos';

export const ORIGEN_NOTA: Record<ClaveNota, OrigenNota> = {
  entidad: 'empresa',
  politicas: 'contador',
  efectivo: 'mayor',
  deudores: 'mayor',
  inventarios: 'mayor',
  ppe: 'activos',
};

export const PREFIJO_NOTA: Partial<Record<ClaveNota, string>> = {
  efectivo: '11',
  deudores: '13',
  inventarios: '14',
  ppe: '15',
};

export interface DetalleNota {
  codigo: string;
  nombre: string | null;
  actual: number;
  anterior: number;
}

/** Saldos por cuenta de la nota, con el corte anterior al lado. */
export function detalleNota(clave: ClaveNota, actual: LibroInventarios, anterior: LibroInventarios | null): DetalleNota[] {
  const prefijo = PREFIJO_NOTA[clave];
  if (!prefijo) return [];
  const previos = new Map((anterior?.filas ?? []).map((f) => [f.codigo, f]));
  const codigos = new Set(
    [...actual.filas, ...(anterior?.filas ?? [])].filter((f) => f.codigo.startsWith(prefijo)).map((f) => f.codigo),
  );
  return [...codigos].sort().map((codigo) => {
    const fila = actual.filas.find((f) => f.codigo === codigo);
    return {
      codigo,
      nombre: fila?.nombre ?? previos.get(codigo)?.nombre ?? null,
      actual: fila?.saldo ?? 0,
      anterior: previos.get(codigo)?.saldo ?? 0,
    };
  });
}

export function estadoDeNota(clave: ClaveNota, config: ConfiguracionEstados, libro: LibroInventarios | null): EstadoNota {
  const guardada = config.notas[clave];
  if (clave === 'entidad') return config.empresa.nombre || guardada?.texto ? 'completa' : 'sin_datos';
  if (clave === 'politicas') return guardada?.revisada ? 'completa' : 'por_revisar';
  if (clave === 'ppe' && !libro?.activos_fijos) return 'sin_datos';
  if (!libro || detalleNota(clave, libro, null).length === 0) return 'sin_datos';
  return 'completa';
}

const CAMPOS_FIRMA: ReadonlyArray<keyof Certificacion> = [
  'representante_nombre', 'representante_cedula', 'contador_nombre', 'contador_cedula', 'contador_tarjeta',
];

/** Lo que falta para que el documento se pueda firmar. */
export function faltantesCertificacion(c: Certificacion, empresa: ConfiguracionEstados['empresa']): string[] {
  const faltan = CAMPOS_FIRMA.filter((campo) => !String(c[campo] ?? '').trim()) as string[];
  if (!empresa.nombre) faltan.unshift('empresa_nombre');
  if (!empresa.nit) faltan.unshift('empresa_nit');
  return faltan;
}
