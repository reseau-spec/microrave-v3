import React, { useEffect, useRef } from 'react';

/**
 * ImpressionObserver — wraps a card and fires onImpression once when visible >= 2s.
 * Anti-spam: 1 impression max per itemId per mount (via firedRef).
 */
export default function ImpressionObserver({ itemId, item, onImpression, children }) {
  const ref = useRef(null);
  const firedRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!onImpression || firedRef.current) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !firedRef.current) {
          timerRef.current = setTimeout(() => {
            if (!firedRef.current) {
              firedRef.current = true;
              onImpression(itemId, item);
            }
          }, 2000);
        } else {
          // Left viewport before 2s — cancel
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [itemId, item, onImpression]);

  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}