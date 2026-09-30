/**
 * CRM ola 3A · Leads, Actividades y acciones rápidas: lógica de pantalla sin
 * React (filtros → parámetros en la zona de la organización, estados, filas,
 * selección, exportación y cuerpos que van a las rutas del servidor).
 */
import { acumular, aLeadFila, alternar, csvLeads, estadoCasillaPagina, estadoPantallaLeads, filtrosLeadsVacios, parametrosLeads, parametrosResumenLeads, porcentajeContactados, type LeadApi } from '../leadsPantallaLogica';
import { cuerpoCalificar } from '../calificarLogica';
import {
  agruparPorDia,
  claveTitulo,
  csvActividades,
  cuerpoDuplicado,
  cuerpoEdicionEntrada,
  estadoEntrada,
  estadoPantallaActividades,
  etiquetaDia,
  filtrosPorDefecto,
  metaEntrada,
  partesDuracion,
  rutaEntrada,
  sonFiltrosPorDefecto,
  textoPlano,
  type EntradaFeed,
} from '@/components/crm/actividades/pantalla/actividadesPantallaLogica';
import { cuerpoLlamada, cuerpoNota, cuerpoReunion, cuerpoSeguimiento, cuerpoTarea, motivoModo, ordenModos, validarTarea, varianteDesdeLegado } from '@/components/crm/acciones/accionesRapidasLogica';
import { catalogoDesdeRespuestas, nombreUsuario, puede } from '@/components/crm/acciones/catalogosCrmLogica';
import { claveError, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { datosLlamada, datosNota, datosReunion } from '@/components/crm/kit/activityDialogLogica';

const BOG = 'America/Bogota';
/** Instante → milisegundos (la API manda ISO con desfase: se compara el instante, no el texto). */
const ms = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);
const USUARIOS = [{ id: 'u1', nombre: 'Carlos Ruiz' }];
const LEAD: LeadApi = { id: 'c1', full_name: 'Ana Gómez', email: 'ana@correo.co', phone: '3005550142', lead_source: 'web_form', owner_id: 'u1', lead_score: 82, last_contact_at: null, tags: ['feria'], created_at: '2026-09-14T15:00:00Z' };

describe('Leads · parámetros de GET /api/crm/leads', () => {
  it('rango de captura en días de la organización → instantes (hasta exclusivo)', () => {
    const p = new URLSearchParams(parametrosLeads({ ...filtrosLeadsVacios(), rango: { desde: '2026-09-30', hasta: '2026-09-01' } }, 2, 25, BOG));
    expect(ms(p.get('creado_desde'))).toBe(Date.parse('2026-09-01T05:00:00Z'));
    expect(ms(p.get('creado_hasta'))).toBe(Date.parse('2026-10-01T05:00:00Z'));
    expect(p.get('page')).toBe('2');
    expect(p.get('limit')).toBe('25');
  });

  it('«Sin colocar» fuerza el origen formulario web; responsable «ninguno»; descartados', () => {
    const p = new URLSearchParams(parametrosLeads({ ...filtrosLeadsVacios(), origen: 'import', sinColocar: true, responsable: 'ninguno', descartados: true, q: ' 900 555 ' }, 1, 25, BOG));
    expect(p.get('origen')).toBe('web_form');
    expect(p.get('owner_id')).toBe('ninguno');
    expect(p.get('descartados')).toBe('1');
    expect(p.get('q')).toBe('900 555');
  });

  it('resumen: inicio del mes y hace 7 días en la zona (Bogotá = UTC−5)', () => {
    const p = new URLSearchParams(parametrosResumenLeads('2026-09-30', BOG));
    expect(ms(p.get('mes_desde'))).toBe(Date.parse('2026-09-01T05:00:00Z'));
    expect(ms(p.get('siete_desde'))).toBe(Date.parse('2026-09-24T05:00:00Z'));
    expect(porcentajeContactados({ contactados_7d: 312, total: 34241 })).toBe(0.9);
    expect(porcentajeContactados({ contactados_7d: 1, total: 0 })).toBe(0);
  });
});

describe('Leads · estados, filas y selección', () => {
  const base = { cargando: false, errorStatus: null, hayError: false, total: 0, filtros: filtrosLeadsVacios() };
  it('estado de la pantalla', () => {
    expect(estadoPantallaLeads({ ...base, errorStatus: 403, hayError: true })).toBe('sinPermiso');
    expect(estadoPantallaLeads({ ...base, hayError: true })).toBe('error');
    expect(estadoPantallaLeads({ ...base, cargando: true, total: null })).toBe('cargando');
    expect(estadoPantallaLeads(base)).toBe('vacio');
    expect(estadoPantallaLeads({ ...base, filtros: { ...filtrosLeadsVacios(), q: 'x' } })).toBe('sinResultados');
    expect(estadoPantallaLeads({ ...base, total: 3 })).toBe('listo');
  });

  it('aLeadFila: responsable por nombre; empresas con documento delante del correo', () => {
    expect(aLeadFila(LEAD, USUARIOS).responsable).toEqual({ id: 'u1', nombre: 'Carlos Ruiz' });
    const empresa = aLeadFila({ ...LEAD, customer_type: 'company', doc_type: 'NIT', doc_number: '901.555.210-4', owner_id: null }, USUARIOS);
    expect(empresa.email).toBe('NIT 901.555.210-4 · ana@correo.co');
    expect(empresa.phone).toBeNull();
    expect(empresa.responsable).toBeNull();
    expect(aLeadFila({ ...LEAD, lead_source: 'inventado' }, []).lead_source).toBeNull();
  });

  it('selección por página y lista móvil acumulada sin duplicados', () => {
    const s = alternar(new Set(['a']), 'b', true);
    expect(estadoCasillaPagina(s, ['a', 'b'])).toBe(true);
    expect(estadoCasillaPagina(alternar(s, 'a', false), ['a', 'b'])).toBe('indeterminate');
    expect(estadoCasillaPagina(new Set(), ['a'])).toBe(false);
    expect(acumular([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }], 2).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(acumular([{ id: 'a' }], [{ id: 'z' }], 1).map((x) => x.id)).toEqual(['z']);
  });

  it('CSV: escapa comas y comillas y neutraliza fórmulas', () => {
    const csv = csvLeads([{ ...LEAD, full_name: '=HYPERLINK("x")', tags: ['a,b'] }], USUARIOS, ['Nombre']);
    const [enc, fila] = csv.split('\n');
    expect(enc).toBe('Nombre');
    expect(fila.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
    expect(fila).toContain('"a,b"');
  });

  it('Calificar: el navegador no manda cliente ni origen (los fija la ruta)', () => {
    expect(cuerpoCalificar({ name: 'X', customer_id: 'c', origen: 'lead', origen_ref: {}, organization_id: 9, amount: 5 })).toEqual({ name: 'X', amount: 5 });
  });
});

const ENTRADA: EntradaFeed = {
  id: 'a1', fuente: 'activity', tipo: 'call', ocurrio_en: '2026-09-23T14:40:00Z', autor_id: 'u1', autor: 'Carlos Ruiz', texto: 'Pide cotización', outcome: 'answered',
  duration_seconds: 252, channel: 'phone', direccion: 'outbound', fijada: false, tarea: null, cliente: { id: 'c1', nombre: 'Ana Gómez' }, oportunidad: { id: 'o1', nombre: 'Uniformes 2026' }, editable: true,
};

describe('Actividades · entradas y días en la zona de la organización', () => {
  it('título, duración, estado y meta', () => {
    expect(claveTitulo(ENTRADA)).toBe('llamadaSaliente');
    expect(claveTitulo({ ...ENTRADA, direccion: 'inbound' })).toBe('llamadaEntrante');
    expect(claveTitulo({ ...ENTRADA, fuente: 'note', tipo: 'note' })).toBe('nota');
    expect(claveTitulo({ ...ENTRADA, tipo: 'system' })).toBe('sistema');
    expect(partesDuracion(252)).toEqual({ min: 4, seg: 12 });
    expect(partesDuracion(0)).toBeNull();
    expect(estadoEntrada(ENTRADA)).toEqual({ clave: 'resultado.answered', tono: 'exito' });
    expect(estadoEntrada({ ...ENTRADA, outcome: 'algo_raro' })).toBeNull();
    expect(estadoEntrada({ ...ENTRADA, fuente: 'task', tipo: 'task', tarea: { estado: 'open', prioridad: 'high', vence: null } })).toEqual({ clave: 'pendiente', tono: 'advertencia' });
    expect(estadoEntrada({ ...ENTRADA, fuente: 'note', tipo: 'note', fijada: true })?.clave).toBe('fijada');
    expect(metaEntrada(ENTRADA, 'Sistema')).toBe('Carlos Ruiz · Ana Gómez · Uniformes 2026');
    expect(metaEntrada({ ...ENTRADA, tipo: 'system', autor: null, oportunidad: null }, 'Sistema')).toBe('Sistema · Ana Gómez');
    expect(textoPlano('<p>Hola&nbsp;<b>Ana</b></p><p>2</p>')).toBe('Hola Ana 2');
  });

  it('agrupa por día de la organización: 00:30 UTC del 24 es el 23 en Bogotá', () => {
    const g = agruparPorDia([ENTRADA, { ...ENTRADA, id: 'a2', ocurrio_en: '2026-09-24T00:30:00Z' }, { ...ENTRADA, id: 'a3', ocurrio_en: '2026-09-22T12:00:00Z' }], BOG);
    expect(g.map((x) => [x.dia, x.entradas.length])).toEqual([['2026-09-23', 2], ['2026-09-22', 1]]);
    expect(agruparPorDia([{ ...ENTRADA, ocurrio_en: '2026-09-24T00:30:00Z' }], 'UTC')[0].dia).toBe('2026-09-24');
    const hoyEs = etiquetaDia('2026-09-23', '2026-09-23', 'es');
    expect(hoyEs.relativo).toBe('hoy');
    expect(hoyEs.fecha).toMatch(/miércoles.*23/);
    expect(etiquetaDia('2026-09-22', '2026-09-23', 'es').relativo).toBe('ayer');
    expect(etiquetaDia('2025-12-31', '2026-09-23', 'en').fecha).toContain('2025');
  });

  it('estado de la pantalla: el mes en curso sin nada es «vacío», con filtros es «sin resultados»', () => {
    const hoy = '2026-09-23';
    expect(sonFiltrosPorDefecto(filtrosPorDefecto(hoy), hoy)).toBe(true);
    expect(sonFiltrosPorDefecto({ ...filtrosPorDefecto(hoy), tipo: 'call' }, hoy)).toBe(false);
    const b = { cargando: false, errorStatus: null, hayError: false, mostradas: 0, porDefecto: true };
    expect(estadoPantallaActividades(b)).toBe('vacio');
    expect(estadoPantallaActividades({ ...b, porDefecto: false })).toBe('sinResultados');
    expect(estadoPantallaActividades({ ...b, errorStatus: 403, hayError: true })).toBe('sinPermiso');
    expect(estadoPantallaActividades({ ...b, hayError: true, mostradas: 3 })).toBe('listo');
  });

  it('propias vs ajenas: solo lo editable se duplica; las tareas no tienen ruta de edición', () => {
    expect(rutaEntrada(ENTRADA)).toBe('/api/crm/activities/a1');
    expect(rutaEntrada({ fuente: 'note', id: 'n1' })).toBe('/api/crm/notes/n1');
    expect(rutaEntrada({ fuente: 'task', id: 't1' })).toBeNull();
    expect(cuerpoDuplicado({ ...ENTRADA, editable: false })).toBeNull();
    const dup = cuerpoDuplicado(ENTRADA);
    expect(dup?.ruta).toBe('/api/crm/activities');
    expect(dup?.cuerpo).toMatchObject({ activity_type: 'call', related_type: 'opportunity', related_id: 'o1', metadata: { duplicada_de: 'a1', direction: 'outbound' } });
    expect(cuerpoDuplicado({ ...ENTRADA, fuente: 'note', tipo: 'note', oportunidad: null })).toEqual({ ruta: '/api/crm/notes', cuerpo: { related_type: 'customer', related_id: 'c1', body: 'Pide cotización', is_pinned: false } });
    expect(cuerpoEdicionEntrada({ fuente: 'note' }, { texto: 'x', fijada: true })).toEqual({ body: 'x', is_pinned: true });
    expect(cuerpoEdicionEntrada({ fuente: 'activity' }, { texto: '  ', outcome: 'voicemail' })).toEqual({ notes: null, outcome: 'voicemail' });
    expect(csvActividades([ENTRADA], ['Fecha'], () => '2026-09-23 09:40').split('\n')[1]).toContain('2026-09-23 09:40,call,Pide cotización,answered,252');
  });
});

describe('Acciones rápidas · cuerpos de las rutas del servidor', () => {
  const destino = { clienteId: 'c1', clienteNombre: 'Ana Gómez', oportunidadId: 'o1', oportunidadNombre: 'Uniformes' };

  it('llamada → /api/crm/activities y seguimiento → /api/crm/tasks a las 10:00 de la organización', () => {
    const d = datosLlamada({ direccion: 'outbound', resultado: 'answered', duracion: '4:12', fechaHora: '2026-09-23T09:40', notas: 'Pide cotización', crearSeguimiento: true, fechaSeguimiento: '2026-09-24' }, destino, BOG);
    expect(cuerpoLlamada(d)).toMatchObject({ activity_type: 'call', related_type: 'opportunity', related_id: 'o1', outcome: 'answered', duration_seconds: 252 });
    expect(ms(cuerpoLlamada(d).occurred_at)).toBe(Date.parse('2026-09-23T14:40:00Z'));
    const seg = cuerpoSeguimiento(d, destino, BOG, 'Seguimiento');
    expect(seg).toMatchObject({ related_to_type: 'opportunity', related_to_id: 'o1', title: 'Seguimiento', description: 'Pide cotización' });
    expect(ms(seg?.due_date)).toBe(Date.parse('2026-09-24T15:00:00Z'));
    expect(cuerpoSeguimiento({ ...d, seguimiento: null }, destino, BOG, 'x')).toBeNull();
  });

  it('reunión: solo los correos se invitan; nota y tarea al cliente u oportunidad', () => {
    const r = datosReunion({ titulo: 'Demo', dia: '2026-09-24', hora: '10:00', duracionMin: 60, participantes: ['ana@correo.co', 'Ana Gómez'], lugar: '' }, destino, BOG);
    expect(cuerpoReunion(r)).toMatchObject({ title: 'Demo', opportunity_id: 'o1', attendees: ['ana@correo.co'] });
    expect(ms(cuerpoReunion(r).start_at)).toBe(Date.parse('2026-09-24T15:00:00Z'));
    expect(cuerpoNota(datosNota({ cuerpo: ' hola ', fijar: true }, { ...destino, oportunidadId: null }))).toEqual({ related_type: 'customer', related_id: 'c1', body: 'hola', is_pinned: true });
    const t = cuerpoTarea({ titulo: ' Enviar ', descripcion: '', fecha: '2026-09-24', hora: '17:00', prioridad: 'high' }, destino, BOG);
    expect(t).toMatchObject({ related_to_type: 'opportunity', related_to_id: 'o1', title: 'Enviar', description: null, priority: 'high' });
    expect(ms(t.due_date)).toBe(Date.parse('2026-09-24T22:00:00Z'));
    expect(validarTarea({ titulo: '', descripcion: '', fecha: '2026-09-01', hora: '10:00', prioridad: 'med' }, '2026-09-23')).toEqual({ titulo: 'obligatorio', fecha: 'fechaPasada' });
  });

  it('modos de llamada con motivo y la barra vieja en el kit', () => {
    expect(motivoModo('browser', { telefono: null, softphoneListo: true })).toBe('sinTelefono');
    expect(motivoModo('browser', { telefono: '+57300', softphoneListo: false })).toBe('softphone');
    expect(motivoModo('mobile', { telefono: '+57300', softphoneListo: false })).toBeNull();
    expect(motivoModo('ai', { telefono: '+57300', softphoneListo: true })).toBe('agente');
    expect(motivoModo('registrar', { telefono: null, softphoneListo: false })).toBeNull();
    expect(ordenModos('mobile')[0]).toBe('mobile');
    expect(ordenModos(null).at(-1)).toBe('registrar');
    expect([varianteDesdeLegado('card'), varianteDesdeLegado('detail'), varianteDesdeLegado('drawer')]).toEqual(['tarjeta', 'detalle', 'drawer']);
  });

  it('catálogos: ventas por defecto primero, etapas por pipeline, permisos que faltan = no', () => {
    const c = catalogoDesdeRespuestas(
      { usuario_id: 'u1', permisos: { 'crm.leads.view': true } },
      [
        { id: 'p2', name: 'Onboarding', pipeline_type: 'onboarding', is_default: true, stages: [] },
        { id: 'p1', name: 'Ventas', pipeline_type: 'sales', is_default: true, stages: [{ id: 's1', name: 'Nuevo', position: 1, probability: 10 }] },
      ],
      [{ id: 'u2', name: null, email: 'b@x.co' }, { id: 'u1', name: 'Ana', email: null }],
    );
    expect(c.pipelines.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(c.etapas).toEqual([{ id: 's1', pipeline_id: 'p1', name: 'Nuevo', position: 1, probability: 10, is_won: undefined, is_lost: undefined }]);
    expect(c.usuarios.map((u) => u.nombre)).toEqual(['Ana', 'b@x.co']);
    expect(puede(c.permisos, 'crm.leads.view')).toBe(true);
    expect(puede(c.permisos, 'crm.leads.assign')).toBe(false);
    expect(nombreUsuario(c.usuarios, 'u1')).toBe('Ana');
  });

  it('errores de las rutas → mensaje', () => {
    expect(claveError(new ErrorApiCrm(403, 'CRM_FORBIDDEN', 'x'))).toBe('sinPermiso');
    expect(claveError(new ErrorApiCrm(409, 'sin_embudo_ventas', 'x'))).toBe('sinEmbudo');
    expect(claveError(new ErrorApiCrm(409, 'otro', 'x'))).toBe('conflicto');
    expect(claveError(new ErrorApiCrm(0, 'red', 'x'))).toBe('red');
    expect(claveError(new Error('x'))).toBe('generico');
  });
});
