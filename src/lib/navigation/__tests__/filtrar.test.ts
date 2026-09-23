import { CATALOGO_NAV, moduloPorCodigo } from '../catalog';
import { filtrarNavegacion, rutaActiva, type AccesoNav } from '../filtrar';

const todosLosModulos = CATALOGO_NAV.map((m) => m.codigo).filter((c): c is string => c !== null);

function acceso(parcial: Partial<AccesoNav> = {}): AccesoNav {
  return {
    modulosActivos: todosLosModulos,
    paginasActivas: {},
    modulosCargo: null,
    paginasCargo: null,
    capacidades: new Set(),
    ...parcial,
  };
}

function modulosVisibles(a: AccesoNav): string[] {
  return filtrarNavegacion(a).flatMap((s) => s.modulos.map((m) => m.modulo.id));
}

describe('catálogo de navegación', () => {
  test('cada módulo con código aparece una sola vez', () => {
    const codigos = todosLosModulos;
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  test('ningún href de página se repite entre módulos', () => {
    const hrefs = CATALOGO_NAV.flatMap((m) => m.paginas.map((p) => p.href));
    const repetidos = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
    expect(repetidos).toEqual([]);
  });

  test('toda página vive bajo una de las rutas de su módulo', () => {
    const fuera = CATALOGO_NAV.flatMap((m) =>
      m.paginas
        .filter((p) => !m.rutas.some((r) => p.href === r || p.href.startsWith(r + '/')))
        .map((p) => `${m.id}: ${p.href}`)
    );
    expect(fuera).toEqual([]);
  });

  test('el CRM trae todas sus páginas de crmNav (antes el panel tenía 10 y el sidebar 16)', () => {
    expect(moduloPorCodigo('crm')!.paginas.length).toBeGreaterThanOrEqual(16);
  });
});

describe('filtrarNavegacion', () => {
  test('Inicio siempre se ve, aunque la organización no tenga ningún módulo', () => {
    expect(modulosVisibles(acceso({ modulosActivos: [] }))).toEqual(['inicio']);
  });

  test('un módulo que la organización no tiene activo no aparece', () => {
    const visibles = modulosVisibles(acceso({ modulosActivos: ['pos', 'inventory'] }));
    expect(visibles).toEqual(expect.arrayContaining(['inicio', 'pos', 'inventario']));
    expect(visibles).not.toContain('finanzas');
  });

  test('el cargo puede ocultar un módulo activo', () => {
    const visibles = modulosVisibles(acceso({ modulosCargo: ['pos'] }));
    expect(visibles).toContain('pos');
    expect(visibles).not.toContain('inventario');
  });

  test('las páginas se filtran por las activas de la organización', () => {
    const [ventas] = filtrarNavegacion(
      acceso({ modulosActivos: ['pos'], paginasActivas: { pos: ['/app/pos', '/app/pos/cajas'] } })
    ).filter((s) => s.codigo === 'ventas');
    const pos = ventas.modulos.find((m) => m.modulo.id === 'pos')!;
    expect(pos.paginas.map((p) => p.href)).toEqual(['/app/pos', '/app/pos/cajas']);
    expect(pos.tieneSubmenu).toBe(true);
  });

  test('con una sola página visible el módulo es un enlace directo a esa página', () => {
    const secciones = filtrarNavegacion(
      acceso({ modulosActivos: ['inventory'], paginasActivas: { inventory: ['/app/inventario/stock'] } })
    );
    const inv = secciones.flatMap((s) => s.modulos).find((m) => m.modulo.id === 'inventario')!;
    expect(inv.tieneSubmenu).toBe(false);
    expect(inv.href).toBe('/app/inventario/stock');
  });

  test('los módulos de una sola página no se filtran por página (como el sidebar viejo)', () => {
    const visibles = modulosVisibles(
      acceso({ paginasCargo: ['/app/pos'], paginasActivas: { clientes: [] } })
    );
    expect(visibles).toEqual(expect.arrayContaining(['clientes', 'reportes', 'configuracion']));
  });

  test('las páginas fuera del menú no se listan, pero siguen en el catálogo', () => {
    const chat = filtrarNavegacion(acceso()).flatMap((s) => s.modulos).find((m) => m.modulo.id === 'chat')!;
    expect(chat.paginas.map((p) => p.href)).not.toContain('/app/chat/ia/configuracion');
    expect(moduloPorCodigo('chat')!.paginas.map((p) => p.href)).toContain('/app/chat/ia/configuracion');
  });

  test('un módulo sin ninguna página visible desaparece', () => {
    const visibles = modulosVisibles(acceso({ modulosActivos: ['finance'], paginasActivas: { finance: [] } }));
    expect(visibles).not.toContain('finanzas');
  });

  test('sin el permiso de gestionar notificaciones solo queda la bandeja, y el módulo entra directo a ella', () => {
    const notif = filtrarNavegacion(acceso())
      .flatMap((s) => s.modulos)
      .find((m) => m.modulo.id === 'notificaciones')!;
    expect(notif.paginas.map((p) => p.href)).toEqual(['/app/notificaciones/bandeja']);
    expect(notif.href).toBe('/app/notificaciones/bandeja');
  });

  test('con el permiso se ven las siete páginas de notificaciones', () => {
    const notif = filtrarNavegacion(acceso({ capacidades: new Set(['gestionarNotificaciones']) }))
      .flatMap((s) => s.modulos)
      .find((m) => m.modulo.id === 'notificaciones')!;
    expect(notif.paginas).toHaveLength(7);
    expect(notif.href).toBe('/app/notificaciones');
  });

  test('las secciones salen en el orden del diseño y sin secciones vacías', () => {
    const codigos = filtrarNavegacion(acceso({ modulosActivos: ['pos', 'configuracion'] })).map((s) => s.codigo);
    expect(codigos).toEqual(['principal', 'ventas', 'organizacion']);
  });
});

describe('rutaActiva', () => {
  test('gana la página más específica', () => {
    expect(rutaActiva('/app/finanzas/contabilidad/asientos')?.pagina?.nombre).toBe('Asientos');
    expect(rutaActiva('/app/finanzas/contabilidad')?.pagina?.nombre).toBe('Contabilidad');
  });

  test('un detalle dentro de una página marca esa página', () => {
    const r = rutaActiva('/app/pos/ventas/abc-123');
    expect(r?.modulo.id).toBe('pos');
    expect(r?.pagina?.href).toBe('/app/pos/ventas');
  });

  test('la raíz del POS no se confunde con sus subpáginas', () => {
    expect(rutaActiva('/app/pos')?.pagina?.href).toBe('/app/pos');
    expect(rutaActiva('/app/pos/cajas')?.pagina?.href).toBe('/app/pos/cajas');
  });

  test('una ruta del módulo sin página propia activa el módulo sin página', () => {
    const r = rutaActiva('/app/finanzas');
    expect(r?.modulo.id).toBe('finanzas');
    expect(r?.pagina).toBeNull();
  });

  test('una página fuera del menú resalta la página que la contiene', () => {
    expect(rutaActiva('/app/chat/ia/configuracion')?.pagina?.href).toBe('/app/chat/ia');
  });

  test('/app/admin pertenece a Roles', () => {
    expect(rutaActiva('/app/admin/usuarios')?.modulo.id).toBe('roles');
  });

  test('una ruta fuera del catálogo no activa nada', () => {
    expect(rutaActiva('/app/perfil')).toBeNull();
    expect(rutaActiva(null)).toBeNull();
  });
});
