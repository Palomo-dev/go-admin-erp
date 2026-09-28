/**
 * Kit de receta (Figma «Componentes — Recetas y subsecciones», 957-583020):
 * el mismo editor en el formulario de producto, el detalle y la pantalla
 * Recetas. Diseño: docs/design/PRODUCTO-RECETAS-Y-SUBSECCIONES.md §4.
 */
export { EditorReceta, type EditorRecetaProps } from './EditorReceta';
export { FilaIngrediente, type FilaIngredienteProps } from './FilaIngrediente';
export { ResumenCostoReceta, type ResumenCostoRecetaProps } from './ResumenCostoReceta';
export { SelectorAlcanceReceta, type SelectorAlcanceRecetaProps, type VarianteAlcance } from './SelectorAlcanceReceta';
export { DialogoConversion, type DialogoConversionProps } from './DialogoConversion';
export { useCostoReceta, type EstadoCostoReceta } from './useCostoReceta';
export * from './recetaLogica';
