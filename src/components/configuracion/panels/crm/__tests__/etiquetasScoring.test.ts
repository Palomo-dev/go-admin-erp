/**
 * Scoring (GOC): los valores de fábrica se guardan en español y se traducen
 * solo al mostrarlos; lo que escribe la persona se muestra tal cual.
 */
import { ETIQUETAS_FABRICA, claveFabrica, indicadoresFabrica } from '../sections/etiquetasScoring';
import es from '../../../../../../messages/es.json';
import en from '../../../../../../messages/en.json';
import fr from '../../../../../../messages/fr.json';
import pt from '../../../../../../messages/pt.json';

type Mensajes = { configuracionTextos: { scoringConfigurator: { porDefecto: Record<string, string> } } };

describe('valores de fábrica del Scoring', () => {
  it('lo que se guarda por defecto está en español, sin importar el idioma de quien guarda', () => {
    const textos = indicadoresFabrica().flatMap((i) => [i.label, ...i.options.map((o) => o.label)]);
    expect(textos).toEqual(['Engagement', 'Bajo', 'Medio', 'Alto', 'Presupuesto', 'Sin presupuesto', 'Limitado', 'Confirmado', 'Timeline', 'Lejano', 'Cercano', 'Inmediato']);
  });

  it('reconoce los valores de fábrica guardados (también «Nueva opcion» sin tilde, como se guardaba antes)', () => {
    expect(claveFabrica('Presupuesto')).toBe('presupuesto');
    expect(claveFabrica(' sin presupuesto ')).toBe('sinPresupuesto');
    expect(claveFabrica('Nueva opcion')).toBe('nuevaOpcion');
    expect(claveFabrica('Nueva opción')).toBe('nuevaOpcion');
  });

  it('lo que escribió la persona no es de fábrica (se muestra tal cual)', () => {
    expect(claveFabrica('Presupuesto aprobado por junta')).toBeNull();
    expect(claveFabrica('Budget')).toBeNull();
    expect(claveFabrica('')).toBeNull();
  });

  it.each([
    ['es', es],
    ['en', en],
    ['fr', fr],
    ['pt', pt],
  ])('cada valor de fábrica tiene traducción en %s', (_idioma, mensajes) => {
    const porDefecto = (mensajes as unknown as Mensajes).configuracionTextos.scoringConfigurator.porDefecto;
    for (const clave of Object.keys(ETIQUETAS_FABRICA)) expect({ clave, ok: !!porDefecto[clave] }).toEqual({ clave, ok: true });
  });

  it('las copias no comparten objetos (el formulario las edita)', () => {
    const a = indicadoresFabrica();
    a[0].options[0].label = 'X';
    expect(indicadoresFabrica()[0].options[0].label).toBe('Bajo');
  });
});
