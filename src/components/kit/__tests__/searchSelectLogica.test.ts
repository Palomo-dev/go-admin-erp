import { filtrarPorTexto, moverResalte } from '@/components/kit/searchSelectLogica';

const CARGOS = [
  { id: '1', nombre: 'Director de Tecnología' },
  { id: '2', nombre: 'Tesorero' },
  { id: '3', nombre: 'Coordinador de Gimnasio' },
];

describe('filtrarPorTexto', () => {
  it('encuentra sin tildes ni mayúsculas', () => {
    expect(filtrarPorTexto(CARGOS, 'tecnolog', (c) => [c.nombre]).map((c) => c.id)).toEqual(['1']);
  });

  it('consulta vacía devuelve la lista entera', () => {
    expect(filtrarPorTexto(CARGOS, '   ', (c) => [c.nombre])).toHaveLength(3);
  });

  it('descarta lo que no coincide', () => {
    expect(filtrarPorTexto(CARGOS, 'tesor', (c) => [c.nombre]).map((c) => c.nombre)).toEqual(['Tesorero']);
  });
});

describe('moverResalte', () => {
  it('avanza, retrocede y da la vuelta', () => {
    expect(moverResalte(0, 3, 'ArrowDown')).toBe(1);
    expect(moverResalte(2, 3, 'ArrowDown')).toBe(0);
    expect(moverResalte(0, 3, 'ArrowUp')).toBe(2);
  });

  it('no mueve una lista vacía', () => {
    expect(moverResalte(0, 0, 'ArrowDown')).toBeNull();
  });
});
