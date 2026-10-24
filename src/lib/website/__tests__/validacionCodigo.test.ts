import { esquemaCambiosConfiguracion } from '../configuracionSitio';
import {
  LIMITE_CODIGO_MEDIDA,
  PLACEHOLDER_CODIGO,
  diagnosticarCodigo,
  vistaPreviaCodigo,
} from '../validacionCodigo';

const bloque = (codigo: string) => ({
  id: null,
  nombre: 'Pixel',
  alcance: 'todas' as const,
  posicion: 'body' as const,
  activo: true,
  codigo,
});

describe('validación del código a medida', () => {
  it('el tope sigue siendo 20 000 caracteres', () => {
    expect(LIMITE_CODIGO_MEDIDA).toBe(20000);
    expect(esquemaCambiosConfiguracion.safeParse({ codigo: [bloque('a'.repeat(20000))] }).success).toBe(true);
    expect(esquemaCambiosConfiguracion.safeParse({ codigo: [bloque('a'.repeat(20001))] }).success).toBe(false);
  });

  it('el placeholder es el ejemplo del editor', () => {
    expect(PLACEHOLDER_CODIGO).toBe('<!-- Pega aquí tu código, p. ej. <script src="https://..."></script> -->');
  });

  it('la vista previa son las primeras 3 líneas y no recorta el original', () => {
    const codigo = 'uno\ndos\ntres\ncuatro';
    expect(vistaPreviaCodigo(codigo)).toBe('uno\ndos\ntres');
    expect(codigo).toBe('uno\ndos\ntres\ncuatro');
  });

  it('detecta una etiqueta sin cerrar y deja pasar las cerradas, vacías y los comentarios', () => {
    const abierta = diagnosticarCodigo('<div>', 'body');
    expect(abierta.bloquea).toBe(true);
    expect(abierta.marcas.some((m) => m.tipo === 'etiqueta' && m.gravedad === 'error' && m.etiqueta === 'div')).toBe(true);

    expect(diagnosticarCodigo('<div></div>', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<DIV></div>', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<br><img src="a"><input>', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<div />', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<div title="a>b"></div>', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<!-- <div> -->', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<div><span></div>', 'body').marcas.some((m) => m.tipo === 'etiqueta' && m.etiqueta === 'span')).toBe(true);
  });

  it('no trata como etiqueta el HTML que va dentro de script, style o textarea', () => {
    const script = '<script>\nvar s = "<div>";\n</script>';
    expect(diagnosticarCodigo(script, 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<style>div { color: red; }</style>', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<textarea><div></textarea>', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<style>', 'body').bloquea).toBe(true);
  });

  it('marca un error de JavaScript evidente y no ejecuta el cuerpo', () => {
    const roto = diagnosticarCodigo('<script>\nfunction (\n</script>', 'body');
    expect(roto.bloquea).toBe(true);
    expect(roto.marcas.some((m) => m.tipo === 'javascript')).toBe(true);

    const conThrow = diagnosticarCodigo('<script>throw new Error("no-correr")</script>', 'body');
    expect(conThrow.bloquea).toBe(false);

    expect(diagnosticarCodigo('<script type="module">\nimport x from "y";\n</script>', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<script type="application/ld+json">{</script>', 'body').bloquea).toBe(false);
    expect(diagnosticarCodigo('<script src="https://cdn.ejemplo/a.js"></script>', 'body').bloquea).toBe(false);
  });

  it('avisa sin bloquear si hay un documento completo o elementos visibles en head', () => {
    const documento = diagnosticarCodigo('<html><body><script></script></body></html>', 'body');
    expect(documento.bloquea).toBe(false);
    expect(documento.avisos).toContain('documento');

    const visible = diagnosticarCodigo('<div></div>', 'head');
    expect(visible.bloquea).toBe(false);
    expect(visible.avisos).toContain('visible');
    expect(diagnosticarCodigo('<div></div>', 'body').avisos).not.toContain('visible');

    const permitido = diagnosticarCodigo('<script></script><style></style><link><meta>', 'head');
    expect(permitido.bloquea).toBe(false);
    expect(permitido.avisos).toEqual([]);
    expect(diagnosticarCodigo('<header></header>', 'body').avisos).not.toContain('documento');
    expect(diagnosticarCodigo('<header></header>', 'head').avisos).toContain('visible');
  });

  it('una cadena vacía no bloquea por sintaxis; pasar el tope sí', () => {
    expect(diagnosticarCodigo('', 'body')).toEqual({ marcas: [], bloquea: false, avisos: [] });
    expect(diagnosticarCodigo('a'.repeat(20000), 'body').bloquea).toBe(false);
    const largo = diagnosticarCodigo('a'.repeat(20001), 'body');
    expect(largo.bloquea).toBe(true);
    expect(largo.marcas.some((m) => m.tipo === 'limite')).toBe(true);
  });
});
