import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ALTERNATIVAS_COSTO_SERVICIOS,
  CUENTAS_PLANTILLA,
  EQUIVALENCIAS_PLANTILLA,
  cuentasPorDefinir,
  equivalenciaDe,
  naturalezaDe,
  naturalezaHeredada,
  nombreOficial,
  padreDe,
  planearReclasificacion,
  plantillaDeSector,
  puedeBorrarCuenta,
  sectorDeTipoOrganizacion,
} from '@/lib/finanzas/contador';
import {
  aceptaMovimiento,
  codigoPuc,
  enEstadosFinancieros,
  nivelDe,
  requiereCentroCosto,
  requiereTercero,
} from '@/lib/finanzas/contador/estructura';

describe('Fase 2 — estructura, naturaleza y plantilla del contador', () => {
  test('3610 es débito y el resto de excepciones conserva su naturaleza', () => {
    expect(naturalezaDe('3610')).toBe('debito');
    expect(naturalezaDe('361005')).toBe('debito');
    expect(naturalezaHeredada('3610', 'credito', null)).toBe('debito');
    expect(naturalezaDe('3710')).toBe('debito');
    expect(naturalezaDe('4175')).toBe('debito');
    expect(naturalezaDe('1399')).toBe('credito');
    expect(naturalezaDe('1592')).toBe('credito');
    expect(naturalezaDe('1598')).toBe('credito');
    expect(naturalezaDe('3605')).toBe('credito');
    expect(naturalezaDe('1105')).toBe('debito');
    expect(naturalezaDe('4135')).toBe('credito');
    expect(naturalezaHeredada('4135', null, 'debito')).toBe('debito');
  });

  test('el grupo 89 es crédito, el 99 es débito, y las clases 8 y 9 salen de los estados', () => {
    expect(naturalezaDe('8')).toBe('debito');
    expect(naturalezaDe('89')).toBe('credito');
    expect(naturalezaDe('8905')).toBe('credito');
    expect(naturalezaDe('9')).toBe('credito');
    expect(naturalezaDe('99')).toBe('debito');
    expect(naturalezaDe('9105')).toBe('credito');
    expect(enEstadosFinancieros('8105')).toBe(false);
    expect(enEstadosFinancieros('9105')).toBe(false);
    expect(enEstadosFinancieros('1105')).toBe(true);
  });

  test('el tercero y el centro de costo siguen la hoja', () => {
    for (const codigo of ['1355', '135515', '1305', '21', '2205', '2365', '2367', '2368', '2370', '2408', '2505', '2805', '2815', '3105', '3115', '4135', '5105', '6135']) {
      expect(requiereTercero(codigo)).toBe(true);
    }
    for (const codigo of ['11', '1105', '1110', '1120', '2404', '74', '7105']) {
      expect(requiereTercero(codigo)).toBe(false);
    }
    expect(requiereCentroCosto('4175')).toBe(true);
    expect(requiereCentroCosto('5105')).toBe(true);
    expect(requiereCentroCosto('6135')).toBe(true);
    expect(requiereCentroCosto('74')).toBe(true);
    expect(requiereCentroCosto('1105')).toBe(false);
  });

  test('solo el último nivel se mueve, y una cuenta con movimiento no se borra', () => {
    expect(nivelDe('3')).toBe('clase');
    expect(nivelDe('36')).toBe('grupo');
    expect(nivelDe('3610')).toBe('cuenta');
    expect(nivelDe('135515')).toBe('subcuenta');
    expect(nivelDe('14350501')).toBe('auxiliar');
    expect(padreDe('3610')).toBe('36');
    expect(padreDe('14350501')).toBe('143505');
    expect(aceptaMovimiento('11', false)).toBe(false);
    expect(aceptaMovimiento('1105', false)).toBe(true);
    expect(aceptaMovimiento('1105', true)).toBe(false);
    expect(puedeBorrarCuenta(true)).toBe(false);
    expect(puedeBorrarCuenta(false)).toBe(true);
    expect(() => codigoPuc('1405-01')).toThrow(/guion/);
  });

  test('la reclasificación usa el código correcto y 6105 conserva el nombre de agricultura', () => {
    expect(equivalenciaDe('4105').codigoCorrecto).toBe('4135');
    expect(equivalenciaDe('6105').codigoCorrecto).toBe('61350501');
    expect(equivalenciaDe('2405').codigoCorrecto).toBe('24080501');
    expect(equivalenciaDe('2105').codigoCorrecto).toBe('22050501');
    expect(equivalenciaDe('1405').codigoCorrecto).toBe('1435');
    expect(equivalenciaDe('1405-01').codigoCorrecto).toBe('14350501');
    expect(EQUIVALENCIAS_PLANTILLA).toHaveLength(6);
    expect(nombreOficial('6105')).toBe('Agricultura, ganadería, caza y silvicultura');
    expect(nombreOficial('4105')).toBe('Agricultura, ganadería, caza y silvicultura');
    expect(nombreOficial('6105')).not.toBe('Costo de ventas agropecuario');
    expect(nombreOficial('6135')).toBe('Costo de ventas comercio al por mayor y al por menor');
    expect(nombreOficial('2105')).toBe('Bancos nacionales');
    expect(nombreOficial('2205')).toBe('Proveedores nacionales');
    expect(nombreOficial('3610')).toBe('Pérdida del ejercicio');
  });

  test('un período declarado no se toca y el RC solo referencia el asiento original', () => {
    const libro = { asientos: 3 };
    const congelado = JSON.stringify(libro);
    expect(() => planearReclasificacion({
      periodoAbierto: false,
      asientoOriginalId: 'asiento-1',
      codigoActual: '2105',
      valor: 80,
      saldo: 'credito',
    })).toThrow(/declarados/);
    const plan = planearReclasificacion({
      periodoAbierto: true,
      asientoOriginalId: 'asiento-1',
      codigoActual: '2105',
      valor: 80,
      saldo: 'credito',
    });
    expect(plan.tipoDocumento).toBe('RC');
    expect(plan.asientoOriginalId).toBe('asiento-1');
    expect(plan.lineas).toEqual([
      { cuenta: '2105', lado: 'debito', centavos: 8000 },
      { cuenta: '22050501', lado: 'credito', centavos: 8000 },
    ]);
    expect(JSON.stringify(libro)).toBe(congelado);
    expect(() => planearReclasificacion({
      periodoAbierto: true,
      asientoOriginalId: '  ',
      codigoActual: '1405',
      valor: 10,
      saldo: 'debito',
    })).toThrow(/original/);
  });

  test('la plantilla trae el comercio y deja sin código el turismo y el costo de servicios', () => {
    expect(CUENTAS_PLANTILLA).toHaveLength(68);
    expect(CUENTAS_PLANTILLA.filter((cuenta) => cuenta.sector === 'todos')).toHaveLength(46);
    const pendientes = cuentasPorDefinir();
    expect(pendientes.map((cuenta) => cuenta.nombre).sort()).toEqual([
      'Contribución parafiscal para el turismo',
      'Costo de ventas de la actividad de servicios',
    ]);
    const turismo = pendientes.find((cuenta) => cuenta.sector === 'hotel')!;
    expect(turismo.codigo).toBeNull();
    expect(turismo.alternativas).toEqual([]);
    const costo = pendientes.find((cuenta) => cuenta.sector === 'servicios')!;
    expect(costo.codigo).toBeNull();
    expect(costo.codigoEnHoja).toBe('6155');
    expect(costo.alternativas).toEqual([...ALTERNATIVAS_COSTO_SERVICIOS]);
    expect(CUENTAS_PLANTILLA.every((cuenta) => cuenta.codigo !== '6155' && cuenta.codigo !== '6170')).toBe(true);

    const comercio = plantillaDeSector('comercio');
    expect(comercio.some((cuenta) => cuenta.codigo === '4135')).toBe(true);
    expect(comercio.some((cuenta) => cuenta.codigo === '6135')).toBe(true);
    expect(comercio.some((cuenta) => cuenta.codigo === '1435')).toBe(true);
    expect(plantillaDeSector('restaurante').some((cuenta) => cuenta.codigo === '4140' && cuenta.sector === 'restaurante')).toBe(true);
    expect(plantillaDeSector('restaurante').some((cuenta) => cuenta.codigo === '2495')).toBe(true);
    expect(plantillaDeSector('hotel').some((cuenta) => cuenta.estado === 'por_definir')).toBe(true);
    const manufactura = plantillaDeSector('manufactura').map((cuenta) => cuenta.codigo);
    expect(manufactura).toEqual(expect.arrayContaining(['4120', '6120', '1405', '1410', '1430', '71', '72', '73', '5905']));
    expect(CUENTAS_PLANTILLA.find((cuenta) => cuenta.codigo === '1399')?.naturaleza).toBe('credito');
    expect(CUENTAS_PLANTILLA.find((cuenta) => cuenta.codigo === '3710')?.naturaleza).toBe('debito');
  });

  test('el tipo de organización no inventa manufactura', () => {
    expect(sectorDeTipoOrganizacion(1)).toBe('restaurante');
    expect(sectorDeTipoOrganizacion(2)).toBe('hotel');
    expect(sectorDeTipoOrganizacion(3)).toBe('comercio');
    expect(sectorDeTipoOrganizacion(4)).toBe('servicios');
    expect(sectorDeTipoOrganizacion(5)).toBeNull();
    expect(sectorDeTipoOrganizacion(6)).toBeNull();
    expect(sectorDeTipoOrganizacion(7)).toBeNull();
  });

  test('el SQL propuesto no tiene sentencias que escriban en la base', () => {
    const archivo = readFileSync(join(process.cwd(), 'supabase/propuestas/20261022080000_fuente_contador_puc.sql'), 'utf8');
    const ejecutable = archivo
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('--'))
      .join('\n')
      .trim();
    expect(ejecutable).toMatch(/raise exception 'propuesta_no_aplicada'/);
    expect(ejecutable).not.toMatch(/\b(insert|update|delete|alter|create)\b/i);
    expect(archivo).toMatch(/6105/);
    expect(archivo).toMatch(/6155/);
    expect(archivo).toMatch(/contribución parafiscal/i);
  });
});
