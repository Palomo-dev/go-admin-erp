/**
 * Piezas de Contabilidad v2 (Figma `02 Componentes › Finanzas — kit/contabilidad`
 * 978:605055). Sin lógica de negocio: reciben datos ya leídos. Viven junto a
 * Contabilidad y no en `@/components/kit` porque sus textos son del dominio
 * (namespace `finanzasContabilidadR3.comun`); si otro módulo las necesita, se
 * suben al kit.
 */
export { OrigenAsiento, EtiquetaOrigen, EnlaceAsiento, useNumeroAsiento, ICONO_ORIGEN, type OrigenAsientoProps } from './OrigenAsiento';
export { MarcaReversion, type MarcaReversionProps } from './MarcaReversion';
export { EstadoPeriodo, estadoDePeriodo, type ValorEstadoPeriodo } from './EstadoPeriodo';
export { BarraCuadre, type BarraCuadreProps } from './BarraCuadre';
export { TablaContable, type TablaContableProps, type LineaTablaContable } from './TablaContable';
