'use client';

/**
 * AuthSceneBackground
 * Fondo decorativo animado para las páginas de auth (login/signup).
 * Contiene ilustraciones SVG: un planeta que gira, una nube que se desplaza
 * y un cohete que viaja en diagonal. Solo visible en desktop (>= lg).
 */

export default function AuthSceneBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* ===== Planeta que gira ===== */}
      <div
        className="absolute top-1/4 right-[12%] opacity-25"
        style={{ animation: 'auth-float 8s ease-in-out infinite' }}
      >
        <svg width="140" height="140" viewBox="0 0 140 140" fill="none">
          {/* Anillo del planeta */}
          <ellipse
            cx="70"
            cy="70"
            rx="65"
            ry="20"
            stroke="white"
            strokeWidth="2"
            opacity="0.4"
            transform="rotate(-20 70 70)"
          />
          {/* Cuerpo del planeta */}
          <circle cx="70" cy="70" r="38" fill="white" opacity="0.15" />
          <circle cx="70" cy="70" r="38" stroke="white" strokeWidth="1.5" opacity="0.5" />
          {/* Continentes (giran) */}
          <g style={{ transformOrigin: '70px 70px', animation: 'auth-spin 30s linear infinite' }}>
            <path
              d="M55 55 Q62 48 70 52 Q78 56 75 62 Q72 68 65 66 Q58 64 55 55 Z"
              fill="white"
              opacity="0.35"
            />
            <path
              d="M72 78 Q80 74 85 80 Q88 86 82 88 Q76 90 72 84 Z"
              fill="white"
              opacity="0.3"
            />
            <path
              d="M50 72 Q56 70 58 76 Q56 82 50 80 Q46 77 50 72 Z"
              fill="white"
              opacity="0.25"
            />
          </g>
          {/* Anillo frontal (encima del planeta) */}
          <path
            d="M10 70 Q70 100 130 70"
            stroke="white"
            strokeWidth="2"
            opacity="0.3"
            fill="none"
            transform="rotate(-20 70 70)"
          />
        </svg>
      </div>

      {/* ===== Nubes (varias, distintos tamaños, velocidades y posiciones) ===== */}
      {/* Nube grande abajo-izquierda */}
      <div
        className="absolute bottom-[18%] left-[3%] opacity-25"
        style={{ animation: 'auth-cloud-drift 25s linear infinite' }}
      >
        <svg width="120" height="60" viewBox="0 0 120 60" fill="none">
          <path d="M25 45 Q10 45 10 35 Q10 25 22 25 Q24 15 36 15 Q44 8 54 14 Q64 8 74 16 Q86 14 90 24 Q104 24 104 35 Q104 45 92 45 Z" fill="white" opacity="0.6" />
        </svg>
      </div>

      {/* Nube mediana arriba-centro */}
      <div
        className="absolute top-[12%] left-[20%] opacity-20"
        style={{ animation: 'auth-cloud-drift 35s linear infinite', animationDelay: '-10s' }}
      >
        <svg width="80" height="40" viewBox="0 0 80 40" fill="none">
          <path d="M18 30 Q6 30 6 22 Q6 14 16 14 Q18 7 28 7 Q35 3 42 8 Q50 3 56 10 Q66 10 66 20 Q66 30 56 30 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* Nube pequeña arriba-derecha, rápida */}
      <div
        className="absolute top-[6%] left-[55%] opacity-18"
        style={{ animation: 'auth-cloud-drift 20s linear infinite', animationDelay: '-5s' }}
      >
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none">
          <path d="M15 22 Q4 22 4 16 Q4 10 12 10 Q14 4 22 4 Q28 1 34 5 Q42 2 46 8 Q54 8 54 16 Q54 22 46 22 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* Nube grande medio-centro, muy lenta */}
      <div
        className="absolute top-[42%] left-[8%] opacity-15"
        style={{ animation: 'auth-cloud-drift 45s linear infinite', animationDelay: '-20s' }}
      >
        <svg width="150" height="70" viewBox="0 0 150 70" fill="none">
          <path d="M30 52 Q12 52 12 40 Q12 28 26 28 Q28 16 42 16 Q52 8 64 14 Q76 8 88 18 Q102 16 108 28 Q124 28 124 40 Q124 52 108 52 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* Nube mediana abajo-derecha */}
      <div
        className="absolute bottom-[30%] left-[45%] opacity-18"
        style={{ animation: 'auth-cloud-drift 30s linear infinite', animationDelay: '-15s' }}
      >
        <svg width="90" height="45" viewBox="0 0 90 45" fill="none">
          <path d="M20 34 Q6 34 6 24 Q6 16 16 16 Q18 8 28 8 Q36 4 44 9 Q54 4 60 12 Q72 12 72 22 Q72 34 60 34 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* Nube pequeña abajo-centro, velocidad media */}
      <div
        className="absolute bottom-[5%] left-[25%] opacity-15"
        style={{ animation: 'auth-cloud-drift 28s linear infinite', animationDelay: '-8s' }}
      >
        <svg width="55" height="28" viewBox="0 0 55 28" fill="none">
          <path d="M14 20 Q4 20 4 14 Q4 8 11 8 Q13 3 20 3 Q26 1 32 5 Q40 2 44 8 Q50 8 50 14 Q50 20 44 20 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* Nube mini arriba-lejana, muy lenta */}
      <div
        className="absolute top-[25%] left-[70%] opacity-12"
        style={{ animation: 'auth-cloud-drift 50s linear infinite', animationDelay: '-25s' }}
      >
        <svg width="45" height="22" viewBox="0 0 45 22" fill="none">
          <path d="M11 16 Q3 16 3 11 Q3 6 9 6 Q11 2 16 2 Q21 0 26 4 Q32 1 35 6 Q41 6 41 11 Q41 16 35 16 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* Nube grande abajo-derecha, velocidad lenta */}
      <div
        className="absolute bottom-[12%] left-[60%] opacity-20"
        style={{ animation: 'auth-cloud-drift 32s linear infinite', animationDelay: '-12s' }}
      >
        <svg width="110" height="55" viewBox="0 0 110 55" fill="none">
          <path d="M22 42 Q8 42 8 32 Q8 22 20 22 Q22 12 34 12 Q42 6 52 12 Q62 6 72 14 Q84 12 88 22 Q100 22 100 32 Q100 42 86 42 Z" fill="white" opacity="0.55" />
        </svg>
      </div>

      {/* Nube mediana arriba-derecha, velocidad media */}
      <div
        className="absolute top-[38%] left-[65%] opacity-15"
        style={{ animation: 'auth-cloud-drift 27s linear infinite', animationDelay: '-18s' }}
      >
        <svg width="75" height="38" viewBox="0 0 75 38" fill="none">
          <path d="M17 28 Q5 28 5 20 Q5 12 14 12 Q16 6 24 6 Q31 2 38 7 Q47 3 52 10 Q62 10 62 18 Q62 28 52 28 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* Nube pequeña medio-derecha, rápida */}
      <div
        className="absolute top-[55%] left-[50%] opacity-14"
        style={{ animation: 'auth-cloud-drift 22s linear infinite', animationDelay: '-3s' }}
      >
        <svg width="50" height="25" viewBox="0 0 50 25" fill="none">
          <path d="M13 18 Q3 18 3 13 Q3 7 10 7 Q12 2 18 2 Q24 0 30 4 Q37 1 40 6 Q46 6 46 12 Q46 18 40 18 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* Nube mini abajo-lejana, muy lenta */}
      <div
        className="absolute bottom-[45%] left-[40%] opacity-10"
        style={{ animation: 'auth-cloud-drift 55s linear infinite', animationDelay: '-30s' }}
      >
        <svg width="40" height="20" viewBox="0 0 40 20" fill="none">
          <path d="M10 15 Q2 15 2 10 Q2 5 8 5 Q10 1 15 1 Q20 0 24 3 Q30 1 33 5 Q38 5 38 10 Q38 15 33 15 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* ===== Cohete que viaja en diagonal ===== */}
      <div
        className="absolute bottom-[10%] right-[15%] opacity-30"
        style={{ animation: 'auth-rocket-travel 12s ease-in-out infinite' }}
      >
        <svg width="70" height="120" viewBox="0 0 70 120" fill="none">
          {/* Estela del cohete */}
          <path
            d="M35 95 Q33 105 35 115 Q37 105 35 95"
            fill="white"
            opacity="0.3"
            style={{ animation: 'auth-flicker 0.3s ease-in-out infinite' }}
          />
          <path
            d="M30 90 Q28 100 30 110 Q32 100 30 90"
            fill="white"
            opacity="0.2"
            style={{ animation: 'auth-flicker 0.25s ease-in-out infinite', animationDelay: '0.1s' }}
          />
          <path
            d="M40 90 Q38 100 40 110 Q42 100 40 90"
            fill="white"
            opacity="0.2"
            style={{ animation: 'auth-flicker 0.25s ease-in-out infinite', animationDelay: '0.15s' }}
          />
          {/* Cuerpo del cohete */}
          <path
            d="M35 10 Q45 25 45 55 L45 80 Q45 90 35 90 Q25 90 25 80 L25 55 Q25 25 35 10 Z"
            fill="white"
            opacity="0.85"
          />
          {/* Ventana */}
          <circle cx="35" cy="40" r="6" fill="#1e3a8a" opacity="0.6" />
          <circle cx="35" cy="40" r="6" stroke="white" strokeWidth="1.5" opacity="0.5" />
          {/* Aletas */}
          <path d="M25 70 L15 85 L25 80 Z" fill="white" opacity="0.7" />
          <path d="M45 70 L55 85 L45 80 Z" fill="white" opacity="0.7" />
          {/* Punta */}
          <path d="M35 10 Q40 18 40 25 L30 25 Q30 18 35 10 Z" fill="white" opacity="0.95" />
        </svg>
      </div>

      {/* ===== Estrellas dispersas por toda la pantalla ===== */}
      <div className="absolute inset-0">
        {[
          { top: '12%', left: '8%', size: 3, delay: '0s' },
          { top: '22%', left: '60%', size: 2, delay: '1s' },
          { top: '45%', left: '15%', size: 2.5, delay: '2s' },
          { top: '60%', left: '70%', size: 2, delay: '0.5s' },
          { top: '75%', left: '40%', size: 3, delay: '1.5s' },
          { top: '85%', left: '85%', size: 2, delay: '2.5s' },
          { top: '35%', left: '88%', size: 2.5, delay: '3s' },
          { top: '8%', left: '45%', size: 2, delay: '0.8s' },
          { top: '50%', left: '50%', size: 2, delay: '1.2s' },
          { top: '18%', left: '80%', size: 2.5, delay: '2.2s' },
          { top: '68%', left: '25%', size: 2, delay: '0.3s' },
          { top: '90%', left: '55%', size: 3, delay: '1.8s' },
          { top: '28%', left: '38%', size: 2, delay: '2.8s' },
          { top: '55%', left: '82%', size: 2.5, delay: '0.6s' },
          { top: '40%', left: '5%', size: 2, delay: '1.4s' },
          { top: '15%', left: '92%', size: 2, delay: '2.6s' },
        ].map((star, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              top: star.top,
              left: star.left,
              width: `${star.size}px`,
              height: `${star.size}px`,
              opacity: 0.5,
              animation: `auth-twinkle 3s ease-in-out infinite`,
              animationDelay: star.delay,
            }}
          />
        ))}
      </div>

      {/* Keyframes inline (scoped via <style>) */}
      <style jsx>{`
        @keyframes auth-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes auth-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        @keyframes auth-cloud-drift {
          0% { transform: translateX(-30px); }
          100% { transform: translateX(calc(100vw + 30px)); }
        }
        @keyframes auth-rocket-travel {
          0% { transform: translate(0, 20px) rotate(-15deg); }
          50% { transform: translate(-30px, -40px) rotate(-15deg); }
          100% { transform: translate(0, 20px) rotate(-15deg); }
        }
        @keyframes auth-twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.7; }
        }
        @keyframes auth-flicker {
          0%, 100% { opacity: 0.15; transform: scaleY(1); }
          50% { opacity: 0.35; transform: scaleY(1.15); }
        }
      `}</style>
    </div>
  );
}
