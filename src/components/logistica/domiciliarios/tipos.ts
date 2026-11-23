import type { CargaDelDia, EstadoDomiciliario } from '@/lib/logistica/domiciliarios';
import type { DomiciliarioFila, EnvioCargaFila } from '@/lib/services/logistica/domiciliariosService';

/** Una fila de la lista de Domiciliarios: el registro, su estado y su carga del día. */
export interface FilaDomiciliario {
  d: DomiciliarioFila;
  nombre: string;
  estado: EstadoDomiciliario;
  carga: CargaDelDia;
  envios: EnvioCargaFila[];
}
