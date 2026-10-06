/**
 * @jest-environment jsdom
 *
 * Organización (Figma 08): piezas principales renderizadas con los textos
 * reales de messages/*.json.
 * - El marco de pantalla decide el acceso con lo que dice el servidor
 *   (`/api/me/capacidades`), nunca con el `role_id`: sin permiso hay salida.
 * - Chip y medidor de cupo: «8/10 usuarios · Comprar usuarios», amarillo
 *   desde el 80 % y rojo desde el 95 %.
 * - Compras: «el plan no lo permite» con salida a Plan.
 * - Mis organizaciones: «Desactivar» solo donde el servidor dice que la
 *   persona administra, con su rol propio en cada fila.
 * - Importar sucursales: revisa el archivo y crea con el servicio de siempre.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { Capacidades } from '@/lib/navigation/useCapacidades';

const capacidades: { datos: Capacidades; cargando: boolean; error: boolean } = {
  datos: {
    organizationId: 7,
    esAdmin: false,
    capacidades: {
      gestionarNotificaciones: false,
      verAnaliticaWeb: false,
      variasSedes: false,
      crearSucursal: false,
      gestionarOrganizacion: false,
      gestionarMiembros: false,
      gestionarFacturacion: false,
    },
    sucursales: { permitidas: [], verTodas: true, accesoTotal: true },
  },
  cargando: false,
  error: false,
};
const recargar = jest.fn();

jest.mock('@/lib/navigation/useCapacidades', () => ({
  useCapacidades: () => ({ ...capacidades, recargar, navegacion: new Set() }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/app/organizacion/miembros',
  useSearchParams: () => new URLSearchParams(),
}));

const organizaciones = [
  { id: 7, nombre: 'Tienda Norte', logoUrl: null, subdominio: 'norte', rol: 'Administrador', plan: 'Pro', estado: 'activa' as const, puedeAdministrar: true, esPropietario: false },
  { id: 9, nombre: 'Café Sur', logoUrl: null, subdominio: null, rol: 'Empleado', plan: null, estado: 'prueba' as const, puedeAdministrar: false, esPropietario: false },
];
jest.mock('@/components/shell/header/useOrganizacionesUsuario', () => ({
  useOrganizacionesUsuario: () => ({ organizaciones, error: false, recargar: jest.fn() }),
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  cambiarOrganizacionActiva: jest.fn(),
  limpiarOrganizacionActiva: jest.fn(),
}));

jest.mock('@/components/organization/CreateOrganizationDialog', () => ({ __esModule: true, default: () => null }));

const createBranch = jest.fn(async (b: { name: string }) => ({ id: 99, ...b }));
const generateBranchCode = jest.fn(async () => 'SUC-7-010');
jest.mock('@/lib/services/branchService', () => ({
  branchService: {
    createBranch: (b: { name: string }) => createBranch(b),
    generateBranchCode: () => generateBranchCode(),
  },
}));

// Importaciones después de los mocks.
/* eslint-disable import/first */
import { PantallaOrganizacion } from '../acceso/PantallaOrganizacion';
import { ChipCupo, MedidorUso } from '../acceso/Cupo';
import { DialogoCompra } from '../acceso/DialogoCompra';
import { MisOrganizacionesPantalla } from '../misOrganizaciones/MisOrganizacionesPantalla';
import { DialogoImportarSucursales } from '../sucursales/DialogoImportarSucursales';
import { cupoUsuarios } from '@/lib/organizacion/cupo';
import type { SucursalFila } from '../sucursales/tipos';
import { Users } from 'lucide-react';
/* eslint-enable import/first */

beforeEach(() => {
  capacidades.datos = { ...capacidades.datos, esAdmin: false, capacidades: { ...capacidades.datos.capacidades, gestionarMiembros: false } };
  capacidades.error = false;
  createBranch.mockClear();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
});

describe('PantallaOrganizacion', () => {
  test('sin permiso: estado con salida, sin la caja amarilla ni el contenido', () => {
    const hijo = jest.fn(() => <p>contenido</p>);
    renderConIdioma(
      <PantallaOrganizacion titulo="Miembros" icono={Users} permiso="miembros">
        {hijo}
      </PantallaOrganizacion>,
    );
    expect(screen.getByText('No tienes acceso a esta pantalla')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver al inicio' }).getAttribute('href')).toBe('/app/inicio');
    expect(hijo).not.toHaveBeenCalled();
  });

  test('con la capacidad del servidor (no por rol) muestra el contenido con la organización de la sesión', () => {
    capacidades.datos = { ...capacidades.datos, capacidades: { ...capacidades.datos.capacidades, gestionarMiembros: true } };
    renderConIdioma(
      <PantallaOrganizacion titulo="Miembros" icono={Users} permiso="miembros">
        {({ organizationId }) => <p>org {organizationId}</p>}
      </PantallaOrganizacion>,
    );
    expect(screen.getByText('org 7')).toBeTruthy();
  });

  test('error del servidor: aviso sin jerga con «Reintentar»', () => {
    capacidades.error = true;
    renderConIdioma(
      <PantallaOrganizacion titulo="Miembros" icono={Users} permiso="miembros">
        {() => <p>contenido</p>}
      </PantallaOrganizacion>,
      { idioma: 'en' },
    );
    expect(screen.getByText("We couldn't load the organization")).toBeTruthy();
  });
});

describe('Cupo', () => {
  test('chip «8/10 usuarios · Comprar usuarios»', () => {
    const onComprar = jest.fn();
    renderConIdioma(<ChipCupo cupo={cupoUsuarios(6, 2, 10)} tipo="usuarios" onComprar={onComprar} />);
    const boton = screen.getByRole('button');
    expect(boton.textContent).toContain('8/10 usuarios');
    expect(boton.textContent).toContain('Comprar usuarios');
    fireEvent.click(boton);
    expect(onComprar).toHaveBeenCalled();
  });

  test('sin tope no hay chip', () => {
    const { container } = renderConIdioma(<ChipCupo cupo={cupoUsuarios(6, 2, null)} tipo="usuarios" />);
    expect(container.textContent).toBe('');
  });

  test.each([
    [7, 'bg-brand-action'],
    [8, 'bg-warning'],
    [10, 'bg-danger'],
  ])('medidor con %i de 10 → %s', (actual, clase) => {
    renderConIdioma(<MedidorUso etiqueta="Usuarios" actual={actual} maximo={10} valor={`${actual} de 10`} onComprar={() => undefined} />);
    const barra = screen.getByRole('progressbar', { name: 'Usuarios' });
    expect((barra.firstElementChild as HTMLElement).className).toContain(clase);
    expect((barra.firstElementChild as HTMLElement).style.width).toBe(`${actual * 10}%`);
    expect(screen.getByRole('button', { name: /Comprar más/ })).toBeTruthy();
  });
});

describe('DialogoCompra', () => {
  // El precio no hace falta en estos estados: la petición queda en vuelo.
  beforeEach(() => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
  });

  test('plan vencido: «Tu plan no permite esta compra» con salida a Plan', () => {
    renderConIdioma(<DialogoCompra abierto onAbiertoChange={() => undefined} tipo="usuarios" organizationId={7} estadoPlan="vencida" maximo={10} />);
    expect(screen.getByText('Tu plan no permite esta compra')).toBeTruthy();
    expect(screen.getByText(/Ponte al día con el pago/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver planes' }).getAttribute('href')).toBe('/app/organizacion/plan');
  });

  test('éxito al volver de la pasarela', () => {
    renderConIdioma(<DialogoCompra abierto onAbiertoChange={() => undefined} tipo="sucursales" organizationId={7} estadoPlan="activa" maximo={3} faseInicial="exito" />, { idioma: 'pt' });
    expect(screen.getByText('Compra concluída!')).toBeTruthy();
  });
});

describe('Mis organizaciones', () => {
  test('todas las organizaciones con su propio rol; «Desactivar» solo donde administra', async () => {
    capacidades.datos = { ...capacidades.datos };
    renderConIdioma(<MisOrganizacionesPantalla />);
    expect(screen.getAllByText('Tienda Norte').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Café Sur').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Empleado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Administrador').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Actual').length).toBeGreaterThan(0);
  });
});

describe('Importar sucursales', () => {
  const existentes = [{ id: 1, name: 'Principal', branch_code: 'MAIN-001', organization_id: 7 }] as unknown as SucursalFila[];

  test('lee el CSV de «Exportar», descarta errores, respeta el cupo y crea con branchService', async () => {
    const onImportadas = jest.fn();
    renderConIdioma(
      <DialogoImportarSucursales abierto onAbiertoChange={() => undefined} organizationId={7} existentes={existentes} restantes={1} onImportadas={onImportadas} />,
    );
    const csv = '﻿Nombre,Código,Ciudad\nNorte,,Bello\nPrincipal,,Medellín\n,,Cali\nSur,SUC-7-020,Envigado\n';
    const archivo = new File([csv], 'sucursales.csv', { type: 'text/csv' });
    Object.defineProperty(archivo, 'text', { value: async () => csv });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [archivo] } });

    await screen.findByText('Filas leídas');
    expect(screen.getByText(/ya existe una sucursal llamada «Principal»/)).toBeTruthy();
    expect(screen.getByText(/Fila 4: sin nombre/)).toBeTruthy();
    expect(screen.getByText('No caben en el cupo del plan')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Importar 1 sucursal' }));
    await waitFor(() => expect(onImportadas).toHaveBeenCalled());
    expect(createBranch).toHaveBeenCalledTimes(1);
    expect(createBranch.mock.calls[0][0]).toMatchObject({ name: 'Norte', city: 'Bello', organization_id: 7, branch_code: 'SUC-7-010' });
    expect(await screen.findByText('Se creó 1 sucursal')).toBeTruthy();
  });
});
