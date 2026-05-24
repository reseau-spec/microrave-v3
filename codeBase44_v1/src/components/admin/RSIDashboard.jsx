/**
 * RSIDashboard v1 — lit les données fusionnées depuis la fonction getRSIData
 * Source : User (auth) + TalentProfile + Session via backend asServiceRole
 */
import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw, Users, TrendingUp, GitBranch, Zap, Award, Mail, Clock } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric', year: '2-digit' });
}
function fmtDays(n) {
  if (n === null || n === undefined) return '—';
  if (n === 0) return 'J0';
  return `J+${n}`;
}
function daysSince(d) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d)) / 86400000);
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = '#6366f1', highlight }) {
  return (
    <div style={{
      background: highlight ? `${color}10` : '#fff',
      borderRadius: 12, border: `1px solid ${highlight ? color + '40' : '#e5e7eb'}`,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Chain tree ────────────────────────────────────────────────────────────────
function ChainNode({ user, childrenMap, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);
  const children = childrenMap[user.userId] || [];

  return (
    <div style={{ marginLeft: depth * 18 }}>
      <div
        onClick={() => children.length && setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 8, marginBottom: 3,
          background: depth === 0 ? '#eef2ff' : '#fafafa',
          border: `1px solid ${depth === 0 ? '#c7d2fe' : '#e5e7eb'}`,
          cursor: children.length ? 'pointer' : 'default',
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: depth === 0 ? '#6366f1' : '#e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: depth === 0 ? '#fff' : '#6b7280',
        }}>
          {user.avatarUrl
            ? <img src={user.avatarUrl} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
            : (user.displayName || '?').charAt(0).toUpperCase()
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.displayName || user.email || user.userId?.slice(0, 10)}
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>
            {fmtDate(user.createdAt)} · {user.sessionCount} session{user.sessionCount !== 1 ? 's' : ''}
            {user.xpGlobal > 0 && ` · ${user.xpGlobal} XP`}
          </div>
        </div>
        {children.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#6366f1',
            background: '#eef2ff', borderRadius: 20, padding: '2px 7px',
          }}>
            {children.length} référé{children.length > 1 ? 's' : ''} {open ? '▲' : '▼'}
          </span>
        )}
      </div>
      {open && children.length > 0 && (
        <div style={{ borderLeft: '2px solid #e0e7ff', marginLeft: 13, paddingLeft: 6, marginBottom: 3 }}>
          {children.map(c => (
            <ChainNode key={c.userId} user={c} childrenMap={childrenMap} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function RSIDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('table');
  const [sortBy, setSortBy] = useState('referrals'); // 'referrals' | 'sessions' | 'date'
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('getRSIData', {});
      if (!res?.data?.ok) throw new Error(res?.data?.error || 'Erreur getRSIData');
      setData(res.data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── Build chain tree from users array ──────────────────────────────────────
  const chainTree = useMemo(() => {
    if (!data?.users) return { roots: [], childrenMap: {} };
    const childrenMap = {};
    const hasParent = new Set();
    const userById = {};
    for (const u of data.users) {
      userById[u.userId] = u;
      if (u.referrerId) {
        hasParent.add(u.userId);
        if (!childrenMap[u.referrerId]) childrenMap[u.referrerId] = [];
        childrenMap[u.referrerId].push(u);
      }
    }
    // Roots = have children but no parent in our user list
    const roots = data.users.filter(u =>
      childrenMap[u.userId] && !hasParent.has(u.userId)
    );
    return { roots, childrenMap };
  }, [data]);

  // ── Funnel de cohorte ─────────────────────────────────────────────────────
  const funnel = useMemo(() => {
    if (!data?.users) return null;
    const all = data.users;
    const total = all.length;

    // Étape 1 — Inscrit (a un compte User)
    const registered = total;

    // Étape 2 — A un profil (a complété l'onboarding)
    const hasProfile = all.filter(u => u.hasProfile).length;

    // Étape 3 — A joué au moins 1 session complétée
    const session1 = all.filter(u => u.sessionCount >= 1).length;

    // Étape 4 — A joué au moins 5 sessions
    const session5 = all.filter(u => u.sessionCount >= 5).length;

    // Étape 5 — A référé au moins 1 personne
    const referral1 = all.filter(u => u.referralsMade >= 1).length;

    // Étape 6 — A référé au moins 5 personnes
    const referral5 = all.filter(u => u.referralsMade >= 5).length;

    const steps = [
      { label: 'Inscrits',            count: registered, icon: '👤', color: '#6366f1', description: 'Compte User créé' },
      { label: 'Profil complété',      count: hasProfile,  icon: '✅', color: '#8b5cf6', description: "A passé l'onboarding" },
      { label: '1 session',            count: session1,    icon: '🎮', color: '#0891b2', description: 'Au moins 1 session complétée' },
      { label: '5 sessions',           count: session5,    icon: '🔥', color: '#f59e0b', description: 'Au moins 5 sessions complétées' },
      { label: '1 référencement',      count: referral1,   icon: '🔗', color: '#10b981', description: 'A amené au moins 1 personne' },
      { label: '5 référencements',     count: referral5,   icon: '🚀', color: '#059669', description: 'A amené au moins 5 personnes' },
    ];

    return { steps, total };
  }, [data]);

  // ── Filtered + sorted table ────────────────────────────────────────────────
  const tableUsers = useMemo(() => {
    if (!data?.users) return [];
    let list = data.users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.referralCode || '').toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      if (sortBy === 'referrals') return (b.referralsMade - a.referralsMade) || (b.sessionCount - a.sessionCount);
      if (sortBy === 'sessions') return b.sessionCount - a.sessionCount;
      if (sortBy === 'date') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      return 0;
    });
    return list;
  }, [data, search, sortBy]);

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 32, color: '#6b7280', fontSize: 13 }}>
      <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
      Chargement RSI...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13, color: '#991b1b' }}>
      ⚠️ {error}
    </div>
  );

  const { kpis, users, computedAt } = data;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitBranch size={15} color="#6366f1" />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>RSI — Référencement Spontané Identifiable</span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>calculé {new Date(computedAt).toLocaleTimeString('fr-CA')}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[{ k: 'funnel', l: '📊 Funnel' }, { k: 'table', l: 'Tableau' }, { k: 'chains', l: 'Chaînes' }].map(t => (
            <button key={t.k} onClick={() => setView(t.k)} style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid',
              borderColor: view === t.k ? '#6366f1' : '#e5e7eb',
              background: view === t.k ? '#eef2ff' : '#fff',
              color: view === t.k ? '#6366f1' : '#6b7280',
              cursor: 'pointer', fontWeight: view === t.k ? 600 : 400,
            }}>{t.l}</button>
          ))}
          <button onClick={load} style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6,
            border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <RefreshCw size={11} />Rafraîchir
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        <KpiCard icon={Users} label="Utilisateurs" value={kpis.total} color="#6366f1" />
        <KpiCard icon={GitBranch} label="Référencés" value={kpis.withReferrer} sub={`sur ${kpis.withProfile ?? kpis.total} profils`} color="#8b5cf6" />
        <KpiCard
          icon={TrendingUp} label="RSI ratio" value={kpis.rsiRatio}
          sub={`cible > ${kpis.rsiTarget}`}
          color={kpis.aboveTarget ? '#059669' : '#d97706'}
          highlight={kpis.aboveTarget}
        />
        <KpiCard icon={Zap} label="Avec sessions" value={kpis.withSessions} sub={`${Math.round(kpis.withSessions/kpis.total*100)}%`} color="#f59e0b" />
        <KpiCard icon={Award} label="Référents actifs" value={kpis.referrers} sub="ont référé ≥1 pers." color="#0891b2" />
      </div>

      {/* Barre RSI status */}
      <div style={{
        padding: '8px 14px', borderRadius: 8, marginBottom: 16, fontSize: 12,
        background: kpis.aboveTarget ? '#d1fae5' : '#fffbeb',
        border: `1px solid ${kpis.aboveTarget ? '#6ee7b7' : '#fcd34d'}`,
        color: kpis.aboveTarget ? '#065f46' : '#92400e',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {kpis.aboveTarget ? '🚀' : '🎯'}
        <span>
          RSI actuel : <strong>{kpis.rsiRatio}</strong>
          {' '}({kpis.withReferrer} référencés ÷ {kpis.withProfile} profils complétés)
          {' '}— Objectif : <strong>&gt; {kpis.rsiTarget}</strong>.
          {!kpis.aboveTarget && kpis.withProfile > 0 &&
            ` Il faut ${Math.ceil(kpis.withProfile * kpis.rsiTarget) - kpis.withReferrer} référencement(s) supplémentaires pour franchir le seuil.`
          }
        </span>
      </div>

      {/* ── FUNNEL VIEW ── */}
      {view === 'funnel' && funnel && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              Inspiré de l'analyse de cohorte du Lean Startup (IMVU) — chaque étape montre
              combien d'utilisateurs ont franchi ce palier d'engagement.
            </p>
          </div>

          {/* Barres du funnel */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {funnel.steps.map((step, idx) => {
              const pct = funnel.total > 0 ? Math.round((step.count / funnel.total) * 100) : 0;
              const prevCount = idx === 0 ? funnel.total : funnel.steps[idx - 1].count;
              const dropPct = prevCount > 0 ? Math.round(((prevCount - step.count) / prevCount) * 100) : 0;
              const isLast = idx === funnel.steps.length - 1;

              return (
                <div key={step.label} style={{
                  padding: '16px 20px',
                  borderBottom: isLast ? 'none' : '1px solid #f3f4f6',
                }}>
                  {/* Label row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{step.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{step.label}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{step.description}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                      {idx > 0 && dropPct > 0 && (
                        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                          ▼ {dropPct}% de chute
                        </span>
                      )}
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: step.color }}>{step.count}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{pct}% des inscrits</div>
                      </div>
                    </div>
                  </div>

                  {/* Barre de progression */}
                  <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: 8, borderRadius: 4,
                      width: `${pct}%`,
                      background: step.color,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>

                  {/* Mini liste des users à cette étape (jusqu'à 5) */}
                  {step.count > 0 && step.count <= 20 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                      {data.users
                        .filter(u => {
                          if (idx === 0) return true;
                          if (idx === 1) return u.hasProfile;
                          if (idx === 2) return u.sessionCount >= 1;
                          if (idx === 3) return u.sessionCount >= 5;
                          if (idx === 4) return u.referralsMade >= 1;
                          if (idx === 5) return u.referralsMade >= 5;
                          return false;
                        })
                        .slice(0, 12)
                        .map(u => (
                          <span key={u.userId} style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 20,
                            background: `${step.color}15`, color: step.color,
                            border: `1px solid ${step.color}30`,
                          }}>
                            {u.displayName || u.email?.split('@')[0] || '?'}
                          </span>
                        ))
                      }
                      {step.count > 12 && (
                        <span style={{ fontSize: 10, color: '#9ca3af', padding: '2px 6px' }}>
                          +{step.count - 12} autres
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Note contextuelle */}
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
              <strong>Lecture :</strong> chaque ligne montre combien d'utilisateurs ont atteint ce palier.
              La chute entre "Inscrits" et "Profil complété" révèle l'abandon à l'onboarding.
              La chute entre "Profil" et "1 session" révèle la friction d'activation.
              Un RSI &gt; 1.1 nécessite que "1 référencement" dépasse "Profil complété".
            </p>
          </div>
        </div>
      )}

      {/* ── TABLE VIEW ── */}
      {view === 'table' && (
        <>
          {/* Search + sort */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher nom, email, code…"
              style={{
                flex: 1, height: 32, borderRadius: 8, border: '1px solid #e5e7eb',
                padding: '0 10px', fontSize: 12, outline: 'none',
              }}
            />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{ height: 32, borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, padding: '0 8px', color: '#374151' }}
            >
              <option value="referrals">↓ Référencements</option>
              <option value="sessions">↓ Sessions</option>
              <option value="date">↑ Ancienneté</option>
            </select>
          </div>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Utilisateur', 'Email', 'Code', 'Inscrit', 'Dernière session', 'Sessions', 'J→1ère session', 'Référencés', 'Référé par'].map(h => (
                      <th key={h} style={{ padding: '9px 10px', fontSize: 10, fontWeight: 600, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableUsers.map(u => {
                    const referrer = u.referrerId ? users.find(r => r.userId === u.referrerId) : null;
                    const lastSeen = u.lastSessionAt || u.lastSeenAt || u.lastLoginAt;
                    const daysSinceActive = daysSince(lastSeen);

                    return (
                      <tr key={u.userId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        {/* Nom */}
                        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{
                              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                              background: u.hasProfile ? '#ede9fe' : '#f3f4f6',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, color: u.hasProfile ? '#6d28d9' : '#9ca3af',
                              overflow: 'hidden',
                            }}>
                              {u.avatarUrl
                                ? <img src={u.avatarUrl} style={{ width: 24, height: 24, objectFit: 'cover' }} />
                                : (u.displayName || '?').charAt(0).toUpperCase()
                              }
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: '#111827' }}>{u.displayName || '—'}</div>
                              <div style={{ fontSize: 10, color: '#9ca3af' }}>
                                {u.role === 'admin' ? '👑 admin' : u.hasProfile ? '✓ profil' : '⚠ sans profil'}
                              </div>
                            </div>
                          </div>
                        </td>
                        {/* Email */}
                        <td style={{ padding: '9px 10px', color: '#6b7280', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.email || '—'}
                        </td>
                        {/* Code */}
                        <td style={{ padding: '9px 10px' }}>
                          {u.referralCode
                            ? <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#f3f4f6', padding: '2px 6px', borderRadius: 5, color: '#374151' }}>{u.referralCode}</span>
                            : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                          }
                        </td>
                        {/* Inscrit */}
                        <td style={{ padding: '9px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                          {fmtDate(u.createdAt)}
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>{daysSince(u.createdAt)}j</div>
                        </td>
                        {/* Dernière activité */}
                        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                          {lastSeen ? (
                            <span style={{
                              fontSize: 11, padding: '2px 7px', borderRadius: 20,
                              background: daysSinceActive < 7 ? '#d1fae5' : daysSinceActive < 30 ? '#fef3c7' : '#f3f4f6',
                              color: daysSinceActive < 7 ? '#065f46' : daysSinceActive < 30 ? '#92400e' : '#9ca3af',
                            }}>
                              {daysSinceActive}j ago
                            </span>
                          ) : <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                        {/* Sessions */}
                        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                          <span style={{
                            fontWeight: 700, fontSize: 12,
                            color: u.sessionCount > 0 ? '#6d28d9' : '#9ca3af',
                          }}>{u.sessionCount}</span>
                        </td>
                        {/* J→1ère session */}
                        <td style={{ padding: '9px 10px', textAlign: 'center', color: '#6b7280' }}>
                          {fmtDays(u.daysToFirstSession)}
                        </td>
                        {/* Référencés */}
                        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                          {u.referralsMade > 0 ? (
                            <span style={{ fontWeight: 700, color: '#059669', fontSize: 12 }}>+{u.referralsMade}</span>
                          ) : <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                        {/* Référé par */}
                        <td style={{ padding: '9px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                          {referrer
                            ? <span style={{ fontSize: 11, background: '#ede9fe', color: '#6d28d9', padding: '2px 7px', borderRadius: 20 }}>
                                {referrer.displayName || referrer.email?.split('@')[0] || '…'}
                              </span>
                            : u.referrerId
                              ? <span style={{ fontSize: 10, color: '#fca5a5' }}>ID non résolu</span>
                              : <span style={{ color: '#d1d5db' }}>—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── CHAINS VIEW ── */}
      {view === 'chains' && (
        <div>
          {chainTree.roots.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              Aucune chaîne de référencement identifiée.
              <div style={{ fontSize: 11, marginTop: 4 }}>Les chaînes apparaissent quand quelqu'un s'inscrit avec un code.</div>
            </div>
          ) : (
            chainTree.roots.map(root => (
              <div key={root.userId} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: 14, marginBottom: 10 }}>
                <ChainNode user={root} childrenMap={chainTree.childrenMap} depth={0} />
              </div>
            ))
          )}

          {/* Orphelins — referrerId non résolu */}
          {(() => {
            const orphans = users.filter(u => u.referrerId && !users.find(r => r.userId === u.referrerId));
            if (!orphans.length) return null;
            return (
              <div style={{ padding: 12, background: '#fffbeb', borderRadius: 10, border: '1px solid #fcd34d', marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                  ⚠️ {orphans.length} utilisateur(s) avec referrerId non résolu
                </div>
                {orphans.map(u => (
                  <div key={u.userId} style={{ fontSize: 11, color: '#b45309' }}>
                    {u.displayName || u.email} → referrerId: {u.referrerId?.slice(0, 12)}…
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}