/**
 * Lógica pura de «Configuración del sitio» (Figma B/12): legales, conteo de
 * cambios, parche a website_settings y resúmenes del móvil. Datos ficticios.
 */
import {
  camposCambiados,
  cambiaIdentidad,
  columnasDeCambios,
  conDatosDeOrganizacion,
  contarCambios,
  documentosLegales,
  esPrimeraVez,
  esquemaCambiosConfiguracion,
  faltaTratamientoDatos,
  funcionDeColumna,
  parcheAjustes,
  resumenSecciones,
  validarFormulario,
  type FormularioConfiguracion,
} from '../configuracionSitio';
import { codigoDeFila } from '../configuracionSitio.server';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/website/paginasSitioService', () => ({ permisosSitio: jest.fn() }));
jest.mock('@/components/sitio-web/seoanalitica/seo.server', () => ({ direccionDelSitio: jest.fn(), guardarAjustesServidor: jest.fn(), ErrorSeo: class extends Error {} }));

const base: FormularioConfiguracion = {
  nombre: 'Tu marca',
  logoUrl: null,
  faviconUrl: null,
  correo: 'hola@tumarca.com',
  telefono: '',
  whatsapp: '',
  saludoWhatsapp: '',
  chatActivo: false,
  idioma: 'es-CO',
  mantenimiento: false,
  codigo: [],
};

describe('documentosLegales', () => {
  it('marca cada documento como publicado, borrador o falta según las páginas', () => {
    const docs = documentosLegales([
      { id: 'p1', slug: 'terminos', titulo: 'Términos', publicada: true, estado: 'publicado', actualizadaEn: '2026-09-12T15:00:00Z' },
      { id: 'p2', slug: 'politica-de-cookies', titulo: 'Cookies', publicada: true, estado: 'cambios', actualizadaEn: null },
      { id: 'p3', slug: 'contacto', titulo: 'Contacto', publicada: true, estado: 'publicado', actualizadaEn: null },
    ]);
    expect(docs.map((d) => [d.clave, d.estado])).toEqual([
      ['terminos', 'publicado'],
      ['privacidad', 'falta'],
      ['tratamiento', 'falta'],
      ['cookies', 'borrador'],
      ['devoluciones', 'falta'],
    ]);
    expect(docs[0].fecha).toBe('2026-09-12T15:00:00Z');
    expect(faltaTratamientoDatos(docs)).toBe(true);
  });

  it('no avisa cuando la política de tratamiento de datos está publicada', () => {
    const docs = documentosLegales([{ id: 'x', slug: 'tratamiento-de-datos', titulo: 'T', publicada: true, estado: 'publicado', actualizadaEn: null }]);
    expect(faltaTratamientoDatos(docs)).toBe(false);
  });
});

describe('cambios del formulario', () => {
  it('cuenta un cambio por campo y uno por bloque de código', () => {
    const actual: FormularioConfiguracion = {
      ...base,
      nombre: 'Mi empresa',
      chatActivo: true,
      codigo: [{ id: null, nombre: 'Chat', alcance: 'todas', posicion: 'body', activo: true, codigo: '<script></script>', autor: null, creadoEn: null }],
    };
    expect(camposCambiados(base, actual)).toEqual(['nombre', 'chatActivo', 'codigo']);
    expect(contarCambios(base, actual)).toBe(3);
    expect(cambiaIdentidad(base, actual)).toBe(true);
    expect(contarCambios(base, base)).toBe(0);
  });

  it('el parche solo lleva lo que cambió y nunca el código anterior (solo lectura)', () => {
    const legado = { id: null, nombre: 'Código anterior', alcance: 'todas', posicion: 'body' as const, activo: true, codigo: 'x', autor: null, creadoEn: null, legado: true };
    const original = { ...base, codigo: [legado] };
    const actual = {
      ...original,
      idioma: 'en' as const,
      codigo: [legado, { id: null, nombre: 'Encuesta', alcance: '/gracias', posicion: 'head' as const, activo: false, codigo: '<div></div>', autor: null, creadoEn: null }],
    };
    const p = parcheAjustes(original, actual);
    expect(p).toEqual({ idioma: 'en', codigo: [{ id: null, nombre: 'Encuesta', alcance: '/gracias', posicion: 'head', activo: false, codigo: '<div></div>' }] });
    expect(cambiaIdentidad(original, actual)).toBe(false);
  });
});

describe('esquema y columnas de website_settings', () => {
  it('traduce el parche a las columnas de la lista blanca', () => {
    const r = esquemaCambiosConfiguracion.parse({ correo: 'hola@tumarca.com', whatsapp: '+57 300 555 0100', idioma: 'pt', mantenimiento: true, chatActivo: false });
    expect(columnasDeCambios(r)).toEqual({
      contact_email: 'hola@tumarca.com',
      whatsapp_number: '+57 300 555 0100',
      site_locale: 'pt',
      maintenance_mode: true,
      chat_widget_enabled: false,
    });
  });

  it('rechaza claves desconocidas, correos inválidos y alcances raros', () => {
    expect(esquemaCambiosConfiguracion.safeParse({ is_published: false }).success).toBe(false);
    expect(esquemaCambiosConfiguracion.safeParse({ organization_id: 7 }).success).toBe(false);
    expect(esquemaCambiosConfiguracion.safeParse({ correo: 'no-es-correo' }).success).toBe(false);
    expect(
      esquemaCambiosConfiguracion.safeParse({ codigo: [{ id: null, nombre: 'x', alcance: 'javascript:alert(1)', posicion: 'body', activo: true, codigo: 'x' }] }).success,
    ).toBe(false);
  });

  it('sabe qué función pendiente necesita cada columna', () => {
    expect(funcionDeColumna('contact_phone')).toBe('contacto');
    expect(funcionDeColumna('custom_code')).toBe('codigo');
    expect(funcionDeColumna('chat_widget_enabled')).toBeNull();
  });
});

describe('primera vez y validación', () => {
  const vacio = { ...base, nombre: '', correo: '' };
  it('detecta la primera vez y precarga la organización sin pisar lo escrito', () => {
    expect(esPrimeraVez(vacio)).toBe(true);
    const f = conDatosDeOrganizacion({ ...vacio, telefono: '+57 1' }, { nombre: 'Mi empresa S.A.S.', logoUrl: 'https://x/logo.png', correo: 'info@miempresa.co', telefono: '+57 2' });
    expect(f).toMatchObject({ nombre: 'Mi empresa S.A.S.', logoUrl: 'https://x/logo.png', correo: 'info@miempresa.co', telefono: '+57 1' });
    expect(esPrimeraVez(f)).toBe(false);
  });

  it('exige nombre y un correo válido solo si el contacto se puede editar', () => {
    expect(validarFormulario(vacio, true)).toEqual({ nombre: 'requerido', correo: 'requerido' });
    expect(validarFormulario(vacio, false)).toEqual({ nombre: 'requerido' });
    expect(validarFormulario({ ...base, correo: 'x@', whatsapp: 'abc' }, true)).toEqual({ correo: 'invalido', whatsapp: 'invalido' });
  });
});

describe('resúmenes del móvil (B/12-03)', () => {
  it('arma una fila por sección con el estado real', () => {
    const docs = documentosLegales([]);
    const r = resumenSecciones({ ...base, chatActivo: true, codigo: [{ id: 'a', nombre: 'x', alcance: 'todas', posicion: 'body', activo: true, codigo: 'x', autor: null, creadoEn: null }] }, docs, {
      publicado: true,
      moneda: 'COP',
    });
    expect(r.map((x) => x.seccion)).toEqual(['datos', 'legales', 'codigo', 'chat', 'idioma', 'mantenimiento', 'peligro']);
    expect(r[1]).toMatchObject({ clave: 'movil.resumen.legalesFaltan', valores: { n: 5 }, falta: true });
    expect(r[2]).toMatchObject({ clave: 'movil.resumen.codigoUno' });
    expect(r[3].clave).toBe('movil.resumen.activo');
    expect(r[5].clave).toBe('movil.resumen.publicado');
  });
});

describe('codigoDeFila', () => {
  it('lee custom_code con autor y añade el texto libre anterior como solo lectura', () => {
    const lista = codigoDeFila(
      {
        custom_code: [{ id: 'c1', nombre: 'Chat', alcance: 'todas', posicion: 'body', activo: true, codigo: 'x', creado_por: 'u1', creado_en: '2026-10-01' }],
        custom_scripts: '<script>pixel</script>',
      },
      new Map([['u1', 'Persona de prueba']]),
    );
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ id: 'c1', autor: 'Persona de prueba', posicion: 'body' });
    expect(lista[1]).toMatchObject({ legado: true, codigo: '<script>pixel</script>' });
  });
});
