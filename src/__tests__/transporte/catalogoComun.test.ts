/**
 * Catálogo común (Figma «23 Transporte» › 20): reglas puras de Vehículos y de Conductores y
 * domiciliarios, la lectura de personas (también las externas, sin empleo) y las traducciones del
 * namespace `catalogoComun` en los cuatro idiomas.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Vehicle } from '@/lib/services/transportService';
import { aPersona, type PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import { documentosFlota } from '@/lib/transporte/documentosFlota';
import {
  CARGO_EXTERNO,
  aCsv,
  cargosDe,
  filasConductores,
  filasVehiculos,
  filtrarConductores,
  filtrarVehiculos,
  kpisConductores,
  kpisVehiculos,
  moduloDeRuta,
  resumenDocumentos,
} from '@/lib/transporte/catalogoComun';

const HOY = '2026-11-24';

function vehiculo(p: Partial<Vehicle>): Vehicle {
  return {
    id: 'v1', organization_id: 120, plate: 'ABC 12F', vehicle_type: 'motorcycle', status: 'available', is_active: true,
    created_at: '', updated_at: '', brand: 'AKT', model: 'NKD 125', year: 2024, capacity_kg: 20, ...p,
  } as Vehicle;
}

function cruda(p: Record<string, unknown>) {
  return {
    id: 'd1', organization_id: 120, branch_id: null, user_id: null, employment_id: null, full_name: null, phone: null, document_type: 'CC',
    document_number: '1024556871', is_external: false, vehicle_type: null, license_number: '1024556871', license_category: 'A2',
    license_expiry: '2027-05-01', license_restrictions: null, medical_certificate_expiry: null, hazmat_certified: false, passenger_certified: false,
    is_active: true, metadata: {}, created_at: '', updated_at: '', ...p,
  } as Parameters<typeof aPersona>[0];
}

const empleado = aPersona(
  cruda({
    id: 'd1',
    user_id: 'u1',
    employment_id: 'e1',
    employment: { id: 'e1', position: { name: 'Domiciliario' }, organization_member: { id: 9, organization_id: 120, user_id: 'u1', profiles: { id: 'u1', first_name: 'Andrés', last_name: 'Pérez', email: 'a@x.co' } } },
  }),
);
const externo = aPersona(cruda({ id: 'd2', full_name: 'Karen Díaz', is_external: true, license_number: null, license_category: null, license_expiry: null, document_number: null }));

describe('aPersona', () => {
  test('con empleo: nombre del perfil, cargo de Recursos humanos y usuario del miembro', () => {
    expect(empleado).toMatchObject({ nombre: 'Andrés Pérez', cargo: 'Domiciliario', userId: 'u1', externo: false, employmentId: 'e1' });
    expect(empleado.credencial.employments?.organization_members?.profiles?.first_name).toBe('Andrés');
  });

  test('sin empleo (domiciliario externo): sale con su nombre y los diálogos lo ven', () => {
    expect(externo).toMatchObject({ nombre: 'Karen Díaz', cargo: null, externo: true, userId: null });
    // Los diálogos de siempre leen el nombre del perfil y `license_number` como texto.
    expect(externo.credencial.employments?.organization_members?.profiles?.first_name).toBe('Karen Díaz');
    expect(externo.credencial.license_number).toBe('');
  });
});

describe('Vehículos', () => {
  const vehiculos = [
    vehiculo({ id: 'v1', current_driver_id: 'u1', soat_expiry: '2026-11-20' }),
    vehiculo({ id: 'v2', plate: 'XYZ 34H', status: 'maintenance', soat_expiry: '2026-12-10' }),
    vehiculo({ id: 'v3', plate: 'WNP 101', vehicle_type: 'bus', status: 'in_use', passenger_capacity: 40, current_driver_id: 'u-sin-ficha' }),
  ];
  const docs = resumenDocumentos(
    documentosFlota(
      vehiculos.map((v) => ({ id: v.id, plate: v.plate, vehicle_type: v.vehicle_type, soat_expiry: v.soat_expiry ?? null, techno_expiry: null, insurance_expiry: null, operating_card_expiry: null })),
      [],
      HOY,
    ),
  );
  const filas = filasVehiculos(vehiculos, [empleado, externo], docs);

  test('conductor por usuario (auth.users), peor documento y estado', () => {
    expect(filas[0]).toMatchObject({ placa: 'ABC 12F', conductor: { nombre: 'Andrés Pérez', cargo: 'Domiciliario' }, docs: { estado: 'vencido', tipo: 'soat' } });
    expect(filas[1].docs.estado).toBe('por_vencer');
    expect(filas[2]).toMatchObject({ conductor: null, conductorDesconocido: true, docs: { estado: 'sin_fecha' } });
  });

  test('filtros y búsqueda sin tildes', () => {
    const base = { busqueda: '', tipo: null, estado: null, transportadora: null, documentos: null };
    expect(filtrarVehiculos(filas, { ...base, busqueda: 'andres' }).map((f) => f.id)).toEqual(['v1']);
    expect(filtrarVehiculos(filas, { ...base, tipo: 'bus' }).map((f) => f.id)).toEqual(['v3']);
    expect(filtrarVehiculos(filas, { ...base, documentos: 'vencido' }).map((f) => f.id)).toEqual(['v1']);
    expect(filtrarVehiculos(filas, { ...base, estado: 'maintenance' }).map((f) => f.id)).toEqual(['v2']);
  });

  test('KPI: disponibles con documentos vencidos no salen', () => {
    expect(kpisVehiculos(filas)).toMatchObject({ total: 3, disponibles: 1, disponiblesBloqueados: 1, enUso: 1, mantenimiento: 1, placasMantenimiento: ['XYZ 34H'] });
  });
});

describe('Conductores y domiciliarios', () => {
  const vehiculos = [vehiculo({ id: 'v1', current_driver_id: 'u1' })];
  const personas: PersonaCatalogo[] = [empleado, externo];
  const docs = resumenDocumentos(
    documentosFlota(
      [],
      personas.map((p) => ({ id: p.id, full_name: p.nombre, license_category: p.licenciaCategoria, license_expiry: p.licenciaVence, medical_certificate_expiry: p.examenVence })),
      HOY,
    ),
  );
  const filas = filasConductores(personas, vehiculos, docs);

  test('vehículo asignado por usuario, licencia y cargo', () => {
    expect(filas[0]).toMatchObject({ nombre: 'Andrés Pérez', vehiculo: { placa: 'ABC 12F' }, licencia: { estado: 'vigente' } });
    expect(filas[1]).toMatchObject({ nombre: 'Karen Díaz', vehiculo: null, licencia: { estado: 'sin_fecha' }, externo: true });
    expect(cargosDe(filas)).toEqual(['Domiciliario', CARGO_EXTERNO]);
  });

  test('filtros: cargo, vehículo y documentos', () => {
    const base = { busqueda: '', cargo: null, estado: null, categoria: null, documentos: null, vehiculo: null };
    expect(filtrarConductores(filas, { ...base, cargo: CARGO_EXTERNO }).map((f) => f.id)).toEqual(['d2']);
    expect(filtrarConductores(filas, { ...base, vehiculo: 'con' }).map((f) => f.id)).toEqual(['d1']);
    expect(filtrarConductores(filas, { ...base, documentos: 'sin_fecha' }).map((f) => f.id)).toEqual(['d2']);
    expect(filtrarConductores(filas, { ...base, busqueda: 'abc 12' }).map((f) => f.id)).toEqual(['d1']);
  });

  test('KPI', () => {
    expect(kpisConductores(filas)).toMatchObject({ total: 2, activos: 2, externos: 1, conVehiculo: 1, sinVehiculo: 1, sinLicencia: 1 });
  });
});

test('la ruta decide el módulo', () => {
  expect(moduloDeRuta('/app/logistica/vehiculos')).toBe('logistica');
  expect(moduloDeRuta('/app/transporte/conductores')).toBe('transporte');
  expect(moduloDeRuta(null)).toBe('transporte');
});

test('CSV con BOM, punto y coma y comillas escapadas', () => {
  expect(aCsv([{ a: 'x;y' }], ['A'], (f) => [f.a])).toBe('﻿A\r\n"x;y"');
});

describe('traducciones de catalogoComun', () => {
  const leer = (l: string) => JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf-8')) as Record<string, unknown>;
  const claves = (o: unknown, p = ''): string[] =>
    o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => claves(v, p ? `${p}.${k}` : k)) : [p];
  const es = leer('es').catalogoComun;

  test.each(['en', 'fr', 'pt'])('%s tiene las mismas claves que es y ningún texto vacío', (l) => {
    const otro = leer(l).catalogoComun;
    expect(claves(otro).sort()).toEqual(claves(es).sort());
    const valores = (o: unknown): string[] => (o && typeof o === 'object' ? Object.values(o as Record<string, unknown>).flatMap(valores) : [String(o)]);
    expect(valores(otro).every((v) => v.trim().length > 0)).toBe(true);
  });

  test('toda clave literal que piden las pantallas existe en español', () => {
    const existentes = new Set(claves(es).map((c) => `catalogoComun.${c}`));
    const archivos = {
      'src/components/transporte/vehiculos/VehiculosPage.tsx': { t: 'catalogoComun.vehiculos', tc: 'catalogoComun.comun' },
      'src/components/transporte/conductores/ConductoresPage.tsx': { t: 'catalogoComun.conductores', tc: 'catalogoComun.comun' },
    } as const;
    const faltan: string[] = [];
    for (const [archivo, ns] of Object.entries(archivos)) {
      const fuente = readFileSync(join(process.cwd(), archivo), 'utf-8');
      for (const m of fuente.matchAll(/\b(t|tc)\('([\w.]+)'/g)) {
        const clave = `${ns[m[1] as 't' | 'tc']}.${m[2]}`;
        if (!existentes.has(clave)) faltan.push(`${archivo}: ${clave}`);
      }
    }
    expect(faltan).toEqual([]);
  });
});
