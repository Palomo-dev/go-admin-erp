/**
 * Lógica pura de los componentes comunes del módulo Sitio web (Figma A/07,
 * B/02): estado de publicación, estado de dominio, vista previa, precio,
 * textos canónicos y tonos de la tabla única.
 */
import { resolverEstadoPublicacion, ESTADO_TONO_PUBLICACION } from '../estadoPublicacion';
import { escalaVista, origenDe, VIEWPORT_DISPOSITIVO } from '../dispositivos';
import { interpolar, textoCanonico, TEXTOS_COMUN } from '../textos';
import { resolverEstadoDominio } from '../DomainStatusBadge';
import { formatearPrecio } from '../PriceTag';
import { resolverEstado, CLAVES_ETIQUETA_ESTADO } from '@/components/kit/estadoTono';
import { porcentajeProgreso } from '@/components/kit/BarraProgreso';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

describe('resolverEstadoPublicacion (A/07a)', () => {
  test('prioridad: guardando > falló > programado > sin publicar > cambios > publicado', () => {
    const base = { publicadoEn: '2026-10-03T23:40:00Z', cambiosSinPublicar: 3 };
    expect(resolverEstadoPublicacion({ ...base, guardando: true, falloPublicacion: true })).toEqual({ tipo: 'guardando' });
    expect(resolverEstadoPublicacion({ ...base, falloPublicacion: true, programadoPara: 'x' })).toEqual({ tipo: 'error' });
    expect(resolverEstadoPublicacion({ ...base, programadoPara: '2026-10-08T12:00:00Z' })).toEqual({
      tipo: 'programado',
      fecha: '2026-10-08T12:00:00Z',
    });
    expect(resolverEstadoPublicacion({ cambiosSinPublicar: 3 })).toEqual({ tipo: 'sin_publicar' });
    expect(resolverEstadoPublicacion(base)).toEqual({ tipo: 'cambios', cantidad: 3 });
    expect(resolverEstadoPublicacion({ publicadoEn: base.publicadoEn, cambiosSinPublicar: 0 })).toEqual({ tipo: 'publicado' });
  });

  test('cada estado tiene su tono en la tabla única, con punto', () => {
    const tonos = Object.fromEntries(
      Object.entries(ESTADO_TONO_PUBLICACION).map(([k, clave]) => [k, resolverEstado(clave)]),
    );
    expect(tonos.publicado).toMatchObject({ tono: 'exito', punto: true, conocido: true });
    expect(tonos.cambios).toMatchObject({ tono: 'advertencia', punto: true });
    expect(tonos.borrador).toMatchObject({ tono: 'neutro', punto: true });
    expect(tonos.guardando).toMatchObject({ tono: 'informacion', punto: true });
    expect(tonos.programado).toMatchObject({ tono: 'informacion', punto: true });
    expect(tonos.sin_publicar).toMatchObject({ tono: 'neutro', punto: true });
    expect(tonos.error).toMatchObject({ tono: 'peligro', punto: true });
  });

  test('«Borrador» de documento no cambia (sin punto): un estado = un tono', () => {
    expect(resolverEstado('Borrador')).toMatchObject({ tono: 'neutro', punto: false });
    expect(resolverEstado('Pendiente').tono).toBe('advertencia');
  });

  test('las claves nuevas entran en la lista de traducciones del kit', () => {
    for (const c of ['publicado', 'cambios_sin_publicar', 'dns_pendiente', 'activo_ssl', 'configurado', 'falta', 'opcional']) {
      expect(CLAVES_ETIQUETA_ESTADO).toContain(c);
    }
  });
});

describe('resolverEstadoDominio (B/02)', () => {
  test.each([
    ['verifying', undefined, 'verificando'],
    ['failed', undefined, 'mal_configurado'],
    ['expired', undefined, 'vencido'],
    ['pending', undefined, 'pendiente'],
    ['disabled', undefined, 'pendiente'],
    ['verified', undefined, 'activo'],
    ['verified', 90, 'activo'],
    ['verified', 12, 'vence_pronto'],
    ['verified', 0, 'vence_pronto'],
    ['verified', -1, 'vencido'],
  ])('%s con %s días → %s', (status, dias, esperado) => {
    expect(resolverEstadoDominio(status, dias as number | undefined)).toBe(esperado);
  });

  test('tonos: verificando información, activo éxito, mal configurado peligro, pendiente neutro', () => {
    expect(resolverEstado('verificando dns').tono).toBe('informacion');
    expect(resolverEstado('activo ssl').tono).toBe('exito');
    expect(resolverEstado('mal configurado').tono).toBe('peligro');
    expect(resolverEstado('vence pronto').tono).toBe('advertencia');
    expect(resolverEstado('dns pendiente').tono).toBe('neutro');
  });
});

describe('vista previa (A/07f, A/07g)', () => {
  test('la escala nunca amplía ni da cero', () => {
    expect(escalaVista(720, 1440)).toBe(0.5);
    expect(escalaVista(2000, 1440)).toBe(1);
    expect(escalaVista(0, 1440)).toBe(1);
    expect(escalaVista(Number.NaN, 390)).toBe(1);
  });

  test('anchos del diseño: 1440 / 1024 / 390', () => {
    expect(VIEWPORT_DISPOSITIVO.escritorio.ancho).toBe(1440);
    expect(VIEWPORT_DISPOSITIVO.portatil.ancho).toBe(1024);
    expect(VIEWPORT_DISPOSITIVO.celular.ancho).toBe(390);
  });

  test('postMessage solo a un origen http(s) concreto, nunca a *', () => {
    expect(origenDe('https://tu-marca.goadmin.io/?preview=abc')).toBe('https://tu-marca.goadmin.io');
    expect(origenDe('javascript:alert(1)')).toBeNull();
    expect(origenDe('no es url')).toBeNull();
    expect(origenDe(null)).toBeNull();
  });
});

describe('precio y textos', () => {
  test('pesos colombianos sin decimales: «$ 89.900»', () => {
    expect(formatearPrecio(89900, 'COP').replace(/\s/g, ' ')).toBe('$ 89.900');
  });

  test('textos canónicos por ruta y con marcadores', () => {
    expect(textoCanonico('dominio.venceEn')).toBe('Vence en {n} días');
    expect(interpolar('Vence en {n} días', { n: 12 })).toBe('Vence en 12 días');
    expect(interpolar('Hola {x}')).toBe('Hola {x}');
    expect(textoCanonico('guia.pasos.cloudflare')).toHaveLength(4);
    expect(textoCanonico('no.existe')).toBeUndefined();
  });

  test('ningún texto canónico dice «GoAdmin» sin espacio, usa emojis ni signos de admiración', () => {
    const todo = JSON.stringify(TEXTOS_COMUN);
    expect(todo).not.toMatch(/GoAdmin/);
    expect(todo).not.toMatch(/[!¡]/);
    expect(todo).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  test('barra de progreso: 5 de 7 = 71 %, acotada', () => {
    expect(porcentajeProgreso(5, 7)).toBe(71);
    expect(porcentajeProgreso(9, 7)).toBe(100);
    expect(porcentajeProgreso(1, 0)).toBe(0);
  });
});
