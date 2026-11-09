/**
 * Regla única de bloqueo (middleware y servidor) y matriz causa × rol de
 * docs/design/MODULO-NO-HABILITADO.md §3.
 */
import {
  RUTA_MODULO_NO_HABILITADO,
  accionPrincipal,
  bloqueoGate,
  causaDeEstado,
  puedeAvisar,
  urlReescritura,
  type CausaAcceso,
  type DatosGate,
} from '../accesoModulo';

const base: DatosGate = {
  codigo: 'pos',
  filasActivas: 1,
  esNucleo: false,
  filasCargo: null,
  pagina: '/app/pos/ventas',
  paginasOcultas: [],
};

describe('bloqueoGate', () => {
  it('módulo activo, sin cargo ni páginas ocultas → pasa', () => {
    expect(bloqueoGate(base)).toBeNull();
  });

  it('módulo opcional sin fila activa → modulo', () => {
    expect(bloqueoGate({ ...base, filasActivas: 0 })).toBe('modulo');
  });

  it('módulo básico sin fila activa → pasa', () => {
    expect(bloqueoGate({ ...base, filasActivas: 0, esNucleo: true })).toBeNull();
  });

  it('fail open: consulta del módulo fallida o módulo desconocido → pasa', () => {
    expect(bloqueoGate({ ...base, filasActivas: null })).toBeNull();
    expect(bloqueoGate({ ...base, filasActivas: 0, esNucleo: null })).toBeNull();
  });

  it('cargo con filas y sin la del módulo → cargo; cargo sin filas no restringe', () => {
    expect(bloqueoGate({ ...base, filasCargo: [{ module_code: 'crm', can_access: true }] })).toBe('cargo');
    expect(bloqueoGate({ ...base, filasCargo: [{ module_code: 'pos', can_access: false }] })).toBe('cargo');
    expect(bloqueoGate({ ...base, filasCargo: [] })).toBeNull();
    expect(bloqueoGate({ ...base, filasCargo: [{ module_code: 'pos', can_access: true }] })).toBeNull();
  });

  it('página oculta → pagina; otra página del módulo → pasa', () => {
    expect(bloqueoGate({ ...base, pagina: '/app/pos/devoluciones', paginasOcultas: ['/app/pos/devoluciones'] })).toBe('pagina');
    expect(bloqueoGate({ ...base, pagina: '/app/pos/ventas', paginasOcultas: ['/app/pos/devoluciones'] })).toBeNull();
  });

  it('fail open: páginas ocultas sin leer → pasa', () => {
    expect(bloqueoGate({ ...base, pagina: '/app/pos/devoluciones', paginasOcultas: null })).toBeNull();
  });

  it('un módulo de una sola página nunca se bloquea por página (misma regla que el menú)', () => {
    expect(bloqueoGate({ ...base, codigo: 'clientes', pagina: '/app/clientes', paginasOcultas: ['/app/clientes'] })).toBeNull();
  });

  it('orden: módulo antes que cargo, cargo antes que página', () => {
    const todo = { ...base, filasCargo: [{ module_code: 'crm', can_access: true }], pagina: '/app/pos/devoluciones', paginasOcultas: ['/app/pos/devoluciones'] };
    expect(bloqueoGate({ ...todo, filasActivas: 0 })).toBe('modulo');
    expect(bloqueoGate(todo)).toBe('cargo');
  });
});

describe('urlReescritura', () => {
  it('apunta a la ruta interna con la ruta pedida', () => {
    const u = urlReescritura('https://app.goadmin.io/app/pos?x=1', '/app/pos', 'modulo', 'pos');
    expect(u.pathname).toBe(RUTA_MODULO_NO_HABILITADO);
    expect(u.searchParams.get('ruta')).toBe('/app/pos');
    expect(u.origin).toBe('https://app.goadmin.io');
  });
});

describe('causaDeEstado', () => {
  it('traduce estadoModulo a la causa visible', () => {
    expect(causaDeEstado({ tipo: 'disponible' })).toBe('apagado');
    expect(causaDeEstado({ tipo: 'limite' })).toBe('limite');
    expect(causaDeEstado({ tipo: 'otroPlan', plan: null })).toBe('otroPlan');
    expect(causaDeEstado({ tipo: 'activo' })).toBeNull();
    expect(causaDeEstado({ tipo: 'basico' })).toBeNull();
  });
});

describe('matriz causa × rol', () => {
  const casos: [CausaAcceso, boolean, string, boolean][] = [
    // causa, puedeResolver → acción principal, puede avisar
    ['apagado', true, 'encender', false],
    ['apagado', false, 'avisar', true],
    ['limite', true, 'verPlanes', false],
    ['limite', false, 'avisar', true],
    ['otroPlan', true, 'verPlanes', false],
    ['otroPlan', false, 'avisar', true],
    ['paginaOculta', true, 'mostrarPagina', false],
    ['paginaOculta', false, 'irAModulo', true],
    ['cargo', true, 'editarCargo', false],
    ['cargo', false, 'pedirAcceso', true],
  ];
  it.each(casos)('%s · resuelve=%s → %s (avisa=%s)', (causa, resuelve, accion, avisa) => {
    expect(accionPrincipal(causa, resuelve)).toBe(accion);
    expect(puedeAvisar(causa, resuelve)).toBe(avisa);
  });
});
