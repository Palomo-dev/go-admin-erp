/**
 * Pantalla de arranque: qué se muestra en «Entrando a tu organización» y los
 * contratos de «/» que no deben volver atrás.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CLAVE_CACHE_PERFIL,
  CLAVE_ORGANIZACION,
  leerDatosArranque,
  primerNombre,
  type AlmacenArranque,
} from '../datosArranque';

function almacen(valores: Record<string, unknown>): AlmacenArranque {
  return {
    getItem: (clave) => (clave in valores ? (typeof valores[clave] === 'string' ? (valores[clave] as string) : JSON.stringify(valores[clave])) : null),
  };
}

const sesion = (email: string, meta: Record<string, unknown> = {}) => ({ user: { email, user_metadata: meta } });

describe('leerDatosArranque', () => {
  test('sin sesión no hay nada que mostrar', () => {
    expect(leerDatosArranque(null, almacen({}))).toEqual({ organizacion: null, usuario: null, sucursal: null });
  });

  test('lee la organización activa con su logo', () => {
    const datos = leerDatosArranque(
      sesion('ana@ejemplo.co'),
      almacen({ [CLAVE_ORGANIZACION]: { id: 120, name: 'Una tienda de calzado', logo_url: 'logos/120.png' } })
    );
    expect(datos.organizacion).toEqual({ id: 120, nombre: 'Una tienda de calzado', logoUrl: 'logos/120.png' });
  });

  test('una organización guardada incompleta o corrupta no se muestra', () => {
    expect(leerDatosArranque(sesion('a@b.co'), almacen({ [CLAVE_ORGANIZACION]: { id: 5 } })).organizacion).toBeNull();
    expect(leerDatosArranque(sesion('a@b.co'), almacen({ [CLAVE_ORGANIZACION]: { id: 'x', name: 'Org' } })).organizacion).toBeNull();
    expect(leerDatosArranque(sesion('a@b.co'), almacen({ [CLAVE_ORGANIZACION]: '{no es json' })).organizacion).toBeNull();
  });

  test('el nombre sale de la caché del perfil solo si es de la misma cuenta', () => {
    const cache = { data: { name: 'Ana María Pérez', email: 'ANA@ejemplo.co' }, orgName: 'x', orgId: '120', timestamp: 1 };
    expect(leerDatosArranque(sesion('ana@ejemplo.co'), almacen({ [CLAVE_CACHE_PERFIL]: cache })).usuario).toBe('Ana');
    // Equipo compartido: la caché es de otra persona → se usan los metadatos de la sesión.
    expect(
      leerDatosArranque(sesion('luis@ejemplo.co', { full_name: 'Luis Gómez' }), almacen({ [CLAVE_CACHE_PERFIL]: cache })).usuario
    ).toBe('Luis');
  });

  test('sin nombre conocido no se inventa uno (nunca el correo)', () => {
    expect(leerDatosArranque(sesion('ana@ejemplo.co'), almacen({})).usuario).toBeNull();
    expect(primerNombre('ana@ejemplo.co')).toBeNull();
    expect(primerNombre('   ')).toBeNull();
  });

  test('la sucursal queda vacía: el navegador no guarda su nombre', () => {
    expect(leerDatosArranque(sesion('a@b.co'), almacen({ currentBranchId: '7' })).sucursal).toBeNull();
  });
});

describe('«/» es solo la pantalla de arranque', () => {
  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf-8');

  test('no declara su propia lista de módulos ni un «Cerrar sesión»', () => {
    const pagina = leer('src/app/page.tsx');
    expect(pagina.match(/['"`]\/app\/[\w/-]*/g) ?? []).toEqual(["'/app/inicio"]);
    expect(pagina).not.toMatch(/signOut|Cerrar Sesi/);
    expect(pagina).toMatch(/PantallaArranque/);
  });

  test('AuthGuard usa la misma pantalla de arranque', () => {
    const guard = leer('src/components/app-layout/AuthGuard.tsx');
    expect(guard).toMatch(/from '@\/components\/shell\/arranque\/PantallaArranque'/);
    expect(guard).not.toMatch(/Cargando sesión/);
  });

  test('el middleware no redirige «/» a /app/inicio (instalación de la PWA en iOS desde «/»)', () => {
    const middleware = leer('src/middleware.ts');
    expect(middleware).not.toMatch(/pathname\s*===\s*['"]\/['"][^\n]*\n?[^\n]*\/app\/inicio/);
    const manifest = JSON.parse(leer('public/manifest.json')) as { start_url: string; scope: string };
    expect({ start_url: manifest.start_url, scope: manifest.scope }).toEqual({ start_url: '/', scope: '/' });
  });
});
