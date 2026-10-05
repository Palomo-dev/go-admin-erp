import type { PhoneLocale } from '../shared/phoneProtocol';
const labels = {
  es: { title: 'GO Admin · Teléfono', incoming: 'Llamada entrante', missed: 'Llamada perdida', callback: 'Devolver llamada', lead: 'Crear lead', answer: 'Contestar', reject: 'Rechazar' },
  en: { title: 'GO Admin · Phone', incoming: 'Incoming call', missed: 'Missed call', callback: 'Call back', lead: 'Create lead', answer: 'Answer', reject: 'Reject' },
  fr: { title: 'GO Admin · Téléphone', incoming: 'Appel entrant', missed: 'Appel manqué', callback: 'Rappeler', lead: 'Créer un lead', answer: 'Répondre', reject: 'Refuser' },
  pt: { title: 'GO Admin · Telefone', incoming: 'Chamada recebida', missed: 'Chamada perdida', callback: 'Retornar chamada', lead: 'Criar lead', answer: 'Atender', reject: 'Rejeitar' },
};
export function phoneLabels(locale?: PhoneLocale) { return labels[locale ?? 'es']; }
