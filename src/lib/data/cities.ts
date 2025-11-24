/**
 * Ciudades principales de Colombia organizadas por departamento
 */
export const colombianCities = [
  // Principales ciudades
  'Bogotá',
  'Medellín',
  'Cali',
  'Barranquilla',
  'Cartagena',
  'Cúcuta',
  'Bucaramanga',
  'Pereira',
  'Santa Marta',
  'Ibagué',
  'Pasto',
  'Manizales',
  'Neiva',
  'Villavicencio',
  'Armenia',
  'Valledupar',
  'Montería',
  'Sincelejo',
  'Popayán',
  'Buenaventura',
  'Palmira',
  'Floridablanca',
  'Tuluá',
  'Barrancabermeja',
  'Cartago',
  'Bello',
  'Itagüí',
  'Envigado',
  'Soledad',
  'Soacha',
  'Dosquebradas',
  'Tunja',
  'Riohacha',
  'Quibdó',
  'Florencia',
  'Yopal',
  'Mocoa',
  'Arauca',
  'Leticia',
  'Inírida',
  'Puerto Carreño',
  'Mitú',
  'San Andrés',
  'Providencia',
  // Ciudades turísticas
  'San Agustín',
  'Villa de Leyva',
  'Salento',
  'Guatapé',
  'San Gil',
  'Girardot',
  'Melgar',
  'Zipaquirá',
  'Eje Cafetero',
  'Taganga',
  'Palomino',
  'Capurganá',
  // Otras ciudades importantes
  'Apartadó',
  'Tumaco',
  'Ipiales',
  'Sogamoso',
  'Duitama',
  'Fusagasugá',
  'Facatativá',
  'Chía',
  'Cajicá',
  'Jamundí',
  'Yumbo',
  'Candelaria',
  'Rionegro',
  'Caldas',
  'La Estrella',
  'Sabaneta',
  'Copacabana',
  'Girardota',
  'Piedecuesta',
  'Girón',
  'Los Patios',
  'Villa del Rosario',
] as const;

/**
 * Ciudades internacionales más comunes (principales destinos turísticos)
 */
export const internationalCities = [
  // Estados Unidos
  'Nueva York',
  'Los Ángeles',
  'Miami',
  'Orlando',
  'Las Vegas',
  'Chicago',
  'San Francisco',
  'Washington D.C.',
  'Boston',
  'Houston',
  
  // España
  'Madrid',
  'Barcelona',
  'Valencia',
  'Sevilla',
  'Málaga',
  'Bilbao',
  'Granada',
  
  // México
  'Ciudad de México',
  'Cancún',
  'Guadalajara',
  'Monterrey',
  'Puebla',
  'Playa del Carmen',
  'Puerto Vallarta',
  
  // Argentina
  'Buenos Aires',
  'Córdoba',
  'Rosario',
  'Mendoza',
  'Bariloche',
  
  // Chile
  'Santiago',
  'Valparaíso',
  'Viña del Mar',
  
  // Perú
  'Lima',
  'Cusco',
  'Arequipa',
  'Trujillo',
  
  // Ecuador
  'Quito',
  'Guayaquil',
  'Cuenca',
  
  // Brasil
  'São Paulo',
  'Río de Janeiro',
  'Brasilia',
  'Salvador',
  
  // Europa
  'París',
  'Londres',
  'Roma',
  'Ámsterdam',
  'Berlín',
  'Viena',
  'Lisboa',
  'Praga',
  
  // Otros
  'Dubái',
  'Tokio',
  'Seúl',
  'Sídney',
  'Toronto',
  'Vancouver',
] as const;

/**
 * Todas las ciudades combinadas y ordenadas
 */
export const allCities = [
  ...colombianCities,
  ...internationalCities,
].sort((a, b) => a.localeCompare(b, 'es'));

export type ColombianCity = typeof colombianCities[number];
export type InternationalCity = typeof internationalCities[number];
export type City = typeof allCities[number];
