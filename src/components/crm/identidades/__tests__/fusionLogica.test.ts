/// <reference types="jest" />
/**
 * Lógica pura de Identidades (Figma CRM 1436:19, 1436:843123, 1436:843665):
 * filas de la comparación, elecciones → `choices` de la RPC, motivo, estado de
 * «Deshacer» y conteos de la lista.
 */
import { GRUPOS_COMPARACION, estadoDeshacer, idsConDependientes, type ClienteDuplicado, type GrupoDuplicados } from '@/lib/services/crm/customerMergeLogica';
import {
  choicesDesdeGrupos,
  claveMismo,
  confianzaGrupo,
  conteoPorTipo,
  eleccionesGrupoIniciales,
  grupoIgual,
  gruposVisibles,
  leerIdsComparar,
  motivoComparacion,
  nombreSecundarioCliente,
  urlComparar,
  valorGrupo,
} from '../fusionLogica';

const c = (id: string, extra: Partial<ClienteDuplicado> = {}): ClienteDuplicado => ({
  id,
  full_name: null,
  first_name: null,
  last_name: null,
  email: null,
  phone: null,
  company_name: null,
  trade_name: null,
  identification_type: null,
  identification_number: null,
  address: null,
  city: null,
  created_at: '2026-01-01T00:00:00Z',
  conversations_count: 0,
  opportunities_count: 0,
  ...extra,
});
const g = (id: string) => GRUPOS_COMPARACION.find((x) => x.id === id)!;

const P = c('p', { company_name: 'Ferretería El Tornillo S.A.S.', identification_type: 'NIT', identification_number: '900.555.123-4', first_name: 'Laura', last_name: 'Gómez', phone: '+57 310 555 0142', email: 'compras@eltornillo.co', address: 'Cra. 52 #45-10', city: 'Medellín', opportunities_count: 3 });
const S = c('s', { company_name: 'Ferreteria el Tornillo', identification_type: 'NIT', identification_number: '900.555.123-4', first_name: 'Laura', last_name: 'G.', phone: '+57 310 555 0142' });

describe('comparación por filas', () => {
  it('textos de fila: contacto y dirección juntan sus campos; el documento solo el número', () => {
    expect(valorGrupo(P, g('contacto'))).toBe('Laura Gómez');
    expect(valorGrupo(P, g('direccion'))).toBe('Cra. 52 #45-10, Medellín');
    expect(valorGrupo(P, g('documento'))).toBe('900.555.123-4');
    expect(valorGrupo(S, g('direccion'))).toBe('');
  });

  it('iguales: NIT y teléfono; el correo sin distinguir mayúsculas', () => {
    expect(grupoIgual(P, S, g('documento'))).toBe(true);
    expect(grupoIgual(P, S, g('telefono'))).toBe(true);
    expect(grupoIgual(P, S, g('contacto'))).toBe(false);
    expect(grupoIgual(c('a', { email: 'A@x.co ' }), c('b', { email: 'a@x.co' }), g('correo'))).toBe(true);
  });

  it('el nombre comercial solo aparece si alguno lo tiene', () => {
    expect(gruposVisibles(P, S).map((x) => x.id)).not.toContain('nombreComercial');
    expect(gruposVisibles(P, c('x', { trade_name: 'Tornillos' })).map((x) => x.id)).toContain('nombreComercial');
  });

  it('por defecto gana el principal; si está vacío y el secundario no, el secundario; los iguales no se eligen', () => {
    const e = eleccionesGrupoIniciales(S, P);
    expect(e.razonSocial).toBe('principal');
    expect(e.correo).toBe('secundario');
    expect(e.direccion).toBe('secundario');
    expect(e).not.toHaveProperty('documento');
    expect(e).not.toHaveProperty('telefono');
  });

  it('choices: solo los campos de las filas tomadas del secundario, todos los de la fila', () => {
    expect(choicesDesdeGrupos({ razonSocial: 'principal', contacto: 'secundario', direccion: 'secundario' }, 's')).toEqual({ first_name: 's', last_name: 's', address: 's', city: 's' });
    expect(choicesDesdeGrupos({ razonSocial: 'principal' }, 's')).toEqual({});
  });

  it('motivo en el orden de la detección: documento (NIT), correo, teléfono por 8 dígitos', () => {
    expect(motivoComparacion(P, S)).toEqual({ clave: 'nit', valor: '900.555.123-4' });
    expect(motivoComparacion(c('a', { email: 'X@y.co' }), c('b', { email: 'x@y.co' }))).toEqual({ clave: 'email', valor: 'X@y.co' });
    expect(motivoComparacion(c('a', { phone: '+57 310 555 0142' }), c('b', { phone: '3105550142' }))?.clave).toBe('phone');
    expect(motivoComparacion(c('a'), c('b'))).toBeNull();
  });
});

describe('lista de duplicados', () => {
  const grupo = (tipo: GrupoDuplicados['identity_type'], clientes: ClienteDuplicado[]): GrupoDuplicados => ({ identity_type: tipo, identity_value: 'v', customers: clientes });

  it('confianza, conteo por tipo y «Mismo NIT»', () => {
    expect(confianzaGrupo({ identity_type: 'document' })).toBe('alta');
    expect(confianzaGrupo({ identity_type: 'phone' })).toBe('media');
    expect(conteoPorTipo([{ identity_type: 'phone' }, { identity_type: 'phone' }, { identity_type: 'email' }])).toEqual({ phone: 2, email: 1, document: 0 });
    expect(claveMismo(grupo('document', [P, S]))).toBe('nit');
    expect(claveMismo(grupo('document', [c('a', { identification_type: 'CC' })]))).toBe('document');
    expect(claveMismo(grupo('email', [P]))).toBe('email');
  });

  it('la URL de comparar lleva solo ids, con el principal sugerido primero', () => {
    const url = urlComparar(grupo('phone', [S, P]));
    expect(url).toBe('/app/crm/identidades/comparar?ids=p,s');
    expect(url).not.toContain('0142');
    expect(leerIdsComparar('a, b,,a')).toEqual(['a', 'b']);
  });

  it('segundo nombre de la tarjeta: el contacto si el nombre principal es la empresa', () => {
    expect(nombreSecundarioCliente({ full_name: 'Laura Gómez', company_name: 'Ferretería', trade_name: null })).toBe('Ferretería');
    expect(nombreSecundarioCliente({ full_name: null, company_name: 'Ferretería', trade_name: null })).toBeNull();
  });
});

describe('deshacer', () => {
  const ahora = Date.parse('2026-11-15T12:00:00Z');
  const f = (dias: number, undone: string | null = null) => ({ id: 'm', merged_at: new Date(ahora - dias * 86_400_000).toISOString(), undone_at: undone });

  it('deshecha, vencida a los 30 días, dependiente, y solo administrador', () => {
    expect(estadoDeshacer(f(1, '2026-11-14T00:00:00Z'), new Set(), true, ahora)).toBe('deshecha');
    expect(estadoDeshacer(f(31), new Set(), true, ahora)).toBe('vencida');
    expect(estadoDeshacer(f(1), new Set(['m']), true, ahora)).toBe('dependiente');
    expect(estadoDeshacer(f(1), new Set(), false, ahora)).toBe('soloAdministrador');
    expect(estadoDeshacer(f(29), new Set(), true, ahora)).toBe('deshacible');
  });

  it('solo cuentan las dependencias de fusiones activas', () => {
    expect([...idsConDependientes([{ undone_at: null, depends_on: ['a'] }, { undone_at: 'x', depends_on: ['b'] }, { undone_at: null, depends_on: null }])]).toEqual(['a']);
  });
});
