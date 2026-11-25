/**
 * Contraste WCAG para los módulos de `src/lib/website/v2/` que la tienda copia tal cual
 * (`aparienciaBuscador.ts` importa `./contrasteColor`, que en goadmin-websites es la copia de
 * `src/lib/utils/contrasteColor.ts`). Un solo cálculo: aquí solo se reexporta.
 */
export * from '../../utils/contrasteColor';
