/**
 * «Calificar en lote»: cuerpo de `POST /api/crm/leads/qualify-bulk` desde el
 * del `OpportunityForm` y avatares del lote.
 */
import { avataresLote, cuerpoLote, leadPlantillaLote, motivoLote, RESPONSABLE_DE_CADA_LEAD } from '../calificarLotePantallaLogica';

const FORM = {
  name: 'Uniformes · {cliente}',
  customer_id: 'c1',
  origen: 'lead',
  origen_ref: {},
  organization_id: 999,
  amount: 0,
  currency: 'COP',
  salesperson_id: RESPONSABLE_DE_CADA_LEAD,
  temperature: 'warm',
  source: null,
  pipeline_id: 'p1',
  stage_id: 's1',
  discovery_data: { necesidad: 'Uniformes' },
};

describe('cuerpoLote', () => {
  it('el nombre es el patrón; sin cliente, origen ni organización; lo de cada lead no se envía', () => {
    const c = cuerpoLote(FORM, ['c1', 'c2', 'c1']);
    expect(c.customer_ids).toEqual(['c1', 'c2']);
    expect(c.patron_nombre).toBe('Uniformes · {cliente}');
    expect(c.plantilla).toEqual({ temperature: 'warm', pipeline_id: 'p1', stage_id: 's1', discovery_data: { necesidad: 'Uniformes' } });
  });

  it('un responsable y un monto elegidos sí viajan', () => {
    const c = cuerpoLote({ ...FORM, salesperson_id: 'u1', amount: 500, source: 'web_form' }, ['c1']);
    expect(c.plantilla).toMatchObject({ salesperson_id: 'u1', amount: 500, currency: 'COP', source: 'web_form' });
  });

  it('«Sin asignar» (null) viaja como null: no hereda el responsable del lead', () => {
    expect(cuerpoLote({ ...FORM, salesperson_id: null }, ['c1']).plantilla).toHaveProperty('salesperson_id', null);
  });
});

describe('apoyos del lote', () => {
  it('lead plantilla con el marcador por nombre', () => {
    expect(leadPlantillaLote('c1')).toMatchObject({ id: 'c1', full_name: '{cliente}' });
  });

  it('avatares: hasta 5 y el resto en +N (incluye los que no están en la página)', () => {
    const leads = Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, full_name: `Lead ${i}` }));
    expect(avataresLote(leads, 12)).toMatchObject({ resto: 7 });
    expect(avataresLote(leads, 12).visibles).toHaveLength(5);
  });

  it('motivos conocidos y «otro»', () => {
    expect(motivoLote('no_es_lead')).toBe('no_es_lead');
    expect(motivoLote('etapa_terminal')).toBe('otro');
  });
});
