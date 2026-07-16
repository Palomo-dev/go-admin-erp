/**
 * Reproduce un beep corto usando Web Audio API, sin depender de archivos de audio.
 * Útil para notificaciones ligeras (ej. nuevo ticket de cocina).
 */
export function playNotificationBeep(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);

    // Cerrar el contexto después de reproducir para liberar recursos
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch (error) {
    console.warn('No se pudo reproducir el sonido de notificación:', error);
  }
}
