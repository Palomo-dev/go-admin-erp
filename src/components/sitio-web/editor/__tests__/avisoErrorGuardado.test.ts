import { detalleErrorGuardado, motivoErrorGuardado } from '../avisoErrorGuardado';

describe('motivoErrorGuardado', () => {
  it.each([
    [{ estado: 401, codigo: 'sin_sesion' }, 'sesion'],
    [{ estado: 403, codigo: 'sin_permiso' }, 'permiso'],
    [{ estado: 409, codigo: 'conflicto_version' }, 'otraPestana'],
    [{ estado: 422, codigo: 'documento_invalido' }, 'invalido'],
    [{ estado: 0, codigo: 'red' }, 'red'],
    [{ estado: 500, codigo: 'error_interno' }, 'generico'],
  ])('%o → %s', (e, m) => expect(motivoErrorGuardado(e)).toBe(m));
});

describe('detalleErrorGuardado', () => {
  it('usa las rutas del contrato', () => {
    expect(detalleErrorGuardado({ detalles: [{ ruta: 'a.b' }, { ruta: 'c' }, { ruta: 'd' }, { ruta: 'e' }] })).toBe('a.b, c, d');
  });
  it('cae al mensaje', () => {
    expect(detalleErrorGuardado({ message: 'x' })).toBe('x');
  });
});
