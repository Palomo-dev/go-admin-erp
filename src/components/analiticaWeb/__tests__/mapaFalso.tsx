/**
 * Apoyo de pruebas: sustituye a `MapaVisitas` con cuadrados en lugar de la
 * geometría real (que se prueba aparte en lib/analiticaWeb/__tests__/mapa.test.ts).
 */
import { MapaCoropletico, type MapaCoropleticoProps } from '../mapas/MapaCoropletico';
import type { FormaDibujada } from '../mapas/proyeccion';

const cuadrado = (codigo: string, nombre: string, x: number): FormaDibujada => ({
  codigo,
  nombre,
  d: `M${x},0h90v90h-90Z`,
  centro: [x + 45, 45],
});

export const FORMAS_PRUEBA: FormaDibujada[] = [cuadrado('CO', 'Colombia', 0), cuadrado('MX', 'México', 100), cuadrado('PE', 'Perú', 200)];

const FORMAS_CO: FormaDibujada[] = [cuadrado('CO-DC', 'Bogotá, D. C.', 0), cuadrado('CO-ANT', 'Antioquia', 100), cuadrado('CO-VAC', 'Valle del Cauca', 200)];

export function MapaFalso(props: Omit<MapaCoropleticoProps, 'formas' | 'ancho' | 'alto'> & { tipo: 'mundo' | 'colombia' }) {
  const { tipo, ...resto } = props;
  return <MapaCoropletico {...resto} formas={tipo === 'mundo' ? FORMAS_PRUEBA : FORMAS_CO} ancho={300} alto={100} />;
}
