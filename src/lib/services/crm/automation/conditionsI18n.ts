/**
 * Traducciones de los campos y operadores del DSL de condiciones.
 *
 * Los campos del DSL (`opportunity.amount`, `customer.tags`, etc.) son
 * identificadores técnicos estables —no se traducen—, pero la UI los muestra
 * al usuario. Este módulo provee etiquetas legibles en el idioma activo.
 *
 * Idiomas soportados: es, en, pt, fr (mismos que `src/i18n/config.ts`).
 * Si falta una traducción, cae al español (defaultLocale).
 */

export type ConditionLocale = 'es' | 'en' | 'pt' | 'fr';

/** Etiqueta legible de un campo del DSL. */
export const CONDITION_FIELD_LABELS: Record<ConditionLocale, Record<string, string>> = {
  es: {
    'opportunity.amount': 'Monto de la oportunidad',
    'opportunity.currency': 'Moneda',
    'opportunity.status': 'Estado',
    'opportunity.temperature': 'Temperatura',
    'opportunity.icp_band': 'Banda ICP',
    'opportunity.icp_fit_score': 'Puntaje ICP',
    'opportunity.score_total': 'Puntaje total',
    'opportunity.record_type': 'Tipo de registro',
    'opportunity.source': 'Origen',
    'opportunity.expected_close_date': 'Cierre esperado',
    'opportunity.last_contact_at': 'Último contacto',
    'opportunity.contact_channel': 'Canal de contacto',
    'opportunity.contact_result': 'Resultado de contacto',
    'opportunity.deal_type': 'Tipo de trato',
    'opportunity.name': 'Nombre',
    'opportunity.stage_id': 'Etapa',
    'opportunity.pipeline_id': 'Pipeline',
    'customer.customer_type': 'Tipo de cliente',
    'customer.lifecycle_stage': 'Etapa del ciclo de vida',
    'customer.health_score': 'Puntaje de salud',
    'customer.tags': 'Etiquetas',
    'customer.company_size': 'Tamaño de empresa',
    'customer.has_email': 'Tiene email',
    'customer.has_phone': 'Tiene teléfono',
    'customer.email': 'Email',
    'customer.phone': 'Teléfono',
    'stage.id': 'ID de etapa',
    'stage.name': 'Nombre de etapa',
    'stage.position': 'Posición',
    'stage.probability': 'Probabilidad',
    'stage.is_won': 'Es ganada',
    'stage.is_lost': 'Es perdida',
    'stage.sla_days': 'Días SLA',
    'pipeline.id': 'ID de pipeline',
    'pipeline.pipeline_type': 'Tipo de pipeline',
    'consent.email': 'Consentimiento email',
    'consent.whatsapp': 'Consentimiento WhatsApp',
    'consent.sms': 'Consentimiento SMS',
    'consent.voice': 'Consentimiento voz',
    'event.event_type': 'Tipo de evento',
  },
  en: {
    'opportunity.amount': 'Opportunity amount',
    'opportunity.currency': 'Currency',
    'opportunity.status': 'Status',
    'opportunity.temperature': 'Temperature',
    'opportunity.icp_band': 'ICP band',
    'opportunity.icp_fit_score': 'ICP fit score',
    'opportunity.score_total': 'Total score',
    'opportunity.record_type': 'Record type',
    'opportunity.source': 'Source',
    'opportunity.expected_close_date': 'Expected close date',
    'opportunity.last_contact_at': 'Last contact',
    'opportunity.contact_channel': 'Contact channel',
    'opportunity.contact_result': 'Contact result',
    'opportunity.deal_type': 'Deal type',
    'opportunity.name': 'Name',
    'opportunity.stage_id': 'Stage',
    'opportunity.pipeline_id': 'Pipeline',
    'customer.customer_type': 'Customer type',
    'customer.lifecycle_stage': 'Lifecycle stage',
    'customer.health_score': 'Health score',
    'customer.tags': 'Tags',
    'customer.company_size': 'Company size',
    'customer.has_email': 'Has email',
    'customer.has_phone': 'Has phone',
    'customer.email': 'Email',
    'customer.phone': 'Phone',
    'stage.id': 'Stage ID',
    'stage.name': 'Stage name',
    'stage.position': 'Position',
    'stage.probability': 'Probability',
    'stage.is_won': 'Is won',
    'stage.is_lost': 'Is lost',
    'stage.sla_days': 'SLA days',
    'pipeline.id': 'Pipeline ID',
    'pipeline.pipeline_type': 'Pipeline type',
    'consent.email': 'Email consent',
    'consent.whatsapp': 'WhatsApp consent',
    'consent.sms': 'SMS consent',
    'consent.voice': 'Voice consent',
    'event.event_type': 'Event type',
  },
  pt: {
    'opportunity.amount': 'Valor da oportunidade',
    'opportunity.currency': 'Moeda',
    'opportunity.status': 'Status',
    'opportunity.temperature': 'Temperatura',
    'opportunity.icp_band': 'Faixa ICP',
    'opportunity.icp_fit_score': 'Pontuação ICP',
    'opportunity.score_total': 'Pontuação total',
    'opportunity.record_type': 'Tipo de registro',
    'opportunity.source': 'Origem',
    'opportunity.expected_close_date': 'Fechamento esperado',
    'opportunity.last_contact_at': 'Último contato',
    'opportunity.contact_channel': 'Canal de contato',
    'opportunity.contact_result': 'Resultado do contato',
    'opportunity.deal_type': 'Tipo de acordo',
    'opportunity.name': 'Nome',
    'opportunity.stage_id': 'Etapa',
    'opportunity.pipeline_id': 'Pipeline',
    'customer.customer_type': 'Tipo de cliente',
    'customer.lifecycle_stage': 'Estágio do ciclo de vida',
    'customer.health_score': 'Pontuação de saúde',
    'customer.tags': 'Tags',
    'customer.company_size': 'Tamanho da empresa',
    'customer.has_email': 'Tem email',
    'customer.has_phone': 'Tem telefone',
    'customer.email': 'Email',
    'customer.phone': 'Telefone',
    'stage.id': 'ID da etapa',
    'stage.name': 'Nome da etapa',
    'stage.position': 'Posição',
    'stage.probability': 'Probabilidade',
    'stage.is_won': 'É ganho',
    'stage.is_lost': 'É perdido',
    'stage.sla_days': 'Dias SLA',
    'pipeline.id': 'ID do pipeline',
    'pipeline.pipeline_type': 'Tipo de pipeline',
    'consent.email': 'Consentimento email',
    'consent.whatsapp': 'Consentimento WhatsApp',
    'consent.sms': 'Consentimento SMS',
    'consent.voice': 'Consentimento voz',
    'event.event_type': 'Tipo de evento',
  },
  fr: {
    'opportunity.amount': "Montant de l'opportunité",
    'opportunity.currency': 'Devise',
    'opportunity.status': 'Statut',
    'opportunity.temperature': 'Température',
    'opportunity.icp_band': 'Bande ICP',
    'opportunity.icp_fit_score': 'Score ICP',
    'opportunity.score_total': 'Score total',
    'opportunity.record_type': "Type d'enregistrement",
    'opportunity.source': 'Source',
    'opportunity.expected_close_date': 'Clôture prévue',
    'opportunity.last_contact_at': 'Dernier contact',
    'opportunity.contact_channel': 'Canal de contact',
    'opportunity.contact_result': 'Résultat du contact',
    'opportunity.deal_type': 'Type de deal',
    'opportunity.name': 'Nom',
    'opportunity.stage_id': 'Étape',
    'opportunity.pipeline_id': 'Pipeline',
    'customer.customer_type': 'Type de client',
    'customer.lifecycle_stage': 'Étape du cycle de vie',
    'customer.health_score': 'Score de santé',
    'customer.tags': 'Tags',
    'customer.company_size': "Taille de l'entreprise",
    'customer.has_email': 'A un email',
    'customer.has_phone': 'A un téléphone',
    'customer.email': 'Email',
    'customer.phone': 'Téléphone',
    'stage.id': "ID de l'étape",
    'stage.name': "Nom de l'étape",
    'stage.position': 'Position',
    'stage.probability': 'Probabilité',
    'stage.is_won': 'Est gagné',
    'stage.is_lost': 'Est perdu',
    'stage.sla_days': 'Jours SLA',
    'pipeline.id': 'ID du pipeline',
    'pipeline.pipeline_type': 'Type de pipeline',
    'consent.email': 'Consentement email',
    'consent.whatsapp': 'Consentement WhatsApp',
    'consent.sms': 'Consentement SMS',
    'consent.voice': 'Consentement voix',
    'event.event_type': "Type d'événement",
  },
};

/** Etiqueta legible de un operador del DSL. */
export const CONDITION_OPERATOR_LABELS: Record<ConditionLocale, Record<string, string>> = {
  es: {
    eq: 'es igual a',
    ne: 'no es igual a',
    gt: 'mayor que',
    gte: 'mayor o igual que',
    lt: 'menor que',
    lte: 'menor o igual que',
    in: 'está en (lista, separada por comas)',
    not_in: 'no está en (lista, separada por comas)',
    contains: 'contiene',
    not_contains: 'no contiene',
    is_null: 'está vacío',
    is_not_null: 'no está vacío',
    before: 'es anterior a (fecha)',
    after: 'es posterior a (fecha)',
    within_days: 'en los últimos N días',
  },
  en: {
    eq: 'equals',
    ne: 'not equals',
    gt: 'greater than',
    gte: 'greater than or equal',
    lt: 'less than',
    lte: 'less than or equal',
    in: 'is in (comma-separated list)',
    not_in: 'is not in (comma-separated list)',
    contains: 'contains',
    not_contains: 'does not contain',
    is_null: 'is empty',
    is_not_null: 'is not empty',
    before: 'is before (date)',
    after: 'is after (date)',
    within_days: 'within the last N days',
  },
  pt: {
    eq: 'é igual a',
    ne: 'não é igual a',
    gt: 'maior que',
    gte: 'maior ou igual que',
    lt: 'menor que',
    lte: 'menor ou igual que',
    in: 'está em (lista, separada por vírgulas)',
    not_in: 'não está em (lista, separada por vírgulas)',
    contains: 'contém',
    not_contains: 'não contém',
    is_null: 'está vazio',
    is_not_null: 'não está vazio',
    before: 'é anterior a (data)',
    after: 'é posterior a (data)',
    within_days: 'nos últimos N dias',
  },
  fr: {
    eq: 'égal à',
    ne: 'différent de',
    gt: 'supérieur à',
    gte: 'supérieur ou égal à',
    lt: 'inférieur à',
    lte: 'inférieur ou égal à',
    in: 'est dans (liste, séparée par virgules)',
    not_in: "n'est pas dans (liste, séparée par virgules)",
    contains: 'contient',
    not_contains: 'ne contient pas',
    is_null: 'est vide',
    is_not_null: "n'est pas vide",
    before: 'est antérieur à (date)',
    after: 'est postérieur à (date)',
    within_days: 'dans les N derniers jours',
  },
};

/** Etiquetas de los grupos de campos (optgroup). */
export const CONDITION_GROUP_LABELS: Record<ConditionLocale, Record<string, string>> = {
  es: {
    'opportunity.': 'Oportunidad',
    'customer.': 'Cliente',
    'stage.': 'Etapa',
    'pipeline.': 'Pipeline',
    'consent.': 'Consentimiento',
    'event.': 'Evento',
  },
  en: {
    'opportunity.': 'Opportunity',
    'customer.': 'Customer',
    'stage.': 'Stage',
    'pipeline.': 'Pipeline',
    'consent.': 'Consent',
    'event.': 'Event',
  },
  pt: {
    'opportunity.': 'Oportunidade',
    'customer.': 'Cliente',
    'stage.': 'Etapa',
    'pipeline.': 'Pipeline',
    'consent.': 'Consentimento',
    'event.': 'Evento',
  },
  fr: {
    'opportunity.': 'Opportunité',
    'customer.': 'Client',
    'stage.': 'Étape',
    'pipeline.': 'Pipeline',
    'consent.': 'Consentement',
    'event.': 'Événement',
  },
};

/** Condiciones de salida de secuencias. */
export const EXIT_CONDITION_LABELS: Record<ConditionLocale, Record<string, string>> = {
  es: {
    won_lost: 'Ganada o perdida',
    stage_changed: 'Cambio de etapa',
    opted_out: 'Canceló consentimiento',
    replied: 'Respondió',
  },
  en: {
    won_lost: 'Won or lost',
    stage_changed: 'Stage changed',
    opted_out: 'Opted out',
    replied: 'Replied',
  },
  pt: {
    won_lost: 'Ganho ou perdido',
    stage_changed: 'Mudança de etapa',
    opted_out: 'Cancelou consentimento',
    replied: 'Respondeu',
  },
  fr: {
    won_lost: 'Gagné ou perdu',
    stage_changed: "Changement d'étape",
    opted_out: 'Consentement retiré',
    replied: 'A répondu',
  },
};

const DEFAULT_LOCALE: ConditionLocale = 'es';

/**
 * Devuelve el locale activo leyendo `localStorage['preferredLanguage']`
 * (escrito por `I18nProvider`). En SSR o si falta, devuelve el default.
 */
export function getConditionLocale(): ConditionLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const cached = window.localStorage.getItem('preferredLanguage');
    if (cached && cached in CONDITION_FIELD_LABELS) return cached as ConditionLocale;
  } catch {
    /* noop */
  }
  return DEFAULT_LOCALE;
}

export function fieldLabel(field: string, locale?: ConditionLocale): string {
  const loc = locale ?? getConditionLocale();
  return CONDITION_FIELD_LABELS[loc]?.[field] ?? CONDITION_FIELD_LABELS[DEFAULT_LOCALE][field] ?? field;
}

export function operatorLabel(operator: string, locale?: ConditionLocale): string {
  const loc = locale ?? getConditionLocale();
  return CONDITION_OPERATOR_LABELS[loc]?.[operator] ?? CONDITION_OPERATOR_LABELS[DEFAULT_LOCALE][operator] ?? operator;
}

export function groupLabel(prefix: string, locale?: ConditionLocale): string {
  const loc = locale ?? getConditionLocale();
  return CONDITION_GROUP_LABELS[loc]?.[prefix] ?? CONDITION_GROUP_LABELS[DEFAULT_LOCALE][prefix] ?? prefix;
}

export function exitConditionLabel(key: string, locale?: ConditionLocale): string {
  const loc = locale ?? getConditionLocale();
  return EXIT_CONDITION_LABELS[loc]?.[key] ?? EXIT_CONDITION_LABELS[DEFAULT_LOCALE][key] ?? key;
}
