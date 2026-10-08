/**
 * @jest-environment jsdom
 *
 * CRM › detalles en celular (390 px): una sola «←», la del MobileHeader del
 * shell. Actividad, segmento y plantilla conservan título, estado y acciones;
 * solo su «←» pasa a lg. (La campaña se suscribe a Realtime al montar: la
 * cubre el guardarraíl 44 de `guardrails.test.ts`.)
 */
import { screen, waitFor } from '@testing-library/react';
import { simularAncho } from '@/test-utils/renderConIdioma';
import { cabeceraPublicada, comprobarDetalleMovil, renderEnCelular } from '@/test-utils/dobleAtrasMovil';

// Un solo router, como en Next: un objeto nuevo por render dispara los efectos que dependen de él.
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app/crm',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: (v: string | null | undefined) => (v ? String(v).slice(0, 10) : ''), formatDateTime: (v: string | null | undefined) => (v ? String(v) : '') }),
}));
jest.mock('@/components/shared/RichTextEditor', () => ({ RichTextEditor: () => null }));
jest.mock('@/components/shared/HtmlContentRenderer', () => ({ HtmlContentRenderer: ({ html }: { html?: string }) => <div>{html}</div> }));
jest.mock('@/components/crm/actividades/ActividadesService', () => ({
  actividadesService: {
    getActivityById: jest.fn(async () => ({
      id: 'a1',
      activity_type: 'call',
      notes: 'Llamó para cotizar',
      occurred_at: '2026-10-08T13:00:00Z',
      created_at: '2026-10-08T13:00:00Z',
      updated_at: '2026-10-08T13:00:00Z',
      metadata: {},
    })),
    getCustomers: jest.fn(async () => []),
    getOpportunities: jest.fn(async () => []),
  },
}));
jest.mock('@/components/crm/segmentos/SegmentosService', () => ({
  SegmentosService: {
    getSegmentById: jest.fn(async () => ({
      id: 'sg1',
      name: 'Clientes frecuentes',
      description: null,
      filter_json: [],
      is_dynamic: true,
      customer_count: 42,
      last_run_at: null,
      created_at: '2026-10-01T13:00:00Z',
      updated_at: '2026-10-01T13:00:00Z',
      created_by: null,
    })),
    getSegmentCustomers: jest.fn(async () => []),
  },
}));

import { ActividadDetalle } from '@/components/crm/actividades/id/ActividadDetalle';
import { SegmentoDetallePage } from '@/components/crm/segmentos/id/SegmentoDetallePage';
import { TemplateEditorHeader } from '@/components/crm/plantillas/TemplateEditorHeader';
import type { TemplateForm } from '@/components/crm/plantillas/useTemplateEditor';

const nada = () => undefined;

afterEach(() => simularAncho(1440));

describe('CRM › detalles en celular (390 px): una sola «←»', () => {
  test('actividad: tipo, «Editar» y «Eliminar» a la vista', async () => {
    renderEnCelular(<ActividadDetalle activityId="a1" />);
    await screen.findByRole('heading', { level: 1, name: 'Llamada' });
    await waitFor(() => comprobarDetalleMovil('Llamada', ['Detalle de actividad', 'Editar', 'Eliminar']));
    expect(cabeceraPublicada()?.volverA).toBe('/app/crm/actividades');
  });

  test('segmento: nombre y acciones a la vista', async () => {
    renderEnCelular(<SegmentoDetallePage segmentId="sg1" />);
    await screen.findByRole('heading', { level: 1, name: /Clientes frecuentes/ });
    await waitFor(() => comprobarDetalleMovil('Clientes frecuentes'));
    expect(cabeceraPublicada()?.volverA).toBe('/app/crm/segmentos');
  });

  test('plantilla de correo: nombre, versión, «Sin guardar» y «Guardar» a la vista', () => {
    const form = { name: 'Bienvenida', kind: 'transactional', is_active: true, subject: '', preheader: '', description: '' } as unknown as TemplateForm;
    renderEnCelular(
      <TemplateEditorHeader
        form={form}
        patch={nada}
        context={null}
        version={2}
        isSystem={false}
        isNew={false}
        dirty
        saving={false}
        stats={null}
        onSave={nada}
        onDuplicate={nada}
        onTestSend={nada}
      />,
    );
    comprobarDetalleMovil('Bienvenida', ['v2', 'Sin guardar', 'Guardar']);
    expect(cabeceraPublicada()?.volverA).toBe('/app/crm/plantillas');
  });
});
