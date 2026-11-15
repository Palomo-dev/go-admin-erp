/**
 * Reglas puras de Recursos humanos › Estructura (áreas, cargos y plazas).
 */
import {
  abiertasIniciales,
  aplanarOrganigrama,
  cambiosCargo,
  construirOrganigrama,
  cuentaErroresCargo,
  datosCargoIniciales,
  estadoPlaza,
  filtrarCargos,
  filtrarOrganigrama,
  FILTROS_CARGOS,
  medioSugerido,
  motivoNoEliminarCargo,
  payloadCargo,
  posicionEnEscala,
  resumenPlazas,
  rutaArea,
  subarbolIds,
  validarCargo,
  validarFilaEscala,
} from '../logica';
import type { AreaApi, CargoDetalle, CargoFila } from '../tipos';

function area(id: string, parent: string | null, extra: Partial<AreaApi> = {}): AreaApi {
  return {
    id,
    parent_id: parent,
    nombre: id,
    codigo: null,
    descripcion: null,
    centro_costo: null,
    responsable: null,
    personas: 0,
    sedes: [],
    plazas: [],
    cargos: [],
    actualizado: null,
    ...extra,
  };
}

const AREAS: AreaApi[] = [
  area('Dirección', null, { personas: 2 }),
  area('Operaciones', 'Dirección', { personas: 1, plazas: [{ sede_id: 1, aprobadas: 1, ocupadas: 1 }] }),
  area('Cocina', 'Operaciones', { personas: 13, sedes: [1], plazas: [{ sede_id: 1, aprobadas: 8, ocupadas: 7 }, { sede_id: 2, aprobadas: 6, ocupadas: 6 }] }),
  area('Servicio', 'Operaciones', { personas: 18, sedes: [2], plazas: [{ sede_id: 1, aprobadas: 12, ocupadas: 11 }], responsable: { id: 'e1', nombre: 'Natalia Gil', cargo: null } }),
  area('Huérfana', 'no-existe', { personas: 3 }),
];

describe('organigrama', () => {
  test('suma personas y vacantes por el subárbol y sube a la raíz lo que no tiene padre', () => {
    const raices = construirOrganigrama(AREAS);
    expect(raices.map((r) => r.area.id)).toEqual(['Dirección', 'Huérfana']);
    const dir = raices[0];
    expect(dir.personasTotal).toBe(2 + 1 + 13 + 18);
    expect(dir.vacantesTotal).toBe(2);
    expect(dir.descendientes).toBe(3);
    const ops = dir.hijos[0];
    expect(ops.hijos.map((h) => h.area.id)).toEqual(['Cocina', 'Servicio']);
    expect(ops.nivel).toBe(1);
  });

  test('un ciclo no cuelga y sus áreas siguen visibles', () => {
    const raices = construirOrganigrama([area('A', 'B'), area('B', 'A')]);
    const ids = aplanarOrganigrama(raices, new Set(), true).map((n) => n.area.id).sort();
    expect(ids).toEqual(['A', 'B']);
  });

  test('busca por nombre o responsable y conserva los ancestros', () => {
    const raices = construirOrganigrama(AREAS);
    const r = filtrarOrganigrama(raices, 'natalia', null);
    expect([...r.coincidencias]).toEqual(['Servicio']);
    expect(aplanarOrganigrama(r.raices, new Set(), true).map((n) => n.area.id)).toEqual(['Dirección', 'Operaciones', 'Servicio']);
  });

  test('la sede deja las áreas que operan en ella o en todas', () => {
    const raices = construirOrganigrama(AREAS);
    const r = filtrarOrganigrama(raices, '', 2);
    const ids = aplanarOrganigrama(r.raices, new Set(), true).map((n) => n.area.id);
    expect(ids).toContain('Servicio');
    expect(ids).toContain('Cocina'); // tiene plazas en la sede 2
    expect(ids).toContain('Dirección'); // sin sedes marcadas: todas
  });

  test('filtros «con vacantes» y «sin responsable»', () => {
    const raices = construirOrganigrama(AREAS);
    const v = filtrarOrganigrama(raices, '', null, { vacantes: true, sinResponsable: false });
    expect([...v.coincidencias].sort()).toEqual(['Cocina', 'Servicio']);
    const s = filtrarOrganigrama(raices, '', null, { vacantes: true, sinResponsable: true });
    expect([...s.coincidencias]).toEqual(['Cocina']);
  });

  test('ramas abiertas al entrar, subárbol y ruta', () => {
    const raices = construirOrganigrama(AREAS);
    expect([...abiertasIniciales(raices)].sort()).toEqual(['Dirección', 'Operaciones']);
    expect([...subarbolIds(AREAS, 'Operaciones')].sort()).toEqual(['Cocina', 'Operaciones', 'Servicio']);
    expect(rutaArea(AREAS, 'Cocina')).toEqual(['Dirección', 'Operaciones', 'Cocina']);
  });
});

describe('plazas', () => {
  test('estado: sin presupuesto no es «sobre lo aprobado»', () => {
    expect(estadoPlaza(null, 4)).toEqual({ tipo: 'sinPresupuesto' });
    expect(estadoPlaza(0, 4)).toEqual({ tipo: 'sinPresupuesto' });
    expect(estadoPlaza(6, 7)).toEqual({ tipo: 'sobre', n: 1 });
    expect(estadoPlaza(8, 7)).toEqual({ tipo: 'vacantes', n: 1 });
    expect(estadoPlaza(2, 2)).toEqual({ tipo: 'completa' });
  });

  test('resumen como el Figma: 47 aprobadas, 46 ocupadas, 2 vacantes, 1 sobre', () => {
    const filas = [
      { area_id: 'dir', sede_id: 1, aprobadas: 2, ocupadas: 2 },
      { area_id: 'ops', sede_id: 1, aprobadas: 1, ocupadas: 1 },
      { area_id: 'coc', sede_id: 1, aprobadas: 8, ocupadas: 7 },
      { area_id: 'coc', sede_id: 2, aprobadas: 6, ocupadas: 6 },
      { area_id: 'ser', sede_id: 1, aprobadas: 12, ocupadas: 11 },
      { area_id: 'ser', sede_id: 2, aprobadas: 6, ocupadas: 7 },
      { area_id: 'bar', sede_id: 1, aprobadas: 3, ocupadas: 3 },
      { area_id: 'bar', sede_id: 2, aprobadas: 2, ocupadas: 2 },
      { area_id: 'adm', sede_id: 1, aprobadas: 5, ocupadas: 5 },
      { area_id: 'gh', sede_id: 1, aprobadas: 2, ocupadas: 2 },
      { area_id: 'nueva', sede_id: 1, aprobadas: 0, ocupadas: 3 },
    ];
    const r = resumenPlazas(filas);
    expect(r.aprobadas).toBe(47);
    expect(r.ocupadas).toBe(49);
    expect(r.vacantes).toBe(2);
    expect(r.sobre).toBe(1);
    expect(r.sedesConPresupuesto).toBe(2);
    expect(r.porcentaje).toBe(98);
    expect(r.filasSobre.map((f) => f.area_id)).toEqual(['ser']);
  });
});

describe('cargos', () => {
  const cargo = (extra: Partial<CargoFila>): CargoFila => ({
    id: 'c',
    nombre: 'Cocinero/a',
    codigo: null,
    area_id: 'coc',
    area: 'Cocina',
    nivel: 2,
    reporta_a: null,
    personas: 9,
    plazas: 10,
    documentos: 7,
    ...extra,
  });

  test('filtros y orden por nombre', () => {
    const lista = [cargo({ id: '1', nombre: 'Mesero/a', area_id: 'ser', area: 'Servicio', plazas: 13, personas: 13 }), cargo({ id: '2' }), cargo({ id: '3', nombre: 'Auxiliar', personas: 0, plazas: null })];
    expect(filtrarCargos(lista, FILTROS_CARGOS).map((c) => c.id)).toEqual(['3', '2', '1']);
    expect(filtrarCargos(lista, FILTROS_CARGOS, 'desc').map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(filtrarCargos(lista, { ...FILTROS_CARGOS, vacantes: true }).map((c) => c.id)).toEqual(['2']);
    expect(filtrarCargos(lista, { ...FILTROS_CARGOS, sinPersonas: true }).map((c) => c.id)).toEqual(['3']);
    expect(filtrarCargos(lista, { ...FILTROS_CARGOS, texto: 'cocina' }).map((c) => c.id)).toEqual(['3', '2']);
  });

  test('eliminar solo sin personas ni plazas', () => {
    expect(motivoNoEliminarCargo({ personas: 1, plazas: null })).toBe('personas');
    expect(motivoNoEliminarCargo({ personas: 0, plazas: 2 })).toBe('plazas');
    expect(motivoNoEliminarCargo({ personas: 0, plazas: null })).toBeNull();
  });

  test('escala: mínimo > 0 y mínimo ≤ medio ≤ máximo', () => {
    expect(validarFilaEscala({ sede_id: 1, minimo: 1950000, medio: 2250000, maximo: 2200000 })).toEqual({ maximo: 'maximoMenorQueMedio' });
    expect(validarFilaEscala({ sede_id: 1, minimo: 0, medio: 1, maximo: 2 })).toEqual({ minimo: 'mayorQueCero' });
    expect(validarFilaEscala({ sede_id: null, minimo: 2, medio: 1, maximo: 3 })).toEqual({ medio: 'medioMenorQueMinimo' });
    expect(validarFilaEscala({ sede_id: null, minimo: 1, medio: 1, maximo: 1 })).toEqual({});
    expect(medioSugerido(1800000, 2200000)).toBe(2000000);
    expect(medioSugerido(null, 1)).toBeNull();
    expect(posicionEnEscala(1700000, { minimo: 1800000, maximo: 2200000 })).toBe('debajo');
    expect(posicionEnEscala(2000000, { minimo: 1800000, maximo: 2200000 })).toBe('dentro');
  });

  const original: CargoDetalle = {
    id: 'c',
    nombre: 'Cocinero/a',
    codigo: null,
    activo: true,
    area_id: 'coc',
    area: 'Cocina',
    nivel: 2,
    reporta_a: { id: 'jefe', nombre: 'Jefe de cocina' },
    proposito: 'Prepara los platos',
    funciones: ['Preparar', 'Alistar'],
    educacion: null,
    experiencia: null,
    clase_arl: 2,
    personas: 9,
    competencias: [{ nombre: 'Trabajo en equipo', tipo: 'comportamental', nivel: 3 }],
    documentos: ['documento_identidad', 'hoja_vida'],
    documentos_propios: true,
    plazas: [],
    actualizado: null,
  };
  const vigentes = [{ sede_id: 1, minimo: 1900000, medio: 2250000, maximo: 2600000 }];

  test('cambios sin guardar y lo que se envía', () => {
    const d = datosCargoIniciales(original);
    expect(cambiosCargo(original, d, vigentes)).toEqual([]);
    d.funciones.push('Registrar mermas');
    d.documentos = d.documentos.filter((x) => x !== 'hoja_vida');
    d.escala = {
      desde: '2027-01-01',
      motivo: 'Ajuste anual',
      filas: [
        { sede_id: 1, minimo: 2000000, medio: 2350000, maximo: 2700000 },
        { sede_id: 2, minimo: null, medio: null, maximo: null },
      ],
    };
    const cambios = cambiosCargo(original, d, vigentes);
    expect(cambios).toEqual([
      { tipo: 'escala', sedes: [1], desde: '2027-01-01' },
      { tipo: 'funcionesNuevas', n: 1 },
      { tipo: 'documentoQuitado', categoria: 'hoja_vida' },
    ]);
    const p = payloadCargo(d, vigentes, false);
    expect(p.escala).toEqual({ desde: '2027-01-01', motivo: 'Ajuste anual', filas: [{ sede_id: 1, minimo: 2000000, medio: 2350000, maximo: 2700000 }] });
    expect('clase_arl' in p).toBe(false);
    // Sin cambios en la escala no se envía (no se toca el dato sensible).
    const sinEscala = payloadCargo({ ...d, escala: { desde: '2027-01-01', motivo: 'x', filas: [{ ...vigentes[0] }] } }, vigentes, true);
    expect(sinEscala.escala).toBeUndefined();
    expect(sinEscala.clase_arl).toBe(2);
  });

  test('validación del cargo y de la vigencia de la escala', () => {
    const d = datosCargoIniciales(null);
    const e = validarCargo(d, null);
    expect(e.nombre).toBe('requerido');
    expect(e.area_id).toBe('requerido');
    expect(e.nivel).toBe('requerido');
    expect(d.documentos.length).toBeGreaterThan(0); // lista base
    const ok = { ...datosCargoIniciales(original), escala: { desde: '2026-02-01', motivo: 'Ajuste', filas: [{ sede_id: 1, minimo: 2, medio: 1, maximo: 3 }] } };
    const e2 = validarCargo(ok, '2026-02-01');
    expect(e2.escalaFecha).toBe('noPosterior');
    expect(e2.escala['1']).toEqual({ medio: 'medioMenorQueMinimo' });
    expect(cuentaErroresCargo(e2)).toBe(2);
  });
});
