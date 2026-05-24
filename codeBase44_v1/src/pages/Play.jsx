//Architecture 
//
//User clique JOUER
//      ↓
//clientJoinQueue → enqueue.ts      → écrit UserQueueState
//      ↓
//startQueuePolling
//      ├── clientHeartbeatQueue → heartbeatQueue.ts → keepalive + fire matchmakerTick
//     └── clientMatchmakerTick → matchmakerTick.ts → rule engine L3→L2→L1→L0→ANY
//                                        ↓
//                                  lit UserQueueState
//                                  compare rôles / styles / waitMs
//                                  crée Session si match valide
//                                        ↓
//heartbeatQueue renvoie status=matched → frontend charge la session
//


import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "../utils";
import { ensureTalentProfile, ensureUserPreferences, syncTalentProfileFromPreferences } from "@/components/onboardingState";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Users, Clock, Check, X, Star, Sparkles, TrendingUp, Calendar, MapPin, Music2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

import { SESSION_STATUS, SOTS_VALID_STATES, POLLING_STATES } from "../components/sessionConstants";
import OpenEventLobbies from "../components/play/OpenEventLobbies";
import LobbyView from "../components/play/LobbyView";
import InProgressView from "../components/play/InProgressView";
import { ResultsView, DropView } from "../components/play/PostSessionViews";

/** -----------------------
 * Helpers*
 * ----------------------*/
function normalizeId(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return String(v.systemId || v.id || v._id || v.value || "");
  return "";
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// Remplace functions.invoke('getSession') — lit directement Session entity + normalise participants
async function fetchSession(sessionId) {
  if (!sessionId) return null;
  try {
    const rows = await base44.entities.Session.filter({ id: sessionId });
    const s = rows?.[0] || null;
    if (!s) return null;
    if (s.participants) {
      let parts = s.participants;
      if (typeof parts === 'string') { try { parts = JSON.parse(parts); } catch { parts = []; } }
      if (!Array.isArray(parts)) parts = [];
      s.participants = parts.map(p => (typeof p === 'string' ? { userId: p } : p));
    } else { s.participants = []; }
    if (s.sotsSubmittedBy) {
      let ssb = s.sotsSubmittedBy;
      if (typeof ssb === 'string') { try { ssb = JSON.parse(ssb); } catch { ssb = []; } }
      s.sotsSubmittedBy = Array.isArray(ssb) ? ssb : [];
    }
    return s;
  } catch { return null; }
}

// ── Queue helpers (remplacent les functions backend non déployées) ──────────

function normalizeArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL QUEUE — délègue au backend cancelQueue.ts
// ─────────────────────────────────────────────────────────────────────────────
async function clientCancelQueue(userId) {
  try {
    const result = await base44.functions.invoke('cancelQueue', {});
    return { ok: result?.data?.ok ?? true, cancelled: result?.data?.cancelled ?? false };
  } catch {
    return { ok: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HEARTBEAT — délègue au backend heartbeatQueue.ts
// Ce backend maintient la fraîcheur de présence ET déclenche matchmakerTick
// en fire-and-forget. Il gère aussi la recovery des matched morts.
// ─────────────────────────────────────────────────────────────────────────────
async function clientHeartbeatQueue(userId) {
  try {
    const result = await base44.functions.invoke('heartbeatQueue', {});
    const data = result?.data;

    if (!data) return { ok: false, status: 'not_queued' };

    return {
      ok: data.ok ?? true,
      status: data.status || 'not_queued',
      matchedSessionId: data.matchedSessionId || null,
      waitMs: data.waitMs ?? null,
      queuedAt: data.queuedAt ?? null,
      recoveredFromDeadMatch: data.recoveredFromDeadMatch ?? false,
      queueStateId: data.queueStateId ?? null,
    };
  } catch {
    return { ok: false, status: 'not_queued' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MATCHMAKER TICK — délègue UNIQUEMENT au backend (matchmakerTick.ts)
// Ne contient AUCUNE logique de matching client-side.
// Le rule engine L3→L2→L1→L0→ANY vit exclusivement dans matchmakerTick.ts.
// ─────────────────────────────────────────────────────────────────────────────
async function clientMatchmakerTick(userId) {
  try {
    const result = await base44.functions.invoke('matchmakerTick', {});
    console.log('[matchmakerTick] backend result', {
      ok: result?.data?.ok,
      matched: result?.data?.matched,
      tier: result?.data?.tier,
      styleLevel: result?.data?.styleLevel,
      skipped: result?.data?.skipped,
      reason: result?.data?.reason,
    });
  } catch (e) {
    // Silent — le tick backend peut être throttlé ou locké, c'est normal
    console.debug('[matchmakerTick] backend tick skipped:', e?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JOIN QUEUE — délègue UNIQUEMENT au backend (enqueue.ts)
// N'effectue AUCUNE décision de matching.
// Ne crée PAS de session. Ne lit PAS d'autres sessions existantes.
// La doctrine : enqueue écrit UserQueueState → matchmakerTick.ts fait le match.
// ─────────────────────────────────────────────────────────────────────────────
async function clientJoinQueue(userId, roleSystemId, styleSystemIds, mode, checkpointSystemId) {
  if (mode === 'event') {
    // Mode event : logique dédiée conservée (pas de quickplay rule engine)
    const nowIso = new Date().toISOString();
    try {
      const allSessions = await base44.entities.Session.filter({}).catch(() => []);
      const eventSessions = allSessions.filter(s => s.sessionType === 'event' && s.status === 'lobby');
      let bestEvent = null, bestSlot = null;
      for (const es of eventSessions) {
        const open = normalizeArr(es.slots).find(sl => sl.status === 'open' && sl.roleSystemId === roleSystemId);
        if (open) { bestEvent = es; bestSlot = open; break; }
      }
      if (!bestEvent) return { ok: false, code: 'NO_EVENT_SLOT_FOUND', message: 'Aucun événement avec un slot correspondant.' };
      const updatedSlots = normalizeArr(bestEvent.slots).map(sl =>
        sl.slotId === bestSlot.slotId ? { ...sl, status: 'pending', candidateUserId: userId, candidateStyleSystemIds: styleSystemIds } : sl
      );
      await base44.entities.Session.update(bestEvent.id, { slots: updatedSlots }).catch(() => {});
      const evRows = await base44.entities.Event.filter({ id: bestEvent.eventId }).catch(() => []);
      return { ok: true, action: 'event_slot_applied', sessionId: bestEvent.id, slotId: bestSlot.slotId, eventTitle: evRows?.[0]?.title || 'Événement', message: 'Candidature envoyée.' };
    } catch (e) {
      return { ok: false, code: 'INTERNAL', error: e.message };
    }
  }

  // Mode quickplay : déléguer à enqueue.ts backend
  console.log('[JOIN_QUEUE]', {
    userId,
    role: roleSystemId,
    styles: styleSystemIds,
    styleCount: styleSystemIds?.length ?? 0,
    checkpoint: checkpointSystemId,
    timestamp: Date.now(),
  });

  try {
    const result = await base44.functions.invoke('enqueue', {
      roleSystemId,
      styleSystemIds,
      checkpointSystemId: checkpointSystemId || null,
    });

    const data = result?.data;

    console.log('[JOIN_QUEUE] enqueue response', {
      ok: data?.ok,
      status: data?.status,
      queueStateId: data?.queueStateId,
      note: data?.note,
    });

    if (!data?.ok) {
      return { ok: false, code: data?.code || 'ENQUEUE_FAILED', message: data?.message };
    }

    // Si déjà matché (reprise de session)
    if (data.status === 'matched' && data.matchedSessionId) {
      return { ok: true, action: 'matched', sessionId: data.matchedSessionId };
    }

    // Enregistré en queue — le matchmakerTick.ts va prendre le relais
    return { ok: true, action: 'queued', queueStateId: data.queueStateId };

  } catch (e) {
    console.error('[JOIN_QUEUE] enqueue error', e);
    return { ok: false, code: 'INTERNAL', error: e.message };
  }
}


/**
 * MatchedView — Écran de transition "Match trouvé!"
 *
 * Remplace le spinner infini. Intègre :
 * 1. Un timeout de 10s : si la session n'est pas chargée → affiche un bouton retry
 * 2. Un retry manuel si le polling n'a pas rattrapé
 * 3. Un log de diagnostic dans la console
 */
function MatchedView({ session, onSessionLoaded, onRetry, onCancel }) {
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    // Si session est déjà disponible, pas de timeout nécessaire
    if (session?.id) return;

    const t = setTimeout(() => {
      console.log('[MatchedView] timeout 10s — session toujours null');
      setTimedOut(true);
    }, 10_000);

    return () => clearTimeout(t);
  }, [session?.id]);

  // Dès que session arrive (via useEffect parent), on réinitialise le timeout
  useEffect(() => {
    if (session?.id) {
      setTimedOut(false);
    }
  }, [session?.id]);

  const handleRetry = async () => {
    setRetrying(true);
    setTimedOut(false);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await onCancel?.();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <Check className="w-6 h-6" />
            Match trouvé !
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!timedOut ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm text-gray-500">Chargement du lobby…</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
                className="mt-2"
              >
                {cancelling ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Annulation…</> : 'Annuler'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                Le lobby prend plus de temps que prévu. Clique sur Rejoindre pour réessayer.
              </p>
              <Button onClick={handleRetry} disabled={retrying} className="w-full">
                {retrying
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connexion…</>
                  : 'Rejoindre le lobby'
                }
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={cancelling} className="w-full">
                {cancelling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Annulation…</> : 'Annuler'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlayPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // UI states
  // idle, preflight, queueing, matched, lobby, ready, in_progress, completed, sots, error
  const [uiState, setUiState] = useState("idle");
  const [queueMode, setQueueMode] = useState("quickplay"); // "quickplay" | "event"

  // Core
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);

  // Taxonomy labels
  const [styleLabels, setStyleLabels] = useState({});
  const [roleLabels, setRoleLabels] = useState({});
  const [checkpointLabels, setCheckpointLabels] = useState({});

  // Lobby UI
  const [profilesCache, setProfilesCache] = useState({});
  const [lobbyRole, setLobbyRole] = useState("");
  const [lobbyStyles, setLobbyStyles] = useState([]);
  const isLobbyDirty = useRef(false);

  // Preflight mood filter (ephemeral)
  const [moodFilter, setMoodFilter] = useState({ roles: {}, styles: {} });

  // SOTS
  const [sotsVotes, setSotsVotes] = useState({});
  const [dropResult, setDropResult] = useState(null);
  const [disputeLoading, setDisputeLoading] = useState(false);
  // Audience vote tracking — ref pour éviter closure stale dans isMyCycleComplete
  const presenceAudienceVotedRef = useRef(false);

  // Queue / polling / timers
  const pollIntervalRef = useRef(null);

  // 6-K — Charger les profils des participants dès que session change
  // Sans ce useEffect, profilesCache ne contient que le profil de l'utilisateur courant
  // → les autres participants s'affichent comme "Joueur 29f6"
  useEffect(() => {
    if (!session?.participants?.length) return;
    const parts = asArray(session.participants);
    const ids = [...new Set(parts.map(p => normalizeId(p?.userId)).filter(Boolean))];
    if (ids.length === 0) return;
    // Charger seulement les profils pas encore dans le cache
    const missing = ids.filter(id => !profilesCache[id]);
    if (missing.length === 0) return;
    base44.entities.TalentProfile.filter({ userId: { $in: missing } })
      .then(profiles => {
        if (!profiles?.length) return;
        setProfilesCache(prev => {
          const next = { ...prev };
          profiles.forEach(p => { if (p?.userId) next[p.userId] = p; });
          return next;
        });
      })
      .catch(() => {});
  }, [session?.id, session?.participants?.length]);
  const queueTimerRef = useRef(null);
  const sessionTimerRef = useRef(null);

  const [queueTime, setQueueTime] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);

  // For debugging queue heartbeats
  const [queueDebug, setQueueDebug] = useState(null);

  // Checkpoints
  const [checkpoints, setCheckpoints] = useState([]);
  const [checkpointSearch, setCheckpointSearch] = useState('');
  const [filteredCheckpoints, setFilteredCheckpoints] = useState([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);

  // Styles for selected role
  const [availableStylesForRole, setAvailableStylesForRole] = useState([]);
  const [roleDomainMap, setRoleDomainMap] = useState({});

  /** -----------------------------------------
   * SOTS cycle complete?
   * ----------------------------------------*/
  const isMyCycleComplete = (sess, currentUserId) => {
    if (!sess || !currentUserId) return false;
    if (!SOTS_VALID_STATES.includes(sess.status)) return false;

    // L'organisateur (RL-ORGANIZER) participe au SOTS normalement
    // mais s'il n'est pas dans participants[], on le traite comme cycle complet
    const parts = asArray(sess.participants);
    const me = parts.find((p) => normalizeId(p?.userId) === currentUserId);

    // Organisateur event non ajouté dans participants (sessions anciennes) → skip SOTS
    if (sess.sessionType === 'event' && !me && normalizeId(sess.hostUserId) === currentUserId) return true;

    const submittedBy = asArray(sess.sotsSubmittedBy);
    if (submittedBy.includes(currentUserId)) return true;

    if (me?.sotsSubmitted === true || me?.submittedBallot === true) return true;

    // Audience — pas dans participants[], vérifié via SessionPresence (chargée async)
    // On utilise presenceDataRef pour éviter un appel async bloquant dans la fonction pure.
    // presenceDataRef est peuplé par enterEventSession (InProgressView) ou via polling.
    if (!me && sess.sessionType === 'event') {
      // Si presenceAudienceVoted est true (setté après submitSOTSSurvey réussi) → cycle complet
      if (presenceAudienceVotedRef.current === true) return true;
    }

    return false;
  };

  /** -----------------------------------------
   * UI sync from session
   * ----------------------------------------*/
  const syncUIState = (status, sess, currentUserId) => {
    // If session ended but I already voted => I'm free
    if ((status === "completed" || status === "aborted") && isMyCycleComplete(sess, currentUserId)) {
      setUiState("idle");
      return;
    }

    const stateMap = {
      queueing: "queueing",
      matched: "matched",
      lobby: "lobby",
      ready: "ready",
      in_progress: "in_progress",
      completed: "completed",
      aborted: "completed",
      sots_submitted: "idle",
      archived: "idle",
    };
    setUiState(stateMap[status] || "idle");
  };

  /** -----------------------------------------
   * Timers / polling utils
   * ----------------------------------------*/
  const clearPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const clearQueueTimer = () => {
    if (queueTimerRef.current) {
      clearInterval(queueTimerRef.current);
      queueTimerRef.current = null;
    }
  };

  const clearSessionTimer = () => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  };

  const startQueueTimer = () => {
    clearQueueTimer();
    setQueueTime(0);
    queueTimerRef.current = setInterval(() => {
      setQueueTime((t) => t + 1);
    }, 1000);
  };

  const startSessionTimer = (startTimeIso) => {
    clearSessionTimer();
    const start = new Date(startTimeIso).getTime();
    if (!Number.isFinite(start)) return;

    sessionTimerRef.current = setInterval(() => {
      setSessionTime(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  };

  const clearAllRuntime = () => {
    clearPolling();
    clearTick();
    clearQueueTimer();
    clearSessionTimer();
  };

  /** -----------------------------------------
   * INIT
   * ----------------------------------------*/
  useEffect(() => {
    (async () => {
      try {
        const currentUser = await base44.auth.me().catch(() => null);
        if (!currentUser) {
          setUiState("error");
          setLoading(false);
          return;
        }
        setUser(currentUser);

        let profiles = await base44.entities.TalentProfile.filter({ userId: currentUser.id }).catch(() => []);
        let resolvedProfile = profiles?.[0] || null;

        if (!resolvedProfile || !resolvedProfile.activeRoles?.length || !resolvedProfile.activeStyles?.length) {
          const [prefs, roles] = await Promise.all([
            ensureUserPreferences(base44, currentUser),
            base44.entities.RoleHierarchy.filter({}).catch(() => []),
          ]);

          const roleDomainMap = (roles || []).reduce((acc, row) => {
            if (row?.systemId) acc[row.systemId] = row.domainKey || '';
            return acc;
          }, {});

          if (prefs) {
            resolvedProfile = await syncTalentProfileFromPreferences(base44, currentUser, prefs, { roleDomainMap }).catch(() => resolvedProfile);
          }

          if (!resolvedProfile) {
            resolvedProfile = await ensureTalentProfile(base44, currentUser).catch(() => null);
          }
        }

        if (resolvedProfile) setProfile(resolvedProfile);

        const [styles, roles, allCheckpoints] = await Promise.all([
          base44.entities.StyleHierarchy.filter({}).catch(() => []),
          base44.entities.RoleHierarchy.filter({}).catch(() => []),
          base44.entities.Checkpoint.filter({}).catch(() => []),
        ]);

        setStyleLabels(styles.reduce((acc, s) => ({ ...acc, [s.systemId]: s.displayName }), {}));
        setRoleLabels(roles.reduce((acc, r) => ({ ...acc, [r.systemId]: r.nameFr || r.displayName || r.systemId }), {}));
        setCheckpointLabels(allCheckpoints.reduce((acc, c) => ({ ...acc, [c.systemId]: c.name }), {}));

        // roleDomainMap (root fallback)
        const domainMap = {};
        roles.forEach((role) => {
          if (role.level === 1 && role.domainKey) domainMap[role.systemId] = role.domainKey;
        });
        roles.forEach((role) => {
          if (!domainMap[role.systemId] && role.racineSystemId) {
            const root = roles.find((r) => r.systemId === role.racineSystemId);
            if (root?.domainKey) domainMap[role.systemId] = root.domainKey;
          }
        });
        setRoleDomainMap(domainMap);

        const activeCheckpoints = allCheckpoints.filter((c) => c.isActive !== false);
        setCheckpoints(activeCheckpoints);

        // Charger session event depuis URL (?sessionId=xxx)
        const urlSessionId = searchParams.get('sessionId');
        if (urlSessionId) {
          try {
            const s = await fetchSession(urlSessionId);
            if (s && ['in_progress', 'lobby', 'ready', 'matched'].includes(s.status)) {
              setSession(s);
              syncUIState(s.status, s, currentUser.id);
              setLoading(false);
              return;
            }
            // Session terminée depuis le feed — vue post-session en lecture
            if (s && ['completed', 'aborted', 'sots_submitted', 'archived'].includes(s.status)) {
              setSession(s);
              syncUIState(s.status, s, currentUser.id);
              setLoading(false);
              return;
            }
          } catch { /* fallback to normal flow */ }
        }

        // Recover any relevant session that still needs me
        const candidates = await base44.entities.Session.filter({
          sessionType: "quickplay",
          status: {
            $in: [
              SESSION_STATUS.QUEUEING,
              SESSION_STATUS.MATCHED,
              SESSION_STATUS.LOBBY,
              SESSION_STATUS.READY,
              SESSION_STATUS.IN_PROGRESS,
              SESSION_STATUS.COMPLETED,
              SESSION_STATUS.ABORTED,
            ],
          },
        }).catch(() => []);

        const relevant = (candidates || []).filter((s) => {
          const parts = asArray(s.participants);
          return parts.some((p) => normalizeId(p?.userId) === currentUser.id);
        });

        const stillNeedsMe = relevant.find((s) => {
          if (!["completed", "aborted"].includes(s.status)) return true;
          return !isMyCycleComplete(s, currentUser.id);
        });

        if (stillNeedsMe) {
          setSession(stillNeedsMe);
          syncUIState(stillNeedsMe.status, stillNeedsMe, currentUser.id);
        } else {
          setSession(null);
          setUiState("idle");
        }
      } catch {
        setUiState("error");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      clearAllRuntime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** -----------------------------------------
   * Session-driven runtime (polling + timers)
   * ----------------------------------------*/
  useEffect(() => {
    if (!session?.id || !user?.id) return;

    syncUIState(session.status, session, user.id);

    if (POLLING_STATES.includes(session.status)) {
      startSessionPolling(session.id);
    } else {
      clearPolling();
    }

    if (session.status === SESSION_STATUS.QUEUEING) startQueueTimer();
    else clearQueueTimer();

    if (session.status === SESSION_STATUS.IN_PROGRESS && session.actualStartAt) startSessionTimer(session.actualStartAt);
    else clearSessionTimer();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status, session?.actualStartAt, user?.id]);

  const startSessionPolling = (sessionId) => {
    clearPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const s = await fetchSession(sessionId);
        if (s) setSession(s);
      } catch {
        // silent
      }
    }, 2000);
  };

  /** -----------------------------------------
   * Lobby hydration (server -> local) (unless dirty)
   * ----------------------------------------*/
  useEffect(() => {
    if (!((uiState === "lobby" || uiState === "ready") && session?.participants && user?.id)) return;
    if (isLobbyDirty.current) return;

    const participants = asArray(session.participants);
    const me = participants.find((p) => normalizeId(p?.userId) === user.id);
    if (!me) return;

    const serverRole = normalizeId(me.roleSystemId) || "";
    const serverStylesIds = asArray(me.styleSystemIds).map(normalizeId).filter(Boolean);
    const serverStyleId = normalizeId(me.styleSystemId);
    const serverStyles = serverStylesIds.length > 0 ? serverStylesIds : serverStyleId ? [serverStyleId] : [];

    setLobbyRole(serverRole);
    setLobbyStyles(serverStyles);
  }, [uiState, session?.participants, user?.id]);

  useEffect(() => {
    isLobbyDirty.current = false;
  }, [session?.id]);

  useEffect(() => {
    if (uiState !== "lobby" && uiState !== "ready") {
      isLobbyDirty.current = false;
      setAvailableStylesForRole([]);
    }
  }, [uiState]);

  /** -----------------------------------------
   * Checkpoint hydration (from session) — robuste
   * Déclenché dès que session.checkpointSystemId ET checkpoints sont disponibles,
   * quel que soit l'uiState (lobby, ready, in_progress, reload direct…).
   * ----------------------------------------*/
  useEffect(() => {
    if (!session?.checkpointSystemId) {
      setSelectedCheckpoint(null);
      return;
    }

    if (!checkpoints.length) return;

    const cp = checkpoints.find((c) => c.systemId === session.checkpointSystemId) || null;
    setSelectedCheckpoint(cp);
  }, [session?.checkpointSystemId, checkpoints]);
  
  useEffect(() => {
    if (!session?.checkpointSystemId) {
      setSelectedCheckpoint(null);
      return;
    }
    if (!checkpoints.length) return;
    const cp = checkpoints.find((c) => c.systemId === session.checkpointSystemId) || null;
    setSelectedCheckpoint(cp);
  }, [session?.checkpointSystemId, checkpoints]);

  /** -----------------------------------------
   * Load styles for role + checkpoints for selection
   * ----------------------------------------*/
  useEffect(() => {
    if (!((uiState === "lobby" || uiState === "ready") && lobbyRole)) {
      setAvailableStylesForRole([]);
      return;
    }
    loadStylesForRole(lobbyRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState, lobbyRole, JSON.stringify(profile?.activeStyles || []), JSON.stringify(profile?.styleWeights || {})]);

  useEffect(() => {
    if (!(uiState === "lobby" || uiState === "ready")) {
      setFilteredCheckpoints([]);
      return;
    }
    loadCheckpointsForLobby(lobbyRole, lobbyStyles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState, lobbyRole, JSON.stringify(lobbyStyles)]);

  // Remplace getStylesForRole — lit StyleHierarchy + RoleDomainMap + RoleStyleMap directs
  const loadStylesForRole = async (roleSystemId) => {
    try {
      // 1. Chercher overrides RoleStyleMap
      const allStyleMaps = await base44.entities.RoleStyleMap.filter({}).catch(() => []);
      const overrides = (allStyleMaps || []).filter(m => m.roleSystemId === roleSystemId && m.isActive !== false);

      // 2. Résoudre domainKey via RoleDomainMap
      const allDomainMaps = await base44.entities.RoleDomainMap.filter({}).catch(() => []);
      const domainMap = (allDomainMaps || []).find(m => m.roleSystemId === roleSystemId && m.isActive !== false);
      const domainKey = domainMap?.domainKey || null;

      // 3. Charger tous les styles actifs
      const allStylesRaw = await base44.entities.StyleHierarchy.filter({}).catch(() => []);
      const activeStyles = (allStylesRaw || []).filter(s => s.active !== false && s.active !== 'false');

      let allDomainStyles = [];

      if (overrides.length > 0) {
        // Mode override: utiliser les styles explicitement mappés au rôle
        const overrideIds = overrides.map(o => o.styleSystemId).filter(Boolean);
        const weightMap = {};
        for (const o of overrides) { if (o.styleSystemId) weightMap[o.styleSystemId] = Number(o.weight) || 1; }
        allDomainStyles = activeStyles
          .filter(s => overrideIds.includes(s.systemId) && s.domainKey)
          .sort((a, b) => {
            const wa = weightMap[a.systemId] || 1;
            const wb = weightMap[b.systemId] || 1;
            if (wa !== wb) return wb - wa;
            return (a.displayName || '').localeCompare(b.displayName || '');
          });
      } else if (domainKey) {
        // Mode domain: tous les styles du domaine
        allDomainStyles = activeStyles
          .filter(s => s.domainKey === domainKey)
          .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      } else {
        // Fallback: tous les styles actifs
        allDomainStyles = activeStyles
          .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      }

      const userActiveStyles = profile?.activeStyles || [];
      const userStyleWeights = profile?.styleWeights || {};
      const preferredInDomain = allDomainStyles.filter(s => userActiveStyles.includes(s.systemId));

      if (preferredInDomain.length > 0) {
        preferredInDomain.sort((a, b) => {
          const wa = userStyleWeights[a.systemId] ?? 50;
          const wb = userStyleWeights[b.systemId] ?? 50;
          if (wb !== wa) return wb - wa;
          return (a.displayName || '').localeCompare(b.displayName || '');
        });
        setAvailableStylesForRole(preferredInDomain);
      } else {
        setAvailableStylesForRole(allDomainStyles.slice(0, 30));
      }
    } catch (error) {
      console.error('[loadStylesForRole]', error);
      setAvailableStylesForRole([]);
    }
  };

  // Remplace getCheckpointsForSelection — lit Checkpoint directement + tri par nom
  const loadCheckpointsForLobby = async (roleSystemId, styleSystemIds) => {
    try {
      const allRaw = await base44.entities.Checkpoint.filter({}).catch(() => []);
      const active = (allRaw || [])
        .filter(cp => cp.active === true || cp.active === 'true')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      setCheckpoints(active);
    } catch (error) {
      console.error('[loadCheckpointsForLobby]', error);
      setCheckpoints([]);
    }
  };

  useEffect(() => {
    const q = checkpointSearch.trim().toLowerCase();

    let rows = [...checkpoints];

    if (q) {
      rows = rows.filter((cp) => {
        const name = String(cp?.name || '').toLowerCase();
        const vibe = String(cp?.vibe || '').toLowerCase();
        const type = String(cp?.type || '').toLowerCase();
        const city = String(cp?.city || cp?.ville || '').toLowerCase();

        return (
          name.includes(q) ||
          vibe.includes(q) ||
          type.includes(q) ||
          city.includes(q)
        );
      });
    }

    setFilteredCheckpoints(rows);
  }, [checkpoints, checkpointSearch]);

  const handleCheckpointPick = useCallback(async (checkpointSystemId) => {
    if (!checkpointSystemId || !session?.id || !user?.id) return;

    if (user.id !== session?.captainUserId) {
      toast({
        title: 'Action non autorisée',
        description: 'Seul le capitaine peut choisir le checkpoint.',
        variant: 'destructive',
      });
      return;
    }

    if (session?.lockedAt) {
      toast({
        title: 'Session verrouillée',
        description: 'Le checkpoint ne peut plus être modifié.',
        variant: 'destructive',
      });
      return;
    }

    if (session?.checkpointSystemId === checkpointSystemId) {
      return;
    }

    const cp = checkpoints.find((c) => c.systemId === checkpointSystemId) || null;
    setSelectedCheckpoint(cp);

    try {
      const updated = await base44.entities.Session.update(session.id, {
        checkpointSystemId,
      });

      setSession((prev) => ({
        ...(prev || {}),
        ...(updated || {}),
        checkpointSystemId,
      }));
    } catch (error) {
      console.error('[handleCheckpointPick]', error);
      toast({
        title: 'Erreur',
        description: "Impossible d'enregistrer le checkpoint.",
        variant: 'destructive',
      });
    }
  }, [checkpoints, session, user?.id, toast]);

  /** -----------------------------------------
   * Queue engine (FIX P0)
   * ----------------------------------------*/
  const tickIntervalRef = useRef(null);

  const clearTick = () => {
    if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null; }
  };

  const startQueuePolling = async () => {
    clearPolling();
    clearTick();

    // Immediate heartbeat
    const hb0 = await clientHeartbeatQueue(user?.id);
    if (hb0) setQueueDebug(hb0);

    // Immediate tick, then every 7s — independent of heartbeat
    clientMatchmakerTick(user?.id).catch(() => {});
    tickIntervalRef.current = setInterval(() => {
      clientMatchmakerTick(user?.id).catch(() => {});
    }, 7000);

    pollIntervalRef.current = setInterval(async () => {
      try {
        // heartbeat keeps us alive
        const hb = await clientHeartbeatQueue(user?.id);
        if (hb) setQueueDebug(hb);

        const status = hb?.status;

        // Log d'état systématique — visible dans la console pour diagnostiquer
        console.log('[queuePoll] tick', {
          status,
          matchedSessionId: hb?.matchedSessionId ?? null,
          waitMs: hb?.waitMs ?? null,
          hasSession: !!session,
        });

        if (status === "matched" && hb?.matchedSessionId) {
          clearPolling();
          console.log('[queuePoll] matched', {
            userId: user?.id,
            status,
            matchedSessionId: hb.matchedSessionId,
            waitMs: hb?.waitMs ?? null,
            queuedAt: hb?.queuedAt ?? null,
            recoveredFromDeadMatch: hb?.recoveredFromDeadMatch ?? false,
          });
          const sess = await fetchSession(hb.matchedSessionId);
          if (sess) {
            console.log('[queuePoll] sessionLoaded', {
              sessionId: sess?.id,
              status: sess?.status,
              participants: Array.isArray(sess?.participants) ? sess.participants.length : 0,
              matchSnapshot: sess?.matchSnapshot ?? null,
              tier: sess?.matchSnapshot?.tier ?? null,
              styleLevel: sess?.matchSnapshot?.styleLevel ?? null,
              sameRole: sess?.matchSnapshot?.sameRole ?? null,
            });
            setSession(sess);
            // Si la session est déjà en lobby (cas normal avec matchmakerTick),
            // passer directement en lobby sans passer par l'état intermédiaire 'matched'.
            if (sess.status === 'lobby' || sess.status === 'ready') {
              setUiState('lobby');
            } else {
              setUiState('matched');
            }
          } else {
            // FALLBACK anti-freeze: session not found — retry once after 1.5s
            console.log('[queuePoll] getSession notFound -> fallback retry');
            await new Promise(r => setTimeout(r, 1500));
            const sess2 = await fetchSession(hb.matchedSessionId);
            if (sess2) {
              setSession(sess2);
              if (sess2.status === 'lobby' || sess2.status === 'ready') {
                setUiState('lobby');
              } else {
                setUiState('matched');
              }
            } else {
              // Still nothing — cancel queue and return to idle
              console.log('[queuePoll] getSession still notFound -> cancelQueue -> idle');
              await clientCancelQueue(user?.id).catch(() => {});
              clearQueueTimer();
              setSession(null);
              setUiState("idle");
              toast({
                title: "Match introuvable",
                description: "La session n'a pas pu être rejointe. Tu peux relancer.",
                variant: "destructive",
              });
            }
          }
          return;
        }

        // Recovered from dead match: stay in queue UI (server already reset to queueing)
        if (status === "queueing" && hb?.recoveredFromDeadMatch) {
          console.log('[queuePoll] recoveredFromDeadMatch, staying in queue');
          return;
        }

        // If server says I'm not in queue anymore -> exit queue UI cleanly
        if (status === "cancelled" || status === "expired" || status === "not_queued") {
          clearPolling();
          clearQueueTimer();
          setSession(null);
          setUiState("idle");

          toast({
            title: "Queue interrompue",
            description:
              status === "expired"
                ? "Ta présence a expiré (pas assez de heartbeat). Clique JOUER pour relancer."
                : status === "cancelled"
                ? "Ta queue a été annulée."
                : "Tu n'es plus en queue.",
            variant: "destructive",
          });
          return;
        }

        // If queueing: nothing else to do (timer continues)
      } catch {
        // silent
      }
    }, 1500); // 1.5s — était 3s. Réduit pour détecter le match plus vite.
    // Le heartbeat backend throttle à 5s donc les écritures DB restent raisonnables.
  };

  /** -----------------------------------------
   * Actions
   * ----------------------------------------*/
  const handleStartPreflight = () => {
    if (!profile || !profile.activeRoles || !profile.activeStyles) {
      toast({
        title: "Profil incomplet",
        description: "Configurez au moins 1 rôle et 1 style dans Préférences",
        variant: "destructive",
      });
      return;
    }

    const initialRoles = (profile.activeRoles || []).reduce((acc, rid) => ({ ...acc, [rid]: true }), {});
    const initialStyles = (profile.activeStyles || []).reduce((acc, sid) => {
      return { ...acc, [sid]: { active: true, weight: 50 } };
    }, {});

    setMoodFilter({ roles: initialRoles, styles: initialStyles });
    setUiState("preflight");
  };

  const handleJoinQueue = async () => {
    setActionLoading(true);
    try {
      // Build role/style arrays
      const activeRoles = Object.entries(moodFilter.roles || {})
        .filter(([, active]) => active === true)
        .map(([rid]) => rid);

      if (activeRoles.length === 0) {
        toast({ title: "Aucun rôle", description: "Sélectionnez au moins 1 rôle", variant: "destructive" });
        return;
      }

      const activeStyleIds = Object.entries(moodFilter.styles || {})
        .filter(([, v]) => v?.active === true)
        .map(([sid]) => sid);

      if (activeStyleIds.length === 0) {
        toast({ title: "Aucun style", description: "Sélectionnez au moins 1 style", variant: "destructive" });
        return;
      }

      // IMPORTANT: read enqueue response status
      const enq = await clientJoinQueue(
        user.id,
        activeRoles[0],
        activeStyleIds,
        queueMode,
        (profile.activeCheckpoints || [])[0] || null,
      );

      // Reset runtime and enter queue UI deterministically
      clearAllRuntime();

      if (!enq?.ok) {
        toast({
          title: "Erreur queue",
          description: enq?.message || enq?.error || "Impossible de rejoindre la queue.",
          variant: "destructive",
        });
        setUiState("idle");
        return;
      }

      if (enq?.action === "event_slot_applied") {
        toast({
          title: "🎯 Candidature envoyée !",
          description: enq.message || "En attente de confirmation de l'organisateur.",
        });
        navigate(`${createPageUrl("EventLobby")}?eventId=${enq.sessionId}`);
        return;
      }

      if (enq?.action === "matched" && enq?.sessionId) {
        // Chemin A : enqueue a déjà trouvé un match existant.
        // GARDE-FOU : vérifier que la session est encore exploitable avant d'y entrer.
        const DEAD_SESSION_STATUSES = ['completed', 'aborted', 'archived', 'disputed'];

        setUiState("matched");
        console.log('[handleJoinQueue] matched direct, fetching session', enq.sessionId);

        let matchedSess = await fetchSession(enq.sessionId);

        if (!matchedSess) {
          console.log('[handleJoinQueue] fetchSession null — retry 1 in 800ms');
          await new Promise(r => setTimeout(r, 800));
          matchedSess = await fetchSession(enq.sessionId);
        }

        if (!matchedSess) {
          console.log('[handleJoinQueue] fetchSession null — retry 2 in 1500ms');
          await new Promise(r => setTimeout(r, 1500));
          matchedSess = await fetchSession(enq.sessionId);
        }

        if (matchedSess) {
          // GARDE-FOU : session morte → annuler + relancer un vrai queueing
          if (DEAD_SESSION_STATUSES.includes(matchedSess.status)) {
            console.log('[handleJoinQueue] session DEAD — clean restart', {
              sessionId: matchedSess.id, status: matchedSess.status,
            });
            await clientCancelQueue(user?.id).catch(() => {});
            toast({ title: "Ancien match expiré", description: "Relance propre en cours…" });
            setUiState("queueing");
            startQueueTimer();
            await startQueuePolling();
            return;
          }
          console.log('[handleJoinQueue] session loaded', {
            sessionId: matchedSess.id,
            status: matchedSess.status,
            tier: matchedSess.matchSnapshot?.tier ?? null,
          });
          setSession(matchedSess);
        } else {
          console.log('[handleJoinQueue] fetchSession toujours null — fallback polling');
          startQueueTimer();
          await startQueuePolling();
        }
        return;
      }

      // Default: queueing — le matchmakerTick.ts backend va trouver un match
      setUiState("queueing");
      startQueueTimer();
      await startQueuePolling();
    } catch (error) {
      const data = error?.response?.data;
      toast({
        title: "Erreur queue",
        description: data?.error || data?.message || error.message,
        variant: "destructive",
      });
      setUiState("idle");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelQueue = async () => {
    setActionLoading(true);
    try {
      if (session?.id && (uiState === "lobby" || uiState === "ready")) {
        await base44.functions.invoke("transitionSession", { sessionId: session.id, action: "LEAVE_LOBBY" });
      } else {
        await clientCancelQueue(user?.id).catch(() => {});
      }

      clearAllRuntime();
      setSession(null);
      setUiState("idle");
      // toast supprimé : retour à l'état idle est visible dans l'UI
    } catch (error) {
      const data = error?.response?.data;
      toast({ title: "Erreur", description: data?.error || data?.message || error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const isUserReady = () => {
    if (!session?.participants || !user) return false;
    const parts = asArray(session.participants);
    const me = parts.find((p) => normalizeId(p?.userId) === user.id);
    return me?.status === "ready";
  };

  const toggleLobbyStyle = (styleId) => {
    const sid = normalizeId(styleId);
    if (!sid) return;
    isLobbyDirty.current = true;
    setLobbyStyles((current) => (current.includes(sid) ? current.filter((id) => id !== sid) : [...current, sid]));
  };

  const handleToggleReady = async () => {
    const userReady = isUserReady();

    if (!userReady) {
      if (!lobbyRole) {
        toast({ title: "Rôle requis", description: "Choisissez un rôle avant d'être prêt", variant: "destructive" });
        return;
      }
      if (lobbyStyles.length === 0) {
        toast({ title: "Style requis", description: "Choisissez au moins 1 style", variant: "destructive" });
        return;
      }
    }

    setActionLoading(true);
    try {
      const result = await base44.functions.invoke("transitionSession", {
        sessionId: session.id,
        action: userReady ? "UNREADY" : "SET_READY",
        roleSystemId: userReady ? undefined : lobbyRole,
        styleSystemIds: userReady ? undefined : lobbyStyles,
        styleSystemId: userReady ? undefined : lobbyStyles[0] || undefined,
      });

      setSession(result.data.session);
      if (!userReady) isLobbyDirty.current = false;
    } catch (error) {
      const data = error?.response?.data;
      toast({ title: "Erreur", description: data?.error || data?.message || error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLaunch = async () => {
    setActionLoading(true);
    try {
      const result = await base44.functions.invoke("transitionSession", {
        sessionId: session.id,
        action: "START_MANUAL",
      });
      setSession(result.data.session);
      // toast supprimé : transition vers l'état in_progress est visible dans l'UI
    } catch (error) {
      const data = error?.response?.data;
      const errorMessages = {
        NOT_CAPTAIN: "Seul le capitaine peut lancer la session",
        NOT_ENOUGH_PLAYERS: `Pas assez de joueurs (minimum ${session?.minPlayers || 2})`,
        NOT_ALL_READY: "Tous les participants doivent être prêts",
        MISSING_CHECKPOINT: "Choisis une carte avant de lancer",
      };
      toast({
        title: "Impossible de lancer",
        description: errorMessages[data?.code] || data?.error || data?.message || error.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckpointChange = async (checkpointSystemId) => {
    if (!session?.id) return;
    try {
      const result = await base44.functions.invoke("transitionSession", {
        sessionId: session.id,
        action: "SET_CHECKPOINT",
        checkpointSystemId,
      });
      setSession(result.data.session);
    } catch (error) {
      const data = error?.response?.data;
      toast({ title: "Erreur", description: data?.error || data?.message || error.message, variant: "destructive" });
    }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try {
      let result;
      if (session?.sessionType === 'event') {
        // COMPLETE_SESSION handled by dedicated function (transitionSession too large for deploy)
        result = await base44.functions.invoke("completeEventSession", { sessionId: session.id });
        if (result?.data?.ok) {
          const updated = await fetchSession(session.id);
          setSession(updated);
        }
      } else {
        result = await base44.functions.invoke("transitionSession", { sessionId: session.id, action: 'COMPLETE' });
        setSession(result.data.session);
      }
      // toast supprimé : retour à idle visible dans l'UI
    } catch (error) {
      const data = error?.response?.data;
      toast({ title: "Erreur", description: data?.error || data?.message || error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAbort = async () => {
    setActionLoading(true);
    try {
      // ABORT est valide pour QuickPlay ET Event sessions.
      // ARCHIVE était incorrectement utilisé pour les events — il requiert sots_submitted.
      // ABORT ferme l'Event immédiatement (transitionSession l'a en charge).
      const result = await base44.functions.invoke("transitionSession", { sessionId: session.id, action: 'ABORT' });
      setSession(result.data.session);
    } catch (error) {
      const data = error?.response?.data;
      toast({ title: "Erreur", description: data?.error || data?.message || error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitSOTS = async () => {
    setActionLoading(true);
    try {
      const submitRes = await base44.functions.invoke("submitSOTSSurvey", {
        sessionId: session.id,
        funWork: clamp(sotsVotes.funWork ?? 3, 1, 5),
        toxicityAvoidance: clamp(sotsVotes.toxicityAvoidance ?? 3, 1, 5),
        fairnessResourcefulness: clamp(sotsVotes.fairnessResourcefulness ?? 3, 1, 5),
        attitudePositivity: clamp(sotsVotes.attitudePositivity ?? 3, 1, 5),
        communication: clamp(sotsVotes.communication ?? 3, 1, 5),
        comment: sotsVotes.comment || null,
        tags: sotsVotes.tags || [],
        // 6-G — Recommandation binaire (null si non répondu)
        wouldRecommend: sotsVotes.wouldRecommend ?? null,
      });

      const drop = submitRes?.data?.drop;
      if (drop) {
        presenceAudienceVotedRef.current = true; // audience : cycle complet
        setDropResult(drop);
        setUiState("drop");
        setSotsVotes({});
      } else {
        presenceAudienceVotedRef.current = true; // audience : cycle complet
        // Recharger le profil pour avoir le XP à jour
        const freshProfiles = await base44.entities.TalentProfile.filter({ userId: user.id }).catch(() => []);
        if (freshProfiles?.[0]) setProfile(freshProfiles[0]);
        setSotsVotes({});
        setUiState("results");
      }
    } catch (error) {
      const data = error?.response?.data;
      if (error?.response?.status === 409) {
        // toast supprimé : l'UI SOTS gère déjà cet état
        setSession(null);
        setUiState("idle");
        setSotsVotes({});
        return;
      }
      toast({ title: "Erreur", description: data?.error || data?.message || error.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispute = async () => {
    if (!session?.id) return;
    setDisputeLoading(true);
    try {
      await base44.functions.invoke("transitionSession", {
        sessionId: session.id,
        action: "DISPUTE",
      });
      toast({
        title: "Litige ouvert",
        description: "La session a été signalée. Un administrateur va examiner la situation.",
      });
      setSession(null);
      setUiState("idle");
    } catch (err) {
      const data = err?.response?.data;
      toast({ title: "Erreur", description: data?.error || err.message, variant: "destructive" });
    } finally {
      setDisputeLoading(false);
    }
  };

  /** -----------------------------------------
   * UI helpers
   * ----------------------------------------*/
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  /** -----------------------------------------
   * RENDER
   * ----------------------------------------*/
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // IDLE
  if (uiState === "idle") {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        {/* QuickPlay */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Play className="w-6 h-6 text-indigo-600" />
              Jouer — QuickPlay
            </CardTitle>
            <CardDescription>Lancez une session rapide et rencontrez d&apos;autres talents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!profile || !profile.activeRoles?.length || !profile.activeStyles?.length ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                <p className="text-sm text-yellow-800">
                  Vous devez configurer au moins 1 rôle et 1 style dans vos préférences avant de jouer.
                </p>
                <Link to={createPageUrl("Preferences")}>
                  <Button variant="outline" className="mt-3">
                    Configurer mes préférences
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex rounded-lg overflow-hidden border border-gray-200">
                  <button
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${queueMode === 'quickplay' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    onClick={() => setQueueMode('quickplay')}
                  >
                    ⚡ Session rapide
                  </button>
                  <button
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${queueMode === 'event' ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    onClick={() => setQueueMode('event')}
                  >
                    📅 Événement
                  </button>
                </div>
                {queueMode === 'event' && (
                  <p className="text-xs text-gray-500 text-center">
                    Le matchmaker trouve un événement avec un rôle disponible qui correspond à ton profil. L&apos;organisateur confirme ou rejette ta candidature.
                  </p>
                )}
                <Button onClick={handleStartPreflight} size="lg" className={`w-full ${queueMode === 'event' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}`}>
                  <Play className="w-5 h-5 mr-2" />
                  {queueMode === 'event' ? 'Trouver un événement' : 'JOUER'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Event Lobbies */}
        <OpenEventLobbies talentProfile={profile} />
      </div>
    );
  }

  // PREFLIGHT
  if (uiState === "preflight") {
    const availableRoles = profile?.activeRoles || [];
    const availableStyles = profile?.activeStyles || [];

    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Mood Filter — Ajustements éphémères</CardTitle>
            <CardDescription>Personnalisez cette session sans modifier votre profil</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3">Rôles (multi-sélection)</h3>
              <div className="space-y-2">
                {availableRoles.map((roleId) => {
                  const isActive = moodFilter.roles?.[roleId] === true;
                  const label = roleLabels[roleId] || roleId;

                  return (
                    <div key={roleId} className="flex items-center justify-between p-3 border rounded">
                      <Label className="cursor-pointer flex-1" htmlFor={`role-${roleId}`}>
                        {label}
                      </Label>
                      <Switch
                        id={`role-${roleId}`}
                        checked={isActive}
                        onCheckedChange={(checked) =>
                          setMoodFilter((prev) => ({
                            ...prev,
                            roles: { ...prev.roles, [roleId]: checked },
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Styles (poids + activation)</h3>
              <div className="space-y-3">
                {availableStyles.map((styleId) => {
                  const styleData = moodFilter.styles?.[styleId] || { active: true, weight: 50 };
                  const isActive = styleData.active === true;
                  const weight = styleData.weight || 50;
                  const label = styleLabels[styleId] || styleId;

                  return (
                    <div key={styleId} className="border rounded p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="cursor-pointer" htmlFor={`style-${styleId}`}>
                          {label}
                        </Label>
                        <Switch
                          id={`style-${styleId}`}
                          checked={isActive}
                          onCheckedChange={(checked) =>
                            setMoodFilter((prev) => ({
                              ...prev,
                              styles: {
                                ...prev.styles,
                                [styleId]: { ...styleData, active: checked },
                              },
                            }))
                          }
                        />
                      </div>

                      {isActive && (
                        <div className="flex items-center gap-3 pt-2">
                          <Label className="text-xs text-gray-600 w-12">Poids</Label>
                          <Slider
                            value={[weight]}
                            onValueChange={(val) =>
                              setMoodFilter((prev) => ({
                                ...prev,
                                styles: {
                                  ...prev.styles,
                                  [styleId]: { ...styleData, weight: val[0] },
                                },
                              }))
                            }
                            min={0}
                            max={100}
                            step={10}
                            className="flex-1"
                          />
                          <span className="w-10 text-xs text-gray-600">{weight}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setUiState("idle")} className="flex-1">
                Retour
              </Button>
              <Button onClick={handleJoinQueue} disabled={actionLoading} className="flex-1">
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Valider intention
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // QUEUEING
  if (uiState === "queueing") {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              Recherche en cours...
            </CardTitle>
            <CardDescription>En attente d&apos;un partenaire</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={33} className="w-full" />
            <div className="text-center">
              <Clock className="w-12 h-12 mx-auto text-gray-400 mb-2" />
              <p className="text-2xl font-bold">{formatTime(queueTime)}</p>

              {(() => {
                const wMs = queueDebug?.waitMs ?? (queueTime * 1000);
                const wS = Math.floor(wMs / 1000);
                const tier = wS < 15 ? 'L3' : wS < 30 ? 'L2' : wS < 45 ? 'L1' : wS < 60 ? 'L0' : 'ANY';
                const nextTierIn = tier === 'L3' ? 15 - wS
                                 : tier === 'L2' ? 30 - wS
                                 : tier === 'L1' ? 45 - wS
                                 : tier === 'L0' ? 60 - wS
                                 : 0;
                return (
                  <p className="mt-2 text-xs text-gray-400">
                    palier actuel : <strong className="text-gray-600">{tier}</strong>
                    {nextTierIn > 0 && <span> — prochain dans {nextTierIn}s</span>}
                    {import.meta.env.DEV && <span> · waitMs={wMs}</span>}
                  </p>
                );
              })()}
            </div>

            <Button variant="outline" onClick={handleCancelQueue} disabled={actionLoading} className="w-full">
              Annuler
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // MATCHED
  if (uiState === "matched") {
    return (
      <MatchedView
        session={session}
        onSessionLoaded={(sess) => { setSession(sess); }}
        onCancel={async () => {
          await clientCancelQueue(user?.id).catch(() => {});
          clearAllRuntime();
          setSession(null);
          setUiState("idle");
        }}
        onRetry={async () => {
          if (session?.id) {
            const fresh = await fetchSession(session.id);
            if (fresh) setSession(fresh);
            return;
          }
          setUiState("queueing");
          startQueueTimer();
          await startQueuePolling();
        }}
      />
    );
  }

  // LOBBY / READY
  if (uiState === "lobby" || uiState === "ready") {
    const participants = asArray(session?.participants);
    const userReady = isUserReady();
    const availableStyleIds = (availableStylesForRole || []).map((s) => s.systemId).filter(Boolean);
    const canBeReady = !!lobbyRole && lobbyStyles.length > 0;

    return (
      <LobbyView
        session={session}
        user={user}
        participants={participants}
        userReady={userReady}
        profile={profile}
        lobbyRole={lobbyRole}
        setLobbyRole={(value) => { isLobbyDirty.current = true; setLobbyRole(value); setLobbyStyles([]); }}
        lobbyStyles={lobbyStyles}
        availableStyleIds={availableStyleIds}
        availableStylesForRole={availableStylesForRole}
        profilesCache={profilesCache}
        roleLabels={roleLabels}
        styleLabels={styleLabels}
        filteredCheckpoints={filteredCheckpoints}
        checkpointSearch={checkpointSearch}
        onCheckpointSearchChange={setCheckpointSearch}
        selectedCheckpoint={selectedCheckpoint}
        checkpointLabels={checkpointLabels}
        handleToggleReady={handleToggleReady}
        handleLaunch={handleLaunch}
        handleCancelQueue={handleCancelQueue}
        handleCheckpointPick={handleCheckpointPick}
        toggleLobbyStyle={toggleLobbyStyle}
        isLobbyDirty={isLobbyDirty}
        canBeReady={canBeReady}
        actionLoading={actionLoading}
        normalizeId={normalizeId}
        asArray={asArray}
      />
    );
  }

  // IN PROGRESS
  if (uiState === "in_progress") {
    return (
      <InProgressView
        session={session}
        user={user}
        sessionTime={sessionTime}
        selectedCheckpoint={selectedCheckpoint}
        profilesCache={profilesCache}
        roleLabels={roleLabels}
        styleLabels={styleLabels}
        actionLoading={actionLoading}
        normalizeId={normalizeId}
        asArray={asArray}
        onComplete={handleComplete}
        onAbort={handleAbort}
      />
    );
  }

  // COMPLETED (if we are here, my cycle not completed)
  if (uiState === "completed") {
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="w-6 h-6 text-green-600" />
              Session terminée
            </CardTitle>
            <CardDescription>Évaluez vos partenaires</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setUiState("sots")} className="w-full">
              Évaluer (SOTS)
            </Button>
            <Button
              variant="outline"
              className="w-full mt-2 border-red-200 text-red-600 hover:bg-red-50"
              onClick={handleDispute}
              disabled={disputeLoading}
            >
              {disputeLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Signaler un problème
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // SOTS
  if (uiState === "sots") {
    const sotsQuestions = [
      { key: "funWork",                label: "La personne ou l'équipe était-elle performante et prenait-elle plaisir dans leur travail ?",       emoji: "🎉" },
      { key: "toxicityAvoidance",      label: "Tout le monde s'est comporté de manière respectueuse ?",               emoji: "🤝" },
      { key: "fairnessResourcefulness",label: "Chacun a contribué équitablement et avec débrouillardise ?",           emoji: "⚖️" },
      { key: "attitudePositivity",     label: "L'attitude générale était positive et constructive ?",                  emoji: "✨" },
      { key: "communication",          label: "La communication entre participants était claire et respectueuse ?",    emoji: "💬" },
    ];

    const SCORE_LABELS = { 1: "Pas du tout", 2: "Un peu", 3: "Correct", 4: "Bien", 5: "Excellent" };

    const handleSurveyChange = (key, value) => {
      setSotsVotes((prev) => ({ ...prev, [key]: parseInt(value, 10) }));
    };

    const isSurveyComplete = () => sotsQuestions.every((q) => (sotsVotes[q.key] ?? 0) >= 1 && (sotsVotes[q.key] ?? 0) <= 5);

    const sotsParticipants = asArray(session?.participants).filter(p => normalizeId(p?.userId) !== normalizeId(user?.id));

    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-4">

        {/* Header */}
        <div className="text-center">
          <div className="text-4xl mb-2">⭐</div>
          <h2 className="text-xl font-bold text-gray-900">Spirit of the Sound</h2>
          <p className="text-sm text-gray-500 mt-1">Évaluez la session que vous venez de vivre</p>
        </div>

        {/* Contexte — avec qui + où */}
        <Card className="border-indigo-100 bg-indigo-50">
          <CardContent className="pt-4 pb-4 space-y-3">
            {/* Titre adapté selon rôle : audience vs participant */}
            {(() => {
              const me = asArray(session?.participants).find(p => normalizeId(p?.userId) === normalizeId(user?.id));
              const isAudience = !me && session?.sessionType === 'event';
              return (
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                  {isAudience ? "Vous avez assisté à la session avec" : "Vous venez de jouer avec"}
                </p>
              );
            })()}

            {sotsParticipants.length === 0 && (
              <p className="text-sm text-gray-500 italic">Session solo</p>
            )}

            {sotsParticipants.map((p) => {
              const pid = normalizeId(p?.userId);
              const prof = profilesCache[pid];
              const displayName = prof?.displayName || `Joueur ${pid.slice(-4)}`;
              const avatarUrl = prof?.avatarUrl || null;
              const roleId = normalizeId(p?.roleSystemId);
              const styleIds = asArray(p?.styleSystemIds).map(normalizeId).filter(Boolean);
              const singleStyleId = normalizeId(p?.styleSystemId);
              const finalStyleIds = styleIds.length > 0 ? styleIds : singleStyleId ? [singleStyleId] : [];

              return (
                <div key={pid} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-indigo-100">
                  <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                    {avatarUrl
                      ? <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                      : <span className="text-white font-bold">{displayName.charAt(0).toUpperCase()}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
                    <p className="text-xs text-gray-500">
                      {roleId ? roleLabels[roleId] || roleId : "—"}
                      {finalStyleIds.length > 0 && ` · ${finalStyleIds.map(s => styleLabels[s] || s).join(", ")}`}
                    </p>
                  </div>
                </div>
              );
            })}

            {selectedCheckpoint && (
              <div className="flex items-center gap-2 pt-1 border-t border-indigo-100">
                <span className="text-lg">{selectedCheckpoint.iconKey || "🗺️"}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{selectedCheckpoint.name}</p>
                  {selectedCheckpoint.vibe && (
                    <p className="text-xs text-indigo-500">{selectedCheckpoint.vibe}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Questions */}
        <Card>
          <CardContent className="pt-5 pb-5 space-y-5">
            {sotsQuestions.map((question, idx) => {
              const val = sotsVotes[question.key] ?? 0;
              return (
                <div key={question.key} className="space-y-2">
                  <Label className="text-sm font-medium text-gray-800 flex items-start gap-2">
                    <span className="text-base leading-none mt-0.5">{question.emoji}</span>
                    <span>{idx + 1}. {question.label}</span>
                  </Label>
                  <RadioGroup
                    value={String(val || "")}
                    onValueChange={(v) => handleSurveyChange(question.key, v)}
                    className="flex gap-2 mt-1"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <label
                        key={n}
                        htmlFor={`${question.key}-${n}`}
                        className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border-2 cursor-pointer transition-all text-center
                          ${val === n
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 hover:border-gray-300 text-gray-500"
                          }`}
                      >
                        <RadioGroupItem value={String(n)} id={`${question.key}-${n}`} className="sr-only" />
                        <span className="text-lg font-bold">{n}</span>
                        <span className="text-xs leading-tight hidden sm:block">{SCORE_LABELS[n]}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              );
            })}

            <div className="pt-3 border-t">
              <Label className="text-sm font-medium text-gray-700">Un mot sur la session ? <span className="text-gray-400 font-normal">(optionnel)</span></Label>
              <textarea
                className="w-full mt-2 p-3 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                rows={2}
                placeholder="Ce qui vous a marqué, ce qui pourrait être amélioré..."
                value={sotsVotes.comment || ""}
                onChange={(e) => setSotsVotes((prev) => ({ ...prev, comment: e.target.value }))}
              />
            </div>

            {/* 6-G — Question recommandation binaire */}
            <div className="pt-3 border-t">
              <Label className="text-sm font-medium text-gray-700 block mb-2">
                Recommanderiez-vous ce(s) partenaire(s) ? <span className="text-gray-400 font-normal">(optionnel)</span>
              </Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSotsVotes(prev => ({ ...prev, wouldRecommend: true }))}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    sotsVotes.wouldRecommend === true
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  👍 Oui
                </button>
                <button
                  type="button"
                  onClick={() => setSotsVotes(prev => ({ ...prev, wouldRecommend: false }))}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    sotsVotes.wouldRecommend === false
                      ? 'border-red-400 bg-red-50 text-red-600'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  👎 Non
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSubmitSOTS}
          disabled={actionLoading || !isSurveyComplete()}
          className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-base"
        >
          {actionLoading
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Envoi en cours...</>
            : <><Star className="w-4 h-4 mr-2" />Soumettre mon évaluation</>
          }
        </Button>

        {!isSurveyComplete() && (
          <p className="text-center text-xs text-gray-400">
            Répondez aux {sotsQuestions.filter(q => !(sotsVotes[q.key] >= 1)).length} question{sotsQuestions.filter(q => !(sotsVotes[q.key] >= 1)).length > 1 ? "s" : ""} restante{sotsQuestions.filter(q => !(sotsVotes[q.key] >= 1)).length > 1 ? "s" : ""} pour continuer
          </p>
        )}

      </div>
    );
  }

  // RESULTS — post-SOTS sans drop
  if (uiState === "results") {
    return (
      <ResultsView
        profile={profile}
        session={session}
        user={user}
        profilesCache={profilesCache}
        normalizeId={normalizeId}
        asArray={asArray}
        onReplay={() => { setSession(null); setUiState("idle"); }}
      />
    );
  }

  if (uiState === "drop" && dropResult) {
    return (
      <DropView
        dropResult={dropResult}
        onContinue={() => { setDropResult(null); setSession(null); setUiState("idle"); }}
      />
    );
  }

  // ERROR
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <X className="w-6 h-6" />
            Erreur
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()} className="w-full">
            Recharger
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}