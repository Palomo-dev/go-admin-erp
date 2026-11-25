import { csv, montoCompacto, pestanaDesdeUrl, reglasDe, resumenReglas } from '../equipoPantallaLogica';

const campo = (k: string) => ({ 'customers.city': 'Ciudad', 'customers.lifecycle_stage': 'Etapa del ciclo' })[k] ?? k;
const operador = (op: string) => ({ in: 'en', eq: '=' })[op] ?? op;
const conj = { y: 'y', o: 'o' };

describe('pantalla Equipo comercial', () => {
  it('pestañas: valores nuevos y enlaces viejos', () => {
    expect(pestanaDesdeUrl(null)).toBe('equipos');
    expect(pestanaDesdeUrl('territorios')).toBe('territorios');
    expect(pestanaDesdeUrl('asignar')).toBe('asignacion');
    expect(pestanaDesdeUrl('performance')).toBe('desempeno');
    expect(pestanaDesdeUrl('cualquiera')).toBe('equipos');
  });

  it('reglas legibles: opcionales con «o», obligatorias con «y»', () => {
    expect(resumenReglas({ rules: [{ field_key: 'customers.city', operator: 'in', value: ['Medellín', 'Envigado'] }] }, campo, operador, conj)).toBe(
      'Ciudad en Medellín, Envigado',
    );
    expect(
      resumenReglas(
        {
          rules: [
            { field_key: 'customers.lifecycle_stage', operator: 'eq', value: 'lead', is_required: true },
            { field_key: 'customers.city', operator: 'eq', value: 'Bogotá' },
            { field_key: 'customers.city', operator: 'eq', value: 'Chía' },
          ],
        },
        campo,
        operador,
        conj,
      ),
    ).toBe('Etapa del ciclo = lead y (ciudad = Bogotá o ciudad = Chía)');
    expect(resumenReglas({}, campo, operador, conj)).toBeNull();
    expect(reglasDe({ rules: [{ nada: 1 }, null] })).toEqual([]);
  });

  it('monto compacto y CSV con escape', () => {
    expect(montoCompacto(42_000_000, { code: 'COP', locale: 'es-CO' })).toMatch(/42,0\s*M/);
    expect(csv(['a', 'b'], [['x,y', 'di "hola"'], [1, null]])).toBe('a,b\r\n"x,y","di ""hola"""\r\n1,');
  });
});
