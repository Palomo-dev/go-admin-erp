/**
 * @jest-environment jsdom
 */
/**
 * «Salud de clientes» pasó de /app/crm/salud/configuracion al diálogo de
 * Configuración (Figma pág. 10, sección 3080:36387; nota técnica S10,
 * aprobada el 2026-11-24): sección registrada como segunda pestaña de CRM, la
 * ruta vieja abre el diálogo con el aviso «se movió» y los accesos de Salud
 * abren el diálogo en `crm.salud`. Nadie enlaza ya la página vieja.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { AtajoConfigurar } from '../AtajoConfigurar';
import { EVENTO_ABRIR_CONFIGURACION, type OpcionesAbrirConfiguracion } from '../dialogo/abrirConfiguracion';
import { PERMISO_ADMIN, resolverSeccion, rutaSeccion, seccionPorId, SECCIONES_CONFIG } from '../config/configSectionsRegistry';
import { destinoDesdeRutaVieja, esRutaVieja, hrefConDialogo } from '../config/dialogoUrl';
import { construirMenu, entradaConSeccion } from '../config/menuConfiguracion';
import { buscarAjustes, construirIndice } from '../config/buscadorConfiguracion';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';

const RAIZ = join(__dirname, '../../../..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
type Ns = { secciones: Record<string, { titulo: string; palabras: string }>; origenes: Record<string, string>; modulos: Record<string, string> };
const IDIOMAS = { es, en, fr, pt } as unknown as Record<string, { configuracionUnificada: Ns }>;

describe('registro de la sección', () => {
  test('crm.salud: segunda pestaña de CRM, nueva, solo admin y con sus propios estados de lectura', () => {
    const s = seccionPorId('crm.salud');
    expect(s).toMatchObject({ modulo: 'crm', seccion: 'salud', clave: 'crmSalud', permiso: PERMISO_ADMIN, nueva: true, estadosPropios: true });
    expect(s?.enlace).toBeUndefined();
    const crm = entradaConSeccion(construirMenu(SECCIONES_CONFIG), 'crm.salud')!;
    expect(crm.id).toBe('crm');
    expect(crm.secciones.map((x) => x.id).slice(0, 2)).toEqual(['crm.general', 'crm.salud']);
    expect(resolverSeccion('crm', 'salud')?.id).toBe('crm.salud');
  });

  test('tiene panel en el renderizador', () => {
    expect(leer('src/components/configuracion/layout/ConfiguracionPanelRenderer.tsx')).toMatch(/'crm\.salud': dynamic\(\(\) => import\('\.\.\/crm\/SaludTab'\)/);
  });

  test.each(Object.keys(IDIOMAS))('el buscador la encuentra por sus palabras clave (%s)', (idioma) => {
    const ns = IDIOMAS[idioma].configuracionUnificada;
    const indice = construirIndice(SECCIONES_CONFIG, {
      modulo: (m) => ns.modulos[m] ?? m,
      seccion: (clave) => ns.secciones[clave] ?? { titulo: clave, palabras: '' },
      ajuste: (clave) => ({ titulo: clave, palabras: '' }),
    });
    expect(buscarAjustes('churn', indice).map((r) => r.seccionId)).toContain('crm.salud');
    expect(buscarAjustes(ns.secciones.crmSalud.titulo, indice)[0]?.seccionId).toBe('crm.salud');
  });
});

describe('la ruta vieja abre el diálogo', () => {
  test('/app/crm/salud/configuracion → crm.salud con el aviso «se movió»', () => {
    expect(esRutaVieja('/app/crm/salud/configuracion')).toBe(true);
    expect(esRutaVieja('/app/crm/salud')).toBe(false);
    expect(destinoDesdeRutaVieja('/app/crm/salud/configuracion')).toEqual({ seccionId: 'crm.salud', movido: 'crmSaludConfiguracion' });
    expect(destinoDesdeRutaVieja('/app/crm/salud/configuracion/')).toEqual({ seccionId: 'crm.salud', movido: 'crmSaludConfiguracion' });
    expect(destinoDesdeRutaVieja('/app/crm/salud')).toBeNull();
    expect(hrefConDialogo('/app/crm/salud', destinoDesdeRutaVieja('/app/crm/salud/configuracion')!)).toBe(
      '/app/crm/salud?config=crm.salud&config_movido=crmSaludConfiguracion',
    );
  });

  test.each(Object.keys(IDIOMAS))('el origen del aviso tiene texto (%s)', (idioma) => {
    expect(IDIOMAS[idioma].configuracionUnificada.origenes.crmSaludConfiguracion).toBeTruthy();
  });

  test('la página vieja solo redirige (sobre Salud de clientes si se entra directo)', () => {
    const pagina = leer('src/app/app/crm/salud/configuracion/page.tsx');
    expect(pagina).toMatch(/<RedirigirAlDialogo base="\/app\/crm\/salud" \/>/);
    expect(pagina).not.toMatch(/crm\/health\/SaludConfiguracion/);
    expect(existsSync(join(RAIZ, 'src/components/crm/health/SaludConfiguracion.tsx'))).toBe(false);
  });
});

describe('los accesos de Salud abren el diálogo en crm.salud', () => {
  test('«Configurar factores» (AtajoConfigurar) emite abrirConfiguracion({ seccionId: crm.salud }) y conserva el enlace estable', () => {
    const recibidos: OpcionesAbrirConfiguracion[] = [];
    const oir = (e: Event) => recibidos.push((e as CustomEvent<OpcionesAbrirConfiguracion>).detail);
    window.addEventListener(EVENTO_ABRIR_CONFIGURACION, oir);
    renderConIdioma(<AtajoConfigurar seccion="crm.salud" etiqueta="Configurar factores" />);
    const enlace = screen.getByRole('link', { name: 'Configurar factores' });
    expect(enlace.getAttribute('href')).toBe(rutaSeccion('crm.salud'));
    fireEvent.click(enlace);
    window.removeEventListener(EVENTO_ABRIR_CONFIGURACION, oir);
    expect(recibidos).toEqual([{ seccionId: 'crm.salud', ancla: undefined }]);
  });

  test('SaludView: botón, menú del celular y «¿Cómo se calcula?» van al diálogo', () => {
    const src = leer('src/components/crm/health/SaludView.tsx');
    expect(src).toMatch(/const SECCION_CONFIG = 'crm\.salud';/);
    expect(src).toMatch(/<AtajoConfigurar seccion=\{SECCION_CONFIG\} etiqueta=\{tc\('configurarFactores'\)\} \/>/);
    expect(src).toMatch(/id: 'factores', etiqueta: tc\('configurarFactores'\), icono: Settings, onSelect: \(\) => abrirConfiguracion\(\{ seccionId: SECCION_CONFIG \}\)/);
    expect(src).toMatch(/accionSecundaria=\{\{ etiqueta: t\('vacio\.comoSeCalcula'\), onClick: \(\) => abrirConfiguracion\(\{ seccionId: SECCION_CONFIG \}\) \}\}/);
  });

  test('SaludDetalle: el enlace «Factores» abre el diálogo', () => {
    const src = leer('src/components/crm/health/SaludDetalle.tsx');
    expect(src).toMatch(/href=\{rutaSeccion\('crm\.salud'\)\}/);
    expect(src).toMatch(/abrirConfiguracion\(\{ seccionId: 'crm\.salud' \}\)/);
  });

  test('nadie en src/ (fuera de las pruebas) ni en messages/ enlaza la página vieja (salvo su redirección)', () => {
    // Las pruebas sí la nombran (fijan la redirección): se recorre solo el código de la app.
    const permitidos = new Set(['src/app/app/crm/salud/configuracion/page.tsx', 'src/components/configuracion/config/dialogoUrl.ts']);
    const hallados: string[] = [];
    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(dir)) {
        const ruta = join(dir, nombre);
        if (statSync(ruta).isDirectory()) {
          if (nombre !== '__tests__') recorrer(ruta);
        }
        else if (/\.(tsx?|json)$/.test(nombre)) {
          const rel = relative(RAIZ, ruta).replace(/\\/g, '/');
          if (!permitidos.has(rel) && readFileSync(ruta, 'utf8').includes('/app/crm/salud/configuracion')) hallados.push(rel);
        }
      }
    };
    recorrer(join(RAIZ, 'src'));
    recorrer(join(RAIZ, 'messages'));
    expect(hallados).toEqual([]);
  });
});
