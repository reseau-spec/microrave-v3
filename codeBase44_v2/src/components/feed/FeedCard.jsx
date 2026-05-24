import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { useNavigate } from 'react-router-dom';
import { Star, TrendingUp, Play, MapPin } from 'lucide-react';
import { DOMAIN_LABELS, getItemDomains } from './feedScoring';

// Couleurs de fond solides par domaine — fonctionnent même sans image
const DOMAIN_COLORS = {
  music:       { bg: '#1e1035', accent: '#7c3aed' },
  humour:      { bg: '#1a1200', accent: '#d97706' },
  art:         { bg: '#0d1a2e', accent: '#2563eb' },
  video:       { bg: '#1a0a0a', accent: '#dc2626' },
  photo:       { bg: '#0a1a0a', accent: '#16a34a' },
  food:        { bg: '#1a0e00', accent: '#ea580c' },
  responsable: { bg: '#001a0a', accent: '#059669' },
  default:     { bg: '#111827', accent: '#6366f1' },
};

// Couleurs par type de lieu
const TYPE_COLORS = {
  'Club':               { bg: '#0d0020', accent: '#7c3aed' },
  'Bar':                { bg: '#1a0800', accent: '#c2410c' },
  'Microbrasserie':     { bg: '#0a1400', accent: '#65a30d' },
  'Bistro':             { bg: '#1a0e00', accent: '#b45309' },
  'Pub':                { bg: '#0e1400', accent: '#4d7c0f' },
  'Karaokè':            { bg: '#1a0020', accent: '#9333ea' },
  'Salle de spectacle': { bg: '#0d1a00', accent: '#16a34a' },
  'Cabaret':            { bg: '#200010', accent: '#db2777' },
  'Studio':             { bg: '#001020', accent: '#0284c7' },
  'Coworking':          { bg: '#00101a', accent: '#0891b2' },
};

function getDomainColor(domainKey) {
  return DOMAIN_COLORS[domainKey] || DOMAIN_COLORS.default;
}
function getCheckpointColor(item) {
  return TYPE_COLORS[item?.type] || getDomainColor(item?.domainDominantKey);
}

// Impression hook
function useImpressionRef(key, onImpression) {
  const ref = useRef(null);
  const fired = useRef(false);
  useEffect(() => {
    if (!onImpression || fired.current) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && !fired.current) { fired.current = true; onImpression(); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onImpression, key]);
  return ref;
}

// Card shell — dimensions fixes px, pas de ratio dépendant du parent
// w/h inline style pour garantir le rendu dans tout contexte flex/overflow
function CardShell({ refProp, onClick, to, bgColor, accentColor, children }) {
  const style = {
    flexShrink: 0,
    width: 144,
    height: 200,
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',
    cursor: 'pointer',
    background: bgColor || '#111827',
    boxShadow: `0 2px 8px rgba(0,0,0,0.3), inset 0 0 40px ${accentColor}22`,
    transition: 'transform 0.2s, box-shadow 0.2s',
  };

  const hoverStyle = { transform: 'scale(1.04)', boxShadow: `0 8px 24px rgba(0,0,0,0.4), inset 0 0 60px ${accentColor}44` };

  const [hovered, setHovered] = React.useState(false);

  const combinedStyle = hovered ? { ...style, ...hoverStyle } : style;

  if (to) {
    return (
      <Link
        ref={refProp}
        to={to}
        style={combinedStyle}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Accent glow top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 80,
          background: `radial-gradient(ellipse at 50% 0%, ${accentColor}40, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        {children}
      </Link>
    );
  }
  return (
    <div
      ref={refProp}
      style={combinedStyle}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 80,
        background: `radial-gradient(ellipse at 50% 0%, ${accentColor}40, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      {children}
    </div>
  );
}

// Avatar initiales pour les talents sans image
function InitialsAvatar({ name, color }) {
  const initials = (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      width: 64, height: 64, borderRadius: '50%',
      background: `${color}33`, border: `2px solid ${color}66`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 22, fontWeight: 700, color: '#fff',
    }}>
      {initials}
    </div>
  );
}

// ── TalentCard ──────────────────────────────────────────────────────────────
export function TalentCard({ item, onTrack, onImpression }) {
  const domains = getItemDomains(item);
  const ref = useImpressionRef(item.id || item.userId, onImpression);
  const url = createPageUrl('Profile') + '?type=talent&id=' + item.userId;
  const primaryDomain = domains[0];
  const colors = getDomainColor(primaryDomain);
  const hasAvatar = !!item.avatarUrl;

  return (
    <CardShell refProp={ref} to={url} onClick={() => onTrack(item, 'feed_click')} bgColor={colors.bg} accentColor={colors.accent}>
      {/* Avatar image ou initiales */}
      {hasAvatar ? (
        <img
          src={item.avatarUrl}
          alt={item.displayName}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <InitialsAvatar name={item.displayName} color={colors.accent} />
      )}

      {/* Gradient bas */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
        background: 'linear-gradient(to top, rgba(0,0,0,0.92), transparent)',
      }} />

      {/* Momentum badge */}
      {item._momentum7d > 0 && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: '#10b981', color: '#fff',
          fontSize: 10, fontWeight: 700,
          padding: '2px 6px', borderRadius: 20,
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          ↑{item._momentum7d}
        </div>
      )}

      {/* Info bas */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 10px 10px' }}>
        {primaryDomain && (
          <div style={{
            display: 'inline-block', fontSize: 9, padding: '2px 6px', borderRadius: 20,
            background: `${colors.accent}33`, color: colors.accent,
            marginBottom: 4, fontWeight: 600,
          }}>
            {DOMAIN_LABELS[primaryDomain] || primaryDomain}
          </div>
        )}
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, lineHeight: 1.3,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {item.displayName}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 2 }}>Talent</div>
        {(item.sotsGlobalScore || 0) > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
            <span style={{ color: '#fbbf24', fontSize: 10 }}>★</span>
            <span style={{ color: '#fff', fontSize: 10, fontWeight: 600 }}>{item.sotsGlobalScore.toFixed(1)}</span>
          </div>
        )}
      </div>
    </CardShell>
  );
}

// ── CheckpointCard ──────────────────────────────────────────────────────────
export function CheckpointCard({ item, onTrack, onImpression }) {
  const domains = getItemDomains(item);
  const ref = useImpressionRef(item.id || item.systemId, onImpression);
  const url = createPageUrl('Profile') + '?type=checkpoint&id=' + item.systemId;
  const primaryDomain = item.domainDominantKey || domains[0];
  const colors = getCheckpointColor(item);
  const isLive = (item._liveStats?.momentumScore ?? 0) > 0;
  const hasCover = !!item.coverImageUrl;

  return (
    <CardShell refProp={ref} to={url} onClick={() => onTrack(item, 'feed_click')} bgColor={colors.bg} accentColor={colors.accent}>
      {hasCover && (
        <img
          src={item.coverImageUrl}
          alt={item.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}

      {/* Gradient bas */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 110,
        background: 'linear-gradient(to top, rgba(0,0,0,0.95), transparent)',
      }} />

      {/* Live + momentum badges */}
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        {isLive && (
          <div style={{
            background: '#f97316', color: '#fff', fontSize: 9, fontWeight: 700,
            padding: '2px 7px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
            Actif
          </div>
        )}
        {item._momentum7d > 0 && (
          <div style={{
            marginLeft: 'auto', background: '#10b981', color: '#fff',
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20,
          }}>
            ↑{item._momentum7d}
          </div>
        )}
      </div>

      {/* Info bas */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 10px 10px' }}>
        {primaryDomain && (
          <div style={{
            display: 'inline-block', fontSize: 9, padding: '2px 6px', borderRadius: 20,
            background: `${colors.accent}33`, color: colors.accent,
            marginBottom: 4, fontWeight: 600,
          }}>
            {DOMAIN_LABELS[primaryDomain] || primaryDomain}
          </div>
        )}
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 12, lineHeight: 1.3,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {item.name}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>{item.type || 'Lieu'}</div>
      </div>
    </CardShell>
  );
}

// ── OpenSessionCard ─────────────────────────────────────────────────────────
export function OpenSessionCard({ item, onTrack, onImpression }) {
  const domains = getItemDomains(item);
  const ref = useImpressionRef(item.id, onImpression);
  const navigate = useNavigate();
  const participants = item.participants?.length || 0;
  const max = item.maxPlayers || 6;
  const fillPct = Math.round((participants / max) * 100);

  function handleClick() {
    onTrack(item, 'feed_click');
    navigate(createPageUrl('Play') + '?sessionId=' + item.id);
  }

  return (
    <CardShell refProp={ref} onClick={handleClick} bgColor="#052e16" accentColor="#22c55e">
      {/* Top badge */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        background: '#22c55e', color: '#000', fontSize: 9, fontWeight: 700,
        padding: '2px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#000' }} />
        Ouverte
      </div>

      {/* Play icon center */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)',
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: '#fff', fontSize: 18, marginLeft: 3 }}>▶</span>
      </div>

      {/* Bottom */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 10px 10px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
          {domains.slice(0, 2).map(d => (
            <span key={d} style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 20,
              background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)',
            }}>
              {DOMAIN_LABELS[d] || d}
            </span>
          ))}
        </div>
        <div style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{participants}/{max} joueurs</div>
        <div style={{ marginTop: 6, height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }}>
          <div style={{ height: 2, borderRadius: 2, background: '#22c55e', width: `${fillPct}%` }} />
        </div>
      </div>
    </CardShell>
  );
}

// ── DoneSessionCard ─────────────────────────────────────────────────────────
export function DoneSessionCard({ item, onTrack, onImpression }) {
  const domains = getItemDomains(item);
  const ref = useImpressionRef(item.id, onImpression);
  const navigate = useNavigate();
  const score = item.sessionSotsScore ?? item.sotsGlobalScore ?? 0;
  const stars = score > 0 ? Math.round(Number(score)) : 0;

  function handleClick() {
    onTrack(item, 'feed_click');
    // Play.jsx accepte ?sessionId= — pour les sessions archivées il affiche la vue post-session
    navigate(createPageUrl('Play') + '?sessionId=' + item.id);
  }

  return (
    <CardShell refProp={ref} onClick={handleClick} bgColor="#0f172a" accentColor="#6366f1">
      {stars > 0 && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: '#f59e0b', color: '#000', fontSize: 9, fontWeight: 700,
          padding: '2px 6px', borderRadius: 20,
        }}>
          ★ {Number(score).toFixed(1)}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 10px 10px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
          {domains.slice(0, 2).map(d => (
            <span key={d} style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 20,
              background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)',
            }}>
              {DOMAIN_LABELS[d] || d}
            </span>
          ))}
        </div>
        <div style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>Session {item.sessionType}</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>
          {item.participants?.length || 0} participants
        </div>
        {stars > 0 && (
          <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
            {[1,2,3,4,5].map(n => (
              <span key={n} style={{ fontSize: 10, color: n <= stars ? '#fbbf24' : 'rgba(255,255,255,0.15)' }}>★</span>
            ))}
          </div>
        )}
      </div>
    </CardShell>
  );
}