import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  acumuladoPorCentro,
  centroHeredado,
  exigeCentro,
  modoDeCuenta,
  repartir,
} from '../reglasCentro';

describe('modo de centro de costo', () => {
  it('respeta un booleano distinto al de la plantilla', () => {
    expect(modoDeCuenta({
      clase: '4',
      requiereCentro: false,
      plantillaExiste: true,
      plantillaRequiere: true,
    })).toBe('opcional');
    expect(modoDeCuenta({
      clase: '1',
      requiereCentro: true,
      plantillaExiste: true,
      plantillaRequiere: false,
    })).toBe('obligatorio');
  });

  it('deja las clases 4 a 7 en obligatorio y el resto en no aplica cuando coinciden con la plantilla', () => {
    expect(modoDeCuenta({
      clase: '5',
      requiereCentro: true,
      plantillaExiste: true,
      plantillaRequiere: true,
    })).toBe('obligatorio');
    expect(modoDeCuenta({
      clase: '7',
      requiereCentro: false,
      plantillaExiste: true,
      plantillaRequiere: false,
    })).toBe('obligatorio');
    expect(modoDeCuenta({
      clase: '1',
      requiereCentro: false,
      plantillaExiste: true,
      plantillaRequiere: false,
    })).toBe('no_aplica');
  });

  it('sin plantilla conserva el true de balance y el false de resultado', () => {
    expect(modoDeCuenta({
      clase: '1',
      requiereCentro: true,
      plantillaExiste: false,
      plantillaRequiere: null,
    })).toBe('obligatorio');
    expect(modoDeCuenta({
      clase: '4',
      requiereCentro: false,
      plantillaExiste: false,
      plantillaRequiere: null,
    })).toBe('opcional');
  });

  it('no exige centro si la organización no tiene centros activos', () => {
    expect(exigeCentro('obligatorio', false)).toBe(false);
    expect(exigeCentro('obligatorio', true)).toBe(true);
    expect(exigeCentro('opcional', true)).toBe(false);
    expect(exigeCentro('no_aplica', true)).toBe(false);
  });
});

describe('reparto por porcentajes', () => {
  it('parte 60/40 por el total exacto', () => {
    expect(repartir(100, [60, 40])).toEqual([60, 40]);
    expect(repartir(100, [60, 40]).reduce((suma, parte) => suma + parte, 0)).toBe(100);
  });

  it('deja el residuo del redondeo en la última parte', () => {
    const partes = repartir(10, [33.33, 33.33, 33.34]);
    expect(partes[0]).toBe(3.33);
    expect(partes[1]).toBe(3.33);
    expect(partes[2]).toBe(3.34);
    expect(partes.reduce((suma, parte) => suma + parte, 0)).toBeCloseTo(10, 2);
  });

  it('cuadra un importe con centavos', () => {
    const partes = repartir(0.01, [60, 40]);
    expect(partes.reduce((suma, parte) => suma + parte, 0)).toBeCloseTo(0.01, 2);
  });
});

describe('acumulación del árbol', () => {
  it('el padre suma su movimiento y el de los hijos', () => {
    const totales = acumuladoPorCentro([
      { id: '200', parentId: null, propio: 10 },
      { id: '210', parentId: '200', propio: 25 },
      { id: '220', parentId: '200', propio: 15 },
      { id: '100', parentId: null, propio: 5 },
    ]);
    expect(totales.get('210')).toBe(25);
    expect(totales.get('200')).toBe(50);
    expect(totales.get('100')).toBe(5);
  });

  it('rechaza un ciclo', () => {
    expect(() => acumuladoPorCentro([
      { id: 'a', parentId: 'b', propio: 1 },
      { id: 'b', parentId: 'a', propio: 1 },
    ])).toThrow('CENTRO_CICLO');
  });
});

describe('herencia del centro', () => {
  it('no aplica nunca recibe centro, aunque venga elegido', () => {
    expect(centroHeredado({
      modo: 'no_aplica',
      explicito: 'cc-1',
      deSucursal: 'cc-sede',
      porDefecto: 'cc-100',
    })).toBeNull();
  });

  it('el centro explícito gana, y si no hay se hereda sucursal o el 100', () => {
    expect(centroHeredado({
      modo: 'obligatorio',
      explicito: 'cc-elegido',
      deSucursal: 'cc-sede',
      porDefecto: 'cc-100',
    })).toBe('cc-elegido');
    expect(centroHeredado({
      modo: 'obligatorio',
      explicito: null,
      deSucursal: 'cc-sede',
      porDefecto: 'cc-100',
    })).toBe('cc-sede');
    expect(centroHeredado({
      modo: 'opcional',
      explicito: null,
      deSucursal: null,
      porDefecto: 'cc-100',
    })).toBe('cc-100');
  });

  it('la nómina usa el centro del empleado antes que el de la sucursal', () => {
    expect(centroHeredado({
      modo: 'obligatorio',
      explicito: null,
      delEmpleado: 'cc-nomina',
      deSucursal: 'cc-sede',
    })).toBe('cc-nomina');
  });

  it('la compra usa el centro del documento', () => {
    expect(centroHeredado({
      modo: 'obligatorio',
      explicito: null,
      delDocumento: 'cc-compra',
      deSucursal: 'cc-sede',
    })).toBe('cc-compra');
  });
});

describe('la siembra versionada', () => {
  const raiz = join(__dirname, '..', '..', '..', '..', '..');
  const carpeta = join(raiz, 'supabase', 'migrations');

  it('no modifica centros existentes y no reescribe el movimiento de inventario', () => {
    const archivos = readdirSync(carpeta).filter((nombre) => nombre.includes('centros_costo') && nombre.endsWith('.sql'));
    expect(archivos.length).toBeGreaterThan(0);
    const sql = archivos.map((nombre) => readFileSync(join(carpeta, nombre), 'utf8')).join('\n');
    expect(sql).toContain('on conflict (organization_id, code) do nothing');
    expect(sql).not.toMatch(/update\s+public\.cost_centers\b/i);
    expect(sql).not.toMatch(/update\s+public\.journal_lines\b/i);
    expect(sql).not.toMatch(/set\s+cost_center_id\b/i);
    expect(sql).not.toMatch(/create\s+or\s+replace\s+function\s+public\.fn_auto_journal_stock_movement/i);
  });
});
