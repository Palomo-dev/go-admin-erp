/**
 * Kit · teclado: cómo se escribe un atajo (`Kbd`), cómo se anuncia
 * (`aria-keyshortcuts`), qué combinación trae un evento y cuándo `useAtajos`
 * dispara (nunca dentro de un campo con una letra suelta, nunca durante una
 * ráfaga del lector de códigos).
 */
import {
  ariaAtajo,
  atajoValidoEnCampo,
  claveAtajo,
  claveDeEvento,
  etiquetaAtajo,
  idTecla,
  partesAtajo,
} from '../teclas';
import { agruparAtajos, resolverAtajo, type Atajo } from '../useAtajos';
import { clasesBoton, temaKbdDe } from '../botonClases';

describe('teclas: normalización', () => {
  test('alias en español, inglés y del evento caen en el mismo id', () => {
    expect(idTecla('Supr')).toBe('delete');
    expect(idTecla('Delete')).toBe('delete');
    expect(idTecla('suppr')).toBe('delete');
    expect(idTecla('Esc')).toBe('escape');
    expect(idTecla('Escape')).toBe('escape');
    expect(idTecla('Intro')).toBe('enter');
    expect(idTecla('Mayús')).toBe('shift');
    expect(idTecla('ArrowUp')).toBe('arriba');
    expect(idTecla(' ')).toBe('space');
    expect(idTecla('F9')).toBe('f9');
  });

  test('partes de un atajo, con «+» como tecla y grupos de flechas', () => {
    expect(partesAtajo('Ctrl+N')).toEqual(['ctrl', 'n']);
    expect(partesAtajo('ctrl + shift + tab')).toEqual(['ctrl', 'shift', 'tab']);
    expect(partesAtajo('+')).toEqual(['+']);
    expect(partesAtajo('Ctrl++')).toEqual(['ctrl', '+']);
    expect(partesAtajo('↑↓')).toEqual(['arriba', 'abajo']);
    expect(partesAtajo('')).toEqual([]);
    expect(partesAtajo(undefined)).toEqual([]);
  });

  test('etiqueta visible: letras en mayúscula, F en mayúscula, nombres del idioma', () => {
    expect(etiquetaAtajo('ctrl+n')).toBe('Ctrl+N');
    expect(etiquetaAtajo('alt+1')).toBe('Alt+1');
    expect(etiquetaAtajo('f9')).toBe('F9');
    expect(etiquetaAtajo('Delete')).toBe('Supr');
    expect(etiquetaAtajo('Delete', { delete: 'Del' })).toBe('Del');
    expect(etiquetaAtajo('escape', { escape: 'Échap' })).toBe('Échap');
    expect(etiquetaAtajo('↑↓')).toBe('↑↓');
    expect(etiquetaAtajo('/')).toBe('/');
  });

  test('aria-keyshortcuts usa los nombres de KeyboardEvent.key', () => {
    expect(ariaAtajo('Ctrl+N')).toBe('Control+N');
    expect(ariaAtajo('Supr')).toBe('Delete');
    expect(ariaAtajo('Esc')).toBe('Escape');
    expect(ariaAtajo('Alt+1')).toBe('Alt+1');
    expect(ariaAtajo('F4')).toBe('F4');
    expect(ariaAtajo('↑↓')).toBe('ArrowUp ArrowDown');
    expect(ariaAtajo('')).toBe('');
  });

  test('clave comparable: modificadores en orden fijo', () => {
    expect(claveAtajo('Shift+Ctrl+Tab')).toBe('ctrl+shift+tab');
    expect(claveAtajo('Alt+D')).toBe('alt+d');
  });
});

describe('teclas: eventos', () => {
  test('F-keys, Escape y letras', () => {
    expect(claveDeEvento({ key: 'F9' })).toBe('f9');
    expect(claveDeEvento({ key: 'Escape' })).toBe('escape');
    expect(claveDeEvento({ key: 'd' })).toBe('d');
    expect(claveDeEvento({ key: 'D', shiftKey: true })).toBe('d');
  });

  test('Alt+1 en macOS escribe «¡»: manda el code', () => {
    expect(claveDeEvento({ key: '¡', code: 'Digit1', altKey: true })).toBe('alt+1');
    expect(claveDeEvento({ key: 'ð', code: 'KeyD', altKey: true })).toBe('alt+d');
    expect(claveDeEvento({ key: 'n', code: 'KeyN', ctrlKey: true })).toBe('ctrl+n');
  });

  test('Mayúscula cuenta con teclas con nombre o con otro modificador', () => {
    expect(claveDeEvento({ key: 'Tab', shiftKey: true, ctrlKey: true })).toBe('ctrl+shift+tab');
    expect(claveDeEvento({ key: '?', shiftKey: true })).toBe('?');
  });

  test('pulsar solo un modificador no es un atajo', () => {
    expect(claveDeEvento({ key: 'Control', ctrlKey: true })).toBe('');
    expect(claveDeEvento({ key: 'Alt', altKey: true })).toBe('');
  });

  test('dentro de un campo solo valen F, Esc y combinaciones', () => {
    expect(atajoValidoEnCampo('f4')).toBe(true);
    expect(atajoValidoEnCampo('escape')).toBe(true);
    expect(atajoValidoEnCampo('alt+1')).toBe(true);
    expect(atajoValidoEnCampo('ctrl+n')).toBe(true);
    expect(atajoValidoEnCampo('d')).toBe(false);
    expect(atajoValidoEnCampo('delete')).toBe(false);
    expect(atajoValidoEnCampo('enter')).toBe(false);
  });
});

describe('useAtajos: resolverAtajo', () => {
  const llamadas: string[] = [];
  const atajo = (tecla: string, extra: Partial<Atajo> = {}): Atajo => ({
    tecla,
    descripcion: tecla,
    accion: () => llamadas.push(tecla),
    ...extra,
  });
  const mapa = [atajo('F4'), atajo('D'), atajo('Alt+1'), atajo('Supr', { cuando: () => false }), atajo('Enter', { permitirEnCampo: true })];

  test('resuelve por la combinación, no por el texto', () => {
    expect(resolverAtajo({ key: 'F4' }, mapa, { enCampo: false })?.tecla).toBe('F4');
    expect(resolverAtajo({ key: '¡', code: 'Digit1', altKey: true }, mapa, { enCampo: false })?.tecla).toBe('Alt+1');
  });

  test('una letra suelta no dispara con el foco en un campo; F4 sí', () => {
    expect(resolverAtajo({ key: 'd' }, mapa, { enCampo: true })).toBeNull();
    expect(resolverAtajo({ key: 'd' }, mapa, { enCampo: false })?.tecla).toBe('D');
    expect(resolverAtajo({ key: 'F4' }, mapa, { enCampo: true })?.tecla).toBe('F4');
    expect(resolverAtajo({ key: 'Enter' }, mapa, { enCampo: true })?.tecla).toBe('Enter');
  });

  test('ráfaga del lector de códigos: 13 dígitos + Enter no disparan nada', () => {
    const conDigitos = [...mapa, atajo('7')];
    for (const key of [...'7702004003508'.split(''), 'Enter']) {
      expect(resolverAtajo({ key }, conDigitos, { enCampo: false, rafagaPendiente: true })).toBeNull();
    }
  });

  test('`cuando` falso desactiva el atajo', () => {
    expect(resolverAtajo({ key: 'Delete' }, mapa, { enCampo: false })).toBeNull();
  });

  test('el mapa F1 agrupa en el orden de registro', () => {
    const grupos = agruparAtajos([atajo('F4', { grupo: 'Venta' }), atajo('Alt+1', { grupo: 'Cobro' }), atajo('F6', { grupo: 'Venta' })]);
    expect(grupos.map((g) => [g.grupo, g.atajos.map((a) => a.tecla)])).toEqual([
      ['Venta', ['F4', 'F6']],
      ['Cobro', ['Alt+1']],
    ]);
  });
});

describe('botonClases', () => {
  test('tema del Kbd según la variante del botón', () => {
    expect(temaKbdDe('primario')).toBe('marca');
    expect(temaKbdDe('destructivo')).toBe('marca');
    expect(temaKbdDe('secundario')).toBe('claro');
    expect(temaKbdDe('fantasma')).toBe('claro');
  });

  test('solo tokens: sin dark:, sin hex, sin gray-*', () => {
    for (const variante of ['primario', 'secundario', 'fantasma', 'destructivo', 'tinte'] as const) {
      for (const tamano of ['sm', 'md', 'lg'] as const) {
        const c = clasesBoton({ variante, tamano, anchoCompleto: true });
        expect(c).not.toMatch(/dark:|#[0-9a-f]{3,6}|gray-/i);
        expect(c).toContain('w-full');
      }
    }
    expect(clasesBoton({ tamano: 'lg' })).toContain('h-12');
  });
});
