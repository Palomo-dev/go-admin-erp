/**
 * B7 — un solo alta rápida de producto (INVENTARIO-PLAN §5.0 y §1.1; auditoría
 * de componentes §4.7): «Crear ingrediente» de la receta usa
 * `kit/documento/FormularioRapidoProducto` (la misma de «Agregar productos»),
 * no el formulario completo en un diálogo, y el `QuickCreateDialog` genérico
 * de productos ya no existe.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const dir = join(process.cwd(), 'src', 'components', 'inventario', 'productos');
const leer = (...p: string[]) => readFileSync(join(dir, ...p), 'utf8');

describe('alta rápida de ingrediente', () => {
  it('la receta abre el alta rápida del kit y no el formulario completo', () => {
    const receta = leer('formulario', 'secciones', 'SeccionReceta.tsx');
    expect(receta).not.toContain('ProductoFormDialog');
    expect(receta).toContain('DialogoIngredienteRapido');
    const dialogo = leer('formulario', 'secciones', 'DialogoIngredienteRapido.tsx');
    expect(dialogo).toContain("from '@/components/kit/documento/FormularioRapidoProducto'");
    expect(dialogo).toContain('variante="compra"');
    expect(dialogo).toContain('crearProductoRapido(organizacionId,');
  });

  it('sin segundo alta rápida ni envoltorios muertos', () => {
    expect(existsSync(join(dir, 'nuevo', 'QuickCreateDialog.tsx'))).toBe(false);
    expect(existsSync(join(dir, 'NuevoProductoForm.tsx'))).toBe(false);
    expect(existsSync(join(dir, 'facebookCatalogExport.ts'))).toBe(false);
    expect(existsSync(join(dir, 'scraping'))).toBe(false);
  });
});
