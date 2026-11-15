/**
 * Fila 4 · Campañas (Figma CRM 1395:17 listado, 1395:1065 / 1402:17 /
 * 1402:821 asistente): lógica pura de las celdas de la lista y del asistente.
 */
import { progresoFila, resultadoFila } from '../campanasListaLogica';
import {
  audienciaCompleta,
  disponibilidadCanales,
  partirFechaHoraLocal,
  plantillaCompleta,
  requisitosActivar,
  requisitosEnRojo,
  rutaAsistenteVoz,
} from '../nuevo/asistenteCampanaLogica';
import type { CampanaUnificada } from '@/lib/services/crm/campaignsUnificadasLogica';

const base: CampanaUnificada = {
  id: 'c1',
  name: 'Prueba',
  source: 'message',
  channel: 'whatsapp',
  status: 'sending',
  emergencyStop: false,
  stoppedReason: null,
  segmentName: null,
  contentName: null,
  scheduledAt: null,
  createdAt: '2026-11-01T10:00:00-05:00',
  progress: { done: 0, total: 0, pct: 0 },
  result: {},
};

describe('celda Progreso', () => {
  it('en marcha muestra hechos de total', () => {
    expect(progresoFila({ ...base, progress: { done: 1484, total: 3905, pct: 38 } })).toEqual({ modo: 'conteo', hechos: 1484, total: 3905, pct: 38 });
  });
  it('programada muestra cuándo sale', () => {
    expect(progresoFila({ ...base, status: 'scheduled', scheduledAt: '2026-11-16T09:00:00-05:00', progress: { done: 0, total: 640, pct: 0 } })).toEqual({ modo: 'programada', fecha: '2026-11-16T09:00:00-05:00', pct: 0 });
  });
  it('mensajes enviados muestran cuántos salieron', () => {
    expect(progresoFila({ ...base, status: 'sent', progress: { done: 2110, total: 2110, pct: 100 } })).toEqual({ modo: 'enviados', enviados: 2110, pct: 100 });
  });
  it('borrador: sin programar y 0 %', () => {
    expect(progresoFila({ ...base, status: 'draft', progress: { done: 3, total: 9, pct: 33 } })).toEqual({ modo: 'sinProgramar', pct: 0 });
    expect(progresoFila({ ...base, source: 'voice', status: 'draft' })).toEqual({ modo: 'sinProgramar', pct: 0 });
  });
});

describe('celda Resultado', () => {
  it('sin audiencia es «—»', () => {
    expect(resultadoFila(base)).toEqual({ modo: 'vacio' });
  });
  it('voz: contacto efectivo sobre las llamadas hechas', () => {
    expect(resultadoFila({ ...base, source: 'voice', channel: 'voice', status: 'running', progress: { done: 100, total: 300, pct: 33 }, result: { completed: 22, failed: 5, active: 3 } })).toEqual({ modo: 'voz', pctEfectivo: 22, enCurso: 3 });
  });
  it('mensajes sin salir: destinatarios con consentimiento', () => {
    expect(resultadoFila({ ...base, status: 'scheduled', progress: { done: 0, total: 640, pct: 0 } })).toEqual({ modo: 'destinatarios', n: 640 });
  });
  it('correo enviado: apertura y respuesta sobre los enviados', () => {
    expect(resultadoFila({ ...base, channel: 'email', status: 'sent', progress: { done: 2110, total: 2110, pct: 100 }, result: { sent: 2000, read: 820, replied: 124 } })).toEqual({ modo: 'interaccion', canal: 'email', pctLectura: 41, pctRespuesta: 6 });
  });
});

describe('asistente · canales', () => {
  it('voz necesita un agente; WhatsApp un número activo; correo aún no se elige', () => {
    const d = disponibilidadCanales({ agentesVoz: 0, canalesWhatsappActivos: 1 });
    expect(d.voice).toEqual({ habilitado: false, motivo: 'sinAgenteVoz', configurable: true });
    expect(d.whatsapp.habilitado).toBe(true);
    expect(d.email).toEqual({ habilitado: false, motivo: 'correoSinMotor', configurable: false });
    expect(disponibilidadCanales({ agentesVoz: null, canalesWhatsappActivos: null }).voice.motivo).toBe('cargando');
  });
  it('el paso 1 exige nombre, segmento y un canal habilitado', () => {
    const d = disponibilidadCanales({ agentesVoz: 2, canalesWhatsappActivos: 0 });
    expect(audienciaCompleta({ nombre: 'X', segmentId: 's', canal: 'voice' }, d)).toBe(true);
    expect(audienciaCompleta({ nombre: ' ', segmentId: 's', canal: 'voice' }, d)).toBe(false);
    expect(audienciaCompleta({ nombre: 'X', segmentId: 's', canal: 'whatsapp' }, d)).toBe(false);
  });
  it('la voz sigue en su asistente con segmento y nombre', () => {
    expect(rutaAsistenteVoz({ segmentId: 'a b', nombre: ' Reactivación ' })).toBe('/app/crm/campanas/voz/nueva?segment=a+b&nombre=Reactivaci%C3%B3n');
    expect(rutaAsistenteVoz({ segmentId: null, nombre: '' })).toBe('/app/crm/campanas/voz/nueva');
  });
});

describe('asistente · plantilla y requisitos', () => {
  it('la plantilla debe estar aprobada', () => {
    expect(plantillaCompleta({ canalId: 'c', plantillaId: 't', estadoMeta: 'APPROVED', variablesFaltantes: [] })).toBe(true);
    expect(plantillaCompleta({ canalId: 'c', plantillaId: 't', estadoMeta: 'PENDING', variablesFaltantes: [] })).toBe(false);
  });
  it('consentimiento solo si es marketing; cuenta los rojos', () => {
    const r = requisitosActivar({ plantillaAprobada: true, variablesFaltantes: 0, marketing: true, consentimiento: false, pendientes: null });
    expect(r.map((x) => x.clave)).toEqual(['plantillaAprobada', 'variables', 'consentimiento', 'audiencia']);
    expect(requisitosEnRojo(r)).toBe(2);
    expect(requisitosActivar({ plantillaAprobada: true, variablesFaltantes: 0, marketing: false, consentimiento: false, pendientes: 10 }).every((x) => x.ok)).toBe(true);
  });
  it('fecha y hora del input local se parten para la zona de la organización', () => {
    expect(partirFechaHoraLocal('2026-11-20T09:30')).toEqual({ fecha: '2026-11-20', hora: '09:30' });
    expect(partirFechaHoraLocal('')).toBeNull();
  });
});
