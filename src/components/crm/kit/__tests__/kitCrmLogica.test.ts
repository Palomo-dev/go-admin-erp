/**
 * Kit CRM (ola 2) · lógica pura de los 20 sets de «CRM (Nuevo)» (Figma
 * 759:20897) y de los 4 reutilizados de «Clientes». Sin React ni red.
 * «Ahora» fijo y zona America/Bogota (UTC-5) explícita: el resultado no
 * depende del TZ del proceso (`npm run test:tz-all`).
 */
import { estadoAccionesRapidas, formatoDeVariante, accionExtraDeVariante, indiceConTecla, motivoAccion } from '../quickActionLogica';
import { accionesMenuOportunidad, estadoMenuDe } from '../opportunityRowMenuLogica';
import { sumarEnMonedaBase, tasaVigente } from '../monedaCrm';
import { cantidadSinTasa, estadoKpiMoneda, fechaTasaInformada, tieneDesglose } from '../kpiMonedaLogica';
import { colorEtapa, estadoColumna, probabilidadEtapa, totalColumna } from '../stageColumnLogica';
import { claveCanal, estadoTarjeta, vistaTarjeta, TONO_PRIORIDAD } from '../opportunityCardLogica';
import { accionesLead, bandaScore, etiquetasVisibles, origenValido, ORIGENES_LEAD } from '../leadRowLogica';
import { nombreSugerido, prefillDesdeLead, validarCalificacion, valoresInicialesCalificacion } from '../qualifyLeadLogica';
import { estadoCaptureBanner } from '../captureBannerLogica';
import { estadoCargarMas, siguienteLote } from '../cargarMasLogica';
import { contarFiltrosPanel, filtrosVacios, hayFiltros, parametrosTimeline, tiposDb } from '../timelineFiltersLogica';
import { datosLlamada, datosNota, datosReunion, dentroDeVentana, horaFin, parsearDuracion, validarLlamada, validarReunion, validarWhatsApp } from '../activityDialogLogica';
import { datosCrear, debeBuscar, detalleFila, filaSiguiente, filtrarResultados, tipoSugerido, validarCrear, valoresCrear } from '../customerLinkPickerLogica';
import { alternarAccion, cuerpoGanar, facturaCreada, validarGanar, valoresInicialesGanar } from '../winDialogLogica';
import { cuerpoPerder, esCompetencia, motivosVisibles, validarPerder, valoresInicialesPerder } from '../loseDialogLogica';
import { aQuienPedir, destinosPosibles, dialogoParaEtapa, resultadoMover } from '../moveStageDialogLogica';
import { camposBloqueados, cuerpoAlta, cuerpoEdicion, etapaInicial, ponderado, validarOportunidad, valoresIniciales, type EtapaFormulario } from '../opportunityFormLogica';
import { conResultado, contarRequisitos, reordenar, resultadoDe, validarEtapas, type EtapaEditable } from '../stageEditorRowLogica';
import { avisoPlantilla, clavePlantilla, etapasDePlantilla, rangoSla } from '../pipelineTemplateCardLogica';
import { vistaBarra } from '../stageBarLogica';
import { accionesPie, bandaIcp, estadoOportunidad } from '../drawerHeaderLogica';
import { cuandoEntrada, tipoDesdeActividad } from '../timelineEntryLogica';
import { esClienteNuevo, etapaCicloValida, tonoSalud, ubicacion } from '../customerIdentityCardLogica';
import { accionTeclaCargo, cargoCambio, cargoNormalizado } from '../contactoVinculadoRowLogica';
import { aFechaHoraLocal, combinarFechaHora, deFechaHoraLocal, diaRelativo, fechaCortaPlana, partirFechaHora } from '../fechasCrm';
import { parsearMonto } from '../camposCrm';
import { LEAD_SOURCES } from '@/lib/crm/enums';
import { PIPELINE_TEMPLATES } from '@/lib/services/crm/pipelineTemplates';

const ZONA = 'America/Bogota';
/** 2026-09-30 15:00 en Bogotá. */
const AHORA = new Date('2026-09-30T20:00:00Z');

describe('camposCrm y fechasCrm', () => {
  test('parsearMonto entiende miles y decimales de ambos estilos', () => {
    expect(parsearMonto('18.000.000')).toBe(18_000_000);
    expect(parsearMonto('$ 1.250.000')).toBe(1_250_000);
    expect(parsearMonto('18,000,000.50')).toBe(18_000_000.5);
    expect(parsearMonto('1250,5')).toBe(1250.5);
    expect(parsearMonto('')).toBeNull();
    expect(parsearMonto('1.250,75')).toBe(1250.75);
    expect(parsearMonto('18.000')).toBe(18_000);
    expect(parsearMonto('abc')).toBeNull();
    expect(parsearMonto('-')).toBeNaN();
  });
  test('día relativo y hora local en la zona de la organización, no en UTC', () => {
    // 2026-10-01 03:00 UTC = 30 sep 22:00 en Bogotá: sigue siendo «hoy».
    expect(diaRelativo('2026-10-01T03:00:00Z', AHORA, ZONA)).toEqual({ tipo: 'hoy', hora: '22:00' });
    expect(aFechaHoraLocal('2026-10-01T03:00:00Z', ZONA)).toBe('2026-09-30T22:00');
    expect(new Date(deFechaHoraLocal('2026-09-30T22:00', ZONA) as string).toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(deFechaHoraLocal('', ZONA)).toBeNull();
  });
  test('un `date` no se corre de día', () => {
    expect(fechaCortaPlana('2026-10-30', 'es')).toMatch(/30/);
  });
  test('CampoFechaHora parte y recompone el mismo valor que un datetime-local', () => {
    expect(partirFechaHora('2026-09-30T22:00')).toEqual({ dia: '2026-09-30', hora: '22:00' });
    expect(combinarFechaHora('2026-09-30', '22:00')).toBe('2026-09-30T22:00');
    // Incompleto = '' (como el campo nativo): nada que guardar.
    expect(combinarFechaHora('2026-09-30', '')).toBe('');
    expect(combinarFechaHora('', '22:00')).toBe('');
    expect(partirFechaHora('')).toEqual({ dia: '', hora: '' });
    expect(partirFechaHora('2026-10-01T03:00:00Z')).toEqual({ dia: '', hora: '' });
  });
});

describe('QuickAction / QuickActionsBar (759:21219, 759:21433)', () => {
  const ctx = { tieneDestino: true, cliente: { phone: '3005550142', email: 'a@b.co', do_not_call: false }, paisPorDefecto: '57' };
  test('motivos: do_not_call, sin teléfono, sin correo, sin canal y sin permiso', () => {
    expect(motivoAccion('llamar', { ...ctx, cliente: { ...ctx.cliente, do_not_call: true } })).toBe('noLlamar');
    expect(motivoAccion('llamar', { ...ctx, cliente: { phone: '' } })).toBe('sinTelefono');
    expect(motivoAccion('email', { ...ctx, cliente: { phone: '3005550142' } })).toBe('sinCorreo');
    expect(motivoAccion('whatsapp', { ...ctx, canalWhatsApp: false })).toBe('sinCanal');
    expect(motivoAccion('nota', { ...ctx, permisos: { nota: false } })).toBe('sinPermiso');
    expect(motivoAccion('tarea', { tieneDestino: false })).toBe('sinDestino');
  });
  test('orden fijo y todas habilitadas con datos completos', () => {
    const e = estadoAccionesRapidas(ctx);
    expect(e.map((x) => x.accion)).toEqual(['llamar', 'email', 'whatsapp', 'reunion', 'tarea', 'nota']);
    expect(e.every((x) => x.habilitada)).toBe(true);
  });
  test('variantes y teclado', () => {
    expect(formatoDeVariante('tarjeta')).toBe('icono');
    expect(formatoDeVariante('drawer')).toBe('boton');
    expect(accionExtraDeVariante('cliente')).toBe('nuevaOportunidad');
    expect(accionExtraDeVariante('detalle')).toBe('propuesta');
    expect(indiceConTecla('ArrowLeft', 0, 6)).toBe(5);
    expect(indiceConTecla('End', 0, 6)).toBe(5);
    expect(indiceConTecla('a', 0, 6)).toBeNull();
  });
});

describe('OpportunityRowMenu (759:21624)', () => {
  test('abierta vs cerrada y permisos', () => {
    expect(accionesMenuOportunidad(estadoMenuDe('open'))).toContain('ganar');
    expect(accionesMenuOportunidad(estadoMenuDe('won'))).toContain('reabrir');
    expect(accionesMenuOportunidad(estadoMenuDe('won'))).not.toContain('ganar');
    expect(accionesMenuOportunidad('abierta', { eliminar: false, cerrar: false })).not.toEqual(expect.arrayContaining(['eliminar', 'ganar']));
  });
});

describe('KpiMoneda y StageColumn (759:22664, 759:22544)', () => {
  const tasas = [
    { base_currency: 'USD', target_currency: 'COP', rate: 4000, effective_date: '2026-09-29' },
    { base_currency: 'USD', target_currency: 'COP', rate: 3900, effective_date: '2026-09-01' },
  ];
  const items = [
    { monto: 1_000_000, moneda: 'COP' },
    { monto: 100, moneda: 'USD' },
    { monto: 50, moneda: 'EUR' },
  ];
  test('tasa vigente: la más reciente ≤ fecha, en cualquier sentido', () => {
    expect(tasaVigente('USD', 'COP', tasas, '2026-09-15')).toEqual({ tasa: 3900, fecha: '2026-09-01' });
    expect(tasaVigente('COP', 'USD', tasas)?.tasa).toBeCloseTo(1 / 4000);
  });
  test('falta tasa: suma lo convertible y avisa, sin inventar', () => {
    const r = sumarEnMonedaBase(items, 'COP', tasas, '2026-09-30');
    expect(r.total).toBe(1_400_000);
    expect(r.sinTasa.map((g) => g.moneda)).toEqual(['EUR']);
    expect(estadoKpiMoneda(r)).toBe('faltaTasa');
    expect(cantidadSinTasa(r)).toBe(1);
    expect(tieneDesglose(r)).toBe(true);
    expect(fechaTasaInformada(r)).toBe('2026-09-29');
  });
  test('columna: incluye convertidas y cuenta las sin tasa', () => {
    const c = totalColumna(items, 'COP', tasas);
    expect(c.incluye).toEqual({ cantidad: 1, moneda: 'USD', otras: 0 });
    expect(c.sinTasa).toBe(1);
    expect(estadoColumna({ cantidad: 0 })).toBe('vacia');
    expect(estadoColumna({ cantidad: 3, destino: true })).toBe('destino');
    expect(colorEtapa('#abc')).toBe('#abc');
    expect(colorEtapa('rojo')).toBeNull();
    expect(probabilidadEtapa(140)).toBe(100);
  });
});

describe('OpportunityCard (759:22188)', () => {
  const base = { id: 'o1', name: 'Renovación', amount: 12_500_000, currency: 'COP', status: 'open', temperature: 'hot' };
  test('vencida por próximo contacto pasado; ganada y perdida mandan', () => {
    expect(estadoTarjeta({ ...base, next_contact_at: '2026-09-28T15:00:00Z' }, AHORA)).toBe('vencida');
    expect(estadoTarjeta({ ...base, status: 'won' }, AHORA)).toBe('ganada');
  });
  test('vista: prioridad = temperatura (D4), próximo en la zona y días en etapa', () => {
    const v = vistaTarjeta({ ...base, next_action: 'Enviar propuesta', next_contact_at: '2026-10-01T15:00:00Z', entroEtapaEn: '2026-09-22T15:00:00Z' }, AHORA, ZONA);
    expect(v.temperatura).toBe('hot');
    expect(TONO_PRIORIDAD.hot).toBe('advertencia');
    expect(v.proximo?.cuando).toEqual({ clave: 'rel.manana', valores: { hora: '10:00' } });
    expect(v.diasEnEtapa).toBe(8);
  });
  test('cierre sin documento no deja un «·» colgando', () => {
    expect(vistaTarjeta({ ...base, status: 'won' }, AHORA, ZONA).cierre).toEqual({ clave: 'cierre.ganadaSolo' });
    expect(vistaTarjeta({ ...base, status: 'won', documentoGanada: 'FV-1042' }, AHORA, ZONA).cierre?.clave).toBe('cierre.ganada');
    expect(claveCanal('phone')).toBe('llamada');
    expect(claveCanal('fax')).toBe('otro');
  });
});

describe('LeadRow y QualifyLeadDialog (759:444712, 759:445219)', () => {
  const lead = { id: 'c1', full_name: 'Ana Gómez', lead_source: 'web_form', lead_score: 82, phone: '300', tags: ['a', 'b', 'c'] };
  test('orígenes = enums.ts (CHECK de la base)', () => {
    expect(ORIGENES_LEAD).toBe(LEAD_SOURCES);
    expect(origenValido('web_form')).toBe('web_form');
    expect(origenValido('tiktok')).toBeNull();
  });
  test('banda de score, etiquetas y menú según permisos', () => {
    expect([bandaScore(82), bandaScore(40), bandaScore(10), bandaScore(null)]).toEqual(['alto', 'medio', 'bajo', null]);
    expect(etiquetasVisibles(lead.tags)).toEqual({ visibles: ['a'], resto: 2 });
    expect(accionesLead({ phone: '' }, { asignar: false })).toEqual(['ver', 'etiquetar', 'descartar']);
  });
  test('calificar: valida y arma el prellenado de OpportunityForm Origen=lead', () => {
    const v = { ...valoresInicialesCalificacion({ responsableId: 'u1' }), necesidad: 'Cotización de uniformes', presupuesto: '18.000.000', cierre: '2026-10-30', decisor: 'el_mismo' as const };
    expect(validarCalificacion({ ...v, necesidad: '' }, '2026-09-30')).toEqual({ necesidad: 'obligatorio' });
    expect(validarCalificacion({ ...v, cierre: '2026-09-01' }, '2026-09-30')).toEqual({ cierre: 'fechaPasada' });
    const p = prefillDesdeLead(lead, v);
    expect(p).toMatchObject({ customer_id: 'c1', amount: '18000000', salesperson_id: 'u1', temperature: 'warm', source: 'web_form' });
    expect(p.discovery_data).toEqual({ necesidad: 'Cotización de uniformes', decisor: 'el_mismo', presupuesto: 18_000_000 });
    expect(nombreSugerido('x'.repeat(200), lead)).toHaveLength(120);
  });
});

describe('CaptureBanner y CargarMas (759:444768, 759:444795)', () => {
  test('banner: oculto sin leads sin colocar', () => {
    expect(estadoCaptureBanner({ cantidad: 0 })).toBe('oculto');
    expect(estadoCaptureBanner({ cantidad: 12 })).toBe('visible');
    expect(estadoCaptureBanner({ cantidad: 12, error: 'x' })).toBe('error');
  });
  test('cargar más: el cursor manda sobre el total; lote acotado a lo que falta', () => {
    expect(estadoCargarMas({ mostrados: 40, total: 1284 })).toBe('listo');
    expect(estadoCargarMas({ mostrados: 40, total: 1284, hayMas: false })).toBe('fin');
    expect(estadoCargarMas({ mostrados: 40, total: 40 })).toBe('fin');
    expect(siguienteLote(1280, 1284, 20)).toBe(4);
    expect(siguienteLote(0, null, 20)).toBe(20);
  });
});

describe('TimelineFilters (759:444935)', () => {
  test('chips → activity_type y rango en la zona de la organización', () => {
    expect(tiposDb('call')).toEqual(['call', 'sms']);
    expect(tiposDb('todos')).toBeNull();
    const f = { ...filtrosVacios(), tipo: 'meeting' as const, responsableId: 'u1', rango: { desde: '2026-09-01', hasta: '2026-09-23' } };
    const p = parametrosTimeline(f, ZONA);
    expect(p.types).toBe('meeting,visit');
    expect(new Date(p.from).toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(new Date(p.to).toISOString()).toBe('2026-09-24T05:00:00.000Z');
    expect(contarFiltrosPanel(f)).toBe(2);
    expect(hayFiltros(filtrosVacios())).toBe(false);
  });
});

describe('ActivityDialog (760:445129)', () => {
  const destino = { clienteId: 'c1', clienteNombre: 'Ana', oportunidadId: 'o1', oportunidadNombre: 'Uniformes' };
  test('duración legible en varios formatos', () => {
    expect(parsearDuracion('4 min 12 s')).toBe(252);
    expect(parsearDuracion('4:12')).toBe(252);
    expect(parsearDuracion('252 s')).toBe(252);
    expect(parsearDuracion('4')).toBe(240);
    expect(parsearDuracion('')).toBeNull();
    expect(parsearDuracion('mucho')).toBeNaN();
  });
  test('llamada: resultado obligatorio y datos para activities', () => {
    const v = { direccion: 'outbound' as const, resultado: 'answered' as const, duracion: '4:12', fechaHora: '2026-09-23T09:40', notas: ' ok ', crearSeguimiento: true, fechaSeguimiento: '2026-09-24' };
    expect(validarLlamada({ ...v, resultado: '' }, '2026-09-20')).toEqual({ resultado: 'obligatorio' });
    const d = datosLlamada(v, destino, ZONA);
    expect(d.actividad).toMatchObject({ activity_type: 'call', outcome: 'answered', duration_seconds: 252, related_type: 'opportunity', related_id: 'o1', notes: 'ok' });
    expect(new Date(d.actividad.occurred_at as string).toISOString()).toBe('2026-09-23T14:40:00.000Z');
    expect(d.seguimiento).toEqual({ due_date: '2026-09-24' });
  });
  test('WhatsApp: fuera de la ventana de 24 h exige plantilla', () => {
    expect(dentroDeVentana('2026-09-30T10:00:00Z', AHORA)).toBe(true);
    expect(dentroDeVentana('2026-09-27T10:00:00Z', AHORA)).toBe(false);
    const v = { canalId: 'w1', plantillaId: '', texto: 'hola', programar: false, fechaHora: '' };
    expect(validarWhatsApp(v, { dentroVentana: false })).toEqual({ plantillaId: 'plantillaObligatoria' });
    expect(validarWhatsApp(v, { dentroVentana: true })).toEqual({});
  });
  test('reunión: instantes en la zona y opportunity_id; nota con is_pinned', () => {
    const v = { titulo: 'Presentación', dia: '2026-10-01', hora: '10:00', duracionMin: 60, participantes: ['Ana'], lugar: '' };
    expect(validarReunion({ ...v, dia: '2026-09-01' }, '2026-09-30')).toEqual({ dia: 'fechaPasada' });
    const r = datosReunion(v, destino, ZONA);
    expect(new Date(r.start_at).toISOString()).toBe('2026-10-01T15:00:00.000Z');
    expect(r.end_at).toBe('2026-10-01T16:00:00.000Z');
    expect(r.opportunity_id).toBe('o1');
    expect(horaFin('23:30', 60)).toBe('00:30');
    expect(datosNota({ cuerpo: ' x ', fijar: true }, { clienteId: 'c1', clienteNombre: 'Ana' })).toEqual({ body: 'x', related_type: 'customer', related_id: 'c1', is_pinned: true });
  });
});

describe('CustomerLinkPicker (761:23596)', () => {
  const filas = [
    { id: 'p', full_name: 'Ana Gómez', customer_type: 'person', doc_type: 'CC', doc_number: '1020', email: 'a@c.co' },
    { id: 'e', full_name: 'Distribuciones El Roble S.A.S.', customer_type: 'company', doc_type: 'NIT', doc_number: '901', city: 'Medellín' },
  ];
  test('filtro, detalle de fila y búsqueda mínima', () => {
    expect(filtrarResultados(filas, 'empresas').map((f) => f.id)).toEqual(['e']);
    expect(detalleFila(filas[0])).toBe('CC 1020 · a@c.co');
    expect(detalleFila(filas[1])).toBe('NIT 901 · Medellín');
    expect(debeBuscar('a')).toBe(false);
  });
  test('crear sin salir: tipo sugerido, tipos de documento del país y sin columnas GENERATED', () => {
    expect(tipoSugerido('Ferretería Zeta', 'todos')).toBe('company');
    expect(tipoSugerido('Ana G', 'todos')).toBe('person');
    const tipos = [{ code: 'CC', name: 'Cédula', for_person: true, for_company: false }, { code: 'NIT', name: 'NIT', for_person: false, for_company: true }];
    const v = valoresCrear('Ana G', 'todos', tipos);
    expect(v).toMatchObject({ tipo: 'person', first_name: 'Ana', last_name: 'G', identification_type: 'CC' });
    expect(validarCrear({ ...v, last_name: '' })).toEqual({ last_name: 'obligatorio' });
    const d = datosCrear(v);
    expect(d).not.toHaveProperty('full_name');
    expect(d.identification_type).toBeNull();
    expect(filaSiguiente(0, 'ArrowDown', [false, true, false])).toBe(2);
  });
});

describe('WinDialog, LoseDialog y MoveStageDialog (761:23994, 761:24268, 761:24498)', () => {
  test('ganar: valida, fusiona win_data y mantiene el orden de acciones', () => {
    const v = valoresInicialesGanar({ amount: 12_500_000, currency: null }, 'COP', '2026-09-30');
    expect(v.moneda).toBe('COP');
    expect(validarGanar({ ...v, fechaCierre: '2026-10-05' }, '2026-09-30')).toEqual({ fechaCierre: 'fechaFutura' });
    expect(alternarAccion(['onboarding'], 'factura')).toEqual(['factura', 'onboarding']);
    const c = cuerpoGanar(v, { product: 'ERP' }, 's-won');
    expect(c.won_data).toMatchObject({ product: 'ERP', amount: 12_500_000, currency: 'COP', closed_on: '2026-09-30' });
    expect(c.stage_id).toBe('s-won');
    expect(facturaCreada([{ tipo: 'cotizacion', numero: 'COT-1' }, { tipo: 'factura', numero: 'FV-1' }])?.numero).toBe('FV-1');
  });
  test('perder: catálogo activo, competencia pide competidor y cuerpo de …/lose', () => {
    const motivos = [
      { id: 'm2', code: 'competitor', label: 'Eligió a la competencia', sort_order: 2 },
      { id: 'm1', code: 'price', label: 'Precio', sort_order: 1 },
      { id: 'm3', code: 'old', label: 'Viejo', is_active: false },
    ];
    expect(motivosVisibles(motivos).map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(esCompetencia(motivos[0])).toBe(true);
    const v = valoresInicialesPerder();
    expect(validarPerder(v, motivos[0])).toEqual({ competidor: 'obligatorio' });
    const c = cuerpoPerder({ ...v, competidor: 'Delta', precioCompetidor: '10.900.000' }, motivos[0], '2026-09-30');
    expect(c.loss_data).toEqual({ lossReasonId: 'm2', lossReasonLabel: 'Eligió a la competencia', competitor: 'Delta', competitorPrice: 10_900_000, recontactDate: '2026-12-29' });
  });
  test('mover: permiso, requisitos y desenlaces', () => {
    expect(resultadoMover({ puedeMover: false, pendientes: [] })).toBe('sinPermiso');
    expect(resultadoMover({ puedeMover: true, pendientes: [{ id: 'r', etiqueta: 'x' }] })).toBe('gate');
    expect(dialogoParaEtapa({ is_won: true })).toBe('ganar');
    expect(dialogoParaEtapa({ is_lost: true })).toBe('perder');
    expect(destinosPosibles([{ id: 'b', name: 'B', probability: 1, position: 2 }, { id: 'a', name: 'A', probability: 1, position: 1 }], 'a').map((e) => e.id)).toEqual(['b']);
    expect(aQuienPedir(['', ' Ana '])).toBe('Ana');
  });
});

describe('OpportunityForm (766:448739)', () => {
  const etapas: EtapaFormulario[] = [
    { id: 's2', pipeline_id: 'p', name: 'Propuesta', position: 2, probability: 60 },
    { id: 's1', pipeline_id: 'p', name: 'Calificación', position: 1, probability: 20 },
    { id: 'sw', pipeline_id: 'p', name: 'Ganada', position: 3, probability: 100, is_won: true },
  ];
  test('Origen bloquea lo que llega prellenado', () => {
    expect(camposBloqueados('general')).toEqual([]);
    expect(camposBloqueados('lead')).toEqual(['customer_id']);
    expect(camposBloqueados('factura')).toEqual(['customer_id', 'amount', 'currency']);
  });
  test('valores iniciales: moneda base, primera etapa no terminal, responsable = usuario', () => {
    const v = valoresIniciales({ monedaBase: 'COP', usuarioId: 'u1', pipelineId: 'p', etapas });
    expect(v).toMatchObject({ currency: 'COP', stage_id: 's1', salesperson_id: 'u1', temperature: 'warm' });
    expect(etapaInicial(etapas, 'x')).toBe('');
    expect(valoresIniciales({ monedaBase: 'COP', prefill: { amount: '', name: 'X' } }).name).toBe('X');
  });
  test('validación y cuerpos de POST/PATCH con el instante en la zona', () => {
    const v = { ...valoresIniciales({ monedaBase: 'COP', usuarioId: 'u1', pipelineId: 'p', etapas }), name: ' Renovación ', customer_id: 'c1', amount: '12.500.000', next_contact_at: '2026-09-24T10:00' };
    expect(validarOportunidad({ ...v, name: '', customer_id: '' })).toEqual({ name: 'obligatorio', customer_id: 'obligatorio' });
    expect(validarOportunidad(v)).toEqual({});
    expect(ponderado(v.amount, 20)).toBe(2_500_000);
    const alta = cuerpoAlta(v, { origen: 'lead', zona: ZONA, origenRef: { lead_id: 'c1' } });
    expect(alta).toMatchObject({ name: 'Renovación', amount: 12_500_000, currency: 'COP', pipeline_id: 'p', stage_id: 's1', origen: 'lead', origen_ref: { lead_id: 'c1' }, temperature: 'warm' });
    expect(new Date(alta.next_contact_at as string).toISOString()).toBe('2026-09-24T15:00:00.000Z');
    const edicion = cuerpoEdicion(v, { zona: ZONA, expectedUpdatedAt: '2026-09-30T00:00:00Z' });
    expect(edicion).not.toHaveProperty('stage_id');
    expect(edicion.expected_updated_at).toBe('2026-09-30T00:00:00Z');
  });
});

describe('StageEditorRow, PipelineTemplateCard y StageBar (798:24970, 800:25326, 801:25456)', () => {
  const e = (clave: string, name: string, extra: Partial<EtapaEditable> = {}): EtapaEditable => ({ clave, name, color: '#3b82f6', probability: 50, sla_days: 7, is_won: false, is_lost: false, ...extra });
  test('nombre vacío o repetido, probabilidad y un solo desenlace de cada tipo', () => {
    const errores = validarEtapas([e('a', 'Propuesta'), e('b', ' propuesta '), e('c', ''), e('d', 'X', { probability: 140 }), e('w1', 'G1', { is_won: true }), e('w2', 'G2', { is_won: true })]);
    expect(errores).toEqual({ a: 'nombreRepetido', b: 'nombreRepetido', c: 'nombreVacio', d: 'probabilidad', w2: 'ganadaDuplicada' });
    expect(conResultado(e('x', 'X'), 'ganada')).toMatchObject({ is_won: true, probability: 100, sla_days: null });
    expect(resultadoDe({ is_won: false, is_lost: true })).toBe('perdida');
    expect(reordenar([e('a', 'A'), e('b', 'B')], 1, 0).map((x) => [x.clave, x.position])).toEqual([['b', 1], ['a', 2]]);
  });
  test('requisitos en los 3 formatos de exit_criteria', () => {
    expect(contarRequisitos(['a', 'b'])).toBe(2);
    expect(contarRequisitos({ requirements: [{}, {}, {}] })).toBe(3);
    expect(contarRequisitos({ require_quotation: true, min_score: 50, required_fields: ['a', 'b'], require_discovery: false })).toBe(4);
    expect(contarRequisitos(null)).toBe(0);
  });
  test('plantillas: las 4 reales, «En blanco» con cierre y avisos', () => {
    const ventas = PIPELINE_TEMPLATES.find((p) => p.key === 'sales')!;
    const blank = PIPELINE_TEMPLATES.find((p) => p.key === 'blank')!;
    const onboarding = PIPELINE_TEMPLATES.find((p) => p.key === 'onboarding')!;
    const etapasVentas = etapasDePlantilla(ventas, { ganada: 'Ganada', perdida: 'Perdida' });
    expect(etapasVentas).toHaveLength(9);
    expect(rangoSla(etapasVentas)).toEqual({ min: 3, max: 45 });
    const etapasBlank = etapasDePlantilla(blank, { ganada: 'Ganada', perdida: 'Perdida' });
    expect(etapasBlank.map((x) => [x.is_won, x.is_lost])).toEqual([[true, false], [false, true]]);
    expect(etapasBlank[0].color).toBe(ventas.stages.find((s) => s.is_won)?.color);
    expect(avisoPlantilla(ventas, etapasVentas, ['sales'])).toBe('tipoExistente');
    expect(avisoPlantilla(onboarding, etapasDePlantilla(onboarding, { ganada: 'G', perdida: 'P' }), [])).toBe('sinPerdida');
    expect(clavePlantilla('renewal')).toBe('renovacion');
  });
  test('barra: pasada/actual/futura, desenlaces aparte y «2 de 3»', () => {
    const etapas = [
      { id: 'a', name: 'Calificación', position: 1, probability: 20 },
      { id: 'b', name: 'Propuesta', position: 2, probability: 60 },
      { id: 'c', name: 'Negociación', position: 3, probability: 80 },
      { id: 'w', name: 'Ganada', position: 4, probability: 100, is_won: true },
      { id: 'l', name: 'Perdida', position: 5, probability: 0, is_lost: true },
    ];
    const v = vistaBarra(etapas, 'b');
    expect(v.segmentos.map((s) => s.estado)).toEqual(['pasada', 'actual', 'futura']);
    expect([v.indice, v.total, v.ganada?.id, v.perdida?.id]).toEqual([2, 3, 'w', 'l']);
    expect(vistaBarra(etapas, 'w').segmentos.every((s) => s.estado === 'pasada')).toBe(true);
  });
});

describe('OpportunityDrawerHeader y reutilizados de Clientes', () => {
  test('cabecera: estado, ICP y pie según permiso de cerrar', () => {
    expect(estadoOportunidad('lost')).toBe('lost');
    expect(estadoOportunidad(null)).toBe('open');
    expect(bandaIcp(' a ')).toBe('A');
    expect(bandaIcp('Z')).toBeNull();
    expect(accionesPie('open', { cerrar: false })).toEqual(['editar']);
    expect(accionesPie('won')).toEqual(['editar', 'reabrir']);
  });
  test('TimelineEntry: tipo desde activities y «Hoy/Ayer» en la zona', () => {
    expect(tipoDesdeActividad('ai_call')).toBe('llamadaIa');
    expect(tipoDesdeActividad('visit')).toBe('reunion');
    expect(tipoDesdeActividad('raro')).toBe('sistema');
    expect(cuandoEntrada('2026-09-30T15:24:00Z', AHORA, ZONA, 'es')).toEqual({ clave: 'hoy', valores: { hora: '10:24' } });
    expect(cuandoEntrada('2026-09-29T23:02:00Z', AHORA, ZONA, 'es')?.clave).toBe('ayer');
  });
  test('CustomerIdentityCard: ciclo, salud, «Nuevo» y ubicación', () => {
    expect(etapaCicloValida('customer')).toBe('customer');
    expect(etapaCicloValida('x')).toBeNull();
    expect([tonoSalud(78), tonoSalud(50), tonoSalud(10)]).toEqual(['exito', 'advertencia', 'peligro']);
    expect(esClienteNuevo('2026-09-20T12:00:00Z', AHORA, ZONA)).toBe(true);
    expect(esClienteNuevo('2026-01-01T12:00:00Z', AHORA, ZONA)).toBe(false);
    expect(ubicacion({ city: 'Bogotá D.C.', address: 'Calle 93' })).toBe('Bogotá D.C. · Calle 93');
  });
  test('ContactoVinculadoRow: cargo normalizado y teclas', () => {
    expect(cargoNormalizado('  Jefe   de compras ')).toBe('Jefe de compras');
    expect(cargoNormalizado('   ')).toBeNull();
    expect(cargoCambio('Gerente', ' Gerente ')).toBe(false);
    expect(accionTeclaCargo('Escape')).toBe('cancelar');
    expect(accionTeclaCargo('Enter')).toBe('guardar');
  });
});
