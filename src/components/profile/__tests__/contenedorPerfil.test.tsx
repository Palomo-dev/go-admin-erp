/**
 * @jest-environment jsdom
 */
/**
 * Contenedor de «Mi perfil» (Figma 344:9281, 346:20440 y 346:21440):
 * cabecera con cargo y sucursales, navegación en el orden del diseño (con
 * «Organización y roles» como una sola sección) y los cuatro idiomas.
 * Organización ficticia; sin datos reales.
 */
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: () => '14 de marzo de 2024', timezone: 'America/Bogota' }),
}));
jest.mock('next/image', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/supabase/imageUtils', () => ({ getAvatarUrl: (p: string) => p }));

import { fireEvent } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { CabeceraPerfil } from '../CabeceraPerfil';
import { NavPerfil, SECCIONES_PERFIL, seccionPerfilDe } from '../NavPerfil';

describe('CabeceraPerfil', () => {
  const base = {
    nombre: 'María Gómez',
    correo: 'maria@ejemplo.co',
    creadoEn: '2024-03-14T15:00:00Z',
    organizacion: { id: 7, nombre: 'Mi empresa S.A.S.', logoUrl: null },
    sucursales: ['Sucursal Principal', 'Sucursal Norte'],
    onCambiarFoto: () => undefined,
  };

  test('nombre, cargo, correo · alta, organización y una píldora por sucursal', () => {
    const editar = jest.fn();
    const { container } = renderConIdioma(<CabeceraPerfil {...base} cargo="Cajera principal" onEditar={editar} />);
    expect(container.querySelector('h1')?.textContent).toBe('María Gómez');
    expect(container.innerHTML).toContain('Cajera principal');
    expect(container.textContent).toContain('maria@ejemplo.co · Se unió el 14 de marzo de 2024');
    expect(container.textContent).toContain('Mi empresa S.A.S.');
    expect(container.textContent).toContain('Sucursal Principal');
    expect(container.textContent).toContain('Sucursal Norte');
    const botonEditar = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Editar');
    fireEvent.click(botonEditar!);
    expect(editar).toHaveBeenCalled();
    // «Cerrar sesión» va a la ruta única de cierre, no duplica `signOut`.
    expect(container.querySelector('a[href="/auth/logout"]')).not.toBeNull();
  });

  test('el avatar abre «Cambiar foto de perfil»', () => {
    const foto = jest.fn();
    const { container } = renderConIdioma(<CabeceraPerfil {...base} onCambiarFoto={foto} onEditar={() => undefined} />);
    const avatar = container.querySelector('button[aria-label="Cambiar foto de perfil"]');
    expect(avatar).not.toBeNull();
    fireEvent.click(avatar!);
    expect(foto).toHaveBeenCalled();
  });

  test('sin cargo no pinta el badge (no se inventa)', () => {
    const { container } = renderConIdioma(<CabeceraPerfil {...base} cargo={null} onEditar={() => undefined} />);
    expect(container.innerHTML).not.toContain('Cajera');
  });
});

describe('NavPerfil', () => {
  test('orden del diseño; la activa lleva aria-current y «Eliminar cuenta» va en rojo', () => {
    const elegir = jest.fn();
    const { container } = renderConIdioma(<NavPerfil activa="preferencias" onElegir={elegir} />);
    const botones = Array.from(container.querySelectorAll('button'));
    expect(botones.map((b) => b.textContent)).toEqual([
      'Datos personales',
      'Seguridad',
      'Preferencias',
      'Sesiones y dispositivos',
      'Organización y roles',
      'Notificaciones',
      'Panel de vendedor',
      'Eliminar cuenta',
    ]);
    expect(botones[2].getAttribute('aria-current')).toBe('page');
    expect(botones[0].getAttribute('aria-current')).toBeNull();
    expect(botones[7].getAttribute('class')).toContain('text-danger-text');
    fireEvent.click(botones[4]);
    expect(elegir).toHaveBeenCalledWith('organizacion-roles');
  });

  test.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('todas las secciones traducidas (%s)', (idioma) => {
    const { container } = renderConIdioma(<NavPerfil activa="datos-personales" onElegir={() => undefined} />, { idioma });
    expect(container.querySelectorAll('button')).toHaveLength(SECCIONES_PERFIL.length);
    expect(container.innerHTML).not.toMatch(/perfil\.|secciones\./);
  });

  test('seccionPerfilDe: ids antiguos de organización y roles van a la sección unida', () => {
    expect(seccionPerfilDe('roles')).toBe('organizacion-roles');
    expect(seccionPerfilDe('organizacion-default')).toBe('organizacion-roles');
    expect(seccionPerfilDe('seguridad')).toBe('seguridad');
    expect(seccionPerfilDe('lo-que-sea')).toBe('datos-personales');
    expect(seccionPerfilDe(null)).toBe('datos-personales');
  });
});
