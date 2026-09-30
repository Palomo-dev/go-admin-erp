import { entregarArchivo, prepararDescarga } from '../cliente';

/**
 * Pestaña mínima para comprobar que el clic de descarga ocurre ahí,
 * no en la ventana que ya perdió el gesto del usuario.
 */
function pestanaDePrueba() {
  const ancla = { href: '', download: '', click: jest.fn() };
  const cuerpo = { textContent: '', appendChild: jest.fn() };
  const revocar = jest.fn();
  const cerrar = jest.fn();
  const pendientes: Array<() => void> = [];
  const pestana = {
    closed: false,
    document: {
      title: '',
      body: cuerpo,
      documentElement: { appendChild: jest.fn() },
      createElement: jest.fn(() => ancla),
    },
    URL: {
      createObjectURL: jest.fn(() => 'blob:cierre'),
      revokeObjectURL: revocar,
    },
    setTimeout: (fn: () => void) => {
      pendientes.push(fn);
      return 1;
    },
    close: () => {
      pestana.closed = true;
      cerrar();
    },
  };
  return { pestana, ancla, cuerpo, revocar, cerrar, pendientes };
}

describe('entrega del archivo', () => {
  test('sin navegador no abre pestaña', () => {
    expect(prepararDescarga('Preparando')).toBeNull();
  });

  test('el clic de descarga ocurre en la pestaña abierta en el gesto', () => {
    const { pestana, ancla, cuerpo, revocar, cerrar, pendientes } = pestanaDePrueba();
    entregarArchivo(new Blob(['pdf']), 'CIERRE-MENSUAL.pdf', pestana as unknown as Window);
    expect(ancla.href).toBe('blob:cierre');
    expect(ancla.download).toBe('CIERRE-MENSUAL.pdf');
    expect(ancla.click).toHaveBeenCalledTimes(1);
    expect(cuerpo.appendChild).toHaveBeenCalledWith(ancla);
    pendientes[0]?.();
    expect(revocar).toHaveBeenCalledWith('blob:cierre');
    expect(cerrar).toHaveBeenCalledTimes(1);
    expect(pestana.closed).toBe(true);
  });

  test('si la pestaña no acepta el archivo, lo guarda en esta ventana', () => {
    const ancla = { href: '', download: '', click: jest.fn() };
    const cuerpo = { appendChild: jest.fn(), removeChild: jest.fn() };
    const documento = { createElement: () => ancla, body: cuerpo };
    const crear = jest.fn(() => 'blob:local');
    const revocar = jest.fn();
    const anteriorDocumento = global.document;
    const anteriorCrear = URL.createObjectURL;
    const anteriorRevocar = URL.revokeObjectURL;
    Object.assign(global, { document: documento });
    URL.createObjectURL = crear as typeof URL.createObjectURL;
    URL.revokeObjectURL = revocar as typeof URL.revokeObjectURL;
    const pestana = {
      closed: false,
      URL: { createObjectURL: () => { throw new Error('no'); } },
      document: { body: null, documentElement: null, createElement: () => ({}) },
      setTimeout: () => 1,
      close: () => undefined,
    };
    try {
      entregarArchivo(new Blob(['x']), 'cierre.pdf', pestana as unknown as Window);
      expect(ancla.download).toBe('cierre.pdf');
      expect(ancla.click).toHaveBeenCalledTimes(1);
      expect(crear).toHaveBeenCalledTimes(1);
    } finally {
      Object.assign(global, { document: anteriorDocumento });
      URL.createObjectURL = anteriorCrear;
      URL.revokeObjectURL = anteriorRevocar;
    }
  });
});
