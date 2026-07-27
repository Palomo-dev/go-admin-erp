const ORG_TYPE_LABELS: Record<string, { es: string; en: string }> = {
  restaurant: { es: 'Restaurante', en: 'Restaurant' },
  hotel: { es: 'Hotel', en: 'Hotel' },
  retail: { es: 'Retail / Tienda', en: 'Retail / Store' },
  services: { es: 'Servicios', en: 'Services' },
  gym: { es: 'Gimnasio', en: 'Gym' },
  parking: { es: 'Parqueadero', en: 'Parking' },
  transport: { es: 'Transporte', en: 'Transport' },
};

export function getOrgTypeLabel(
  name: string,
  locale: string = 'es'
): string {
  const key = name?.toLowerCase()?.trim();
  if (!key) return 'Organización';
  const entry = ORG_TYPE_LABELS[key];
  if (!entry) return name;
  return locale.startsWith('es') ? entry.es : entry.en;
}
