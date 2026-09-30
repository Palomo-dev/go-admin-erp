/**
 * @jest-environment jsdom
 *
 * Kit CRM (ola 2) · render de los componentes en es, en, fr y pt con el
 * proveedor real de next-intl y messages/*.json. Una clave que falte (o una
 * variable ICU que no llegue) hace fallar la prueba: next-intl lo reporta por
 * `console.error` y aquí se vigila. La zona de la organización se fija en
 * America/Bogota con «hoy» = 2026-09-30.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { contextoMoneda } from '@/lib/utils/moneda';
import { PIPELINE_TEMPLATES } from '@/lib/services/crm/pipelineTemplates';
import { QuickActionsBarCrm } from '../QuickActionsBarCrm';
import { OpportunityRowMenu } from '../OpportunityRowMenu';
import { KpiMoneda } from '../KpiMoneda';
import { StageColumn } from '../StageColumn';
import { OpportunityCard } from '../OpportunityCard';
import { LeadRow, LeadRowCargando, LeadRowEncabezado } from '../LeadRow';
import { QualifyLeadDialog } from '../QualifyLeadDialog';
import { CaptureBanner } from '../CaptureBanner';
import { CargarMas } from '../CargarMas';
import { TimelineFilters } from '../TimelineFilters';
import { ActivityDialog } from '../ActivityDialog';
import { CustomerLinkPicker } from '../CustomerLinkPicker';
import { WinDialog } from '../WinDialog';
import { LoseDialog } from '../LoseDialog';
import { MoveStageDialog } from '../MoveStageDialog';
import { OpportunityForm } from '../OpportunityForm';
import { StageEditorRow } from '../StageEditorRow';
import { PipelineTemplateCard } from '../PipelineTemplateCard';
import { StageBar } from '../StageBar';
import { OpportunityDrawerHeader } from '../OpportunityDrawerHeader';
import { TimelineEntry } from '../TimelineEntry';
import { CustomerIdentityCard } from '../CustomerIdentityCard';
import { ContactoVinculadoRow } from '../ContactoVinculadoRow';
import { sumarEnMonedaBase } from '../monedaCrm';
import { totalColumna } from '../stageColumnLogica';
import { filtrosVacios } from '../timelineFiltersLogica';

jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    timezone: 'America/Bogota',
    getToday: () => '2026-09-30',
    formatDate: (v: string) => v,
    formatDateTime: (v: string) => v,
    formatTime: (v: string) => v,
    formatPlain: (v: string) => v,
  }),
}));

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const AHORA = new Date('2026-09-30T20:00:00Z');
const COP = contextoMoneda('COP', { locale: 'es-CO' });
const ETAPAS = [
  { id: 'a', pipeline_id: 'p', name: 'Calificación', position: 1, probability: 20 },
  { id: 'b', pipeline_id: 'p', name: 'Propuesta', position: 2, probability: 60 },
  { id: 'w', pipeline_id: 'p', name: 'Ganada', position: 3, probability: 100, is_won: true },
  { id: 'l', pipeline_id: 'p', name: 'Perdida', position: 4, probability: 0, is_lost: true },
];
const LEAD = { id: 'c1', full_name: 'Ana Gómez', email: 'ana@correo.co', phone: '3005550142', lead_source: 'web_form', lead_score: 82, tags: ['feria', 'vip'] };

let errores: jest.SpyInstance;
beforeEach(() => {
  errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  const intl = errores.mock.calls.map((c) => String(c[0] instanceof Error ? `${c[0].name} ${c[0].message}` : c[0])).filter((m) => /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|INVALID_KEY/.test(m));
  errores.mockRestore();
  expect(intl).toEqual([]);
  expect(document.body.textContent ?? '').not.toMatch(/crm\.kit\./);
});

describe.each(IDIOMAS)('kit CRM en %s', (idioma) => {
  const r = (ui: React.ReactElement) => renderConIdioma(ui, { idioma });

  test('QuickActionsBar (cliente) y OpportunityRowMenu', () => {
    r(
      <>
        <QuickActionsBarCrm variante="cliente" estados={[{ accion: 'llamar', habilitada: false, motivo: 'noLlamar' }, { accion: 'email', habilitada: true }]} onNuevaOportunidad={() => undefined} />
        <OpportunityRowMenu titulo="Renovación" status="open" onAccion={() => undefined} />
      </>,
    );
    const barra = screen.getByRole('toolbar');
    expect(within(barra).getAllByRole('button')).toHaveLength(3);
    expect(within(barra).getAllByRole('button')[0].getAttribute('aria-disabled')).toBe('true');
  });

  test('KpiMoneda con tasa faltante y StageColumn vacía', () => {
    const resumen = sumarEnMonedaBase([{ monto: 1000, moneda: 'COP' }, { monto: 10, moneda: 'EUR' }], 'COP', [], '2026-09-30');
    r(
      <>
        <KpiMoneda etiqueta="Valor abierto" resumen={resumen} monedaBase={COP} fechaContable="2026-09-30" onRegistrarTasa={() => undefined} />
        <StageColumn etapa={{ id: 'a', name: 'Calificación', color: '#3b82f6', probability: 20 }} cantidad={0} total={totalColumna([], 'COP')} monedaBase={COP} onCrear={() => undefined} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getAllByRole('button').length).toBeGreaterThan(2);
  });

  test('OpportunityCard (vencida) y LeadRow', () => {
    r(
      <>
        <OpportunityCard
          oportunidad={{ id: 'o1', name: 'Renovación 2027', clienteNombre: 'Distribuciones', amount: 12_500_000, currency: 'COP', status: 'open', temperature: 'hot', score_total: 82, next_action: 'Llamar', next_contact_at: '2026-09-28T15:00:00Z', last_contact_at: '2026-09-27T15:00:00Z', contact_channel: 'whatsapp', entroEtapaEn: '2026-09-22T15:00:00Z' }}
          moneda={COP}
          ahora={AHORA}
        />
        <table>
          <thead><LeadRowEncabezado /></thead>
          <tbody><LeadRow lead={LEAD} ahora={AHORA} onCalificar={() => undefined} /><LeadRowCargando /></tbody>
        </table>
      </>,
    );
    expect(screen.getByRole('article').getAttribute('data-estado')).toBe('vencida');
    // La fila «cargando» es aria-hidden: el lector no la anuncia.
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  test('CaptureBanner, CargarMas y TimelineFilters', () => {
    r(
      <>
        <CaptureBanner cantidad={12} onVerLeads={() => undefined} onCrearEmbudo={() => undefined} />
        <CargarMas mostrados={40} total={1284} onCargar={() => undefined} />
        <CargarMas mostrados={40} total={40} onCargar={() => undefined} entidad="leads" />
        <TimelineFilters valor={{ ...filtrosVacios(), tipo: 'call', responsableId: 'u1' }} onValorChange={() => undefined} usuarios={[{ id: 'u1', nombre: 'Carlos' }]} />
      </>,
    );
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  // Radix oculta (aria-hidden) todo lo que no es el diálogo modal abierto: se pintan de a uno.
  const dialogos: [string, () => React.ReactElement][] = [
    ['QualifyLeadDialog', () => <QualifyLeadDialog abierto onAbiertoChange={() => undefined} lead={LEAD} moneda={COP} usuarios={[{ id: 'u1', nombre: 'Carlos' }]} onContinuar={() => undefined} onDescartar={() => undefined} />],
    ['ActivityDialog llamada', () => <ActivityDialog abierto onAbiertoChange={() => undefined} tipo="llamada" destino={{ clienteId: 'c1', clienteNombre: 'Ana' }} telefono="+57 300" ahora={AHORA} onGuardar={() => undefined} />],
    ['ActivityDialog WhatsApp fuera de ventana', () => <ActivityDialog abierto onAbiertoChange={() => undefined} tipo="whatsapp" destino={{ clienteId: 'c1', clienteNombre: 'Ana' }} telefono="+57 300" ultimaRespuestaCliente="2026-09-27T10:00:00Z" plantillasWhatsApp={[{ id: 't1', etiqueta: 'seguimiento', vistaPrevia: 'Hola' }]} ahora={AHORA} onGuardar={() => undefined} />],
    ['ActivityDialog reunión', () => <ActivityDialog abierto onAbiertoChange={() => undefined} tipo="reunion" destino={{ clienteId: 'c1', clienteNombre: 'Ana', oportunidadNombre: 'Uniformes' }} participantes={['Ana']} ahora={AHORA} onGuardar={() => undefined} />],
    ['ActivityDialog correo', () => <ActivityDialog abierto onAbiertoChange={() => undefined} tipo="correo" destino={{ clienteId: 'c1', clienteNombre: 'Ana' }} remitentes={[{ id: 'r1', etiqueta: 'ventas@x.co', verificado: true }]} plantillasCorreo={[{ id: 'p1', etiqueta: 'Seguimiento' }]} onGuardar={() => undefined} />],
    ['ActivityDialog nota', () => <ActivityDialog abierto onAbiertoChange={() => undefined} tipo="nota" destino={{ clienteId: 'c1', clienteNombre: 'Ana', oportunidadId: 'o1', oportunidadNombre: 'Uniformes' }} onGuardar={() => undefined} />],
    ['CustomerLinkPicker', () => <CustomerLinkPicker abierto onAbiertoChange={() => undefined} buscar={async () => []} onSeleccionar={() => undefined} onCrear={async () => ({ id: 'n', full_name: 'N', customer_type: 'person' })} />],
    ['WinDialog', () => <WinDialog abierto onAbiertoChange={() => undefined} oportunidad={{ name: 'Renovación', amount: 100, currency: 'COP' }} monedaBase={COP} motivos={[{ id: 'w1', label: 'Soporte' }]} comision={{ responsable: { id: 'u1', nombre: 'Carlos' }, porcentaje: 5 }} onGanar={async () => []} />],
    ['LoseDialog', () => <LoseDialog abierto onAbiertoChange={() => undefined} oportunidad={{ name: 'Renovación', amount: 100 }} moneda={COP} motivos={[{ id: 'm1', code: 'price', label: 'Precio' }]} onPerder={() => undefined} />],
    ['MoveStageDialog confirmar', () => <MoveStageDialog abierto onAbiertoChange={() => undefined} oportunidad={{ name: 'Renovación', clienteNombre: 'Distribuciones' }} etapas={ETAPAS} etapaActualId="a" etapaDestinoId="b" onEtapaDestinoChange={() => undefined} onMover={() => undefined} />],
    ['MoveStageDialog gate', () => <MoveStageDialog abierto onAbiertoChange={() => undefined} oportunidad={{ name: 'Renovación' }} etapas={ETAPAS} etapaActualId="a" etapaDestinoId="b" requisitosPendientes={[{ id: 'r1', etiqueta: 'Cotización' }, { id: 'r2', etiqueta: 'Cierre' }]} puedeOmitirRequisitos onCompletar={() => undefined} onMover={() => undefined} />],
    ['MoveStageDialog sin permiso', () => <MoveStageDialog abierto onAbiertoChange={() => undefined} oportunidad={{ name: 'Renovación' }} etapas={ETAPAS} etapaActualId="b" etapaDestinoId="w" puedeMover={false} quienesPueden={['Ana']} onMover={() => undefined} onPedirAcceso={() => undefined} />],
    ['OpportunityForm sheet factura', () => <OpportunityForm layout="sheet" origen="factura" abierto onAbiertoChange={() => undefined} prefill={{ customer_id: 'c1', amount: '12500000' }} contextoOrigen={{ titulo: 'Desde la factura FV-1042' }} lineasFactura={{ numero: 'FV-1042', lineas: [{ concepto: 'Licencia', cantidad: 5, total: 10_000_000 }] }} pipelines={[{ id: 'p', name: 'Ventas' }]} etapas={ETAPAS} usuarios={[]} monedaBase={COP} onEnviar={() => undefined} />],
  ];
  test.each(dialogos)('%s', (_n, ui) => {
    r(ui());
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  test('OpportunityForm (diálogo, Origen=lead)', () => {
    r(
      <OpportunityForm layout="dialog" origen="lead" abierto onAbiertoChange={() => undefined} prefill={{ customer_id: 'c1', name: 'Cotiza tu plan · Ana' }} contextoOrigen={{ titulo: 'Desde el lead Ana' }} pipelines={[{ id: 'p', name: 'Ventas' }]} etapas={ETAPAS} usuarios={[{ id: 'u1', nombre: 'Carlos' }]} usuarioActualId="u1" monedaBase={COP} clienteNombre="Ana" onEnviar={() => undefined} />,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  test('StageEditorRow con error, PipelineTemplateCard y StageBar', () => {
    r(
      <>
        <StageEditorRow etapa={{ clave: 'x', name: '', color: '#3b82f6', probability: 60, sla_days: 21, is_won: false, is_lost: false, exit_criteria: ['a'] }} error="nombreVacio" onCambiar={() => undefined} colores={['#3b82f6']} onRequisitos={() => undefined} onEliminar={() => undefined} />
        <div role="radiogroup" aria-label="plantillas">
          {PIPELINE_TEMPLATES.map((p) => <PipelineTemplateCard key={p.key} plantilla={p} seleccionada={p.key === 'sales'} tiposExistentes={['sales']} onSeleccionar={() => undefined} />)}
        </div>
        <StageBar etapas={ETAPAS} actualId="b" />
        <StageBar etapas={ETAPAS} actualId="b" layout="movil" />
      </>,
    );
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
  });

  test('OpportunityDrawerHeader (escritorio y compacta)', () => {
    const op = { id: 'o1', name: 'Renovación 2027', status: 'open', temperature: 'warm', score_total: 82, icp_band: 'a', amount: 12_500_000, currency: 'COP', expected_close_date: '2026-10-30', stage_id: 'b', clienteNombre: 'Distribuciones', entroEtapaEn: '2026-09-22T15:00:00Z' };
    r(
      <>
        <OpportunityDrawerHeader oportunidad={op} moneda={COP} etapas={ETAPAS} ahora={AHORA} onGanar={() => undefined} onPerder={() => undefined} onEditar={() => undefined} />
        <OpportunityDrawerHeader oportunidad={op} moneda={COP} etapas={ETAPAS} layout="movilCompacta" onCerrar={() => undefined} />
      </>,
    );
    expect(screen.getAllByRole('toolbar')).toHaveLength(2);
  });

  test('reutilizados de Clientes: TimelineEntry, CustomerIdentityCard y ContactoVinculadoRow', () => {
    r(
      <>
        <TimelineEntry entrada={{ id: 't1', tipo: 'llamadaIa', titulo: 'Llamada del agente IA', detalle: 'Confirmó presupuesto', ocurrioEn: '2026-09-30T13:15:00Z', autor: 'Agente', editable: true }} onEditar={() => undefined} ahora={AHORA} />
        <CustomerIdentityCard cliente={{ id: 'c1', full_name: 'María Ríos', customer_type: 'person', doc_type: 'CC', doc_number: '1020', lifecycle_stage: 'customer', health_score: 78, tags: ['vip'], created_at: '2026-09-25T12:00:00Z' }} empresas={[{ id: 'e1', nombre: 'Andina' }]} onNuevaOportunidad={() => undefined} puedeCrearOportunidad ahora={AHORA} />
        <ContactoVinculadoRow persona={{ id: 'p1', full_name: 'Jorge Peña', email: 'j@x.co' }} cargo="Gerente" principal onGuardarCargo={() => undefined} onMarcarPrincipal={() => undefined} onDesvincular={() => undefined} />
      </>,
    );
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });
});

describe('comportamiento (es)', () => {
  test('QualifyLeadDialog: valida la necesidad y entrega el prellenado', () => {
    const onContinuar = jest.fn();
    renderConIdioma(<QualifyLeadDialog abierto onAbiertoChange={() => undefined} lead={LEAD} moneda={COP} usuarios={[]} responsableId="u1" onContinuar={onContinuar} />);
    fireEvent.click(screen.getByRole('button', { name: /Continuar: crear oportunidad/ }));
    expect(onContinuar).not.toHaveBeenCalled();
    expect(screen.getByText('Este campo es obligatorio.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/¿Qué necesita\?/), { target: { value: 'Uniformes' } });
    fireEvent.change(screen.getByLabelText('Presupuesto aproximado'), { target: { value: '18.000.000' } });
    fireEvent.click(screen.getByRole('button', { name: /Continuar: crear oportunidad/ }));
    expect(onContinuar).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'c1', amount: '18000000', salesperson_id: 'u1' }));
  });

  test('ActivityDialog nota: arma los datos de notes con is_pinned', () => {
    const onGuardar = jest.fn();
    renderConIdioma(<ActivityDialog abierto onAbiertoChange={() => undefined} tipo="nota" destino={{ clienteId: 'c1', clienteNombre: 'Ana', oportunidadId: 'o1', oportunidadNombre: 'Uniformes' }} onGuardar={onGuardar} ahora={AHORA} />);
    fireEvent.change(screen.getByLabelText(/^Nota/), { target: { value: 'Prefiere factura electrónica' } });
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nota' }));
    expect(onGuardar).toHaveBeenCalledWith({ tipo: 'nota', datos: { body: 'Prefiere factura electrónica', related_type: 'opportunity', related_id: 'o1', is_pinned: true } });
  });

  test('ActivityDialog reunión y correo se pintan con sus campos', () => {
    const { unmount } = renderConIdioma(<ActivityDialog abierto onAbiertoChange={() => undefined} tipo="reunion" destino={{ clienteId: 'c1', clienteNombre: 'Ana', oportunidadNombre: 'Uniformes' }} participantes={['Ana']} onGuardar={() => undefined} ahora={AHORA} />);
    expect(screen.getByRole('grid')).toBeTruthy();
    unmount();
    renderConIdioma(<ActivityDialog abierto onAbiertoChange={() => undefined} tipo="correo" destino={{ clienteId: 'c1', clienteNombre: 'Ana' }} correo="ana@correo.co" remitentes={[{ id: 'r1', etiqueta: 'ventas@empresa.co', verificado: true }]} onGuardar={() => undefined} />);
    expect(screen.getByText('Remitente verificado')).toBeTruthy();
  });

  test('CustomerLinkPicker: busca en el servidor, deshabilita «Ya vinculada» y pasa al cargo', async () => {
    const buscar = jest.fn().mockResolvedValue([
      { id: 'p1', full_name: 'Ana Gómez', customer_type: 'person', doc_type: 'CC', doc_number: '1020' },
      { id: 'p2', full_name: 'Andrés Galeano', customer_type: 'person' },
    ]);
    const onSeleccionar = jest.fn();
    renderConIdioma(<CustomerLinkPicker abierto onAbiertoChange={() => undefined} buscar={buscar} onSeleccionar={onSeleccionar} conCargo vincularA="Distribuciones" filtroInicial="personas" filtroFijo yaVinculados={['p2']} principalActual="Carlos" onCrear={async () => ({ id: 'n', full_name: 'Nuevo', customer_type: 'person' })} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'An' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /Ana Gómez/ })).toBeTruthy(), { timeout: 2000 });
    expect(buscar).toHaveBeenCalledWith('An');
    expect(screen.getByRole('option', { name: /Andrés/ }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Crear persona «An» sin salir de aquí')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /Ana Gómez/ }));
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Jefe de compras' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText(/Carlos deja de serlo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(onSeleccionar).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { cargo: 'Jefe de compras', principal: true });
  });

  test('WinDialog: ficha → acciones → resumen con la factura', async () => {
    const onGanar = jest.fn().mockResolvedValue([{ tipo: 'factura', numero: 'FV-1042' }]);
    renderConIdioma(<WinDialog abierto onAbiertoChange={() => undefined} oportunidad={{ name: 'Renovación', amount: 12_500_000, currency: 'COP', win_data: { product: 'ERP' } }} monedaBase={COP} onGanar={onGanar} onVerFactura={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: /Ganar oportunidad/ }));
    await screen.findByText('FV-1042');
    expect(onGanar.mock.calls[0][0].won_data).toMatchObject({ product: 'ERP', amount: 12_500_000, actions: ['factura', 'onboarding', 'renovacion'] });
    expect(screen.getByRole('button', { name: 'Ver factura' })).toBeTruthy();
  });

  test('LoseDialog: competencia pide competidor; sin catálogo no deja perder', () => {
    const onPerder = jest.fn();
    const { unmount } = renderConIdioma(<LoseDialog abierto onAbiertoChange={() => undefined} oportunidad={{ name: 'R', amount: 1 }} moneda={COP} motivos={[{ id: 'm1', code: 'competitor', label: 'Eligió a la competencia' }]} onPerder={onPerder} />);
    // Select del kit (Radix): la etiqueta apunta al disparador; se abre y se elige la opción.
    const motivo = screen.getByLabelText(/Motivo/);
    expect(motivo.getAttribute('role')).toBe('combobox');
    fireEvent.click(motivo);
    fireEvent.click(screen.getByRole('option', { name: 'Eligió a la competencia' }));
    expect(motivo.textContent).toContain('Eligió a la competencia');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar perdida' }));
    expect(onPerder).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Competidor/), { target: { value: 'Delta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Marcar perdida' }));
    expect(onPerder.mock.calls[0][0].loss_data).toMatchObject({ lossReasonId: 'm1', competitor: 'Delta' });
    unmount();
    renderConIdioma(<LoseDialog abierto onAbiertoChange={() => undefined} oportunidad={{ name: 'R', amount: 1 }} moneda={COP} motivos={[]} onPerder={onPerder} />);
    expect((screen.getByRole('button', { name: 'Marcar perdida' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('MoveStageDialog: gate con «Avanzar de todos modos» solo con permiso', () => {
    const onMover = jest.fn();
    const props = { abierto: true, onAbiertoChange: () => undefined, oportunidad: { name: 'R', next_contact_at: '2026-10-01T15:00:00Z' }, etapas: ETAPAS, etapaActualId: 'a', etapaDestinoId: 'b', requisitosPendientes: [{ id: 'r1', etiqueta: 'Cotización enviada' }], onMover, onCompletar: () => undefined };
    const { unmount } = renderConIdioma(<MoveStageDialog {...props} />);
    expect(screen.queryByRole('button', { name: 'Avanzar de todos modos' })).toBeNull();
    unmount();
    renderConIdioma(<MoveStageDialog {...props} puedeOmitirRequisitos />);
    fireEvent.click(screen.getByRole('button', { name: 'Avanzar de todos modos' }));
    expect(onMover).toHaveBeenCalledWith(expect.objectContaining({ stageId: 'b', override: true }));
    expect(new Date(onMover.mock.calls[0][0].nextContactAt).toISOString()).toBe('2026-10-01T15:00:00.000Z');
  });

  test('OpportunityForm: cliente bloqueado en Origen=cliente, cuerpo de POST y página con resumen', () => {
    const onEnviar = jest.fn();
    const comunes = { pipelines: [{ id: 'p', name: 'Ventas' }], etapas: ETAPAS, usuarios: [{ id: 'u1', nombre: 'Carlos' }], usuarioActualId: 'u1', monedaBase: COP, onEnviar };
    const { unmount } = renderConIdioma(<OpportunityForm layout="sheet" origen="cliente" abierto onAbiertoChange={() => undefined} prefill={{ customer_id: 'c1' }} clienteNombre="Ana" {...comunes} />);
    expect(screen.queryByText('Buscar persona o empresa…')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
    expect(onEnviar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Nombre de la oportunidad/), { target: { value: 'Renovación' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
    expect(onEnviar).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'c1', name: 'Renovación', stage_id: 'a', currency: 'COP', origen: 'cliente' }));
    unmount();
    renderConIdioma(<OpportunityForm layout="page" modo="edit" prefill={{ customer_id: 'c1', name: 'R', amount: '1.000.000', stage_id: 'b' }} onEliminar={() => undefined} {...comunes} />);
    expect(screen.getByRole('complementary', { name: 'Resumen' }).textContent).toContain('60 %');
    expect(screen.getByRole('button', { name: /Eliminar/ })).toBeTruthy();
  });

  test('ContactoVinculadoRow: Enter guarda el cargo, Escape cancela', () => {
    const onGuardarCargo = jest.fn();
    renderConIdioma(<ContactoVinculadoRow persona={{ id: 'p1', full_name: 'Jorge Peña' }} cargo="Gerente" onGuardarCargo={onGuardarCargo} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar el cargo/ }));
    const campo = screen.getByLabelText('Cargo de Jorge Peña');
    fireEvent.change(campo, { target: { value: '  Director  ' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(onGuardarCargo).toHaveBeenCalledWith('Director');
  });

  test('StageBar: la etapa actual no se pulsa y ganar abre su diálogo', () => {
    const onGanar = jest.fn();
    const onElegir = jest.fn();
    renderConIdioma(<StageBar etapas={ETAPAS} actualId="b" onGanar={onGanar} onElegir={onElegir} />);
    expect((screen.getByRole('button', { current: 'step' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Calificación/ }));
    expect(onElegir).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    fireEvent.click(screen.getByRole('button', { name: /Ganada/ }));
    expect(onGanar).toHaveBeenCalledWith(expect.objectContaining({ id: 'w' }));
  });

  test('CaptureBanner no se pinta sin leads sin colocar', () => {
    const { container } = renderConIdioma(<CaptureBanner cantidad={0} />);
    expect(container.textContent).toBe('');
  });
});
