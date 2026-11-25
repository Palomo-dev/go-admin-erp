/**
 * Clientes › Facturación electrónica (Figma «06 Clientes» 3192-19436; decisiones del dueño
 * 2026-11-25): DV automático, una sola validación del correo de factura, IVA 48/49 guardado como
 * código del RUT y traducido a tributo en el payload de Factus, estado de la tarjeta, revisión del
 * pedido web y el aviso de la empresa marcada 49 que cobra IVA.
 */
import {
  RESPONSABILIDADES_DIAN_FE,
  conResponsabilidadIva,
  dvAutomatico,
  erroresFacturacion,
  estadoFacturacion,
  etiquetaDocumento,
  leerRevision,
  pedidoPorRevisar,
  responsabilidadIvaDe,
  responsabilidadesParaDian,
  rutNoResponsableConIva,
  tributoDianCliente,
  tributoIdDeIva,
  urlUnificarFichas,
  validarCorreoFactura,
} from '@/lib/clientes/facturacionElectronica';
import { calcularDv } from '@/lib/utils/nitDv';
import { mapearCliente } from '@/lib/services/einvoicing/payloadsFactus';
import { buildCustomerInsert, emptyCustomerValues } from '@/lib/services/customers/customerPayload';

describe('DV automático', () => {
  it('solo para NIT y con el mismo cálculo de nitDv', () => {
    expect(dvAutomatico('nit', '901334221')).toBe(calcularDv('901334221'));
    expect(dvAutomatico('tax_id', '900.123.456')).toBe(calcularDv('900123456'));
    expect(dvAutomatico('cc', '1020456789')).toBeNull();
    expect(dvAutomatico('nit', '')).toBeNull();
  });
});

describe('correo de factura: una sola validación', () => {
  it('vacío, válido o inválido', () => {
    expect(validarCorreoFactura('')).toBe('vacio');
    expect(validarCorreoFactura('   ')).toBe('vacio');
    expect(validarCorreoFactura('facturas@empresa.co')).toBe('valido');
    expect(validarCorreoFactura('facturas@andina')).toBe('invalido');
    expect(validarCorreoFactura('con espacio@empresa.co')).toBe('invalido');
  });
});

describe('IVA 48 / 49', () => {
  it('se lee del RUT; sin 48 ni 49 no hay respuesta (el usuario debe escoger)', () => {
    expect(responsabilidadIvaDe(['O-13', 'O-48'])).toBe('48');
    expect(responsabilidadIvaDe(['O-49'])).toBe('49');
    expect(responsabilidadIvaDe(['R-99-PN'])).toBeNull();
    expect(responsabilidadIvaDe(null)).toBeNull();
  });

  it('guardar 48 quita 49 y R-99-PN; guardar 49 quita 48 y conserva lo demás', () => {
    expect(conResponsabilidadIva(['O-13', 'O-49', 'R-99-PN'], '48')).toEqual(['O-13', 'O-48']);
    expect(conResponsabilidadIva(['O-15', 'O-48'], '49')).toEqual(['O-15', 'O-49']);
    expect(conResponsabilidadIva(['R-99-PN'], '49')).toEqual(['R-99-PN', 'O-49']);
  });

  it('48 → tributo IVA (01, id 18); 49 → no aplica (ZZ, id 21)', () => {
    expect(tributoIdDeIva('48')).toBe(18);
    expect(tributoIdDeIva('49')).toBe(21);
    expect(tributoDianCliente(['O-48'])).toBe('01');
    expect(tributoDianCliente(['O-49'])).toBe('ZZ');
    expect(tributoDianCliente(['O-13'])).toBeNull();
  });

  it('hacia la DIAN 48/49 no viajan como responsabilidad; sin ninguna, R-99-PN', () => {
    expect(responsabilidadesParaDian(['O-13', 'O-48'])).toEqual(['O-13']);
    expect(responsabilidadesParaDian(['O-49'])).toEqual(['R-99-PN']);
    expect(responsabilidadesParaDian([])).toEqual(['R-99-PN']);
  });

  it('el payload de Factus usa el RUT por encima de tribute_id (una sola función)', () => {
    const responsable = mapearCliente(
      { identification_type: 'nit', identification_number: '901334221', dv: 3, customer_type: 'company', company_name: 'Empresa de prueba', tribute_id: 21, fiscal_responsibilities: ['O-13', 'O-48'] },
      '05001',
    );
    expect(responsable).toMatchObject({ tribute_code: '01', responsibilities: ['O-13'] });
    const noResponsable = mapearCliente(
      { identification_type: 'cc', identification_number: '1020456789', first_name: 'Ana', last_name: 'Pérez', tribute_id: 18, fiscal_responsibilities: ['O-49'] },
      '11001',
    );
    expect(noResponsable).toMatchObject({ tribute_code: 'ZZ', responsibilities: ['R-99-PN'] });
  });
});

describe('Factus: responsabilidad de IVA confirmada por el Contador (2026-11-25)', () => {
  // Anexo técnico 1.9 (Res. DIAN 000165 de 2023): 01 si responsable, ZZ si no; responsabilidades
  // solo O-13, O-15, O-23, O-47 y R-99-PN. En el perfil se sigue mostrando 48/49.
  it('las únicas responsabilidades que viajan son O-13, O-15, O-23, O-47 y R-99-PN', () => {
    expect([...RESPONSABILIDADES_DIAN_FE].sort()).toEqual(['O-13', 'O-15', 'O-23', 'O-47', 'R-99-PN']);
    expect(responsabilidadesParaDian(['O-13', 'O-15', 'O-23', 'O-47'])).toEqual(['O-13', 'O-15', 'O-23', 'O-47']);
    expect(responsabilidadesParaDian(['R-99-PN'])).toEqual(['R-99-PN']);
    // Códigos viejos o desconocidos no viajan; sin ninguna válida, R-99-PN.
    expect(responsabilidadesParaDian(['O-05', 'O-07', 'O-48'])).toEqual(['R-99-PN']);
  });

  it('O-48 / O-49 nunca como responsabilidad: solo como tributo 01 / ZZ, y el perfil sigue en 48/49', () => {
    const casos: Array<{ resps: string[]; tributo: '01' | 'ZZ'; iva: '48' | '49' }> = [
      { resps: ['O-48'], tributo: '01', iva: '48' },
      { resps: ['O-13', 'O-15', 'O-48'], tributo: '01', iva: '48' },
      { resps: ['O-23', 'O-47', 'O-48'], tributo: '01', iva: '48' },
      { resps: ['O-49'], tributo: 'ZZ', iva: '49' },
      { resps: ['O-49', 'R-99-PN'], tributo: 'ZZ', iva: '49' },
      { resps: ['O-47', 'O-49'], tributo: 'ZZ', iva: '49' },
    ];
    for (const c of casos) {
      // Tributo contrario en la ficha: manda el RUT.
      const tributeId = c.tributo === '01' ? 21 : 18;
      const doc = mapearCliente(
        { identification_type: 'cc', identification_number: '1020456789', first_name: 'Ana', last_name: 'Pérez', tribute_id: tributeId, fiscal_responsibilities: c.resps },
        '11001',
      );
      expect(doc.tribute_code).toBe(c.tributo);
      const resps = doc.responsibilities ?? [];
      expect(resps).not.toContain('O-48');
      expect(resps).not.toContain('O-49');
      expect(resps.every((r) => RESPONSABILIDADES_DIAN_FE.includes(r))).toBe(true);
      expect(resps.length).toBeGreaterThan(0);
      // El perfil del cliente (TarjetaFacturacionCliente) sigue leyendo 48/49 de la ficha.
      expect(responsabilidadIvaDe(c.resps)).toBe(c.iva);
    }
  });

  it('consumidor final: ZZ y R-99-PN', () => {
    expect(mapearCliente(null, '11001')).toMatchObject({ tribute_code: 'ZZ', responsibilities: ['R-99-PN'] });
  });
});

describe('empresa que factura marcada 49 con IVA', () => {
  it('avisa solo si el RUT dice 49 y hay IVA con tarifa', () => {
    expect(rutNoResponsableConIva(['O-49'], [{ tax_rate: 19, tax_code: 'IVA_19' }])).toBe(true);
    expect(rutNoResponsableConIva(['O-49'], [{ tax_rate: 19, tax_code: '01' }])).toBe(true);
    expect(rutNoResponsableConIva(['O-49'], [{ tax_rate: 0, tax_code: null }])).toBe(false);
    expect(rutNoResponsableConIva(['O-49'], [{ tax_rate: 8, tax_code: 'INC_8' }])).toBe(false);
    expect(rutNoResponsableConIva(['O-48'], [{ tax_rate: 19, tax_code: 'IVA_19' }])).toBe(false);
    expect(rutNoResponsableConIva(null, [{ tax_rate: 19 }])).toBe(false);
  });
});

describe('documento y estado de la tarjeta', () => {
  it('etiqueta con puntos y DV solo en NIT', () => {
    expect(etiquetaDocumento({ identification_type: 'nit', identification_number: '901334221', dv: 3 })).toBe('NIT 901.334.221-3');
    expect(etiquetaDocumento({ identification_type: 'cc', identification_number: '1020456789', dv: 5 })).toBe('CC 1.020.456.789');
    expect(etiquetaDocumento({ identification_type: 'passport', identification_number: 'AB123' })).toBe('PA AB123');
    expect(etiquetaDocumento({ identification_number: '' })).toBe('');
  });

  it('vacía sin documento; incompleta sin municipio o IVA de empresa; falta correo; completa', () => {
    const base = { customer_type: 'company', identification_type: 'nit', identification_number: '901334221', dv: 3, company_name: 'Empresa', fiscal_municipality_id: 'm1', fiscal_responsibilities: ['O-48'] };
    expect(estadoFacturacion({ ...base, identification_number: '' })).toBe('vacia');
    expect(estadoFacturacion({ ...base, fiscal_municipality_id: null })).toBe('incompleta');
    expect(estadoFacturacion({ ...base, fiscal_responsibilities: ['O-13'] })).toBe('incompleta');
    expect(estadoFacturacion(base)).toBe('faltaCorreo');
    expect(estadoFacturacion({ ...base, billing_email: 'facturas@empresa.co' })).toBe('completa');
  });
});

describe('validación del diálogo', () => {
  const ok = { tipoPersona: 'company' as const, tipoDocumento: 'nit', numero: '901334221', razonSocial: 'Empresa', nombres: '', apellidos: '', correoFactura: '', municipioId: 'm1', iva: '48' as const };
  it('sin errores con los obligatorios; IVA sin escoger es error', () => {
    expect(erroresFacturacion(ok)).toEqual([]);
    expect(erroresFacturacion({ ...ok, iva: null })).toEqual(['iva']);
  });
  it('correo inválido, NIT corto y persona sin apellidos', () => {
    expect(erroresFacturacion({ ...ok, correoFactura: 'facturas@andina' })).toEqual(['correo']);
    expect(erroresFacturacion({ ...ok, numero: '123' })).toEqual(['numero']);
    expect(erroresFacturacion({ ...ok, tipoPersona: 'person', tipoDocumento: 'cc', numero: '1020456789', nombres: 'Ana' })).toEqual(['apellidos']);
  });
});

describe('revisión del pedido web (billing_data.revision)', () => {
  it('por revisar mientras no haya revisión; se lee lo que dejó la base', () => {
    expect(pedidoPorRevisar({ perfil: 'distinto' })).toBe(true);
    expect(pedidoPorRevisar({ perfil: 'duplicado' })).toBe(true);
    expect(pedidoPorRevisar({ perfil: 'guardado' })).toBe(false);
    const revisado = { perfil: 'distinto', revision: { decision: 'usar', por: 'u1', por_nombre: 'Ana', en: '2026-11-25T12:00:00Z', documento_ficha_antes: 'CC 1' } };
    expect(pedidoPorRevisar(revisado)).toBe(false);
    expect(leerRevision(revisado)).toEqual({ decision: 'usar', por: 'u1', porNombre: 'Ana', en: '2026-11-25T12:00:00Z', documentoFichaAntes: 'CC 1' });
    expect(leerRevision({ revision: { decision: 'otra' } })).toBeNull();
  });

  it('unificar lleva a CRM › Identidades solo con ids', () => {
    expect(urlUnificarFichas('a', 'b')).toBe('/app/crm/identidades/comparar?ids=a,b');
  });
});

describe('alta de cliente con correo de factura', () => {
  it('buildCustomerInsert lo guarda normalizado y no agrega la columna si está vacío', () => {
    const v = { ...emptyCustomerValues(), firstName: 'Ana', lastName: 'Pérez', billingEmail: ' Facturas@Empresa.co ' };
    expect(buildCustomerInsert(v, { organizationId: 1, branchId: null }).billing_email).toBe('facturas@empresa.co');
    expect('billing_email' in buildCustomerInsert(emptyCustomerValues(), { organizationId: 1, branchId: null })).toBe(false);
  });
});
