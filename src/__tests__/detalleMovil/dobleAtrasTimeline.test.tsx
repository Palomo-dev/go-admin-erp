/**
 * @jest-environment jsdom
 *
 * Timeline › detalles en celular (390 px): una sola «←», la del MobileHeader
 * del shell. La fila «← Volver al Timeline» existe solo desde lg; badges,
 * título e identificadores siguen a la vista en celular.
 */
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, comprobarDetalleMovil, renderEnCelular } from '@/test-utils/dobleAtrasMovil';

import { EntityTimelineHeader } from '@/components/timeline/entidad/EntityTimelineHeader';
import { CorrelationHeader } from '@/components/timeline/correlaciones/CorrelationHeader';
import { EventDetailHeader } from '@/components/timeline/eventos/EventDetailHeader';
import type { TimelineEvent } from '@/lib/services/timelineService';

const nada = () => undefined;

afterEach(() => simularAncho(1440));

describe('Timeline › detalles en celular (390 px): una sola «←»', () => {
  test('historia de una entidad', () => {
    renderEnCelular(
      <EntityTimelineHeader entityType="customer" entityId="9f1c2d1e-0000-4000-8000-000000000001" entityName="Cliente de prueba" totalEvents={12} onBack={nada} onNavigateToEntity={nada} />,
    );
    comprobarDetalleMovil('Cliente de prueba');
    expect(cabeceraPublicada()?.volverA).toBe('/app/timeline');
  });

  test('traza de correlación', () => {
    renderEnCelular(<CorrelationHeader correlationId="corr-1" totalEvents={3} onBack={nada} onShare={nada} />);
    comprobarDetalleMovil('Operación Completa', ['Traza de Correlación', 'Operación Completa']);
  });

  test('detalle de un evento', () => {
    const evento = {
      event_id: 'ev-1',
      event_time: '2026-10-08T13:00:00Z',
      event_type: 'sale.created',
      source_table: 'sales',
      source_category: 'pos',
      action: 'create',
      entity_type: 'sale',
      entity_id: 'v1',
      actor_id: null,
      branch_id: null,
      payload: {},
    } as unknown as TimelineEvent;
    renderEnCelular(<EventDetailHeader event={evento} onBack={nada} />);
    comprobarDetalleMovil('sale.created', ['Sistema']);
  });
});
