/**
 * Campos del importador de leads y reconocimiento de columnas por alias.
 *
 * La regla de reconocimiento es la genérica (`@/lib/importacion/mapeoColumnas`,
 * la misma del importador de productos). Los alias cubren los encabezados de un
 * libro de prospección típico (tanda con `nombre_comercial`, `razon_social_rues`,
 * `nit_rues`, `telefono_e164`, `correo_publicado`, `valor_anual_usd`,
 * `fuente_*_url`, `rne_crc`…) y variantes comunes en es/en/fr/pt, además de las
 * cabeceras de la plantilla en los cuatro idiomas de la interfaz
 * (`leadsImportar.cabeceras` de messages/*.json; lo comprueba el test).
 *
 * Todos los alias se escriben YA normalizados con `normalizarCabecera`
 * («Teléfono E.164» → «telefonoe164»).
 */

import {
  autoMapearCon,
  encontrarFilaCabeceraCon,
  reasignarColumnaCon,
  type DefinicionColumna,
  type MapeoDe,
} from '@/lib/importacion/mapeoColumnas';
import { normalizarCabecera } from '@/lib/inventario/importacion/texto';

export type CampoLead =
  | 'idExterno'
  | 'prioridad'
  | 'nombre'
  | 'razonSocial'
  | 'contacto'
  | 'nit'
  | 'dv'
  | 'telefono'
  | 'tipoTelefono'
  | 'correo'
  | 'web'
  | 'direccion'
  | 'barrio'
  | 'ciudad'
  | 'departamento'
  | 'zona'
  | 'sector'
  | 'subsector'
  | 'plan'
  | 'valor'
  | 'verificacion'
  | 'fechaVerificacion'
  | 'fuente'
  | 'horario'
  | 'notas'
  | 'etiquetas'
  | 'rne'
  | 'pais'
  | 'cargo'
  | 'etapa'
  | 'fecha'
  | 'telefonoAdicional'
  | 'correoAdicional'
  | 'adicional';

/**
 * Campos que admiten varias columnas (sus valores se juntan en una lista).
 * `adicional` es el destino de toda columna que no casa con un campo: se
 * guarda tal cual, con su encabezado, en `metadata.importacion.adicionales`
 * y se muestra en la ficha. Antes esas columnas quedaban en «No importar» y
 * se perdían sin aviso aunque el asistente las mostrara en el mapeo.
 */
export type CampoMultiple = 'fuente' | 'etiquetas' | 'telefonoAdicional' | 'correoAdicional' | 'adicional';
export type CampoSimple = Exclude<CampoLead, CampoMultiple>;

export type DefinicionCampoLead = DefinicionColumna<CampoLead>;

/**
 * Orden = orden de la plantilla. Si dos columnas nombran el mismo campo simple
 * gana la primera: en un libro con `telefono_e164` y `telefono`, la E.164.
 */
export const CAMPOS_LEAD: readonly DefinicionCampoLead[] = [
  { campo: 'idExterno', alias: ['id', 'idexterno', 'idexterne', 'externalid', 'codigo', 'codigoexterno', 'code', 'ref', 'referencia', 'identifiant', 'codigointerno'] },
  { campo: 'prioridad', alias: ['prioridad', 'priority', 'prioridade', 'priorite', 'banda', 'icp', 'bandaicp'] },
  {
    campo: 'nombre',
    obligatorio: true,
    alias: ['nombrecomercial', 'nombre', 'nombredelnegocio', 'negocio', 'empresa', 'establecimiento', 'comercio', 'tradename', 'businessname', 'company', 'business', 'name', 'nomecomercial', 'nomcommercial', 'nome', 'nom', 'entreprise', 'lead'],
  },
  { campo: 'razonSocial', alias: ['razonsocial', 'razonsocialrues', 'legalname', 'companyname', 'razaosocial', 'raisonsociale', 'denominacionsocial'] },
  { campo: 'contacto', alias: ['contacto', 'nombrecontacto', 'personacontacto', 'responsable', 'contactname', 'contact', 'contato', 'nomducontact'] },
  { campo: 'nit', alias: ['nit', 'nitrues', 'rut', 'taxid', 'numerofiscal', 'numeroidentificacion', 'identificacion', 'documento', 'nif', 'cnpj', 'siret', 'vat'] },
  { campo: 'dv', alias: ['dv', 'digitoverificacion', 'digitodeverificacion', 'checkdigit'] },
  {
    campo: 'telefono',
    alias: ['telefonoe164', 'telefono', 'celular', 'movil', 'telefonocelular', 'whatsapp', 'tel', 'phone', 'phonenumber', 'mobile', 'cellphone', 'telephone', 'telefone', 'numero', 'numerotelefono'],
  },
  { campo: 'tipoTelefono', alias: ['tipotelefono', 'tipodetelefono', 'phonetype', 'tipodetelefone', 'typedetelephone'] },
  { campo: 'correo', alias: ['correo', 'correopublicado', 'correoelectronico', 'email', 'mail', 'emailaddress', 'courriel', 'eletronico', 'emailpublicado'] },
  { campo: 'web', alias: ['web', 'sitioweb', 'paginaweb', 'website', 'site', 'siteweb', 'url', 'pagina'] },
  { campo: 'direccion', alias: ['direccion', 'address', 'domicilio', 'endereco', 'adresse', 'direccionfisica'] },
  { campo: 'barrio', alias: ['barrio', 'neighborhood', 'bairro', 'quartier', 'localidad', 'comuna'] },
  { campo: 'ciudad', alias: ['ciudad', 'city', 'municipio', 'cidade', 'ville', 'poblacion'] },
  { campo: 'departamento', alias: ['departamento', 'state', 'provincia', 'region', 'regiao', 'estadoregion', 'province'] },
  { campo: 'zona', alias: ['zona', 'zone', 'area', 'territorio', 'territory'] },
  { campo: 'sector', alias: ['sector', 'industria', 'industry', 'rubro', 'vertical', 'segmento', 'setor', 'secteur'] },
  { campo: 'subsector', alias: ['subsector', 'subcategoria', 'categoria', 'tiponegocio', 'tipodenegocio', 'category', 'subsetor', 'soussecteur'] },
  { campo: 'plan', alias: ['planprobable', 'plan', 'planrecomendado', 'plano', 'formule'] },
  { campo: 'valor', alias: ['valoranualusd', 'valoranual', 'valor', 'valorestimado', 'monto', 'importe', 'amount', 'value', 'dealvalue', 'valeur', 'montant', 'presupuesto', 'annualvalue'] },
  { campo: 'verificacion', alias: ['verificacion', 'verification', 'verificacao', 'metodoverificacion'] },
  { campo: 'fechaVerificacion', alias: ['fechaverificacion', 'fechadeverificacion', 'verifiedat', 'verificationdate', 'datadeverificacao', 'datedeverification'] },
  {
    campo: 'fuente',
    multiple: true,
    alias: ['fuente', 'fuentes', 'fuenteurl', 'fuentetelefonourl', 'fuentenegociourl', 'fuenteniturl', 'source', 'sources', 'sourceurl', 'fonte', 'origen', 'origenurl'],
  },
  { campo: 'horario', alias: ['horario', 'horariocontacto', 'horariodecontacto', 'ley2300horario', 'contacthours', 'horaires'] },
  { campo: 'notas', alias: ['notas', 'nota', 'notes', 'observaciones', 'observacion', 'comentarios', 'comments', 'observacoes', 'remarques'] },
  { campo: 'etiquetas', multiple: true, alias: ['etiquetas', 'etiqueta', 'tags', 'tag', 'etiquettes'] },
  { campo: 'rne', alias: ['rne', 'rnecrc', 'registronumerosexcluidos', 'donotcallregistry'] },
  { campo: 'pais', alias: ['pais', 'country', 'pays', 'paisorigen', 'countrycode'] },
  { campo: 'cargo', alias: ['cargo', 'cargocontacto', 'cargodelcontacto', 'puesto', 'position', 'jobtitle', 'fonction', 'poste', 'rol'] },
  { campo: 'etapa', alias: ['etapa', 'etapalead', 'etapadellead', 'estadolead', 'estadodellead', 'stage', 'leadstage', 'leadstatus', 'fase', 'etape'] },
  { campo: 'fecha', alias: ['fecha', 'fechacaptura', 'fechadecaptura', 'fechacreacion', 'fechadecreacion', 'fecharegistro', 'fechaderegistro', 'fechacontacto', 'fechadecontacto', 'date', 'createdat', 'datacaptura'] },
  {
    campo: 'telefonoAdicional',
    multiple: true,
    alias: ['telefono2', 'telefonosecundario', 'telefonoalterno', 'telefonoadicional', 'otrotelefono', 'telefonofijo', 'fijo', 'celular2', 'movil2', 'whatsapp2', 'phone2', 'secondaryphone', 'telefone2'],
  },
  { campo: 'correoAdicional', multiple: true, alias: ['correo2', 'correosecundario', 'correoalterno', 'correoadicional', 'otrocorreo', 'email2', 'secondaryemail'] },
  // Sin alias: lo asigna `mapeoInicialLeads` a toda columna no reconocida.
  { campo: 'adicional', multiple: true, alias: [] },
];

export type MapeoLead = MapeoDe<CampoLead>;

export const CAMPOS_MULTIPLES: ReadonlySet<CampoLead> = new Set(CAMPOS_LEAD.filter((c) => c.multiple).map((c) => c.campo));

const ALIAS_DE = (campo: CampoLead): readonly string[] => CAMPOS_LEAD.find((c) => c.campo === campo)?.alias ?? [];

/**
 * Reconocimiento por alias. Una segunda columna de teléfono o de correo (un
 * libro con `telefono_e164` y `telefono`) ya no queda sin importar: pasa a
 * «Teléfono adicional» / «Correo adicional».
 */
export function autoMapearLeads(cabeceras: unknown[]): MapeoLead {
  const mapeo = autoMapearCon(CAMPOS_LEAD, cabeceras);
  return mapeo.map((campo, i) => {
    if (campo) return campo;
    const norm = normalizarCabecera(cabeceras[i]);
    if (!norm) return null;
    if (ALIAS_DE('telefono').includes(norm)) return 'telefonoAdicional';
    if (ALIAS_DE('correo').includes(norm)) return 'correoAdicional';
    return null;
  });
}

/**
 * Mapeo con el que abre el asistente: el reconocimiento por alias y, para
 * TODA otra columna con datos (tenga o no encabezado), «Dato adicional». Así
 * nada de lo que el usuario ve en el archivo se pierde por omisión; descartar
 * una columna es una decisión explícita («No importar»).
 */
export function mapeoInicialLeads(matriz: readonly (readonly unknown[] | undefined)[], filaCabecera: number): MapeoLead {
  if (filaCabecera < 0) return [];
  const cabeceras = [...(matriz[filaCabecera] ?? [])];
  let ancho = cabeceras.length;
  for (let i = filaCabecera + 1; i < matriz.length; i++) ancho = Math.max(ancho, matriz[i]?.length ?? 0);
  const conDatos = (col: number) =>
    String(cabeceras[col] ?? '').trim() !== '' ||
    matriz.slice(filaCabecera + 1).some((f) => f?.[col] !== null && f?.[col] !== undefined && String(f[col]).trim() !== '');
  const base = autoMapearLeads(cabeceras);
  return Array.from({ length: ancho }, (_, col) => base[col] ?? (conDatos(col) ? 'adicional' : null));
}

/** La cabecera es la primera fila que reconoce el nombre (o la razón social) y al menos otras dos columnas. */
export function encontrarFilaCabeceraLeads(matriz: unknown[][]): number {
  return encontrarFilaCabeceraCon(CAMPOS_LEAD, matriz, ['nombre', 'razonSocial'], 3);
}

export function reasignarColumnaLead(mapeo: MapeoLead, columna: number, campo: CampoLead | null): MapeoLead {
  return reasignarColumnaCon(CAMPOS_LEAD, mapeo, columna, campo);
}

/**
 * Lo que el mapeo no cubre y hace falta: un nombre (comercial, razón social o
 * de contacto) y al menos una forma de contacto (teléfono o correo). Sin eso
 * no hay lead contactable (misma regla que `leadCustomer.resolveLeadCustomer`).
 */
export type FaltanteMapeo = 'nombre' | 'contactoMedio';

export function faltantesMapeoLead(mapeo: MapeoLead): FaltanteMapeo[] {
  const faltan: FaltanteMapeo[] = [];
  if (!mapeo.some((c) => c === 'nombre' || c === 'razonSocial' || c === 'contacto')) faltan.push('nombre');
  if (!mapeo.some((c) => c === 'telefono' || c === 'correo')) faltan.push('contactoMedio');
  return faltan;
}

/** ¿La cabecera del valor dice que viene en dólares? (`valor_anual_usd`, «Valor USD», «US$»). */
export function cabeceraEnDolares(cabecera: unknown): boolean {
  const s = String(cabecera ?? '').toLowerCase();
  return /\busd\b|us\$|d[oó]lar|dollar|_usd|usd_/.test(s);
}
