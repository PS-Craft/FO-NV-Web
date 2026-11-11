// Debug-HUD: FPS und (wo verfügbar) JS-Heap. Wird später um Draw Calls/Texturspeicher erweitert.
export function startHud(el: HTMLElement): void {
  let frames = 0;
  let last = performance.now();
  const tick = (t: number) => {
    if (!el.isConnected) return;       // die Oberfläche wurde neu aufgebaut: diese Schleife beenden
    frames++;
    if (t - last >= 1000) {
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      el.textContent = `${Math.round((frames * 1000) / (t - last))} FPS${mem ? ` · ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB Heap` : ''}`;
      frames = 0;
      last = t;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
