/**
 * Plantilla descargable y reporte de resultado del importador de leads.
 * CSV para Excel en español (`filasACsv`: separador `;`, BOM y celdas que
 * empiezan por `=`/`+`/`-`/`@` neutralizadas contra inyección de fórmulas).
 *
 * Los ejemplos son datos INVENTADOS (el repositorio es público).
 */

import { filasACsv } from '@/lib/utils/csv';
import type { CampoLead } from './campos';
import type { ResultadoFilaLead } from './tipos';

/** Columnas de la plantilla, en orden. Sus cabeceras salen de `leadsImportar.cabeceras` (es/en/fr/pt). */
export const CAMPOS_PLANTILLA: readonly CampoLead[] = [
  'idExterno', 'nombre', 'razonSocial', 'nit', 'contacto', 'telefono', 'correo', 'direccion', 'barrio', 'ciudad',
  'departamento', 'sector', 'subsector', 'prioridad', 'valor', 'plan', 'web', 'fuente', 'notas', 'etiquetas',
];

export const EJEMPLOS_PLANTILLA: readonly string[][] = [
  ['EJ-0001', 'Panadería La Espiga Inventada', 'Panadería La Espiga Inventada S.A.S.', '900111222-0', 'Laura Ejemplo', '300 123 4567', 'hola@espiga-inventada.example', 'Calle 10 # 20-30', 'Centro', 'Pereira', 'Risaralda', 'Retail (tienda)', 'Panadería', 'A', '600', 'Business', 'https://espiga-inventada.example', 'https://directorio.example/espiga', 'Atiende en la mañana', 'piloto'],
  ['EJ-0002', 'Asadero El Fogón Ficticio', '', '', '', '604 444 1234', '', 'Carrera 5 # 6-7', '', 'Medellín', 'Antioquia', 'Restaurante/bar', 'Asadero', 'B', '300', 'Pro', '', 'https://mapa.example/fogon', '', ''],
];

export function plantillaLeadsCsv(cabeceras: Readonly<Partial<Record<CampoLead, string>>>): string {
  return filasACsv(
    CAMPOS_PLANTILLA.map((c) => cabeceras[c] ?? c),
    EJEMPLOS_PLANTILLA,
  );
}

export interface TextosReporte {
  cabeceras: [string, string, string, string, string, string];
  accion: (r: ResultadoFilaLead) => string;
  detalle: (r: ResultadoFilaLead) => string;
}

/** Una línea por fila del archivo: fila · nombre · teléfono · resultado · cliente · detalle. */
export function reporteLeadsCsv(resultados: readonly ResultadoFilaLead[], textos: TextosReporte): string {
  const filas = [...resultados]
    .sort((a, b) => a.fila - b.fila)
    .map((r) => [r.fila, r.nombre, r.telefono ?? '', textos.accion(r), r.cliente?.nombre ?? r.customerId ?? '', textos.detalle(r)]);
  return filasACsv(textos.cabeceras, filas);
}
