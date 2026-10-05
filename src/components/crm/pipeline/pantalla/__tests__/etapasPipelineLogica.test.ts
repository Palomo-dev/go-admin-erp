import type { EtapaApi } from '@/components/crm/oportunidad/oportunidadLogica';
import { indiceNuevaEtapa, moverEtapa, ordenAlInsertar } from '../etapasPipelineLogica';
import { indiceAntesDelCierre, insertarAntesDelCierre } from '@/components/crm/kit/stageEditorRowLogica';

function etapa(parcial: Partial<EtapaApi> & Pick<EtapaApi, 'id' | 'name' | 'position'>): EtapaApi {
  return { probability: 10, color: '#3b82f6', is_won: false, is_lost: false, ...parcial };
}

const ABIERTAS = [
  etapa({ id: 'a', name: 'Contacto Inicial', position: 1, probability: 10 }),
  etapa({ id: 'b', name: 'Reunión Agendada', position: 2, probability: 30 }),
  etapa({ id: 'c', name: 'Propuesta Enviada', position: 3, probability: 60 }),
];

describe('hoja de etapas: mover y crear antes del cierre', () => {
  const lista = [
    ...ABIERTAS,
    etapa({ id: 'g', name: 'Ganado', position: 4, probability: 100, is_won: true }),
    etapa({ id: 'p', name: 'Perdido', position: 5, probability: 0, is_lost: true }),
  ];

  test('subir la última etapa abierta la deja antes y renumera', () => {
    const movida = moverEtapa(lista, 2, 1);
    expect(movida.map((e) => [e.id, e.position])).toEqual([
      ['a', 1],
      ['c', 2],
      ['b', 3],
      ['g', 4],
      ['p', 5],
    ]);
  });

  test('un destino fuera de la lista no quita etapas', () => {
    expect(moverEtapa(lista, 0, -1).map((e) => e.id)).toEqual(['a', 'b', 'c', 'g', 'p']);
  });

  test('la etapa nueva se inserta antes de Ganado, no debajo de Perdido', () => {
    expect(indiceNuevaEtapa(lista)).toBe(3);
    expect(ordenAlInsertar(lista, 'nueva')).toEqual([
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
      { id: 'c', position: 3 },
      { id: 'nueva', position: 4 },
      { id: 'g', position: 5 },
      { id: 'p', position: 6 },
    ]);
  });

  test('sin etapas de cierre, la nueva queda al final', () => {
    expect(indiceNuevaEtapa(ABIERTAS)).toBe(3);
    expect(ordenAlInsertar(ABIERTAS, 'nueva').at(-1)).toEqual({ id: 'nueva', position: 4 });
  });
});

describe('insertarAntesDelCierre (asistente «Nuevo pipeline»)', () => {
  const fila = (clave: string, is_won = false, is_lost = false) => ({ clave, is_won, is_lost });

  test('la etapa nueva entra antes de Ganada y Perdida, no al final', () => {
    const lista = [fila('a'), fila('b'), fila('g', true), fila('p', false, true)];
    expect(insertarAntesDelCierre(lista, fila('n')).map((e) => e.clave)).toEqual(['a', 'b', 'n', 'g', 'p']);
  });

  test('sin etapas de cierre, va al final', () => {
    expect(insertarAntesDelCierre([fila('a')], fila('n')).map((e) => e.clave)).toEqual(['a', 'n']);
  });

  test('indiceAntesDelCierre usa el orden recibido', () => {
    expect(indiceAntesDelCierre([fila('g', true), fila('a')])).toBe(0);
  });
});
