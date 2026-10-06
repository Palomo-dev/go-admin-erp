/**
 * Módulos, Sucursales y la guía «Configura tu organización» — lógica pura.
 * Planes ficticios con la forma real de `plans.module_config`.
 */
import {
  agruparPorVertical,
  codigoCanonico,
  coincideModulo,
  cupoOpcionales,
  estadoModulo,
  moduloEnCatalogo,
  opcionalesActivos,
  planIncluye,
  planMinimoPara,
  type ModuloBase,
  type PlanModulos,
} from '../modulos';
import {
  estadoSitioSede,
  filtrarSucursales,
  ordenarSucursales,
  resumenHorario,
  resumenSucursales,
  sucursalesACsv,
  urlPublicaSede,
  type SucursalBase,
} from '../sucursales';
import { pasosGuia, progresoGuia } from '../guia';

const MODULOS: ModuloBase[] = [
  { code: 'organizations', name: 'Organización', is_core: true, rank: 1 },
  { code: 'pos', name: 'Punto de venta', is_core: false, rank: 2 },
  { code: 'inventory', name: 'Inventario', is_core: false, rank: 3, description: 'Stock y bodegas' },
  { code: 'pms_hotel', name: 'Hotel', is_core: false, rank: 4 },
  { code: 'gym', name: 'Gimnasio (alias)', is_core: false, rank: 5 },
  { code: 'desconocido', name: 'Sin menú', is_core: false, rank: 6 },
];

const BASICO: PlanModulos = { code: 'basic', name: 'Básico', max_modules: 3, price_cop_month: 90000, module_config: { available_modules: ['organizations', 'pos', 'inventory'] } };
const PRO: PlanModulos = { code: 'pro', name: 'Pro', max_modules: 10, price_cop_month: 190000, module_config: { available_modules: ['organizations', 'pos', 'inventory', 'pms_hotel', 'memberships'] } };
const ULTIMATE: PlanModulos = { code: 'ultimate', name: 'Ultimate', max_modules: null, price_cop_month: 390000, module_config: { available_modules: ['organizations', 'pos', 'inventory', 'pms_hotel', 'memberships'] } };
const MEDIDA: PlanModulos = { code: 'enterprise', name: 'A medida', max_modules: null, is_custom_enterprise: true, module_config: null };
const PLANES = [ULTIMATE, PRO, BASICO, MEDIDA];

describe('módulos', () => {
  test('alias del catálogo de planes', () => {
    expect(codigoCanonico('gym')).toBe('memberships');
    expect(codigoCanonico('pos')).toBe('pos');
    expect(planIncluye(PRO, 'gym')).toBe(true);
  });

  test('un plan sin lista o a medida no restringe; sin plan no incluye nada', () => {
    expect(planIncluye(MEDIDA, 'pms_hotel')).toBe(true);
    expect(planIncluye(null, 'pos')).toBe(false);
    expect(planIncluye(BASICO, 'pms_hotel')).toBe(false);
  });

  test('«Disponible en el plan X»: el activo más barato que lo incluye, nunca el a medida', () => {
    expect(planMinimoPara(PLANES, 'pms_hotel')?.code).toBe('pro');
    expect(planMinimoPara(PLANES, 'desconocido')).toBeNull();
    expect(planMinimoPara([{ ...PRO, is_active: false }, ULTIMATE], 'pms_hotel')?.code).toBe('ultimate');
  });

  test('cupo de opcionales = tope − básicos', () => {
    expect(cupoOpcionales({ modulos: MODULOS, plan: BASICO })).toBe(2);
    expect(cupoOpcionales({ modulos: MODULOS, plan: ULTIMATE })).toBeNull();
    expect(opcionalesActivos({ modulos: MODULOS, activos: new Set(['organizations', 'pos']) })).toBe(1);
  });

  test('estado de cada módulo', () => {
    const ctx = { modulos: MODULOS, activos: new Set(['organizations', 'pos']), plan: BASICO, planes: PLANES };
    expect(estadoModulo(MODULOS[0], ctx)).toEqual({ tipo: 'basico' });
    expect(estadoModulo(MODULOS[1], ctx)).toEqual({ tipo: 'activo' });
    expect(estadoModulo(MODULOS[2], ctx)).toEqual({ tipo: 'disponible' });
    expect(estadoModulo(MODULOS[3], ctx)).toEqual({ tipo: 'otroPlan', plan: 'Pro' });
    expect(estadoModulo(MODULOS[5], ctx)).toEqual({ tipo: 'otroPlan', plan: null });
    const lleno = { ...ctx, activos: new Set(['organizations', 'pos', 'inventory']) };
    const otro: ModuloBase = { code: 'crm', name: 'CRM', is_core: false };
    expect(estadoModulo(otro, { ...lleno, plan: { ...BASICO, module_config: { available_modules: ['pos', 'inventory', 'crm'] } } })).toEqual({ tipo: 'limite' });
  });

  test('agrupados por vertical: básicos primero, luego por sección del menú, otros al final', () => {
    const grupos = agruparPorVertical(MODULOS);
    expect(grupos[0]).toMatchObject({ clave: 'nucleo' });
    expect(grupos[0].modulos.map((m) => m.code)).toEqual(['organizations']);
    expect(grupos[grupos.length - 1].clave).toBe('otros');
    expect(grupos[grupos.length - 1].modulos.map((m) => m.code)).toEqual(['desconocido']);
    // Ningún módulo se pierde ni se repite.
    expect(grupos.flatMap((g) => g.modulos).length).toBe(MODULOS.length);
  });

  test('catálogo y buscador', () => {
    expect(moduloEnCatalogo('pos')).toBe(true);
    expect(moduloEnCatalogo('gym')).toBe(true);
    expect(moduloEnCatalogo('desconocido')).toBe(false);
    expect(coincideModulo(MODULOS[2], 'BODEGA')).toBe(true);
    expect(coincideModulo(MODULOS[1], 'kardex', [{ name: 'Kardex' }])).toBe(true);
    expect(coincideModulo(MODULOS[1], '   ')).toBe(true);
    expect(coincideModulo(MODULOS[1], 'hotel')).toBe(false);
  });
});

describe('sucursales', () => {
  const SEDES: (SucursalBase & { address?: string | null; branch_code?: string | null })[] = [
    { id: 1, name: 'Principal', is_main: true, is_active: true, manager_id: 'u1', city: 'Medellín', branch_code: 'MAIN-001' },
    { id: 2, name: 'Norte', is_active: true, is_web_published: true, city: 'Bello', branch_code: 'SUC-1-002' },
    { id: 3, name: 'Bodega', is_active: false, branch_code: 'SUC-1-003' },
    { id: 4, name: 'Centro', is_active: true, manager_id: 'u2', address: 'Calle 10 # 40-20' },
  ];
  const SITIOS = [
    { branch_id: null, published_revision_id: 'r1' },
    { branch_id: 4, published_revision_id: 'r2' },
  ];

  test('columna «Sitio web»: publicado, heredado del principal o sin sitio', () => {
    expect(estadoSitioSede(SEDES[0], SITIOS)).toBe('publicado');
    expect(estadoSitioSede(SEDES[1], SITIOS)).toBe('heredado');
    expect(estadoSitioSede(SEDES[2], SITIOS)).toBe('sinSitio');
    expect(estadoSitioSede(SEDES[3], SITIOS)).toBe('publicado');
    // Sin principal publicado, nada se hereda.
    expect(estadoSitioSede(SEDES[1], [{ branch_id: null, published_revision_id: null }])).toBe('sinSitio');
  });

  test('cifras de la cabecera coherentes con el cupo (solo activas, P1-8)', () => {
    const r = resumenSucursales(SEDES, SITIOS, 3);
    expect(r).toMatchObject({ total: 4, activas: 3, inactivas: 1, sinGerente: 1, conSitio: 3 });
    expect(r.cupo).toMatchObject({ usados: 3, maximo: 3, lleno: true });
  });

  test('filtrar y ordenar', () => {
    expect(filtrarSucursales(SEDES, 'bello', 'todas').map((s) => s.id)).toEqual([2]);
    expect(filtrarSucursales(SEDES, '', 'inactiva').map((s) => s.id)).toEqual([3]);
    expect(filtrarSucursales(SEDES, 'calle 10', 'activa').map((s) => s.id)).toEqual([4]);
    expect(ordenarSucursales(SEDES).map((s) => s.id)).toEqual([1, 4, 2, 3]);
  });

  test('CSV con BOM, comillas y sin fórmulas', () => {
    const csv = sucursalesACsv(['Nombre', 'Dirección'], [['Sede "A"', 'Calle 1, local 2'], ['=1+1', null]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Sede ""A""","Calle 1, local 2"');
    expect(csv).toContain("'=1+1,");
  });

  test('URL pública de la sede', () => {
    expect(urlPublicaSede({ custom_domain: 'tienda.ejemplo.co' }, {})).toBe('https://tienda.ejemplo.co');
    // El subdominio de la sede no es una URL de la sede: el sitio lo resolvería como otra organización.
    expect(urlPublicaSede({ subdomain: 'norte' }, {})).toBeNull();
    expect(urlPublicaSede({ subdomain: 'norte', slug: 'norte' }, { subdominio: 'marca' })).toBe('https://marca.goadmin.io/norte');
    expect(urlPublicaSede({ slug: 'norte' }, { dominio: 'ejemplo.co' })).toBe('https://ejemplo.co/norte');
    expect(urlPublicaSede({ slug: 'norte' }, { subdominio: 'marca' })).toBe('https://marca.goadmin.io/norte');
    expect(urlPublicaSede({ slug: 'norte' }, {})).toBeNull();
  });

  test('horario agrupado en tramos', () => {
    const dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const h = { open: '09:00', close: '18:00' };
    expect(
      resumenHorario({ monday: h, tuesday: h, wednesday: h, thursday: h, friday: h, saturday: { open: '10:00', close: '15:00' }, sunday: { closed: true } }, dias),
    ).toEqual(['Lun–Vie 09:00–18:00', 'Sáb 10:00–15:00']);
    expect(resumenHorario(null, dias)).toEqual([]);
  });
});

describe('guía «Configura tu organización»', () => {
  const base = { tieneLogo: false, sedesConDireccion: 0, miembrosActivos: 1, invitacionesVigentes: 0, tieneMetodoPago: false, sitioPublicado: false };

  test('cinco pasos en orden con su destino', () => {
    const pasos = pasosGuia(base);
    expect(pasos.map((p) => p.clave)).toEqual(['logo', 'sede', 'equipo', 'pago', 'sitio']);
    expect(pasos.every((p) => p.estado === 'pendiente')).toBe(true);
    expect(pasos.find((p) => p.clave === 'equipo')?.href).toBe('/app/organizacion/invitaciones?invitar=1');
  });

  test('invitar cuenta como hecho aunque nadie haya aceptado todavía', () => {
    expect(pasosGuia({ ...base, invitacionesVigentes: 1 }).find((p) => p.clave === 'equipo')?.estado).toBe('hecho');
  });

  test('lo que no se puede comprobar no cuenta en el progreso', () => {
    const pasos = pasosGuia({ ...base, tieneLogo: true, sedesConDireccion: 2, miembrosActivos: 3, tieneMetodoPago: null, sitioPublicado: true });
    expect(pasos.find((p) => p.clave === 'pago')?.estado).toBe('noDisponible');
    expect(progresoGuia(pasos)).toEqual({ hechos: 4, total: 4, completa: true });
    expect(progresoGuia(pasosGuia(base))).toEqual({ hechos: 0, total: 5, completa: false });
  });
});
