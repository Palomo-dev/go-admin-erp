/**
 * Lista de países con sus códigos telefónicos (dial codes), código ISO y bandera.
 * Ordenados alfabéticamente por nombre en español.
 * Fuente: estándar ITU-T E.164 + ISO 3166-1 alpha-2.
 */
export interface CountryPhoneCode {
  /** Código ISO 3166-1 alpha-2 (ej: 'CO', 'MX', 'US') */
  iso: string;
  /** Nombre en español */
  name: string;
  /** Código telefónico internacional con prefijo '+' (ej: '+57', '+52', '+1') */
  dialCode: string;
  /** Bandera en emoji (ej: '🇨🇴') */
  flag: string;
}

export const countryPhoneCodes: CountryPhoneCode[] = [
  { iso: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { iso: 'US', name: 'Estados Unidos', dialCode: '+1', flag: '🇺🇸' },
  { iso: 'MX', name: 'México', dialCode: '+52', flag: '🇲🇽' },
  { iso: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { iso: 'PE', name: 'Perú', dialCode: '+51', flag: '🇵🇪' },
  { iso: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  { iso: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { iso: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { iso: 'BO', name: 'Bolivia', dialCode: '+591', flag: '🇧🇴' },
  { iso: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { iso: 'PY', name: 'Paraguay', dialCode: '+595', flag: '🇵🇾' },
  { iso: 'BR', name: 'Brasil', dialCode: '+55', flag: '🇧🇷' },
  { iso: 'CA', name: 'Canadá', dialCode: '+1', flag: '🇨🇦' },
  { iso: 'ES', name: 'España', dialCode: '+34', flag: '🇪🇸' },
  { iso: 'DO', name: 'República Dominicana', dialCode: '+1', flag: '🇩🇴' },
  { iso: 'GT', name: 'Guatemala', dialCode: '+502', flag: '🇬🇹' },
  { iso: 'CU', name: 'Cuba', dialCode: '+53', flag: '🇨🇺' },
  { iso: 'HN', name: 'Honduras', dialCode: '+504', flag: '🇭🇳' },
  { iso: 'SV', name: 'El Salvador', dialCode: '+503', flag: '🇸🇻' },
  { iso: 'NI', name: 'Nicaragua', dialCode: '+505', flag: '🇳🇮' },
  { iso: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { iso: 'PA', name: 'Panamá', dialCode: '+507', flag: '🇵🇦' },
  { iso: 'PR', name: 'Puerto Rico', dialCode: '+1', flag: '🇵🇷' },
  { iso: 'AF', name: 'Afganistán', dialCode: '+93', flag: '🇦🇫' },
  { iso: 'AL', name: 'Albania', dialCode: '+355', flag: '🇦🇱' },
  { iso: 'DE', name: 'Alemania', dialCode: '+49', flag: '🇩🇪' },
  { iso: 'AD', name: 'Andorra', dialCode: '+376', flag: '🇦🇩' },
  { iso: 'AO', name: 'Angola', dialCode: '+244', flag: '🇦🇴' },
  { iso: 'AG', name: 'Antigua y Barbuda', dialCode: '+1', flag: '🇦🇬' },
  { iso: 'SA', name: 'Arabia Saudita', dialCode: '+966', flag: '🇸🇦' },
  { iso: 'DZ', name: 'Argelia', dialCode: '+213', flag: '🇩🇿' },
  { iso: 'AM', name: 'Armenia', dialCode: '+374', flag: '🇦🇲' },
  { iso: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { iso: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { iso: 'AZ', name: 'Azerbaiyán', dialCode: '+994', flag: '🇦🇿' },
  { iso: 'BS', name: 'Bahamas', dialCode: '+1', flag: '🇧🇸' },
  { iso: 'BD', name: 'Bangladés', dialCode: '+880', flag: '🇧🇩' },
  { iso: 'BB', name: 'Barbados', dialCode: '+1', flag: '🇧🇧' },
  { iso: 'BH', name: 'Baréin', dialCode: '+973', flag: '🇧🇭' },
  { iso: 'BE', name: 'Bélgica', dialCode: '+32', flag: '🇧🇪' },
  { iso: 'BZ', name: 'Belice', dialCode: '+501', flag: '🇧🇿' },
  { iso: 'BJ', name: 'Benín', dialCode: '+229', flag: '🇧🇯' },
  { iso: 'BY', name: 'Bielorrusia', dialCode: '+375', flag: '🇧🇾' },
  { iso: 'MM', name: 'Birmania', dialCode: '+95', flag: '🇲🇲' },
  { iso: 'BA', name: 'Bosnia y Herzegovina', dialCode: '+387', flag: '🇧🇦' },
  { iso: 'BW', name: 'Botsuana', dialCode: '+267', flag: '🇧🇼' },
  { iso: 'BN', name: 'Brunéi', dialCode: '+673', flag: '🇧🇳' },
  { iso: 'BG', name: 'Bulgaria', dialCode: '+359', flag: '🇧🇬' },
  { iso: 'BF', name: 'Burkina Faso', dialCode: '+226', flag: '🇧🇫' },
  { iso: 'BI', name: 'Burundi', dialCode: '+257', flag: '🇧🇮' },
  { iso: 'BT', name: 'Bután', dialCode: '+975', flag: '🇧🇹' },
  { iso: 'CV', name: 'Cabo Verde', dialCode: '+238', flag: '🇨🇻' },
  { iso: 'KH', name: 'Camboya', dialCode: '+855', flag: '🇰🇭' },
  { iso: 'CM', name: 'Camerún', dialCode: '+237', flag: '🇨🇲' },
  { iso: 'TD', name: 'Chad', dialCode: '+235', flag: '🇹🇩' },
  { iso: 'CZ', name: 'Chequia', dialCode: '+420', flag: '🇨🇿' },
  { iso: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { iso: 'CY', name: 'Chipre', dialCode: '+357', flag: '🇨🇾' },
  { iso: 'VA', name: 'Ciudad del Vaticano', dialCode: '+379', flag: '🇻🇦' },
  { iso: 'KM', name: 'Comoras', dialCode: '+269', flag: '🇰🇲' },
  { iso: 'CG', name: 'Congo', dialCode: '+242', flag: '🇨🇬' },
  { iso: 'CD', name: 'Congo (R.D.)', dialCode: '+243', flag: '🇨🇩' },
  { iso: 'KP', name: 'Corea del Norte', dialCode: '+850', flag: '🇰🇵' },
  { iso: 'KR', name: 'Corea del Sur', dialCode: '+82', flag: '🇰🇷' },
  { iso: 'CI', name: 'Costa de Marfil', dialCode: '+225', flag: '🇨🇮' },
  { iso: 'HR', name: 'Croacia', dialCode: '+385', flag: '🇭🇷' },
  { iso: 'DK', name: 'Dinamarca', dialCode: '+45', flag: '🇩🇰' },
  { iso: 'DM', name: 'Dominica', dialCode: '+1', flag: '🇩🇲' },
  { iso: 'EG', name: 'Egipto', dialCode: '+20', flag: '🇪🇬' },
  { iso: 'AE', name: 'Emiratos Árabes Unidos', dialCode: '+971', flag: '🇦🇪' },
  { iso: 'ER', name: 'Eritrea', dialCode: '+291', flag: '🇪🇷' },
  { iso: 'SK', name: 'Eslovaquia', dialCode: '+421', flag: '🇸🇰' },
  { iso: 'SI', name: 'Eslovenia', dialCode: '+386', flag: '🇸🇮' },
  { iso: 'EE', name: 'Estonia', dialCode: '+372', flag: '🇪🇪' },
  { iso: 'SZ', name: 'Esuatini', dialCode: '+268', flag: '🇸🇿' },
  { iso: 'ET', name: 'Etiopía', dialCode: '+251', flag: '🇪🇹' },
  { iso: 'PH', name: 'Filipinas', dialCode: '+63', flag: '🇵🇭' },
  { iso: 'FI', name: 'Finlandia', dialCode: '+358', flag: '🇫🇮' },
  { iso: 'FJ', name: 'Fiyi', dialCode: '+679', flag: '🇫🇯' },
  { iso: 'FR', name: 'Francia', dialCode: '+33', flag: '🇫🇷' },
  { iso: 'GA', name: 'Gabón', dialCode: '+241', flag: '🇬🇦' },
  { iso: 'GM', name: 'Gambia', dialCode: '+220', flag: '🇬🇲' },
  { iso: 'GE', name: 'Georgia', dialCode: '+995', flag: '🇬🇪' },
  { iso: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭' },
  { iso: 'GI', name: 'Gibraltar', dialCode: '+350', flag: '🇬🇮' },
  { iso: 'GD', name: 'Granada', dialCode: '+1', flag: '🇬🇩' },
  { iso: 'GR', name: 'Grecia', dialCode: '+30', flag: '🇬🇷' },
  { iso: 'GL', name: 'Groenlandia', dialCode: '+299', flag: '🇬🇱' },
  { iso: 'GP', name: 'Guadalupe', dialCode: '+590', flag: '🇬🇵' },
  { iso: 'GU', name: 'Guam', dialCode: '+1', flag: '🇬🇺' },
  { iso: 'GF', name: 'Guayana Francesa', dialCode: '+594', flag: '🇬🇫' },
  { iso: 'GG', name: 'Guernsey', dialCode: '+44', flag: '🇬🇬' },
  { iso: 'GN', name: 'Guinea', dialCode: '+224', flag: '🇬🇳' },
  { iso: 'GQ', name: 'Guinea Ecuatorial', dialCode: '+240', flag: '🇬🇶' },
  { iso: 'GW', name: 'Guinea-Bisáu', dialCode: '+245', flag: '🇬🇼' },
  { iso: 'GY', name: 'Guyana', dialCode: '+592', flag: '🇬🇾' },
  { iso: 'HT', name: 'Haití', dialCode: '+509', flag: '🇭🇹' },
  { iso: 'NL', name: 'Países Bajos', dialCode: '+31', flag: '🇳🇱' },
  { iso: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰' },
  { iso: 'HU', name: 'Hungría', dialCode: '+36', flag: '🇭🇺' },
  { iso: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { iso: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩' },
  { iso: 'IQ', name: 'Irak', dialCode: '+964', flag: '🇮🇶' },
  { iso: 'IR', name: 'Irán', dialCode: '+98', flag: '🇮🇷' },
  { iso: 'IE', name: 'Irlanda', dialCode: '+353', flag: '🇮🇪' },
  { iso: 'BV', name: 'Isla Bouvet', dialCode: '+47', flag: '🇧🇻' },
  { iso: 'IM', name: 'Isla de Man', dialCode: '+44', flag: '🇮🇲' },
  { iso: 'IS', name: 'Islandia', dialCode: '+354', flag: '🇮🇸' },
  { iso: 'KY', name: 'Islas Caimán', dialCode: '+1', flag: '🇰🇾' },
  { iso: 'CC', name: 'Islas Cocos', dialCode: '+61', flag: '🇨🇨' },
  { iso: 'CK', name: 'Islas Cook', dialCode: '+682', flag: '🇨🇰' },
  { iso: 'FO', name: 'Islas Feroe', dialCode: '+298', flag: '🇫🇴' },
  { iso: 'MH', name: 'Islas Marshall', dialCode: '+692', flag: '🇲🇭' },
  { iso: 'FK', name: 'Islas Malvinas', dialCode: '+500', flag: '🇫🇰' },
  { iso: 'SB', name: 'Islas Salomón', dialCode: '+677', flag: '🇸🇧' },
  { iso: 'VI', name: 'Islas Vírgenes (EE.UU.)', dialCode: '+1', flag: '🇻🇮' },
  { iso: 'VG', name: 'Islas Vírgenes (Británicas)', dialCode: '+1', flag: '🇻🇬' },
  { iso: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱' },
  { iso: 'IT', name: 'Italia', dialCode: '+39', flag: '🇮🇹' },
  { iso: 'JM', name: 'Jamaica', dialCode: '+1', flag: '🇯🇲' },
  { iso: 'JP', name: 'Japón', dialCode: '+81', flag: '🇯🇵' },
  { iso: 'JE', name: 'Jersey', dialCode: '+44', flag: '🇯🇪' },
  { iso: 'JO', name: 'Jordania', dialCode: '+962', flag: '🇯🇴' },
  { iso: 'KZ', name: 'Kazajistán', dialCode: '+7', flag: '🇰🇿' },
  { iso: 'KE', name: 'Kenia', dialCode: '+254', flag: '🇰🇪' },
  { iso: 'KG', name: 'Kirguistán', dialCode: '+996', flag: '🇰🇬' },
  { iso: 'KI', name: 'Kiribati', dialCode: '+686', flag: '🇰🇮' },
  { iso: 'KW', name: 'Kuwait', dialCode: '+965', flag: '🇰🇼' },
  { iso: 'LA', name: 'Laos', dialCode: '+856', flag: '🇱🇦' },
  { iso: 'LS', name: 'Lesoto', dialCode: '+266', flag: '🇱🇸' },
  { iso: 'LV', name: 'Letonia', dialCode: '+371', flag: '🇱🇻' },
  { iso: 'LB', name: 'Líbano', dialCode: '+961', flag: '🇱🇧' },
  { iso: 'LR', name: 'Liberia', dialCode: '+231', flag: '🇱🇷' },
  { iso: 'LY', name: 'Libia', dialCode: '+218', flag: '🇱🇾' },
  { iso: 'LI', name: 'Liechtenstein', dialCode: '+423', flag: '🇱🇮' },
  { iso: 'LT', name: 'Lituania', dialCode: '+370', flag: '🇱🇹' },
  { iso: 'LU', name: 'Luxemburgo', dialCode: '+352', flag: '🇱🇺' },
  { iso: 'MO', name: 'Macao', dialCode: '+853', flag: '🇲🇴' },
  { iso: 'MK', name: 'Macedonia del Norte', dialCode: '+389', flag: '🇲🇰' },
  { iso: 'MG', name: 'Madagascar', dialCode: '+261', flag: '🇲🇬' },
  { iso: 'MY', name: 'Malasia', dialCode: '+60', flag: '🇲🇾' },
  { iso: 'MW', name: 'Malaui', dialCode: '+265', flag: '🇲🇼' },
  { iso: 'MV', name: 'Maldivas', dialCode: '+960', flag: '🇲🇻' },
  { iso: 'ML', name: 'Mali', dialCode: '+223', flag: '🇲🇱' },
  { iso: 'MT', name: 'Malta', dialCode: '+356', flag: '🇲🇹' },
  { iso: 'MA', name: 'Marruecos', dialCode: '+212', flag: '🇲🇦' },
  { iso: 'MQ', name: 'Martinica', dialCode: '+596', flag: '🇲🇶' },
  { iso: 'MR', name: 'Mauritania', dialCode: '+222', flag: '🇲🇷' },
  { iso: 'MU', name: 'Mauricio', dialCode: '+230', flag: '🇲🇺' },
  { iso: 'YT', name: 'Mayotte', dialCode: '+262', flag: '🇾🇹' },
  { iso: 'FM', name: 'Micronesia', dialCode: '+691', flag: '🇫🇲' },
  { iso: 'MD', name: 'Moldavia', dialCode: '+373', flag: '🇲🇩' },
  { iso: 'MC', name: 'Mónaco', dialCode: '+377', flag: '🇲🇨' },
  { iso: 'MN', name: 'Mongolia', dialCode: '+976', flag: '🇲🇳' },
  { iso: 'MS', name: 'Montserrat', dialCode: '+1', flag: '🇲🇸' },
  { iso: 'MZ', name: 'Mozambique', dialCode: '+258', flag: '🇲🇿' },
  { iso: 'NA', name: 'Namibia', dialCode: '+264', flag: '🇳🇦' },
  { iso: 'NR', name: 'Nauru', dialCode: '+674', flag: '🇳🇷' },
  { iso: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵' },
  { iso: 'NE', name: 'Níger', dialCode: '+227', flag: '🇳🇪' },
  { iso: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
  { iso: 'NU', name: 'Niue', dialCode: '+683', flag: '🇳🇺' },
  { iso: 'NO', name: 'Noruega', dialCode: '+47', flag: '🇳🇴' },
  { iso: 'NC', name: 'Nueva Caledonia', dialCode: '+687', flag: '🇳🇨' },
  { iso: 'NZ', name: 'Nueva Zelanda', dialCode: '+64', flag: '🇳🇿' },
  { iso: 'OM', name: 'Omán', dialCode: '+968', flag: '🇴🇲' },
  { iso: 'PK', name: 'Pakistán', dialCode: '+92', flag: '🇵🇰' },
  { iso: 'PW', name: 'Palaos', dialCode: '+680', flag: '🇵🇼' },
  { iso: 'PS', name: 'Palestina', dialCode: '+970', flag: '🇵🇸' },
  { iso: 'PL', name: 'Polonia', dialCode: '+48', flag: '🇵🇱' },
  { iso: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { iso: 'QA', name: 'Catar', dialCode: '+974', flag: '🇶🇦' },
  { iso: 'GB', name: 'Reino Unido', dialCode: '+44', flag: '🇬🇧' },
  { iso: 'CF', name: 'República Centroafricana', dialCode: '+236', flag: '🇨🇫' },
  { iso: 'RE', name: 'Reunión', dialCode: '+262', flag: '🇷🇪' },
  { iso: 'RW', name: 'Ruanda', dialCode: '+250', flag: '🇷🇼' },
  { iso: 'RO', name: 'Rumania', dialCode: '+40', flag: '🇷🇴' },
  { iso: 'RU', name: 'Rusia', dialCode: '+7', flag: '🇷🇺' },
  { iso: 'EH', name: 'Sáhara Occidental', dialCode: '+212', flag: '🇪🇭' },
  { iso: 'WS', name: 'Samoa', dialCode: '+685', flag: '🇼🇸' },
  { iso: 'AS', name: 'Samoa Americana', dialCode: '+1', flag: '🇦🇸' },
  { iso: 'BL', name: 'San Bartolomé', dialCode: '+590', flag: '🇧🇱' },
  { iso: 'KN', name: 'San Cristóbal y Nieves', dialCode: '+1', flag: '🇰🇳' },
  { iso: 'SM', name: 'San Marino', dialCode: '+378', flag: '🇸🇲' },
  { iso: 'MF', name: 'San Martín', dialCode: '+590', flag: '🇲🇫' },
  { iso: 'PM', name: 'San Pedro y Miquelón', dialCode: '+508', flag: '🇵🇲' },
  { iso: 'VC', name: 'San Vicente y las Granadinas', dialCode: '+1', flag: '🇻🇨' },
  { iso: 'SH', name: 'Santa Elena', dialCode: '+290', flag: '🇸🇭' },
  { iso: 'LC', name: 'Santa Lucía', dialCode: '+1', flag: '🇱🇨' },
  { iso: 'ST', name: 'Santo Tomé y Príncipe', dialCode: '+239', flag: '🇸🇹' },
  { iso: 'SN', name: 'Senegal', dialCode: '+221', flag: '🇸🇳' },
  { iso: 'RS', name: 'Serbia', dialCode: '+381', flag: '🇷🇸' },
  { iso: 'SC', name: 'Seychelles', dialCode: '+248', flag: '🇸🇨' },
  { iso: 'SL', name: 'Sierra Leona', dialCode: '+232', flag: '🇸🇱' },
  { iso: 'SG', name: 'Singapur', dialCode: '+65', flag: '🇸🇬' },
  { iso: 'SY', name: 'Siria', dialCode: '+963', flag: '🇸🇾' },
  { iso: 'SO', name: 'Somalia', dialCode: '+252', flag: '🇸🇴' },
  { iso: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰' },
  { iso: 'ZA', name: 'Sudáfrica', dialCode: '+27', flag: '🇿🇦' },
  { iso: 'SD', name: 'Sudán', dialCode: '+249', flag: '🇸🇩' },
  { iso: 'SS', name: 'Sudán del Sur', dialCode: '+211', flag: '🇸🇸' },
  { iso: 'SE', name: 'Suecia', dialCode: '+46', flag: '🇸🇪' },
  { iso: 'CH', name: 'Suiza', dialCode: '+41', flag: '🇨🇭' },
  { iso: 'SR', name: 'Surinam', dialCode: '+597', flag: '🇸🇷' },
  { iso: 'SJ', name: 'Svalbard y Jan Mayen', dialCode: '+47', flag: '🇸🇯' },
  { iso: 'TH', name: 'Tailandia', dialCode: '+66', flag: '🇹🇭' },
  { iso: 'TW', name: 'Taiwán', dialCode: '+886', flag: '🇹🇼' },
  { iso: 'TZ', name: 'Tanzania', dialCode: '+255', flag: '🇹🇿' },
  { iso: 'TJ', name: 'Tayikistán', dialCode: '+992', flag: '🇹🇯' },
  { iso: 'IO', name: 'Territorio Británico del Océano Índico', dialCode: '+246', flag: '🇮🇴' },
  { iso: 'TF', name: 'Territorios Australes Franceses', dialCode: '+262', flag: '🇹🇫' },
  { iso: 'TL', name: 'Timor Oriental', dialCode: '+670', flag: '🇹🇱' },
  { iso: 'TG', name: 'Togo', dialCode: '+228', flag: '🇹🇬' },
  { iso: 'TK', name: 'Tokelau', dialCode: '+690', flag: '🇹🇰' },
  { iso: 'TO', name: 'Tonga', dialCode: '+676', flag: '🇹🇴' },
  { iso: 'TT', name: 'Trinidad y Tobago', dialCode: '+1', flag: '🇹🇹' },
  { iso: 'TN', name: 'Túnez', dialCode: '+216', flag: '🇹🇳' },
  { iso: 'TM', name: 'Turkmenistán', dialCode: '+993', flag: '🇹🇲' },
  { iso: 'TR', name: 'Turquía', dialCode: '+90', flag: '🇹🇷' },
  { iso: 'TV', name: 'Tuvalu', dialCode: '+688', flag: '🇹🇻' },
  { iso: 'UA', name: 'Ucrania', dialCode: '+380', flag: '🇺🇦' },
  { iso: 'UG', name: 'Uganda', dialCode: '+256', flag: '🇺🇬' },
  { iso: 'UY', name: 'Uruguay', dialCode: '+598', flag: '🇺🇾' },
  { iso: 'UZ', name: 'Uzbekistán', dialCode: '+998', flag: '🇺🇿' },
  { iso: 'VU', name: 'Vanuatu', dialCode: '+678', flag: '🇻🇺' },
  { iso: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  { iso: 'VN', name: 'Vietnam', dialCode: '+84', flag: '🇻🇳' },
  { iso: 'WF', name: 'Wallis y Futuna', dialCode: '+681', flag: '🇼🇫' },
  { iso: 'YE', name: 'Yemen', dialCode: '+967', flag: '🇾🇪' },
  { iso: 'DJ', name: 'Yibuti', dialCode: '+253', flag: '🇩🇯' },
  { iso: 'ZM', name: 'Zambia', dialCode: '+260', flag: '🇿🇲' },
  { iso: 'ZW', name: 'Zimbabue', dialCode: '+263', flag: '🇿🇼' },
];

/** País por defecto (Colombia) para preseleccionar en formularios. */
export const DEFAULT_COUNTRY_ISO = 'CO';

/**
 * Busca un país por su código ISO.
 */
export function getCountryByIso(iso: string): CountryPhoneCode | undefined {
  return countryPhoneCodes.find((c) => c.iso === iso);
}

/**
 * Intenta detectar el país y el número a partir de un teléfono guardado.
 * Soporta formatos: "+57 300 123 4567", "573001234567", "+1 555 123 4567".
 * Devuelve { iso, dialCode, number } o null si no coincide ningún dial code.
 */
export function parsePhoneString(
  raw: string,
): { iso: string; dialCode: string; number: string } | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, '');
  // Probar dial codes más largos primero para evitar coincidencias parciales (+1 vs +57)
  const sorted = [...countryPhoneCodes].sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  );
  for (const country of sorted) {
    const dial = country.dialCode.replace('+', '');
    if (cleaned.startsWith(`+${dial}`)) {
      return {
        iso: country.iso,
        dialCode: country.dialCode,
        number: cleaned.slice(dial.length + 1),
      };
    }
    if (cleaned.startsWith(dial) && !cleaned.startsWith('+')) {
      return {
        iso: country.iso,
        dialCode: country.dialCode,
        number: cleaned.slice(dial.length),
      };
    }
  }
  return null;
}

/**
 * Combina el código de país y el número en un solo string para guardar en BD.
 * Formato resultante: "+57 3001234567"
 */
export function formatPhoneForStorage(dialCode: string, number: string): string {
  const trimmedNumber = (number || '').replace(/[^\d]/g, '');
  if (!trimmedNumber) return '';
  return `${dialCode} ${trimmedNumber}`;
}
