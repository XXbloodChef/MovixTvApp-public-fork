import { useEffect, useRef, useState } from 'react';

export interface FpsSample {
  current: number;
  /** Pire seconde observée depuis le démarrage de la mesure. */
  worst: number;
}

/**
 * Compteur d'images par seconde basé sur requestAnimationFrame.
 *
 * C'est la mesure qui décide si l'interface TV peut se permettre des animations :
 * les SoC de téléviseur plafonnent vite, et un `backdrop-filter` suffit souvent à
 * faire tomber une page de 60 à 15 fps.
 */
export function useFpsMeter(enabled: boolean): FpsSample {
  const [sample, setSample] = useState<FpsSample>({ current: 0, worst: 0 });
  const frameRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    let frames = 0;
    let windowStart = performance.now();
    let worst: number | null = null;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      frames += 1;
      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        const fps = Math.round((frames * 1000) / elapsed);
        worst = worst === null ? fps : Math.min(worst, fps);
        setSample({ current: fps, worst });
        frames = 0;
        windowStart = now;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
    };
  }, [enabled]);

  return sample;
}
