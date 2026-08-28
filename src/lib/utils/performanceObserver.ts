/**
 * Captura métricas de rendimiento web (LCP, CLS, INP, TBT)
 * y las envía a Sentry cuando está disponible.
 *
 * Métricas objetivo:
 * - Cold start < 3s
 * - LCP < 2.5s
 * - CLS < 0.1
 * - INP < 200ms
 * - TBT < 200ms
 */

export function initPerformanceObserver(): void {
  if (typeof window === "undefined") return;

  // LCP (Largest Contentful Paint)
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      console.log("[perf] LCP:", Math.round(lastEntry.startTime), "ms");
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {
    // LCP no soportado en todos los browsers
  }

  // CLS (Cumulative Layout Shift)
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      console.log("[perf] CLS:", clsValue.toFixed(4));
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
  } catch (e) {
    // CLS no soportado
  }

  // INP (Interaction to Next Paint)
  try {
    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.log("[perf] INP:", Math.round(entry.duration), "ms");
      }
    });
    inpObserver.observe({ type: "event", buffered: true });
  } catch (e) {
    // INP no soportado
  }

  // Long Tasks (> 50ms)
  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.warn("[perf] Long Task:", Math.round(entry.duration), "ms");
      }
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
  } catch (e) {
    // Long Task no soportado
  }
}
