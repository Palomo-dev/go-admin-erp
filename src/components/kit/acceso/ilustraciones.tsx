/**
 * Ilustraciones del acceso: el viajero y las piezas de su cielo.
 *
 * Personaje PROPIO de GO Admin (decisión v2-1, docs/design/AUTH-ACCESO-V2.md §0 y
 * §7): un viajero de abrigo claro y bufanda Azul GO, inspirado en El Principito
 * y dibujado desde cero. No se usan los dibujos, la rosa, el zorro ni citas de
 * la obra original.
 *
 * Trazos exportados de Figma (`02 Componentes › Fundamentos › Ilustración · El
 * viajero y su cielo`, 2026-09-29) con cada color cambiado por su variable
 * `auth/ilus-*` (tokens.css): el mismo dibujo es de día en tema claro y de noche
 * en tema oscuro. Decorativas: `aria-hidden`.
 */

/** Viajero de pie sobre su planeta (Figma `Ilustración/Viajero` Pose=De pie, 1069:665528). Colores `auth/ilus-*`: sigue el tema. */
export function ViajeroDePie({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 360" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M40 300C40 250 95 226 160 226C225 226 280 250 280 300C280 338 230 356 160 356C90 356 40 338 40 300Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M78 268C84.6667 264 92 263.333 100 266" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M212 306C219.732 306 226 303.314 226 300C226 296.686 219.732 294 212 294C204.268 294 198 296.686 198 300C198 303.314 204.268 306 212 306Z" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M112 326C116.971 326 121 324.209 121 322C121 319.791 116.971 318 112 318C107.029 318 103 319.791 103 322C103 324.209 107.029 326 112 326Z" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M244 266C249.333 268 253.333 271.333 256 276" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M176 338.5C177.381 338.5 178.5 337.381 178.5 336C178.5 334.619 177.381 333.5 176 333.5C174.619 333.5 173.5 334.619 173.5 336C173.5 337.381 174.619 338.5 176 338.5Z" className="fill-auth-ilus-linea" />
      <path d="M232 238C232 226 233 216 236 206" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M235 214C226 206 214 206 208 212C216 220 228 220 235 214Z" className="fill-auth-ilus-acento-suave stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M236 206C242 196 254 194 262 198C256 208 244 210 236 206Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M146 196L143 229" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M168 196L171 229" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M132 232C132 226 138 226 145 228L147 233L133 234L132 232Z" className="fill-auth-ilus-linea stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M169 228C176 226 183 226 183 232L181 234L168 233L169 228Z" className="fill-auth-ilus-linea stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M140 134C132 150 128 178 124 202C142 208 172 208 190 202C186 178 182 150 174 134C164 130 150 130 140 134Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M157 138V204" className="stroke-auth-ilus-linea" strokeWidth={1.8} />
      <path d="M151 157.8C151.994 157.8 152.8 156.994 152.8 156C152.8 155.006 151.994 154.2 151 154.2C150.006 154.2 149.2 155.006 149.2 156C149.2 156.994 150.006 157.8 151 157.8Z" className="fill-auth-ilus-linea" />
      <path d="M151 173.8C151.994 173.8 152.8 172.994 152.8 172C152.8 171.006 151.994 170.2 151 170.2C150.006 170.2 149.2 171.006 149.2 172C149.2 172.994 150.006 173.8 151 173.8Z" className="fill-auth-ilus-linea" />
      <path d="M130 186C148 190 166 190 184 186" className="stroke-auth-ilus-linea" strokeWidth={1.8} />
      <path d="M140 140C132 156 128 170 130 182" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M130 189C132.209 189 134 187.209 134 185C134 182.791 132.209 181 130 181C127.791 181 126 182.791 126 185C126 187.209 127.791 189 130 189Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M174 140C186 150 194 160 198 166" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M210.854 145.311L198.971 146.981C194.049 147.673 190.619 152.224 191.311 157.146L192.981 169.029C193.673 173.951 198.224 177.381 203.146 176.689L215.029 175.019C219.951 174.327 223.381 169.776 222.689 164.854L221.019 152.971C220.327 148.049 215.776 144.619 210.854 145.311Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2.2} />
      <path d="M200 142L197 136M209 139V132M218 142L221 136" className="stroke-auth-ilus-acento" strokeWidth={2} />
      <path d="M198 172C200.209 172 202 170.209 202 168C202 165.791 200.209 164 198 164C195.791 164 194 165.791 194 168C194 170.209 195.791 172 198 172Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M136 104C136 88 146 78 158 78C171 78 180 88 180 103C180 119 171 130 158 130C145 130 136 120 136 104Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M136 98C132 90 136 82 142 82C140 74 148 68 155 72C158 64 170 64 172 72C180 70 186 78 182 86C188 90 186 98 180 100C176 92 170 88 164 90C160 84 152 84 148 90C144 88 138 92 136 98Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.2} />
      <path d="M150 78C152.667 76.6667 155 77 157 79M163 76C165.667 75.3334 167.667 76.3334 169 79" className="stroke-auth-ilus-linea" strokeWidth={1.6} />
      <path d="M184 84C189.333 82.6667 193.667 80 197 76M186 92C190.667 92.6667 194.667 91.6667 198 89" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M151 109C152.105 109 153 107.657 153 106C153 104.343 152.105 103 151 103C149.895 103 149 104.343 149 106C149 107.657 149.895 109 151 109Z" className="fill-auth-ilus-linea" />
      <path d="M167 109C168.105 109 169 107.657 169 106C169 104.343 168.105 103 167 103C165.895 103 165 104.343 165 106C165 107.657 165.895 109 167 109Z" className="fill-auth-ilus-linea" />
      <path d="M155 118C157.667 120 160.333 120 163 118" className="stroke-auth-ilus-linea" strokeWidth={1.8} />
      <path d="M143 114C145 114.667 146.667 114.667 148 114M170 114C172 114.667 173.667 114.667 175 114" className="stroke-auth-ilus-rubor" strokeWidth={2} />
      <path d="M140 128C150 136 166 136 176 128L178 136C168 144 148 144 138 136L140 128Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2.2} />
      <path d="M172 134C196 128 214 112 236 116C256 120 268 108 284 98C282 112 270 128 252 132C232 136 216 132 200 144C192 150 180 146 172 140V134Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2.2} />
      <path d="M284 98L290 94M282 106L289 105" className="stroke-auth-ilus-linea" strokeWidth={1.8} />
    </svg>
  );
}

/** Viajero sentado mirando las estrellas (Figma `Ilustración/Viajero` Pose=Sentado, 1124:35317). */
export function ViajeroSentado({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 300" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M30 250C30 205 90 186 160 186C230 186 290 205 290 250C290 284 236 298 160 298C84 298 30 284 30 250Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M96 255C103.18 255 109 252.761 109 250C109 247.239 103.18 245 96 245C88.8203 245 83 247.239 83 250C83 252.761 88.8203 255 96 255Z" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M228 222C234 224 238.333 227.333 241 232" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M190 278.5C191.381 278.5 192.5 277.381 192.5 276C192.5 274.619 191.381 273.5 190 273.5C188.619 273.5 187.5 274.619 187.5 276C187.5 277.381 188.619 278.5 190 278.5Z" className="fill-auth-ilus-linea" />
      <path d="M150 285.5C154.418 285.5 158 283.933 158 282C158 280.067 154.418 278.5 150 278.5C145.582 278.5 142 280.067 142 282C142 283.933 145.582 285.5 150 285.5Z" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M250 200C250 190 251 182 254 174" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M253 182C244 174 232 174 226 180C234 188 246 188 253 182Z" className="fill-auth-ilus-acento-suave stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M254 174C260 164 272 162 280 166C274 176 262 178 254 174Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M112 112C104 128 99.9998 158 102 186C120 192 148 192 160 186C156 160 150 128 142 112C132 108 120 108 112 112Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M128 116V150" className="stroke-auth-ilus-linea" strokeWidth={1.8} />
      <path d="M132 184C140 168 158 150 180 146C188 146 192 152 190 160L196 186L182 188L176 164C164 170 154 180 150 188L132 184Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M178 186C184 182 196 182 202 186L201 191H178V186Z" className="fill-auth-ilus-linea stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M140 122C150 134 164 142 178 148" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M180 153C182.209 153 184 151.209 184 149C184 146.791 182.209 145 180 145C177.791 145 176 146.791 176 149C176 151.209 177.791 153 180 153Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M107.137 89.2628C103.267 73.7381 110.55 61.6159 122.194 58.7129C134.808 55.5679 145.96 63.0935 149.588 77.648C153.459 93.1727 147.388 106.023 134.774 109.168C122.16 112.313 111.008 104.788 107.137 89.2628Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M105.686 83.4411C99.8691 76.6464 101.815 67.9163 107.637 66.4648C103.761 59.1863 110.072 51.4291 117.831 53.6169C118.807 45.1287 130.45 42.2257 134.326 49.5042C141.605 45.6282 149.362 51.9391 147.416 60.6691C154.206 63.0988 154.201 71.345 148.863 74.7371C143.046 67.9424 136.257 65.5128 130.919 68.9049C125.586 64.0508 117.824 65.9862 115.394 72.7756C111.029 71.8027 106.175 77.1354 105.686 83.4411Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.2} />
      <path d="M148.873 58.2447C153.725 55.6607 157.285 52.0249 159.551 47.3373M152.749 65.5232C157.438 65.0411 161.078 63.1031 163.667 59.7092" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M123.388 88.303C124.459 88.0358 125.003 86.5159 124.603 84.9083C124.202 83.3006 123.008 82.214 121.936 82.4812C120.864 82.7485 120.321 84.2683 120.721 85.876C121.122 87.4836 122.316 88.5702 123.388 88.303Z" className="fill-auth-ilus-linea" />
      <path d="M138.913 84.4322C139.984 84.1649 140.528 82.6451 140.127 81.0374C139.727 79.4298 138.533 78.3432 137.461 78.6104C136.389 78.8776 135.845 80.3975 136.246 82.0051C136.647 83.6128 137.841 84.6994 138.913 84.4322Z" className="fill-auth-ilus-linea" />
      <path d="M130.658 96.7964C132.922 97.6063 134.862 97.1224 136.48 95.3449" className="stroke-auth-ilus-linea" strokeWidth={1.8} />
      <path d="M116.107 96.302C118.209 96.465 119.826 96.0618 120.958 95.0924M143.275 89.5282C145.377 89.6912 146.994 89.288 148.126 88.3186" className="stroke-auth-ilus-rubor" strokeWidth={2} />
      <path d="M110 108C120 116 136 116 146 108L148 116C138 124 118 124 108 116L110 108Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2.2} />
      <path d="M110 114C92 118 78 104 60 108C42 112 32 104 18 96C22 110 34 124 52 126C70 128 84 124 100 132C106 134 110 126 110 120V114Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2.2} />
    </svg>
  );
}

/** Planeta con anillo (Figma `Ilustración/Planeta` 1069:665563). */
export function Planeta({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 160" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M34.0001 104C8.00004 118 4.00004 132 22.0001 134C48.0001 137 108 122 156 96C192 76 202 56 186 52C176 50 162 52 146 58" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M100 128C125.405 128 146 107.405 146 82C146 56.5949 125.405 36 100 36C74.5949 36 54 56.5949 54 82C54 107.405 74.5949 128 100 128Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M60 104C82 108 118 98 146 80" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M34.0001 104C8.00004 118 4.00004 132 22.0001 134C48.0001 137 108 122 156 96" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M74 60C80.6667 54.6666 88 53.3333 96 56" className="stroke-auth-ilus-acento" strokeWidth={3} />
      <path d="M118 69C120.761 69 123 66.7614 123 64C123 61.2386 120.761 59 118 59C115.239 59 113 61.2386 113 64C113 66.7614 115.239 69 118 69Z" className="fill-auth-ilus-acento" />
      <path d="M86 95C87.6569 95 89 93.6569 89 92C89 90.3431 87.6569 89 86 89C84.3431 89 83 90.3431 83 92C83 93.6569 84.3431 95 86 95Z" className="fill-auth-ilus-linea" />
    </svg>
  );
}

/** Cohete (Figma `Ilustración/Cohete` 1069:665575). */
export function Cohete({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 200" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M48 150C46 168 54 182 60 194C66 182 74 168 72 150H48Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2.2} />
      <path d="M54 152C54 164 58 172 60 178C62 172 66 164 66 152H54Z" className="fill-auth-ilus-relleno" />
      <path d="M60 10C82 28 90 62 88 100L86 146H34L32 100C30 62 38 28 60 10Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M44 34C52 28 68 28 76 34" className="stroke-auth-ilus-linea" strokeWidth={2} />
      <path d="M60 85C67.1797 85 73 79.1797 73 72C73 64.8203 67.1797 59 60 59C52.8203 59 47 64.8203 47 72C47 79.1797 52.8203 85 60 85Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M54 66C56.6667 64 59.3333 63.3333 62 64" className="stroke-auth-ilus-relleno" strokeWidth={2} />
      <path d="M34 108C20 116 14 134 16 152L34 140V108Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M86 108C100 116 106 134 104 152L86 140V108Z" className="fill-auth-ilus-acento stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M60 112V146" className="stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M40 146H80L76 154H44L40 146Z" className="fill-auth-ilus-linea stroke-auth-ilus-linea" strokeWidth={2} />
    </svg>
  );
}

/** Luna creciente (Figma `Ilustración/Luna` 1069:665582). */
export function Luna({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 160" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M69.9998 10C33.9998 22 17.9998 60 27.9998 96C37.9998 132 71.9998 152 106 146C73.9998 132 55.9998 104 55.9998 74C55.9998 46 63.9998 24 69.9998 10Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2.5} />
      <path d="M44 70L48 73M40 96C43.3333 97.3333 46.3333 97 49 95M56 124L61 126" className="stroke-auth-ilus-linea" strokeWidth={2} />
    </svg>
  );
}

/** Estrella de trazo (Figma `Ilustración/Estrella` 1069:665585). */
export function EstrellaTrazo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M20 4L24 15L36 16L27 23L30 35L20 28L10 35L13 23L4 16L16 15L20 4Z" className="fill-auth-ilus-relleno stroke-auth-ilus-linea" strokeWidth={2} />
    </svg>
  );
}

/** Nube (Figma `Ilustración/Nube` 1069:665578). Blanca; la opacidad la pone quien la usa. */
export function Nube({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 110 70" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path d="M25 55C25 45 30 40 40 40C44 30 51.3333 26.6667 62 30C71.3333 23.3334 79.3333 24.3334 86 33C95.3333 33 100 38 100 48C100 56 95 60 85 60H32C27.3333 60 25 58.3334 25 55Z" className="fill-auth-estrella" />
    </svg>
  );
}
