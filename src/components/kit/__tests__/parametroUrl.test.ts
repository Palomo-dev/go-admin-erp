/**
 * Pestaña, vista o registro activo en la URL (regla de pestañas 2026-10-05):
 * lista blanca al leer, valor por defecto fuera de la URL y el resto de claves
 * intacto al escribir.
 */
import { escribirParametrosUrl, leerOpcionUrl, urlConParametros } from '../parametroUrl';

const VISTAS = ['kanban', 'tabla', 'pronostico'] as const;

describe('leerOpcionUrl', () => {
  test('sin parámetro, o sin params, devuelve el de por defecto', () => {
    expect(leerOpcionUrl(new URLSearchParams(''), 'vista', VISTAS, 'kanban')).toBe('kanban');
    expect(leerOpcionUrl(null, 'vista', VISTAS, 'kanban')).toBe('kanban');
  });
  test('un valor de la lista se respeta (con espacios recortados)', () => {
    expect(leerOpcionUrl(new URLSearchParams('vista=tabla'), 'vista', VISTAS, 'kanban')).toBe('tabla');
    expect(leerOpcionUrl(new URLSearchParams('vista=%20pronostico%20'), 'vista', VISTAS, 'kanban')).toBe('pronostico');
  });
  test('un valor fuera de la lista no entra: vuelve el de por defecto', () => {
    expect(leerOpcionUrl(new URLSearchParams('vista=<script>'), 'vista', VISTAS, 'kanban')).toBe('kanban');
    expect(leerOpcionUrl(new URLSearchParams('vista=Tabla'), 'vista', VISTAS, 'kanban')).toBe('kanban');
  });
});

describe('escribirParametrosUrl', () => {
  test('fija, reemplaza y quita sin tocar las demás claves', () => {
    const actuales = 'q=ana&pagina=2&vista=tabla';
    expect(escribirParametrosUrl(actuales, { vista: 'pronostico' }).toString()).toBe('q=ana&pagina=2&vista=pronostico');
    expect(escribirParametrosUrl(actuales, { vista: null }).toString()).toBe('q=ana&pagina=2');
    expect(escribirParametrosUrl(actuales, { vista: '' }).toString()).toBe('q=ana&pagina=2');
    expect(escribirParametrosUrl(actuales, { pipeline: 'p2' }).toString()).toBe('q=ana&pagina=2&vista=tabla&pipeline=p2');
  });
  test('acepta URLSearchParams y vacío', () => {
    expect(escribirParametrosUrl(new URLSearchParams('a=1'), { b: '2' }).toString()).toBe('a=1&b=2');
    expect(escribirParametrosUrl(null, { estado: 'won' }).toString()).toBe('estado=won');
  });
});

test('urlConParametros no deja «?» colgando', () => {
  expect(urlConParametros('/app/crm/pipeline', new URLSearchParams())).toBe('/app/crm/pipeline');
  expect(urlConParametros('/app/crm/pipeline', new URLSearchParams('vista=tabla'))).toBe('/app/crm/pipeline?vista=tabla');
});
