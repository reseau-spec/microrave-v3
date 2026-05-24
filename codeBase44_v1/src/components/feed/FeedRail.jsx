/**
 * FeedRail — carrousel horizontal avec pagination réelle par callback.
 *
 * Props :
 *   title       — string
 *   icon        — string emoji
 *   items       — items actuellement affichés (20 au départ)
 *   hasMore     — bool : y a-t-il d'autres items disponibles côté Feed.jsx ?
 *   onLoadMore  — () => void : appelé quand l'utilisateur arrive en fin de rail
 *   isLoadingMore — bool : true pendant que Feed.jsx prépare le prochain batch
 *   renderItem  — (item) => ReactNode
 *   emptyLabel  — string
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const LOAD_THRESHOLD = 120; // px avant la fin pour déclencher onLoadMore

export default function FeedRail({ title, icon, items, hasMore, onLoadMore, isLoadingMore, renderItem, emptyLabel }) {
  const scrollRef = useRef(null);
  const triggerRef = useRef(false); // anti double-call

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || triggerRef.current || !hasMore || isLoadingMore) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - LOAD_THRESHOLD) {
      triggerRef.current = true;
      onLoadMore?.();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  // Reset trigger quand de nouveaux items arrivent
  useEffect(() => {
    triggerRef.current = false;
  }, [items.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  function scrollBy(dir) {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'right' ? 460 : -460, behavior: 'smooth' });
  }

  return (
    <section style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, paddingLeft: 16, paddingRight: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{title}</span>
          {items.length > 0 && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>({items.length}{hasMore ? '+' : ''})</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => scrollBy('left')} style={{
            width: 24, height: 24, borderRadius: '50%', border: 'none',
            background: '#f3f4f6', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronLeft size={14} color="#6b7280" />
          </button>
          <button onClick={() => scrollBy('right')} style={{
            width: 24, height: 24, borderRadius: '50%', border: 'none',
            background: '#f3f4f6', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronRight size={14} color="#6b7280" />
          </button>
        </div>
      </div>

      {/* Rail */}
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic', padding: '12px 16px' }}>
          {emptyLabel || 'Aucun élément'}
        </p>
      ) : (
        <div
          ref={scrollRef}
          style={{
            display: 'flex', gap: 10,
            overflowX: 'auto', overflowY: 'visible',
            height: 216,
            paddingLeft: 16, paddingRight: 16, paddingBottom: 8,
            scrollbarWidth: 'none', msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {items.map(renderItem)}

          {/* Loader discret — visible seulement quand hasMore ET en cours */}
          {hasMore && (
            <div style={{
              flexShrink: 0, width: 48, height: 200,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isLoadingMore ? (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  border: '2px solid #e5e7eb', borderTopColor: '#6366f1',
                  animation: 'feedSpin 0.7s linear infinite',
                }} />
              ) : (
                // Indicateur silencieux "il y en a plus" — pas de spinner tant que pas en train de charger
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, opacity: 0.25 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#6b7280' }} />
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#6b7280' }} />
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#6b7280' }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes feedSpin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}