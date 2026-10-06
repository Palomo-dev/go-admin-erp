/**
 * CRM «Figma a código» — lógica pura de las pantallas nuevas: llamadas,
 * detalle de campaña de voz, editor del agente en 5 pasos, constructor de
 * segmentos, campañas unificadas, prueba en seco retroactiva, frecuencia de
 * objeciones, pronóstico trimestral, fusión, simulación y Meta.
 */
import {
  EMPTY_FILTERS,
  celdaCsv,
  formatDuration,
  hayFiltrosLlamadas,
  minutosDeVoz,
  parametrosLlamadas,
  porcentaje,
  resultadoDeLlamada,
  tipoDeLlamada,
  estadoGrabacion,
} from '@/components/voice/callsListadoLogica';
import { cronometro, diasRestantes, estadoCampana, etiquetaFila, progresoAudiencia, resultadoLibre, tiempoRelativo } from '@/components/crm/agentes/campanas/detalle/campanaVozDetalleLogica';
import {
  PASOS_EDITOR,
  cuerpoAsignacion,
  faltaEnAsignacion,
  faltantesPaso,
  filasEtapas,
  historialParaApi,
  objetivoInicial,
  pasoAnterior,
  pasoSiguiente,
} from '@/components/crm/agentes/editor/pasosEditorLogica';
import { claveGrupos, estadoDeError, gruposParaContar, porcentajeDeBase, reglaCompleta } from '@/components/crm/segmentos/nuevo/conteoSegmentoLogica';
import { anadirGrupo, anadirRegla, cambiarCampo, cambiarOperador, quitarGrupo, quitarRegla, reglaNueva } from '@/components/crm/segmentos/nuevo/reglasSegmentoLogica';
import { accionesCampanaMensajes, estadoFilaCampana, parametrosCampanas, rutaCampana } from '@/components/crm/campanas/campanasListaLogica';
import { motivosOrdenados, rutaReplay } from '@/components/crm/automatizaciones/replayLogica';
import { altosTendencia, marcaTiempo, resumenesPorObjecion, semanaPico } from '@/components/crm/objeciones/frecuenciaObjecionesLogica';
import { anchosCobertura, brechaCuota, deltaAjuste, montoInicialAjuste, nombreVendedor, opcionesTrimestre, partesTrimestre, tonoCobertura } from '@/components/crm/pronostico/trimestre/trimestreLogica';
import { camposDistintos, choicesParaApi, claveErrorFusion, eleccionesIniciales, nombreCliente, principalSugerido } from '@/components/crm/identidades/fusionLogica';
import { cuerpoSimulacion, notaTerritorio } from '@/components/crm/equipo/simulacionLogica';
import { errorSincronizacion, estadoSincronizacion } from '@/components/crm/plantillas/sincronizacionMetaLogica';
import type { FilterRule } from '@/components/crm/segmentos/types';
import type { ClienteDuplicado } from '@/lib/services/crm/customerMergeLogica';
import type { AgentFormState } from '@/components/crm/agentes/editor/useAgentForm';

describe('llamadas', () => {
  it('parámetros: «mías» viaja como me, días tal cual (los convierte el servidor) y el offset de la página', () => {
    const p = parametrosLlamadas({ ...EMPTY_FILTERS, mine: true, q: '  precio ', fromDate: '2026-10-01', toDate: '2026-10-06' }, 3, 25);
    expect(Object.fromEntries(p)).toEqual({ limit: '25', offset: '50', user_id: 'me', q: 'precio', from_date: '2026-10-01', to_date: '2026-10-06' });
  });
  it('«sin resultados» solo si el usuario cambió algo respecto del rango por defecto', () => {
    const rango = { fromDate: '2026-09-07', toDate: '2026-10-06' };
    expect(hayFiltrosLlamadas({ ...EMPTY_FILTERS, ...rango }, rango)).toBe(false);
    expect(hayFiltrosLlamadas({ ...EMPTY_FILTERS, ...rango, direction: 'inbound' }, rango)).toBe(true);
    expect(hayFiltrosLlamadas({ ...EMPTY_FILTERS, ...rango, fromDate: '2026-10-01' }, rango)).toBe(true);
  });
  it('duración, porcentaje, minutos y CSV a prueba de fórmulas', () => {
    expect(formatDuration(134)).toBe('2:14');
    expect(formatDuration(null)).toBe('—');
    expect(porcentaje(1, 3)).toBe(33);
    expect(porcentaje(1, 0)).toBe(0);
    expect(minutosDeVoz(61)).toBe(2);
    expect(celdaCsv('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });
  it('resultado: la disposición manda; sin ella, el estado técnico', () => {
    expect(resultadoDeLlamada({ disposition_outcome: 'answered', status: 'completed', direction: 'outbound' } as never)).toEqual({ clave: 'answered', tono: 'exito' });
    expect(resultadoDeLlamada({ disposition_outcome: null, status: 'no_answer', direction: 'inbound' } as never)).toEqual({ clave: 'missed', tono: 'peligro' });
    expect(tipoDeLlamada({ direction: 'outbound', mode: 'ai_agent', status: 'completed' } as never)).toBe('agenteIa');
    expect(estadoGrabacion({ recordings: [{ status: 'processing' }] } as never)).toBe('procesando');
  });
});

describe('detalle de campaña de voz', () => {
  it('etiqueta de fila: en curso, no volver, reunión, Ley 2300 y texto libre', () => {
    expect(etiquetaFila({ status: 'in_progress' }).clave).toBe('enCurso');
    const fila = { estado: 'completed', resultado: null, devolucion_at: null, reintento_at: null, ley2300: false, reunion_at: null, no_volver_a_llamar: true };
    expect(etiquetaFila({ status: 'completed' }, fila).clave).toBe('noVolver');
    expect(etiquetaFila({ status: 'completed' }, { ...fila, no_volver_a_llamar: false, reunion_at: '2026-10-08T15:00:00Z' })).toMatchObject({ clave: 'reunion', cuando: '2026-10-08T15:00:00Z' });
    expect(etiquetaFila({ status: 'no_answer' }, { ...fila, no_volver_a_llamar: false, ley2300: true, reintento_at: 'x' }).clave).toBe('ley2300');
    expect(etiquetaFila({ status: 'completed' }, { ...fila, no_volver_a_llamar: false, resultado: 'No interesado · precio' })).toMatchObject({ clave: 'conversacion', detalle: 'No interesado · precio' });
    expect(resultadoLibre('answered_by_human')).toBeNull();
  });
  it('progreso, días de cupo, tiempo relativo, cronómetro y estado', () => {
    expect(progresoAudiencia(30, 120)).toBe(25);
    expect(diasRestantes(30, 120, 40)).toBe(3);
    expect(diasRestantes(120, 120, 40)).toBeNull();
    const ahora = Date.parse('2026-10-06T15:00:00Z');
    expect(tiempoRelativo('2026-10-06T14:56:00Z', ahora)).toEqual({ valor: -4, unidad: 'minute' });
    expect(tiempoRelativo('2026-10-06T14:59:30Z', ahora)).toBeNull();
    expect(cronometro('2026-10-06T14:57:46Z', ahora)).toBe('02:14');
    expect(estadoCampana({ status: 'running', emergency_stop: true }).clave).toBe('detenida');
  });
});

describe('editor del agente en 5 pasos', () => {
  const form = { name: '', llm_model: '' } as AgentFormState;
  it('orden de pasos y lo que bloquea el paso 1', () => {
    expect(PASOS_EDITOR).toEqual(['proposito', 'etapas', 'voz', 'herramientas', 'probar']);
    expect(pasoSiguiente('proposito')).toBe('etapas');
    expect(pasoAnterior('proposito')).toBeNull();
    expect(faltantesPaso(form, 'proposito')).toEqual(['nombre', 'modelo']);
    expect(faltantesPaso(form, 'voz')).toEqual([]);
  });
  it('historial sin el saludo y con roles de la API', () => {
    expect(historialParaApi([{ rol: 'agente', texto: 'Hola' }, { rol: 'cliente', texto: '¿Precio?' }, { rol: 'agente', texto: 'Depende' }])).toEqual([
      { role: 'user', content: '¿Precio?' },
      { role: 'assistant', content: 'Depende' },
    ]);
  });
  it('etapas: sin las de cierre, en orden; la asignación arrastra los campos que el upsert repondría', () => {
    const etapas = [
      { id: 'b', name: 'Propuesta', pipeline_id: 'p', position: 2 },
      { id: 'a', name: 'Calificado', pipeline_id: 'p', position: 1 },
      { id: 'g', name: 'Ganada', pipeline_id: 'p', position: 3, is_won: true },
    ];
    const asignaciones = [{ id: 'x', stage_id: 'b', voice_agent_id: 'otro', objective: 'qualify_lead', objective_prompt: null, product_id: null, trigger_on: 'enter', action_policy: 'suggest', is_active: true }];
    expect(filasEtapas(etapas, asignaciones, 'p', 'yo').map((f) => [f.etapa.id, f.estado])).toEqual([['a', 'libre'], ['b', 'otro']]);
    expect(objetivoInicial('sell_product', ['sell_product', 'qualify_lead'])).toBe('qualify_lead');
    expect(faltaEnAsignacion({ objective: 'custom', objective_prompt: ' ', product_id: null })).toBe('descripcion');
    const cuerpo = cuerpoAsignacion('b', 'yo', { ...asignaciones[0], max_attempts: 3, allowed_tools: ['schedule_meeting'] }, { is_active: false });
    expect(cuerpo).toMatchObject({ stage_id: 'b', voice_agent_id: 'yo', channel: 'voice', trigger_on: 'enter', is_active: false, max_attempts: 3, allowed_tools: ['schedule_meeting'] });
  });
});

describe('constructor de segmentos', () => {
  const r = (field: string, operator: string, value: FilterRule['value']): FilterRule => ({ field, operator: operator as FilterRule['operator'], value });
  it('solo cuentan las reglas completas y los grupos con algo', () => {
    expect(reglaCompleta(r('city', 'equals', ''))).toBe(false);
    expect(reglaCompleta(r('city', 'is_empty', ''))).toBe(true);
    expect(reglaCompleta(r('created_at', 'between', ['2026-01-01', '']))).toBe(false);
    expect(gruposParaContar([[r('city', 'equals', '')], [r('city', 'equals', 'Cali')]])).toEqual([[r('city', 'equals', 'Cali')]]);
    expect(claveGrupos([[r('city', 'equals', '')]])).toBe('[]');
  });
  it('estado de la pantalla según el código HTTP y el % de la base', () => {
    expect([504, 503, 400, 403, 500].map(estadoDeError)).toEqual(['tardio', 'noDisponible', 'invalido', 'sinPermiso', 'error']);
    expect(porcentajeDeBase(1284, 34241)).toBe(3.7);
    expect(porcentajeDeBase(1, 0)).toBe(0);
  });
  it('editar grupos: cambiar campo limpia el valor; «entre» guarda dos fechas; el primer grupo se vacía, no se quita', () => {
    expect(cambiarCampo(r('city', 'contains', 'x'), 'created_at')).toEqual({ field: 'created_at', operator: 'equals', value: '' });
    expect(cambiarOperador(r('created_at', 'equals', '2026-01-01'), 'between').value).toEqual(['', '']);
    let g: FilterRule[][] = [[reglaNueva()]];
    g = anadirGrupo(g);
    g = anadirRegla(g, 1);
    expect(g.map((x) => x.length)).toEqual([1, 2]);
    expect(quitarRegla(quitarRegla(g, 1, 0), 1, 0)).toHaveLength(1);
    expect(quitarGrupo(g, 0)[0]).toEqual([]);
  });
});

describe('campañas unificadas', () => {
  it('voz usa el estado del detalle; mensajes, el estado efectivo del motor', () => {
    expect(estadoFilaCampana({ source: 'voice', status: 'running', emergencyStop: false })).toEqual({ clave: 'enCurso', tono: 'exito' });
    expect(estadoFilaCampana({ source: 'message', status: 'sending', emergencyStop: false }).clave).toBe('enviando');
    expect(rutaCampana({ id: 'a b', source: 'voice' })).toBe('/app/crm/campanas/voz/a%20b');
    expect(rutaCampana({ id: 'x', source: 'message' })).toBe('/app/crm/campanas/x');
  });
  it('acciones de mensajes: pausar/reanudar/cancelar solo para admin; no se borra una que está enviando', () => {
    expect(accionesCampanaMensajes('sending', false)).toEqual(['duplicar']);
    expect(accionesCampanaMensajes('sending', true)).toEqual(['pausar', 'cancelar', 'duplicar']);
    expect(accionesCampanaMensajes('paused', true)).toEqual(['reanudar', 'cancelar', 'duplicar', 'eliminar']);
    expect(parametrosCampanas({ channel: 'voice', q: ' ', page: 2 })).toBe('channel=voice&page=2');
  });
});

describe('prueba en seco retroactiva y objeciones', () => {
  it('motivos de mayor a menor y ruta de la simulación', () => {
    expect(motivosOrdenados({ cooldown: 1, conditions_not_met: 4, x: 0 })).toEqual([['conditions_not_met', 4], ['cooldown', 1]]);
    expect(rutaReplay('r/1')).toBe('/api/crm/automation-rules/r%2F1/replay');
  });
  it('frecuencia: parte del total y «superada»; pico y alturas de la tendencia; minuto de la cita', () => {
    const m = resumenesPorObjecion([
      { objection_id: 'a', call_count: 3, advanced_count: 1, opportunity_count: 2, advanced_opportunity_count: 1 },
      { objection_id: 'b', call_count: 1, advanced_count: 0, opportunity_count: 1, advanced_opportunity_count: 0 },
    ]);
    expect(m.get('a')).toEqual({ llamadas: 3, pct: 75, superada: 33 });
    expect(semanaPico([{ week: '2026-09-01', call_count: 2 }, { week: '2026-09-08', call_count: 5 }])?.week).toBe('2026-09-08');
    expect(altosTendencia([{ call_count: 0 }, { call_count: 10 }])).toEqual([4, 100]);
    expect(marcaTiempo(130_000)).toBe('02:10');
    expect(marcaTiempo(null)).toBeNull();
  });
});

describe('pronóstico trimestral', () => {
  it('trimestres alrededor del actual y partes para el i18n', () => {
    expect(opcionesTrimestre('2026-Q1')).toEqual(['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3']);
    expect(partesTrimestre('2026-Q4')).toEqual({ anio: 2026, q: 4 });
  });
  it('cobertura, brecha y anchos de la barra', () => {
    expect(tonoCobertura(1.1)).toBe('exito');
    expect(tonoCobertura(0.5)).toBe('peligro');
    expect(tonoCobertura(null)).toBe('neutro');
    expect(brechaCuota(450, 312, 398)).toEqual({ falta: 138, pctMejor: 88 });
    expect(anchosCobertura(100, 25, 50, 200)).toEqual({ ganado: 12.5, compromiso: 25, mejorCaso: 100, cuota: 50 });
    expect(montoInicialAjuste(1234.567, 0)).toBe(1235);
    expect(deltaAjuste(null, 10)).toBeNull();
    expect(nombreVendedor({ first_name: 'Ana', last_name: null })).toBe('Ana');
  });
});

describe('fusión de clientes', () => {
  const c = (id: string, extra: Partial<ClienteDuplicado> = {}): ClienteDuplicado => ({
    id, full_name: null, first_name: null, last_name: null, email: null, phone: null, company_name: null, trade_name: null,
    identification_type: null, identification_number: null, address: null, city: null, created_at: '2026-01-01', conversations_count: 0, opportunities_count: 0, ...extra,
  });
  it('campos distintos y elección por defecto: gana el principal salvo que no tenga el dato', () => {
    const p = c('p', { email: 'a@x.co', city: null, phone: '3105550142' });
    const s = c('s', { email: null, city: 'Medellín', phone: '3105550142' });
    expect(camposDistintos(p, s)).toEqual(['email', 'city']);
    const e = eleccionesIniciales(p, s);
    expect(e).toEqual({ email: 'p', city: 's' });
    expect(choicesParaApi(e, 's')).toEqual({ city: 's' });
  });
  it('principal sugerido, nombre y errores conocidos', () => {
    expect(principalSugerido([c('a', { opportunities_count: 1 }), c('b', { opportunities_count: 3 })])?.id).toBe('b');
    expect(nombreCliente({ full_name: ' ', company_name: 'Ferretería', trade_name: null })).toBe('Ferretería');
    expect(claveErrorFusion('factura_emitida')).toBe('factura_emitida');
    expect(claveErrorFusion('CRM_FORBIDDEN')).toBe('sin_permiso');
    expect(claveErrorFusion('otra_cosa')).toBe('generico');
  });
});

describe('simulación de asignación, territorios y Meta', () => {
  it('cuerpo: vacío = lo configurado; sucursales como número', () => {
    expect(cuerpoSimulacion({ strategy: '', team_id: '', city: ' Cali ', company_size: '', branches_count: '3', lifecycle_stage: '', current_software: '' })).toEqual({
      customer: { city: 'Cali', company_size: null, branches_count: 3, lifecycle_stage: null, current_software: null },
    });
    expect(notaTerritorio({ clientes: 0, solapados: 0, reglasDeOportunidad: false, sinReglas: true })).toBe('sinReglas');
    expect(notaTerritorio({ clientes: 5, solapados: 2, reglasDeOportunidad: false, sinReglas: false })).toBe('solapados');
  });
  it('Meta: estado honesto (sin canal, sin permiso) y errores del proveedor', () => {
    expect(estadoSincronizacion(null)).toBe('cargando');
    expect(estadoSincronizacion({ canales: [{ status: 'inactive' }], puedeGestionar: true })).toBe('sinCanal');
    expect(estadoSincronizacion({ canales: [{ status: 'active' }], puedeGestionar: false })).toBe('sinPermiso');
    expect(estadoSincronizacion({ canales: [{ status: 'active' }], puedeGestionar: true })).toBe('lista');
    expect(errorSincronizacion({ code: 'PROVIDER', status: 502 })).toBe('proveedor');
    expect(errorSincronizacion({ code: 'ADMIN_REQUIRED', status: 403 })).toBe('sinPermiso');
    expect(errorSincronizacion({ code: 'NO_CHANNEL', status: 422 })).toBe('sinCanal');
  });
});
