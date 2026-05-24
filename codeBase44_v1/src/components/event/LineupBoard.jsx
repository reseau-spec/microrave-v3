/**
 * LineupBoard — Grille de placement scènes × plages pour l'EventLobby.
 *
 * Layout 2 colonnes :
 *   Colonne gauche  : cartes talent + plateau de placement
 *   Colonne droite  : zone de négociation du cachet (organisateur ET talent)
 *
 * Vue organisateur : slider de prix + bouton Bénévolat + bouton Confirmer placement
 * Vue talent       : proposition reçue + boutons Accepter / Refuser / Contre-proposer
 */
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, LayoutGrid, ZapIcon, X, DollarSign, Check, XCircle, RefreshCw, ChevronRight, Clock, MessageSquare, CheckCheck, Lock, ExternalLink } from 'lucide-react';

// ─── computeCommissionPreview ─────────────────────────────────────────────────
// Réplique exactement la logique de buildCommissionSnapshot (respondToPriceProposal v10).
// Appelé AVANT acceptation pour afficher à l'utilisateur ce qui SERA figé.
//
// Règle absolue : UI_snapshot === DB_snapshot
//   Ce que l'utilisateur voit avant d'accepter = exactement ce qui est écrit dans
//   LineupPlacement au moment de l'acceptation. Aucune approximation tolérée.
//
// Sources (même ordre de priorité que le backend) :
//   1. UserMembership.tier (actif) → tier contractuel
//   2. MembershipPlan.commissionRate (plan actif pour ce tier) → baseRate
//   3. TalentProfile.sotsRecent30Score / sotsGlobalScore → sotsScore
//   4. Grille SOTS (identique respondToPriceProposal v10) → modulation
//   5. effectiveRate = round4(baseRate × modulation)
//
// ⚠️ SYNCHRONISATION OBLIGATOIRE — Grille SOTS identique à :
//   - respondToPriceProposal/entry.ts → sotsModulationFactor()
//   - generatePayoutSplits/entry.ts   → sotsModulation() [fallback]
// Si tu modifies un seuil ici, le modifier dans les 2 fonctions backend aussi.
//
// Grille v10 :
//   score ≥ 4.5  → ×0.90  (−10%)
//   score ≥ 4.0  → ×0.95  (−5%)
//   score ≥ 3.5  → ×1.00  (neutre)
//   score >  3.0 → ×1.05  (+5%)
//   score ≤ 2.0  → ×1.20  (+20%)
//   score ≤ 2.5  → ×1.15  (+15%)
//   score ≤ 3.0  → ×1.10  (+10%)
//   score = 0    → ×1.00  (pas de modulation)

const COMMISSION_RATES_FALLBACK = { A: 0.120, B: 0.090, C: 0.060, D: 0.035, E: 0.050 };
const TIER_LABELS = { A: 'Freemium', B: 'Base', C: 'Pro', D: 'Studio', E: 'Fondateur' };

function sotsModulationFactor(score) {
  if (!score || score <= 0) return 1.00;
  if (score >= 4.5) return 0.90;
  if (score >= 4.0) return 0.95;
  if (score >= 3.5) return 1.00;
  if (score >  3.0) return 1.05;
  if (score <= 2.0) return 1.20;
  if (score <= 2.5) return 1.15;
  if (score <= 3.0) return 1.10;
  return 1.05;
}

// computeCommissionPreview(talentUserId, profileMap)
// → { commissionTier, commissionBaseRate, sotsScore, sotsModulationFactor, effectiveCommissionRate }
// Version synchrone qui utilise profileMap déjà chargé (sotsRecent30Score / sotsGlobalScore).
// Le tier et baseRate sont chargés async par le hook useCommissionPreview ci-dessous.
function buildCommissionPreviewSync({ tier, baseRate, profile }) {
  const sotsScore    = Number(profile?.sotsRecent30Score || profile?.sotsGlobalScore || 0);
  const modulation   = sotsModulationFactor(sotsScore);
  const effectiveRate = Math.round(baseRate * modulation * 10000) / 10000;
  return {
    commissionTier:          tier,
    commissionBaseRate:      baseRate,
    sotsScore,
    sotsModulation:          modulation,
    effectiveCommissionRate: effectiveRate,
    isReady:                 true,
  };
}

// Hook : charge le tier + baseRate depuis DB pour un talent donné.
// Retourne { preview, loading } — preview est null pendant le chargement.
// Une fois chargé, preview contient le snapshot complet (même données que le backend à T1).
function useCommissionPreview(talentUserId, profileMap) {
  const [preview, setPreview] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!talentUserId) { setPreview(null); return; }
    setLoading(true);
    setPreview(null);

    const profile = profileMap?.[talentUserId] || null;

    // Charger UserMembership + MembershipPlan en parallèle
    Promise.all([
      base44.entities.UserMembership
        .filter({ userId: talentUserId, status: 'active' })
        .catch(() => []),
    ]).then(async ([memberships]) => {
      const tier = memberships?.[0]?.tier || 'A';

      // Charger le plan actif pour ce tier
      let baseRate = COMMISSION_RATES_FALLBACK[tier] ?? 0.120;
      try {
        const plans = await base44.entities.MembershipPlan
          .filter({ tier })
          .catch(() => []);
        const now = new Date().toISOString();
        const activePlans = (plans || []).filter(p =>
          p.activeFrom <= now &&
          (!p.activeTo || p.activeTo > now) &&
          !p.isLegacy
        ).sort((a, b) => a.commissionRate - b.commissionRate);
        if (activePlans[0]?.commissionRate != null) {
          baseRate = Number(activePlans[0].commissionRate);
        }
      } catch { /* fallback déjà défini */ }

      setPreview(buildCommissionPreviewSync({ tier, baseRate, profile }));
    }).catch(() => {
      // Fallback dégradé : tier A, taux 12%
      const tier = 'A';
      const baseRate = 0.120;
      setPreview(buildCommissionPreviewSync({ tier, baseRate, profile }));
    }).finally(() => setLoading(false));
  }, [talentUserId]);

  return { preview, loading };
}

// ─── Couleurs domaines ────────────────────────────────────────────────────────
const DOMAIN_COLORS = {
  music:       'bg-purple-100 text-purple-700',
  humour:      'bg-orange-100 text-orange-700',
  video:       'bg-cyan-100 text-cyan-700',
  photo:       'bg-pink-100 text-pink-700',
  art:         'bg-yellow-100 text-yellow-700',
  food:        'bg-green-100 text-green-700',
  responsable: 'bg-red-100 text-red-700',
  producer:    'bg-slate-100 text-slate-600',
  tech:        'bg-blue-100 text-blue-700',
};

export function getRoleBadgeColor(roleId, roleMap) {
  const role = roleMap[roleId];
  const domain = (role?.domainKey || '').toLowerCase();
  return DOMAIN_COLORS[domain] || 'bg-gray-100 text-gray-600';
}

// ─── Calcul de prix ───────────────────────────────────────────────────────────
const MERGE_GAP_MIN = 15;

export function buildPresenceBlocks(talentPlacements, schedule) {
  const resolved = talentPlacements
    .map(p => {
      const plageObj = schedule.find(pl => pl.plageId === p.plageId);
      if (!plageObj?.timeStart || !plageObj?.timeEnd) return null;
      return {
        ...p,
        startMs: new Date(plageObj.timeStart).getTime(),
        endMs: new Date(plageObj.timeEnd).getTime(),
        durationMin: (new Date(plageObj.timeEnd) - new Date(plageObj.timeStart)) / 60000,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs);

  if (!resolved.length) return [];

  const blocks = [];
  let current = { placements: [resolved[0]], startMs: resolved[0].startMs, endMs: resolved[0].endMs };

  for (let i = 1; i < resolved.length; i++) {
    const p = resolved[i];
    const gapMin = (p.startMs - current.endMs) / 60000;
    if (gapMin <= MERGE_GAP_MIN) {
      current.placements.push(p);
      current.endMs = Math.max(current.endMs, p.endMs);
    } else {
      blocks.push(current);
      current = { placements: [p], startMs: p.startMs, endMs: p.endMs };
    }
  }
  blocks.push(current);

  return blocks.map(block => {
    const requiredMin = (block.endMs - block.startMs) / 60000;
    const billableMin = Math.max(30, requiredMin);
    const totalWorkedMin = block.placements.reduce((s, p) => s + p.durationMin, 0);
    return {
      ...block,
      requiredMin,
      billableMin,
      totalWorkedMin,
      placements: block.placements.map(p => ({
        ...p,
        allocationRatio: totalWorkedMin > 0 ? p.durationMin / totalWorkedMin : 1 / block.placements.length,
      })),
    };
  });
}

export function computePlacementPrice(userId, targetPlageId, allConfirmedSlots, schedule, hourlyRate) {
  const allPlacements = allConfirmedSlots
    .filter(s => s.candidateUserId === userId)
    .flatMap(s => (s.placements || []).map(p => ({ ...p, slotId: s.slotId })));

  const plageObj = schedule.find(p => p.plageId === targetPlageId);
  const fallbackHours = plageObj?.timeStart && plageObj?.timeEnd
    ? Math.max(0.5, (new Date(plageObj.timeEnd) - new Date(plageObj.timeStart)) / 3600000)
    : 0.5;

  if (!allPlacements.length) {
    return { price: Math.round(hourlyRate * fallbackHours), billableMin: fallbackHours * 60, requiredMin: fallbackHours * 60, allocationRatio: 1 };
  }

  const alreadyIncluded = allPlacements.some(p => p.plageId === targetPlageId);
  const pToAdd = !alreadyIncluded && plageObj ? [{ plageId: targetPlageId, sceneId: null, slotId: null }] : [];
  const blocks = buildPresenceBlocks([...allPlacements, ...pToAdd], schedule);

  for (const block of blocks) {
    const entry = block.placements.find(p => p.plageId === targetPlageId);
    if (entry) {
      const blockTotalPrice = hourlyRate * (block.billableMin / 60);
      return {
        price: Math.round(blockTotalPrice * entry.allocationRatio),
        billableMin: block.billableMin,
        requiredMin: block.requiredMin,
        allocationRatio: entry.allocationRatio,
        workedMin: entry.durationMin,
      };
    }
  }

  return { price: Math.round(hourlyRate * fallbackHours), billableMin: fallbackHours * 60, requiredMin: fallbackHours * 60, allocationRatio: 1 };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtHHMM(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d)) return '--:--';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function durationLabel(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) return '';
  const diffMin = Math.round((new Date(isoEnd) - new Date(isoStart)) / 60000);
  if (diffMin <= 0) return '';
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}min`;
}


// ─── Status helpers ───────────────────────────────────────────────────────────
function proposalStatusInfo(status, finalStatus) {
  const s = finalStatus || status || '';
  if (s === 'accepted')         return { label: 'Accepté',            color: 'text-green-400', bg: 'bg-green-900/40 border-green-600',  Icon: CheckCheck };
  if (s === 'pending_talent')   return { label: 'En attente du talent', color: 'text-amber-300', bg: 'bg-amber-900/40 border-amber-600',  Icon: Clock };
  if (s === 'pending_organizer')return { label: 'Contre-offre reçue', color: 'text-blue-300',   bg: 'bg-blue-900/40 border-blue-600',   Icon: MessageSquare };
  if (s === 'rejected')         return { label: 'Refusé',             color: 'text-red-400',   bg: 'bg-red-900/40 border-red-600',     Icon: XCircle };
  return { label: s || '—', color: 'text-purple-300', bg: 'bg-purple-900/40 border-purple-600', Icon: Clock };
}

// ─── Pad de négociation — rattaché à une assignation précise ──────────────────
// Utilisé par organisateur (toutes assignations) et talent (ses propres assignations).
// assignment = { slotId, sceneId, plageId, candidateUserId, proposalId }
// proposal   = PriceProposal entité DB complète (rounds, finalPrice, status…)
function AssignmentNegotiationPad({
  assignment, proposal, prof, eventTitle,
  isOrganizer, loading,
  onAccept, onReject, onCounter,
  actionLoading,
  profileMap,   // v10 — requis pour SOTS via useCommissionPreview
  styleMap,     // v11 — requis pour StylePicker talent
  roleMap,      // v11 — requis pour filtrer styles par domaine
}) {
  const [showCounter, setShowCounter] = useState(false);
  const [counterPrice, setCounterPrice] = useState(0);
  const [counterNote,  setCounterNote]  = useState('');

  // v11 — Styles sélectionnés par le talent avant acceptation
  // Pré-initialisés depuis proposal.styleSystemIds (styles proposés par l'organisateur).
  // Le talent les voit pré-cochés, peut les modifier avant d'accepter.
  // useEffect nécessaire : proposal arrive async (loadProposal) après le montage,
  // useState(() => ...) ne se réinitialise pas quand proposal change.
  const orgProposedStyles = Array.isArray(proposal?.styleSystemIds) ? proposal.styleSystemIds : [];
  const [selectedStyleIds, setSelectedStyleIds] = useState([]);

  useEffect(() => {
    // Sync dès que proposal.styleSystemIds arrive ou change
    const styles = Array.isArray(proposal?.styleSystemIds) ? proposal.styleSystemIds : [];
    setSelectedStyleIds(styles);
  }, [proposal?.styleSystemIds?.join(',')]);

  const handleStyleToggle = (sid) =>
    setSelectedStyleIds(prev =>
      prev.includes(sid) ? prev.filter(s => s !== sid) : [...prev, sid]
    );

  // v10 — CommissionPreview : même calcul que buildCommissionSnapshot backend
  // Affiché AVANT acceptation. Doit matcher exactement ce qui sera figé à T1.
  const talentUserId = assignment?.candidateUserId || proposal?.talentUserId;
  const { preview: commPreview, loading: commLoading } = useCommissionPreview(talentUserId, profileMap);

  const name = prof?.displayName || `Talent …${(talentUserId || '').slice(-4)}`;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!proposal && !assignment) return null;

  const status      = proposal?.status      || '';
  const finalStatus = proposal?.finalStatus || '';
  const info        = proposalStatusInfo(status, finalStatus);
  const StatusIcon  = info.Icon;

  // Prix à afficher : PriceProposal DB > rounds[] > snapshot hint > 0
  // Ordre de priorité :
  //   1. currentOfferPrice — champ dédié écrit par proposePriceToTalent
  //   2. assignedPrice — champ legacy
  //   3. rounds[last].price — toujours présent, source fiable (rounds sont créés avant currentOfferPrice)
  //      Fallback nécessaire car currentOfferPrice peut être undefined pendant le chargement async
  //      ou absent si la proposal a été créée avant ce champ.
  //   4. _snapshotPrice — hint du snapshot (peut être stale)
  //   5. 0 — dernier recours (affiche "Bénévolat" — ne doit jamais atteindre ce cas pour une vraie proposal)
  const rounds        = Array.isArray(proposal?.rounds) ? proposal.rounds : [];
  const lastRoundPrice = rounds.length > 0 ? rounds[rounds.length - 1]?.price : null;

  const currentOffer  = Number(
    proposal?.currentOfferPrice ??
    proposal?.assignedPrice     ??
    lastRoundPrice              ??
    assignment?._snapshotPrice  ??
    0
  );
  const finalPrice    = proposal?.finalPrice != null ? Number(proposal.finalPrice) : null;
  const calculatedPrice = Number(proposal?.calculatedPrice ?? 0);

  const isAccepted     = finalStatus === 'accepted' || status === 'accepted';
  const isPendingTalent = status === 'pending_talent';
  const isPendingOrg   = status === 'pending_organizer';
  const isTerminal     = ['accepted','rejected','withdrawn','expired'].includes(finalStatus) ||
                         ['accepted','rejected','withdrawn','expired'].includes(status);

  const maxSlider = Math.max((calculatedPrice || 100) * 2, (currentOffer || 0) * 2, 500);

  const shownPrice = isAccepted && finalPrice != null ? finalPrice : currentOffer;

  return (
    <div className="h-full flex flex-col overflow-y-auto">

      {/* Talent header */}
      <div className="p-4 border-b border-purple-800/40">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {prof?.avatarUrl
              ? <img src={prof.avatarUrl} alt={name} className="w-full h-full object-cover" />
              : name[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{name}</p>
            <p className="text-purple-400 text-xs">
              {assignment?.plageLabel || 'Plage'} · {assignment?.sceneLabel || 'Scène'}
            </p>
          </div>
        </div>
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${info.bg} ${info.color}`}>
          <StatusIcon className="w-3 h-3" />
          {info.label}
        </div>
      </div>

      {/* Prix */}
      <div className="p-4 text-center border-b border-purple-800/40">
        <p className="text-xs text-purple-400 uppercase tracking-wider mb-1">
          {isAccepted ? 'Prix contractuel final' : isPendingOrg ? 'Contre-offre du talent' : 'Offre en cours'}
        </p>
        {loading && shownPrice === 0 ? (
          /* Fix : ne jamais afficher "Bénévolat" pendant le chargement.
             shownPrice===0 pendant loading = état transitoire (proposal pas encore arrivée),
             pas une vraie offre à 0$. On affiche un spinner jusqu'à ce que la donnée arrive. */
          <div className="flex justify-center items-center h-10">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : shownPrice === 0 ? (
          <p className="text-3xl font-black text-amber-300">Bénévolat</p>
        ) : (
          <p className={`text-4xl font-black ${isAccepted ? 'text-green-300' : isPendingOrg ? 'text-blue-300' : 'text-white'}`}>
            {shownPrice} <span className="text-xl text-purple-300">$</span>
          </p>
        )}
        {calculatedPrice > 0 && !isAccepted && (
          <p className="text-purple-500 text-xs mt-1">Calculé système : {calculatedPrice} $</p>
        )}
        {isAccepted && (
          <p className="text-green-500 text-xs mt-1">Figé · non modifiable</p>
        )}
      </div>

      {/* v10 — CommissionPreview : affiché au talent uniquement (confidentiel organisateur)
           AVANT acceptation : données en direct (même calcul que le backend à T1)
           APRÈS acceptation : données figées depuis proposal.commissionSnapshot
           Invariant : ce qui est affiché = exactement ce qui est dans LineupPlacement */}
      {shownPrice > 0 && !isOrganizer && (
        <div className="px-4 py-3 border-b border-purple-800/40">
          {(() => {
            // Source des données commission :
            //   - Accepté : snapshot figé dans PriceProposal (T1)
            //   - En cours / pending : preview calculé en live (identique au backend)
            const useSnapshot  = isAccepted && proposal?.commissionSnapshotAt;
            const tier         = useSnapshot ? proposal.commissionTier : commPreview?.commissionTier;
            const baseRate     = useSnapshot ? proposal.commissionBaseRate : commPreview?.commissionBaseRate;
            const sotsScore    = useSnapshot ? proposal.sotsScoreAtAcceptance : commPreview?.sotsScore;
            const modulation   = useSnapshot ? proposal.sotsModulationFactor : commPreview?.sotsModulation;
            const effectiveRate = useSnapshot ? proposal.effectiveCommissionRate : commPreview?.effectiveCommissionRate;
            const isLoadingComm = !useSnapshot && commLoading;

            if (isLoadingComm) {
              return (
                <div className="flex items-center gap-2 py-1">
                  <div className="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="text-purple-500 text-xs">Calcul commission…</span>
                </div>
              );
            }
            if (!effectiveRate && effectiveRate !== 0) return null;

            const fee = Math.round(shownPrice * effectiveRate * 100) / 100;
            const net = Math.round((shownPrice - fee) * 100) / 100;
            const tierLabel = TIER_LABELS[tier] || tier || '?';
            const showSots  = (sotsScore > 0 || (modulation != null && modulation !== 1.0));

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold">
                    Ventilation commission
                  </p>
                  {useSnapshot
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/50">Figé · contrat</span>
                    : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-900/40 text-purple-400 border border-purple-800/50">Sera figé à l'acceptation</span>
                  }
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <span className="text-purple-500">Tier</span>
                  <span className="text-purple-200 font-medium">{tierLabel} ({tier})</span>
                  <span className="text-purple-500">Taux de base</span>
                  <span className="text-purple-200 font-medium">{((baseRate || 0) * 100).toFixed(1)} %</span>
                  {showSots && (
                    <>
                      <span className="text-purple-500">Score SOTS</span>
                      <span className="text-purple-200 font-medium">
                        {sotsScore > 0 ? `${sotsScore.toFixed(2)} / 5` : '—'}
                        {modulation != null && modulation !== 1.0 && (
                          <span className={`ml-1.5 font-bold text-[10px] ${modulation < 1 ? 'text-green-400' : 'text-amber-400'}`}>
                            {modulation < 1
                              ? `−${((1 - modulation) * 100).toFixed(0)} % (bonus)`
                              : `+${((modulation - 1) * 100).toFixed(0)} % (malus)`}
                          </span>
                        )}
                      </span>
                    </>
                  )}
                  <span className="text-purple-400 font-semibold">Taux effectif</span>
                  <span className="text-white font-bold">{((effectiveRate || 0) * 100).toFixed(2)} %</span>
                </div>
                <div className="grid grid-cols-3 gap-1 pt-1 border-t border-purple-800/40">
                  <div className="text-center p-1.5 rounded-lg bg-purple-900/30 border border-purple-800/40">
                    <p className="text-purple-500 text-[9px] mb-0.5">Cachet brut</p>
                    <p className="text-white font-bold text-xs">{shownPrice} $</p>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-red-950/30 border border-red-900/30">
                    <p className="text-red-500 text-[9px] mb-0.5">Commission MR</p>
                    <p className="text-red-300 font-bold text-xs">{fee} $</p>
                  </div>
                  <div className="text-center p-1.5 rounded-lg bg-green-950/40 border border-green-900/40">
                    <p className="text-green-500 text-[9px] mb-0.5">
                      {isAccepted ? 'Net figé' : 'Net talent'}
                    </p>
                    <p className="text-green-300 font-bold text-xs">{net} $</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Historique rounds */}
      {rounds.length > 0 && (
        <div className="px-4 py-3 border-b border-purple-800/40">
          <p className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold mb-2">Historique</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {rounds.map((r, i) => {
              const roundStyles = Array.isArray(r.styleSystemIds)
                ? r.styleSystemIds.map(sid => styleMap?.[sid]).filter(Boolean)
                : [];
              return (
                <div key={i} className={`flex flex-col gap-1 text-xs rounded px-2 py-1.5 ${r.proposedBy === 'organizer' ? 'bg-purple-900/40' : 'bg-blue-900/30'}`}>
                  <div className="flex items-center justify-between">
                    <span className={r.proposedBy === 'organizer' ? 'text-purple-300' : 'text-blue-300'}>
                      {r.proposedBy === 'organizer' ? (isOrganizer ? 'Vous' : 'Organisateur') : (isOrganizer ? 'Talent' : 'Vous')}
                    </span>
                    <span className="font-semibold text-white">{r.price === 0 ? 'Bénévolat' : `${r.price} $`}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                      r.status === 'countered' ? 'bg-amber-900/60 text-amber-300' :
                      r.status === 'accepted'  ? 'bg-green-900/60 text-green-300' :
                      r.status === 'rejected'  ? 'bg-red-900/60 text-red-300' :
                      'bg-purple-900/60 text-purple-400'
                    }`}>{r.status || 'pending'}</span>
                  </div>
                  {roundStyles.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {roundStyles.map(style => (
                        <span key={style.systemId}
                          className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-800/60 text-purple-200 border border-purple-700/40">
                          {style.displayName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions — organisateur face à une contre-offre */}
      {isOrganizer && isPendingOrg && !isTerminal && (
        <div className="p-4 flex flex-col gap-2 border-b border-purple-800/40">
          <p className="text-xs text-purple-300 font-semibold mb-1">Répondre à la contre-offre</p>

          {/* Styles de candidature — l'organisateur peut choisir parmi ce que le talent propose */}
          {(() => {
            const candidatureStyles = Array.isArray(assignment?.candidateStyleSystemIds)
              ? assignment.candidateStyleSystemIds
              : (Array.isArray(proposal?.styleSystemIds) ? proposal.styleSystemIds : []);
            if (!candidatureStyles.length) return null;
            return (
              <div className="rounded-lg border border-purple-700/40 bg-purple-950/40 px-3 py-2 mb-1">
                <StylePicker
                  talentActiveStyles={candidatureStyles}
                  styleMap={styleMap}
                  roleDomainKey={null}
                  selectedStyles={selectedStyleIds}
                  onToggle={(sid) => setSelectedStyleIds(prev =>
                    prev.includes(sid) ? prev.filter(s => s !== sid) : [...prev, sid]
                  )}
                />
              </div>
            );
          })()}

          {!showCounter ? (
            <>
              <button type="button" disabled={actionLoading} onClick={() => onAccept(selectedStyleIds)}
                className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                <Check className="w-4 h-4" />
                Accepter {loading && currentOffer === 0 ? '…' : currentOffer === 0 ? 'bénévolat' : `${currentOffer} $`}
              </button>
              <button type="button" disabled={actionLoading}
                onClick={() => { setCounterPrice(currentOffer); setShowCounter(true); }}
                className="w-full py-2 rounded-xl border border-purple-500 text-purple-200 hover:bg-purple-800/40 text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                <RefreshCw className="w-4 h-4" /> Contre-proposer
              </button>
              <button type="button" disabled={actionLoading} onClick={onReject}
                className="w-full py-2 rounded-xl border border-red-800 text-red-400 hover:bg-red-900/30 text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                <XCircle className="w-4 h-4" /> Refuser
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-purple-300">Votre contre-proposition</p>
              <div className="text-center py-1">
                <p className="text-3xl font-black text-white">{counterPrice === 0 ? <span className="text-amber-300">Bénévolat</span> : <>{counterPrice} <span className="text-lg text-purple-300">$</span></>}</p>
              </div>
              <input type="range" min={0} max={maxSlider} step={5} value={counterPrice}
                onChange={e => setCounterPrice(Number(e.target.value))}
                className="w-full accent-purple-400 cursor-pointer" />
              <textarea placeholder="Message optionnel…" value={counterNote}
                onChange={e => setCounterNote(e.target.value)} rows={2}
                className="w-full text-xs rounded-lg border border-purple-700 bg-purple-900/30 text-purple-100 placeholder-purple-600 px-3 py-2 resize-none focus:outline-none focus:border-purple-400" />
              <div className="flex gap-2">
                <button type="button" disabled={actionLoading}
                  onClick={() => onCounter(counterPrice, counterNote, selectedStyleIds)}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-all disabled:opacity-50">
                  Envoyer ma contre-offre
                </button>
                <button type="button" onClick={() => setShowCounter(false)}
                  className="px-3 py-2.5 rounded-xl border border-purple-700 text-purple-400 text-sm">✕</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Actions — talent face à une proposition */}
      {!isOrganizer && isPendingTalent && !isTerminal && (
        <div className="p-4 flex flex-col gap-2 border-b border-purple-800/40">

          {/* v11 — StylePicker talent : uniquement les styles soumis à la candidature
               Source : assignment.candidateStyleSystemIds — ce que le talent a proposé lors de l'apply.
               Les styles proposés par l'organisateur (proposal.styleSystemIds) sont pré-cochés
               via le useEffect sur orgProposedStyles. */}
          {(() => {
            // SOURCE CORRECTE : styles de la candidature (pas prof.activeStyles)
            const candidatureStyles = Array.isArray(assignment?.candidateStyleSystemIds)
              ? assignment.candidateStyleSystemIds
              : [];
            if (!candidatureStyles.length) return null;
            return (
              <div className="rounded-lg border border-purple-700/40 bg-purple-950/40 p-3 mb-1">
                {orgProposedStyles.length > 0 && (
                  <p className="text-purple-500 text-[10px] mb-2 leading-tight">
                    ✦ L'organisateur suggère ces styles — modifiez si besoin avant d'accepter
                  </p>
                )}
                <StylePicker
                  talentActiveStyles={candidatureStyles}
                  styleMap={styleMap}
                  roleDomainKey={null}
                  selectedStyles={selectedStyleIds}
                  onToggle={handleStyleToggle}
                />
              </div>
            );
          })()}

          {!showCounter ? (
            <>
              <button type="button" disabled={actionLoading} onClick={() => onAccept(selectedStyleIds)}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                <Check className="w-4 h-4" />
                Accepter — {loading && currentOffer === 0 ? '…' : currentOffer === 0 ? 'bénévolat' : `${currentOffer} $`}
                {selectedStyleIds.length > 0 && (
                  <span className="text-[11px] font-normal opacity-80">
                    · {selectedStyleIds.length} style{selectedStyleIds.length > 1 ? 's' : ''}
                  </span>
                )}
              </button>
              <button type="button" disabled={actionLoading}
                onClick={() => { setCounterPrice(currentOffer); setShowCounter(true); }}
                className="w-full py-2.5 rounded-xl border border-purple-500 text-purple-200 hover:bg-purple-800/40 text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                <RefreshCw className="w-4 h-4" /> Contre-proposer
              </button>
              <button type="button" disabled={actionLoading} onClick={onReject}
                className="w-full py-2 rounded-xl border border-red-800 text-red-400 hover:bg-red-900/30 text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                <XCircle className="w-4 h-4" /> Refuser
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-purple-300">Votre contre-proposition</p>
              <div className="text-center py-1">
                <p className="text-3xl font-black text-white">{counterPrice === 0 ? <span className="text-amber-300">Bénévolat</span> : <>{counterPrice} <span className="text-lg text-purple-300">$</span></>}</p>
              </div>
              <input type="range" min={0} max={maxSlider} step={5} value={counterPrice}
                onChange={e => setCounterPrice(Number(e.target.value))}
                className="w-full accent-purple-400 cursor-pointer" />
              <textarea placeholder="Message (optionnel)…" value={counterNote}
                onChange={e => setCounterNote(e.target.value)} rows={2}
                className="w-full text-xs rounded-lg border border-purple-700 bg-purple-900/30 text-purple-100 placeholder-purple-600 px-3 py-2 resize-none focus:outline-none focus:border-purple-400" />
              <div className="flex gap-2">
                <button type="button" disabled={actionLoading}
                  onClick={() => onCounter(counterPrice, counterNote, selectedStyleIds)}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-all disabled:opacity-50">
                  Envoyer ma contre-offre
                </button>
                <button type="button" onClick={() => setShowCounter(false)}
                  className="px-3 py-2.5 rounded-xl border border-purple-700 text-purple-400 text-sm">✕</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Styles figés — état accepté — visibles organisateur ET talent */}
      {isAccepted && (() => {
        const figuredStyles = Array.isArray(proposal?.styleSystemIds)
          ? proposal.styleSystemIds.map(sid => styleMap?.[sid]).filter(Boolean)
          : [];
        if (!figuredStyles.length) return null;
        return (
          <div className="px-4 py-3 border-b border-purple-800/40">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold">
                Styles confirmés
              </p>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/50">
                Figé · contrat
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {figuredStyles.map(style => (
                <span key={style.systemId}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium border bg-green-900/30 text-green-300 border-green-800/50">
                  {style.displayName}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Lecture seule — état terminal */}
      {isTerminal && !isAccepted && (
        <div className="p-4 text-center">
          <Lock className="w-5 h-5 text-gray-500 mx-auto mb-1" />
          <p className="text-xs text-gray-400">Négociation terminée</p>
        </div>
      )}
    </div>
  );
}

// ─── StylePicker inline — styles actifs du talent filtrés par domaine du rôle ─
// Affiche uniquement les styles déclarés actifs par le talent ET compatibles
// avec le domaine du rôle assigné (ex: rôle Humoriste → domaine humour → styles humour).
// Un style musical ne peut pas être assigné sur un rôle de domaine humour.
// Aucune commission n'est visible ici — confidentiel au talent uniquement.
function StylePicker({ talentActiveStyles, styleMap, roleDomainKey, selectedStyles, onToggle }) {
  if (!talentActiveStyles?.length) return null;

  // Filtrer les styles actifs du talent qui correspondent au domaine du rôle
  const allTalentStyles = talentActiveStyles
    .map(sid => styleMap?.[sid])
    .filter(Boolean);

  // Si roleDomainKey est connu : ne montrer que les styles du bon domaine
  // Si inconnu (rôle sans domaine) : montrer tous les styles actifs du talent
  const compatibleStyles = roleDomainKey
    ? allTalentStyles.filter(s => s.domainKey === roleDomainKey)
    : allTalentStyles;

  const sortedStyles = compatibleStyles
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  // Styles du talent mais hors domaine — pour feedback visuel
  const incompatibleCount = allTalentStyles.length - compatibleStyles.length;

  if (sortedStyles.length === 0) {
    return (
      <div className="space-y-1.5">
        <p className="text-purple-300 text-[10px] font-semibold uppercase tracking-wider">
          Style souhaité
        </p>
        <p className="text-purple-600 text-[11px] italic">
          Aucun style compatible avec ce rôle dans les préférences du talent.
          {incompatibleCount > 0 && ` (${incompatibleCount} style${incompatibleCount > 1 ? 's' : ''} hors domaine non affiché${incompatibleCount > 1 ? 's' : ''})`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-purple-300 text-[10px] font-semibold uppercase tracking-wider">
          Style souhaité
        </p>
        {selectedStyles.length > 0 && (
          <span className="text-[9px] text-purple-400">
            {selectedStyles.length} sélectionné{selectedStyles.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sortedStyles.map(style => {
          const isSelected = selectedStyles.includes(style.systemId);
          return (
            <button
              key={style.systemId}
              type="button"
              onClick={() => onToggle(style.systemId)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                isSelected
                  ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                  : 'bg-purple-900/30 text-purple-300 border-purple-700/50 hover:border-purple-500 hover:text-purple-200'
              }`}
            >
              {style.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Zone de négociation — Vue organisateur ───────────────────────────────────
function NegotiationPanelOrganizer({
  slot, prof, placedPlages, schedule, confirmedSlots,
  priceDraft, setPriceDraft, priceRange, setPriceRange,
  pricingMeta, activePlage,
  onConfirmPlacement,
  actionLoading,
  profileMap,
  styleMap,    // v11 — requis pour StylePicker
  roleMap,     // v11 — requis pour filtrer les styles par domaine du rôle
}) {
  const name = prof?.displayName || 'Talent';
  const calculatedTotal = placedPlages.reduce((sum, plageId) => {
    const hourlyRate = Number(
      prof?.pricingByRole?.[slot.roleSystemId]?.hourlyRate ||
      prof?.pricingBase?.hourlyRate
    ) || 80;
    return sum + computePlacementPrice(slot.candidateUserId, plageId, confirmedSlots, schedule, hourlyRate).price;
  }, 0);

  const offeredPrice = priceDraft ?? priceRange.rec;
  const isGratuit    = offeredPrice === 0;
  const diff         = calculatedTotal > 0
    ? Math.round(((offeredPrice - calculatedTotal) / calculatedTotal) * 100)
    : 0;

  // v11 — Domaine du rôle → filtre les styles compatibles
  // roleMap[slot.roleSystemId].domainKey vient de RoleHierarchy via taxonomyCache
  const roleDomainKey = roleMap?.[slot?.roleSystemId]?.domainKey || null;

  // v11 — Source des styles : candidatureStyleSystemIds = styles que le talent a sélectionnés
  // lors de sa candidature (applyToSlot). C'est la liste contractuelle — pas prof.activeStyles
  // qui contient TOUS les styles du profil sans filtre de candidature.
  // slot.candidateStyleSystemIds est populé par confirmedSlots via applyToSlot → Session.slots.
  const candidatureStyles = Array.isArray(slot?.candidateStyleSystemIds)
    ? slot.candidateStyleSystemIds
    : [];

  // v11 — Styles sélectionnés pour ce placement
  const [selectedStyleIds, setSelectedStyleIds] = useState([]);

  const handleStyleToggle = (sid) =>
    setSelectedStyleIds(prev =>
      prev.includes(sid) ? prev.filter(s => s !== sid) : [...prev, sid]
    );

  return (
    <div className="h-full flex flex-col">

      {/* En-tête talent */}
      <div className="p-4 border-b border-purple-800/40">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {prof?.avatarUrl
              ? <img src={prof.avatarUrl} alt={name} className="w-full h-full object-cover" />
              : name[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{name}</p>
            <p className="text-purple-300 text-xs">
              Taux déclaré : {Number(prof?.pricingBase?.hourlyRate || 80)} $/h
            </p>
          </div>
        </div>
        <p className="text-purple-400 text-xs mt-2">
          Prix calculé par le système :{' '}
          <span className="text-white font-semibold">{calculatedTotal} $ CAD</span>
        </p>
      </div>

      {/* Corps scrollable */}
      <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">

        {/* Slider de prix */}
        <div>
          <div className="flex items-end justify-between mb-1">
            <span className="text-purple-300 text-xs uppercase tracking-wider font-semibold">
              Proposition de cachet
            </span>
            {diff !== 0 && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                diff > 0 ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
              }`}>
                {diff > 0 ? '+' : ''}{diff}% vs calculé
              </span>
            )}
          </div>

          <div className="text-center py-3">
            {isGratuit ? (
              <div>
                <p className="text-4xl font-black text-amber-300">Bénévolat</p>
                <p className="text-purple-400 text-xs mt-1">0 $ CAD · gratuit</p>
              </div>
            ) : (
              <div>
                <p className="text-4xl font-black text-white">
                  {offeredPrice} <span className="text-xl text-purple-300">$</span>
                </p>
                <p className="text-purple-400 text-xs mt-1">CAD total pour ce placement</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs text-purple-400">
              <span>0$</span>
              <span className="text-purple-200">Recommandé : {priceRange.rec}$</span>
              <span>{priceRange.max}$</span>
            </div>
            <input
              type="range"
              min={0}
              max={priceRange.max}
              step={5}
              value={offeredPrice}
              onChange={e => setPriceDraft(Number(e.target.value))}
              className="w-full accent-purple-400 cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => setPriceDraft(isGratuit ? priceRange.rec : 0)}
            className={`w-full mt-3 py-2 rounded-lg text-sm font-semibold border transition-all ${
              isGratuit
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 hover:bg-amber-500/30'
                : 'border-purple-600 text-purple-300 hover:border-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
            }`}
          >
            {isGratuit ? '↩ Revenir au prix calculé' : '✦ Proposer bénévolat (0 $)'}
          </button>
        </div>

        {/* Sélection de style parmi ceux proposés à la candidature
             Source : slot.candidateStyleSystemIds — styles sélectionnés par le talent lors de l'apply.
             Pas de filtre domaine supplémentaire : candidatureStyles est déjà filtré par rôle. */}
        {candidatureStyles.length > 0 && (
          <div className="rounded-lg border border-purple-700/40 bg-purple-950/40 p-3">
            <StylePicker
              talentActiveStyles={candidatureStyles}
              styleMap={styleMap}
              roleDomainKey={null}
              selectedStyles={selectedStyleIds}
              onToggle={handleStyleToggle}
            />
          </div>
        )}

        {/* Détail technique taux horaire */}
        {pricingMeta && activePlage && (() => {
          // Taux effectif = prix offert / minutes JOUÉES (workedMin)
          // PAS sur billableMin (durée du bloc partagé) qui donnerait un taux trompeur.
          // Exemple : 80$ pour 45min jouées = 106.67$/h, pas 20$/h (80$/240min×60)
          const effectiveMin = pricingMeta.workedMin ?? pricingMeta.billableMin ?? 0;
          const er = effectiveMin > 0
            ? Math.round((offeredPrice / effectiveMin) * 60 * 100) / 100
            : pricingMeta.hourlyRate;
          const wd = Math.round(pricingMeta.workedMin ?? pricingMeta.billableMin ?? 0);
          return (
            <div className="bg-purple-900/30 rounded-lg p-3 text-xs text-purple-400 space-y-1">
              <p>{er} $/h · {wd} min jouées</p>
              {pricingMeta.requiredMin !== pricingMeta.billableMin && (
                <p>
                  Bloc requis {Math.round(pricingMeta.requiredMin)} min →
                  facturé {Math.round(pricingMeta.billableMin)} min
                </p>
              )}
            </div>
          );
        })()}

        {/* Instruction quand aucune plage sélectionnée */}
        {!activePlage && (
          <p className="text-purple-400 text-xs text-center italic">
            Cliquez une{' '}
            <span className="text-purple-200 font-semibold">ligne de plage</span>{' '}
            dans le plateau pour voir le détail du prix, puis une case pour placer.
          </p>
        )}
      </div>

      {/* Bouton confirmer */}
      {activePlage && (
        <div className="p-4 border-t border-purple-800/40">
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => onConfirmPlacement(offeredPrice, selectedStyleIds)}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
            Confirmer et envoyer la proposition
          </button>
          {selectedStyleIds.length > 0 && (
            <p className="text-purple-400 text-[10px] text-center mt-1.5">
              {selectedStyleIds.length} style{selectedStyleIds.length > 1 ? 's' : ''}{' '}
              sélectionné{selectedStyleIds.length > 1 ? 's' : ''}
            </p>
          )}
          <p className="text-purple-500 text-[10px] text-center mt-1">
            Le talent sera notifié et devra accepter les conditions.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Zone de négociation — Vue talent ─────────────────────────────────────────
function NegotiationPanelTalent({
  placement, organizerName, eventTitle,
  onAccept, onReject, onCounter,
  actionLoading,
  prof,                // v11 — profil du talent courant
  styleMap,            // v11 — requis pour StylePicker
  roleMap,             // v11 — requis pour domaine
  candidatureStyles,   // v11 — styles soumis à la candidature (slot.candidateStyleSystemIds)
}) {
  const [counterPrice, setCounterPrice] = useState(placement?.assignedPrice || 0);
  const [counterNote, setCounterNote] = useState('');
  const [showCounter, setShowCounter] = useState(false);

  // v11 — Styles sélectionnés par le talent avant acceptation
  // placement est la PriceProposal — placement.styleSystemIds = styles proposés par l'organisateur
  // useEffect pour sync : placement arrive async, useState initial serait toujours vide
  const orgProposedStyles = Array.isArray(placement?.styleSystemIds) ? placement.styleSystemIds : [];
  const [selectedStyleIds, setSelectedStyleIds] = useState([]);

  useEffect(() => {
    const styles = Array.isArray(placement?.styleSystemIds) ? placement.styleSystemIds : [];
    setSelectedStyleIds(styles);
  }, [placement?.styleSystemIds?.join(',')]);

  const handleStyleToggle = (sid) =>
    setSelectedStyleIds(prev =>
      prev.includes(sid) ? prev.filter(s => s !== sid) : [...prev, sid]
    );

  const proposed = placement?.assignedPrice ?? 0;
  const calculated = placement?.calculatedPrice ?? proposed;
  const isGratuit = proposed === 0;
  const diff = calculated > 0 ? Math.round(((proposed - calculated) / calculated) * 100) : 0;

  // Domaine du rôle depuis la PriceProposal
  const roleDomainKey = roleMap?.[placement?.roleSystemId]?.domainKey || null;
  // SOURCE CORRECTE : styles soumis à la candidature (pas prof.activeStyles)
  const availableCandidatureStyles = Array.isArray(candidatureStyles) && candidatureStyles.length > 0
    ? candidatureStyles
    : (prof?.activeStyles || []);

  if (!placement) return null;

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* En-tête */}
      <div className="p-4 border-b border-purple-800/40">
        <p className="text-purple-300 text-xs uppercase tracking-wider font-semibold mb-2">Proposition reçue</p>
        <p className="text-white text-sm">
          <span className="font-semibold">{organizerName || 'L\'organisateur'}</span>
          {' '}vous propose pour{' '}
          <span className="text-purple-200 font-semibold">« {eventTitle} »</span>
        </p>
      </div>

      {/* Montant proposé */}
      <div className="p-4 text-center border-b border-purple-800/40">
        {isGratuit ? (
          <div>
            <p className="text-3xl font-black text-amber-300">Bénévolat</p>
            <p className="text-purple-400 text-sm mt-1">0 $ CAD · gratuit</p>
          </div>
        ) : (
          <div>
            <p className="text-3xl font-black text-white">{proposed} <span className="text-lg text-purple-300">$ CAD</span></p>
            {diff !== 0 && (
              <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${diff >= 0 ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                {diff > 0 ? '+' : ''}{diff}% vs tarif calculé ({calculated} $)
              </span>
            )}
          </div>
        )}
      </div>

      {/* v11 — StylePicker talent : uniquement les styles soumis à la candidature */}
      {availableCandidatureStyles.length > 0 && (
        <div className="px-4 py-3 border-b border-purple-800/40">
          <div className="rounded-lg border border-purple-700/40 bg-purple-950/40 p-3">
            {orgProposedStyles.length > 0 && (
              <p className="text-purple-500 text-[10px] mb-2 leading-tight">
                ✦ L'organisateur suggère ces styles — modifiez si besoin avant d'accepter
              </p>
            )}
            <StylePicker
              talentActiveStyles={availableCandidatureStyles}
              styleMap={styleMap}
              roleDomainKey={null}
              selectedStyles={selectedStyleIds}
              onToggle={handleStyleToggle}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        {!showCounter ? (
          <>
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => onAccept(selectedStyleIds)}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Accepter — {isGratuit ? 'bénévolat' : `${proposed} $`}
              {selectedStyleIds.length > 0 && (
                <span className="text-[11px] font-normal opacity-80">
                  · {selectedStyleIds.length} style{selectedStyleIds.length > 1 ? 's' : ''}
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={actionLoading}
              onClick={() => { setCounterPrice(proposed); setShowCounter(true); }}
              className="w-full py-2.5 rounded-xl border border-purple-500 text-purple-200 hover:bg-purple-800/40 text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Contre-proposer un autre prix
            </button>

            <button
              type="button"
              disabled={actionLoading}
              onClick={onReject}
              className="w-full py-2 rounded-xl border border-red-800 text-red-400 hover:bg-red-900/30 text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Refuser
            </button>
          </>
        ) : (
          <>
            <div>
              <label className="text-purple-300 text-xs uppercase tracking-wider font-semibold block mb-2">
                Votre contre-proposition
              </label>
              <div className="text-center py-2">
                <p className="text-3xl font-black text-white">{counterPrice} <span className="text-lg text-purple-300">$</span></p>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(calculated * 2, proposed * 2, 500)}
                step={5}
                value={counterPrice}
                onChange={e => setCounterPrice(Number(e.target.value))}
                className="w-full accent-purple-400 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-purple-500 mt-1">
                <span>0$</span>
                <span>Calculé : {calculated}$</span>
              </div>
            </div>

            <textarea
              placeholder="Message (optionnel) — ex: je suis disponible mais j'ai des frais de déplacement…"
              value={counterNote}
              onChange={e => setCounterNote(e.target.value)}
              rows={2}
              className="w-full text-xs rounded-lg border border-purple-700 bg-purple-900/30 text-purple-100 placeholder-purple-600 px-3 py-2 resize-none focus:outline-none focus:border-purple-400"
            />

            <div className="flex gap-2">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onCounter(counterPrice, counterNote, selectedStyleIds)}
                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-all disabled:opacity-50"
              >
                Envoyer ma contre-offre
              </button>
              <button
                type="button"
                onClick={() => setShowCounter(false)}
                className="px-3 py-2.5 rounded-xl border border-purple-700 text-purple-400 hover:text-purple-200 text-sm transition-all"
              >
                ✕
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function LineupBoard({ session, roleMap, styleMap, profileMap, currentUserId, isOrganizer, onAssign, onUnassign, actionLoading, refreshLobby, toast, setActionLoading }) {
  const [selectedSlotId, setSelectedSlotId]   = useState(null);
  const [priceDraft,     setPriceDraft]        = useState(null);
  const [priceRange,     setPriceRange]        = useState({ min: 0, max: 500, rec: 100 });
  const [activePlage,    setActivePlage]       = useState(null);
  const [pricingMeta,    setPricingMeta]       = useState(null);
  const [pendingScene,   setPendingScene]      = useState(null); // scène cible avant confirmation

  // 6-E — Invitation directe
  const [inviteQuery,    setInviteQuery]       = useState('');
  const [inviteResults,  setInviteResults]     = useState([]);
  const [inviteLoading,  setInviteLoading]     = useState(false);
  const [inviteTargetSlot, setInviteTargetSlot] = useState(null); // slotId cible pour invitation

  // ── Assignation sélectionnée (point d'entrée canonique du pad) ──────────────
  // selectedAssignment = { slotId, sceneId, plageId, sceneLabel, plageLabel,
  //                        candidateUserId, proposalId } | null
  // Piloté UNIQUEMENT par le clic sur un bloc placé dans le plateau.
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [activeProposal,     setActiveProposal]     = useState(null);
  const [proposalLoading,    setProposalLoading]    = useState(false);

  const scenes   = session?.scenes   || [];
  const schedule = session?.schedule || [];
  const slots    = session?.slots    || [];

  // Placements du talent courant — indexés par clé stable (slotId:sceneId:plageId)
  const myPlacementsMap = (() => {
    if (isOrganizer || !currentUserId) return {};
    const snap = session?.moodFilterSnapshot;
    if (!snap?.lineupPlacements) return {};
    const map = {};
    Object.values(snap.lineupPlacements).forEach(p => {
      if (p?.userId === currentUserId && p?.isPlaced) {
        const key = [p.slotId, p.sceneId, p.plageId].filter(Boolean).join(':');
        map[key] = p;
      }
    });
    return map;
  })();

  // ── confirmedSlots — fix candidateUserId stale ────────────────────────────
  // Quand candidates[] est vide (sessions en ancien format DB avant assignLineupSlot v6),
  // le code utilisait slot.candidateUserId = premier talent assigné (stale).
  // → proposePriceToTalent envoyait la proposition au mauvais talent.
  // Fix : lire moodFilterSnapshot.lineupPlacements pour trouver les vrais talents placés.
  const snapPlacements = session?.moodFilterSnapshot?.lineupPlacements || {};

  const confirmedSlots = slots.flatMap(s => {
    // v3c fix — exclure les candidats avec proposalStatus=rejected du plateau.
    // Sans ce filtre, un talent qui a refusé son offre reste dans candidates[]
    // avec status='confirmed' et continue d'apparaître sur le plateau.
    const cands = Array.isArray(s.candidates)
      ? s.candidates.filter(c => c.status === 'confirmed' && c.proposalStatus !== 'rejected')
      : [];

    if (cands.length === 0) {
      // Fix : chercher les vrais talents placés dans le snapshot
      const snapPlacedForSlot = Object.values(snapPlacements).filter(
        p => p?.slotId === s.slotId && p?.isPlaced === true && p?.proposalStatus !== 'rejected'
      );

      if (snapPlacedForSlot.length > 0) {
        console.log('[LineupBoard] confirmedSlots snapshot fallback', {
          slotId: s.slotId, placedUsers: snapPlacedForSlot.map(p => p.userId),
          stale_candidateUserId: s.candidateUserId,
        });
        return snapPlacedForSlot.map(p => {
          const placements = [{ sceneId: p.sceneId, plageId: p.plageId, assignedPrice: p.assignedPrice }].filter(pl => pl.sceneId);
          return { ...s, realSlotId: s.slotId, slotId: `${s.slotId}:${p.userId}`,
            candidateUserId: p.userId, candidateStyleSystemIds: [], placements, isPlaced: true };
        });
      }

      // Fallback legacy ultime
      if (s.status === 'confirmed' && s.candidateUserId) {
        const placements = s.placements?.length > 0 ? s.placements : (s.isPlaced ? [{ sceneId: s.sceneId, plageId: s.plageId }] : []);
        return [{ ...s, realSlotId: s.slotId, slotId: `${s.slotId}:${s.candidateUserId}`,
          candidateUserId: s.candidateUserId, candidateStyleSystemIds: s.candidateStyleSystemIds || [],
          placements, isPlaced: placements.length > 0 }];
      }
      return [];
    }

    return cands.map(c => {
      // Inclure les propositions pending dans le plateau (affichage ⏳)
      const snapEntry = Object.values(snapPlacements).find(
        p => p?.userId === c.userId && p?.slotId === s.slotId
      );
      const placements = c.placements?.length > 0
        ? c.placements
        : c.isPlaced
          ? [{ sceneId: c.sceneId, plageId: c.plageId }]
          : snapEntry?.sceneId
            ? [{ sceneId: snapEntry.sceneId, plageId: snapEntry.plageId, assignedPrice: snapEntry.assignedPrice }]
            : [];
      const isPendingProposal = !!(snapEntry && !snapEntry.isPlaced &&
        ['pending_talent','pending_organizer'].includes(snapEntry.proposalStatus));
      return { ...s, realSlotId: s.slotId, slotId: `${s.slotId}:${c.userId}`,
        candidateUserId: c.userId, candidateStyleSystemIds: c.styleSystemIds || [],
        placements, isPlaced: placements.length > 0, isPendingProposal };
    });
  });

  // Recalcul du prix quand talent sélectionné + plage active
  useEffect(() => {
    if (!selectedSlotId || !activePlage || !isOrganizer) return;
    const slot = confirmedSlots.find(s => s.slotId === selectedSlotId);
    const prof = slot ? profileMap[slot.candidateUserId] : null;
    if (!slot || !prof) return;
    const pricingByRole = prof?.pricingByRole?.[slot.roleSystemId];
    const hourlyRate = Number(pricingByRole?.hourlyRate || prof?.pricingBase?.hourlyRate) || 80;
    const { price: rec, billableMin, requiredMin, allocationRatio, workedMin } = computePlacementPrice(slot.candidateUserId, activePlage, confirmedSlots, schedule, hourlyRate);
    setPriceRange({ min: 0, max: Math.round(rec * 2), rec });
    setPriceDraft(rec);
    setPricingMeta({ billableMin, requiredMin, allocationRatio, workedMin, hourlyRate });
  }, [selectedSlotId, activePlage, isOrganizer]);

  // Recalcul du prix de base quand talent sélectionné (sans plage)
  useEffect(() => {
    if (!selectedSlotId || !isOrganizer) return;
    const slot = confirmedSlots.find(s => s.slotId === selectedSlotId);
    const prof = slot ? profileMap[slot.candidateUserId] : null;
    if (!slot || !prof) return;
    const pricingByRole = prof?.pricingByRole?.[slot.roleSystemId];
    const hourlyRate = Number(pricingByRole?.hourlyRate || prof?.pricingBase?.hourlyRate) || 80;
    const firstPlage = schedule[0];
    if (firstPlage) {
      const { price: rec } = computePlacementPrice(slot.candidateUserId, firstPlage.plageId, confirmedSlots, schedule, hourlyRate);
      setPriceRange({ min: 0, max: Math.round(rec * 2), rec });
      if (priceDraft === null) setPriceDraft(rec);
    }
  }, [selectedSlotId]);

  // ── Charger la PriceProposal liée à une assignation précise ─────────────────
  // loadProposal — charge la PriceProposal depuis la DB.
  // Deux chemins :
  //   1. proposalId fourni → filter({ id: proposalId })
  //   2. proposalId absent → fallback par eventId + talentUserId + slotId
  //      (cas : snapshot pas encore refreshé après proposePriceToTalent,
  //       ou plageId mismatch dans le lookup snapPl)
  //
  // Bug 3 fix : le fallback filtre par plageId pour éviter de charger
  // la mauvaise proposition quand un talent a plusieurs plages sur le même event.
  const loadProposal = async (proposalId, { fallbackEventId, fallbackTalentUserId, fallbackSlotId, fallbackPlageId } = {}) => {
    setProposalLoading(true);
    try {
      if (proposalId) {
        const rows = await base44.entities.PriceProposal.filter({ id: proposalId }).catch(() => []);
        if (rows?.[0]) { setActiveProposal(rows[0]); return; }
      }
      // Fallback : chercher par eventId + talentUserId
      if (fallbackEventId && fallbackTalentUserId) {
        const fallbackRows = await base44.entities.PriceProposal.filter({
          eventId:      fallbackEventId,
          talentUserId: fallbackTalentUserId,
          ...(fallbackSlotId ? { slotId: fallbackSlotId } : {}),
        }).catch(() => []);

        // Bug 3 fix : filtrer par plageId si disponible — évite de charger 300$ quand on clique Warmup
        const filtered = fallbackPlageId
          ? (fallbackRows || []).filter(p => {
              const plages = Array.isArray(p.targetPlageIds) ? p.targetPlageIds : [];
              return plages.includes(fallbackPlageId);
            })
          : (fallbackRows || []);
        const pool = filtered.length > 0 ? filtered : (fallbackRows || []);

        // Priorité : active > accepted > any
        const active = pool.find(p =>
          ['pending_talent','pending_organizer'].includes(p.status)
        ) || pool.find(p =>
          ['accepted'].includes(p.finalStatus || p.status)
        ) || pool[0] || null;
        setActiveProposal(active);
        if (active) console.log('[LineupBoard] loadProposal FALLBACK found', active.id, active.status);
        else console.warn('[LineupBoard] loadProposal: no proposal found', { fallbackEventId, fallbackTalentUserId, fallbackSlotId });
        return;
      }
      setActiveProposal(null);
    } catch (e) {
      console.warn('[LineupBoard] loadProposal failed:', e?.message);
      setActiveProposal(null);
    } finally {
      setProposalLoading(false);
    }
  };

  // Ouvre le pad pour une assignation précise du plateau
  const openAssignmentPad = async ({ slotId, sceneId, sceneLabel, plageId, plageLabel, candidateUserId, proposalId, roleSystemId, candidateStyleSystemIds }) => {
    // Récupérer le prix depuis le snapshot avant le chargement async de la proposition
    const _snap = session?.moodFilterSnapshot?.lineupPlacements || {};
    const _snapPl = Object.values(_snap).find(p =>
      p?.userId === candidateUserId && p?.sceneId === sceneId && p?.plageId === plageId
    ) || Object.values(_snap).find(p =>
      p?.userId === candidateUserId && p?.plageId === plageId
    );
    setSelectedAssignment({ slotId, sceneId, sceneLabel, plageId, plageLabel, candidateUserId, proposalId,
      roleSystemId: roleSystemId || null,
      candidateStyleSystemIds: candidateStyleSystemIds || [],
      _snapshotPrice: _snapPl?.assignedPrice ?? null,
      _snapshotStatus: _snapPl?.proposalStatus ?? null,
    });
    // Fix "Bénévolat" flash : NE PAS effacer activeProposal ici.
    // setActiveProposal(null) avant loadProposal causait un render intermédiaire
    // avec proposal=null → currentOffer=0 → shownPrice=0 → affichage "Bénévolat"
    // pendant les ~200ms du chargement async.
    // loadProposal écrase activeProposal lui-même quand la donnée arrive.
    // Reset placement mode seulement (pas la proposal)
    setSelectedSlotId(null); setActivePlage(null); setPriceDraft(null); setPricingMeta(null); setPendingScene(null);
    // Toujours passer les fallback params — si proposalId est null ou le filter échoue,
    // on charge via eventId+talentUserId+slotId (snapshot potentiellement stale)
    await loadProposal(proposalId, {
      fallbackEventId:      session?.eventId,
      fallbackTalentUserId: candidateUserId,
      fallbackSlotId:       slotId,
      fallbackPlageId:      plageId,
    });
  };

  // Ferme le pad
  const closePad = () => {
    setSelectedAssignment(null);
    setActiveProposal(null);
  };

  // ── Handlers pad de négociation ───────────────────────────────────────────────
  const handlePadAccept = async (styleIds = []) => {
    const proposalId = activeProposal?.id || selectedAssignment?.proposalId;
    if (!proposalId) return;
    try {
      setActionLoading(true);
      await base44.functions.invoke('respondToPriceProposal', {
        proposalId,
        action: 'accept',
        ...(Array.isArray(styleIds) && styleIds.length > 0 ? { styleSystemIds: styleIds } : {}),
      });
      await refreshLobby?.();
      await loadProposal(proposalId);
      toast?.({ title: '✓ Proposition acceptée !' });
    } catch (err) {
      toast?.({ title: 'Erreur', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
    } finally { setActionLoading(false); }
  };

  const handlePadReject = async () => {
    const proposalId = activeProposal?.id || selectedAssignment?.proposalId;
    if (!proposalId) return;
    try {
      setActionLoading(true);
      await base44.functions.invoke('respondToPriceProposal', { proposalId, action: 'reject' });
      await refreshLobby?.();
      await loadProposal(proposalId);
      toast?.({ title: 'Proposition refusée.' });
    } catch (err) {
      toast?.({ title: 'Erreur', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
    } finally { setActionLoading(false); }
  };

  const handlePadCounter = async (price, note, styleIds = []) => {
    const proposalId = activeProposal?.id || selectedAssignment?.proposalId;
    if (!proposalId) return;
    try {
      setActionLoading(true);
      await base44.functions.invoke('respondToPriceProposal', {
        proposalId,
        action: 'counter',
        counterPrice: price,
        counterNote: note || '',
        ...(Array.isArray(styleIds) && styleIds.length > 0 ? { styleSystemIds: styleIds } : {}),
      });
      await refreshLobby?.();
      await loadProposal(proposalId);
      toast?.({ title: '↩ Contre-offre envoyée !' });
    } catch (err) {
      toast?.({ title: 'Erreur', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
    } finally { setActionLoading(false); }
  };

  const getPlacedSlots = (sceneId, plageId) =>
    confirmedSlots.filter(s => {
      const pls = s.placements?.length > 0 ? s.placements : (s.isPlaced ? [{ sceneId: s.sceneId, plageId: s.plageId }] : []);
      return pls.some(p => p.sceneId === sceneId && p.plageId === plageId);
    });

  // Clic sur cellule — stocke scène en attente, confirme si activePlage correspond
  const handleCellClick = (sceneId, plageId) => {
    if (actionLoading || !selectedSlotId || !isOrganizer) return;
    // Active la plage si pas encore active — le bouton "Confirmer" dans le panel fait le placement
    setActivePlage(plageId);
    setPendingScene(sceneId);
  };

  // Confirmation depuis le bouton dans NegotiationPanel
  // v11 — styleIds : styles sélectionnés par l'organisateur pour ce placement
  const handleConfirmPlacement = (finalPrice, styleIds = []) => {
    if (!selectedSlotId || !activePlage || !pendingScene) return;
    onAssign(selectedSlotId, pendingScene, activePlage, finalPrice, styleIds);
    setSelectedSlotId(null); setActivePlage(null); setPriceDraft(null); setPricingMeta(null); setPendingScene(null);
  };

  const selectedSlot = selectedSlotId ? confirmedSlots.find(s => s.slotId === selectedSlotId) : null;
  const selectedProf = selectedSlot ? profileMap[selectedSlot.candidateUserId] : null;
  const selectedPlacedPlages = selectedSlot
    ? (selectedSlot.placements || []).map(p => p.plageId).concat(activePlage ? [activePlage] : [])
    : [];

  // Panneau visible si :
  // – une assignation du plateau est cliquée (tous rôles)
  // – OU l'organisateur a une carte sélectionnée pour placement initial
  const showNegotiationPanel = !!selectedAssignment || (isOrganizer && !!selectedSlotId);
  const showAssignmentPad    = !!selectedAssignment;
  const showPlacementPanel   = !selectedAssignment && isOrganizer && !!selectedSlotId;

  if (!confirmedSlots.length) {
    return (
      <div className="py-12 text-center">
        <LayoutGrid className="w-10 h-10 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Le plateau se déverrouille dès qu&apos;un talent est confirmé.</p>
      </div>
    );
  }
  if (!scenes.length || !schedule.length) {
    return (
      <div className="py-10 text-center text-amber-600 text-sm">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        Aucune scène ou plage configurée — vérifiez la configuration de l&apos;événement.
      </div>
    );
  }

  return (
    <div className="flex gap-4 min-h-0">

      {/* ── Colonne gauche : cartes + plateau ─────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Cartes talent */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <ZapIcon className="w-3.5 h-3.5 text-yellow-400" />
            {isOrganizer ? 'Cartes à placer' : 'Talents confirmés'}
            <span className="text-gray-300 font-normal">({confirmedSlots.length} confirmé{confirmedSlots.length > 1 ? 's' : ''})</span>
          </p>

          {(() => {
            const totalCases = scenes.length * schedule.length;
            const filledCases = new Set(confirmedSlots.flatMap(s => (s.placements || (s.isPlaced ? [{ sceneId: s.sceneId, plageId: s.plageId }] : [])).map(p => `${p.sceneId}:${p.plageId}`))).size;
            if (totalCases > 0 && filledCases >= totalCases) return <p className="text-xs text-green-600 italic mb-2">✓ Toutes les cases du plateau sont remplies</p>;
            if (filledCases > 0) return <p className="text-xs text-gray-400 italic mb-2">{filledCases}/{totalCases} case{totalCases > 1 ? 's' : ''} remplie{totalCases > 1 ? 's' : ''}</p>;
            return null;
          })()}

          <div className="flex flex-wrap gap-2">
            {confirmedSlots.map(slot => {
              const prof = profileMap[slot.candidateUserId];
              const role = roleMap[slot.roleSystemId];
              const name = prof?.displayName || `Talent …${(slot.candidateUserId || '').slice(-4)}`;
              const isSelected = selectedSlotId === slot.slotId;
              const isPlaced = slot.isPlaced;

              // Statut de négociation depuis lineupPlacements
              const snap = session?.moodFilterSnapshot?.lineupPlacements || {};
              const placement = Object.values(snap).find(p => p?.userId === slot.candidateUserId && p?.slotId === (slot.realSlotId || slot.slotId?.split(':')?.[0]));
              const proposalStatus = placement?.proposalStatus;

              return (
                <button key={slot.slotId} type="button" disabled={!isOrganizer}
                  onClick={() => {
                    if (!isOrganizer) return;
                    const next = isSelected ? null : slot.slotId;
                    console.log('[LineupBoard] card clicked', {
                      slotId: slot.slotId, candidateUserId: slot.candidateUserId,
                      candidates: slot.candidates?.length, isPlaced: slot.isPlaced, next,
                    });
                    setSelectedSlotId(next);
                    setActivePlage(null); setPriceDraft(null); setPricingMeta(null); setPendingScene(null);
                  }}
                  className={`relative group rounded-xl border-2 p-3 text-left transition-all w-36
                    ${isSelected
                      ? 'border-purple-400 bg-purple-950 shadow-[0_0_16px_rgba(168,85,247,0.4)] scale-105'
                      : isPlaced
                        ? 'border-green-300 bg-green-50 hover:border-purple-400 cursor-pointer'
                        : 'border-indigo-200 bg-white hover:border-purple-400 hover:shadow-md cursor-pointer'
                    }`}
                >
                  <div className={`w-10 h-10 rounded-full mb-2 overflow-hidden flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br from-indigo-500 to-purple-600 ${isSelected ? 'ring-2 ring-purple-400' : ''}`}>
                    {prof?.avatarUrl ? <img src={prof.avatarUrl} alt={name} className="w-full h-full object-cover" /> : name[0]?.toUpperCase()}
                  </div>
                  <p className={`text-xs font-semibold truncate ${isSelected ? 'text-purple-200' : 'text-gray-800'}`}>{name}</p>
                  <span className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded mt-1 truncate max-w-full ${isSelected ? 'bg-purple-900 text-purple-300' : getRoleBadgeColor(slot.roleSystemId, roleMap)}`}>{role?.nameFr || slot.roleSystemId}</span>

                  {/* Badge placement + négociation */}
                  {isPlaced && !proposalStatus && (
                    <div className="absolute top-1 right-1 bg-green-100 rounded px-1">
                      <span className="text-[9px] text-green-700 font-bold">{(slot.placements?.length || 1)}✓</span>
                    </div>
                  )}
                  {proposalStatus === 'pending_talent' && (
                    <div className="absolute top-1 right-1 bg-amber-100 rounded px-1">
                      <span className="text-[9px] text-amber-700 font-bold">⏳</span>
                    </div>
                  )}
                  {proposalStatus === 'pending_organizer' && (
                    <div className="absolute top-1 right-1 bg-blue-100 rounded px-1">
                      <span className="text-[9px] text-blue-700 font-bold">💬</span>
                    </div>
                  )}
                  {isSelected && <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-400 animate-pulse" />}
                </button>
              );
            })}

            {/* 6-E — Bouton invitation directe (organisateur seulement) */}
            {isOrganizer && (
              <div className="w-36">
                {inviteTargetSlot ? (
                  // Widget de recherche de talent
                  <div className="rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50 p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">Inviter un talent</p>
                    <input
                      type="text"
                      placeholder="Nom ou email…"
                      value={inviteQuery}
                      onChange={async (e) => {
                        const q = e.target.value;
                        setInviteQuery(q);
                        if (q.trim().length < 2) { setInviteResults([]); return; }
                        setInviteLoading(true);
                        try {
                          const profiles = await base44.entities.TalentProfile
                            .filter({ displayName: { $regex: q, $options: 'i' } }, null, 8)
                            .catch(() => []);
                          setInviteResults(profiles || []);
                        } catch { setInviteResults([]); }
                        finally { setInviteLoading(false); }
                      }}
                      className="w-full text-xs px-2 py-1.5 border border-indigo-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    />
                    {inviteLoading && <p className="text-[10px] text-gray-400">Recherche…</p>}
                    {inviteResults.map(p => (
                      <button key={p.userId} type="button"
                        onClick={async () => {
                          try {
                            setActionLoading(true);
                            await base44.functions.invoke('inviteTalentToSlot', {
                              sessionId: session.id,
                              slotId: inviteTargetSlot,
                              talentUserId: p.userId,
                            });
                            toast?.({ title: `✉️ ${p.displayName} invité !`, description: 'Vous pouvez maintenant lui proposer un prix.' });
                            setInviteTargetSlot(null);
                            setInviteQuery('');
                            setInviteResults([]);
                            await refreshLobby?.();
                          } catch (err) {
                            toast?.({ title: 'Erreur', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
                          } finally { setActionLoading(false); }
                        }}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-indigo-100 hover:border-indigo-400 transition-all"
                      >
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold overflow-hidden">
                          {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" /> : (p.displayName?.[0] || '?').toUpperCase()}
                        </div>
                        <span className="text-xs truncate">{p.displayName}</span>
                      </button>
                    ))}
                    <button type="button" onClick={() => { setInviteTargetSlot(null); setInviteQuery(''); setInviteResults([]); }}
                      className="text-[10px] text-gray-400 hover:text-red-400 w-full text-center mt-1">
                      Annuler
                    </button>
                  </div>
                ) : (
                  // Bouton pour ouvrir le widget — choisir d'abord le slot cible
                  <div className="space-y-1">
                    <p className="text-[9px] text-gray-400 text-center">Inviter sur :</p>
                    <select
                      className="w-full text-xs px-2 py-1.5 border border-dashed border-indigo-200 rounded-lg bg-white text-gray-500 cursor-pointer"
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) setInviteTargetSlot(e.target.value); }}
                    >
                      <option value="">+ Inviter un talent</option>
                      {slots.map(s => {
                        const r = roleMap[s.roleSystemId];
                        return <option key={s.slotId} value={s.slotId}>{r?.nameFr || s.roleSystemId}</option>;
                      })}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Plateau */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <LayoutGrid className="w-3.5 h-3.5" />
            Plateau — {scenes.length} scène{scenes.length > 1 ? 's' : ''} × {schedule.length} plage{schedule.length > 1 ? 's' : ''}
            {selectedSlotId && !activePlage && <span className="text-purple-500 font-normal">← Cliquez une case pour choisir la plage</span>}
            {activePlage && !pendingScene && <span className="text-purple-500 font-normal">← Cliquez une case pour confirmer</span>}
          </p>
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full border-collapse min-w-[380px]">
              <thead>
                <tr>
                  <th className="w-24 p-2 text-left"><div className="text-[10px] text-gray-400 font-normal">Plage / Scène</div></th>
                  {scenes.map(scene => (
                    <th key={scene.sceneId} className="p-2 text-center min-w-[100px]">
                      <div className="text-xs font-semibold text-gray-700 flex flex-col items-center gap-0.5">
                        <span className="text-lg">{scene.icon}</span>
                        <span>{scene.label}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map(plage => {
                  const isActivePlage = activePlage === plage.plageId;
                  return (
                    <tr key={plage.plageId} className={isActivePlage ? 'bg-purple-50/60' : 'hover:bg-gray-50/50'}>
                      <td
                        className={`p-2 border-r border-gray-100 ${isOrganizer && selectedSlotId ? 'cursor-pointer' : ''} ${isActivePlage ? 'bg-purple-50 border-purple-200' : ''}`}
                        onClick={() => isOrganizer && selectedSlotId && setActivePlage(isActivePlage ? null : plage.plageId)}
                      >
                        <div className="text-xs font-medium text-gray-700">{plage.label}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{fmtHHMM(plage.timeStart)}→{fmtHHMM(plage.timeEnd)}</div>
                        <div className="text-[9px] text-gray-300">{durationLabel(plage.timeStart, plage.timeEnd)}</div>
                      </td>
                      {scenes.map(scene => {
                        const placedList = getPlacedSlots(scene.sceneId, plage.plageId);
                        const isEmpty = placedList.length === 0;
                        const canDrop = isOrganizer && selectedSlotId && isEmpty;
                        const isPendingHere = isActivePlage && pendingScene === scene.sceneId;
                        return (
                          <td
                            key={scene.sceneId}
                            onClick={() => handleCellClick(scene.sceneId, plage.plageId)}
                            className={`p-1.5 border border-gray-100 transition-all
                              ${canDrop ? 'cursor-pointer bg-purple-100 border-purple-400 shadow-inner' : ''}
                              ${isPendingHere ? 'bg-purple-200 border-purple-500' : ''}
                              ${placedList.length && isOrganizer ? 'cursor-pointer hover:bg-red-50' : ''}`}
                          >
                            {canDrop && !isPendingHere && (
                              <div className="h-4 rounded flex items-center justify-center text-[9px] font-medium mb-1 text-purple-600 bg-purple-50 border border-dashed border-purple-300">
                                + Placer ici
                              </div>
                            )}
                            {isPendingHere && (
                              <div className="h-4 rounded flex items-center justify-center text-[9px] font-medium mb-1 text-purple-800 bg-purple-200 border border-purple-500">
                                ✦ Confirmez →
                              </div>
                            )}
                            <div className={`min-h-[2rem] space-y-1 ${isEmpty && !canDrop && !isPendingHere ? 'flex items-center justify-center' : ''}`}>
                              {isEmpty && !canDrop && !isPendingHere && <span className="text-gray-200 text-xs">—</span>}
                              {placedList.map(placedItem => {
                                const prof = profileMap[placedItem.candidateUserId];
                                const role = roleMap[placedItem.roleSystemId];
                                const name = prof?.displayName || `…${(placedItem.candidateUserId || '').slice(-4)}`;
                                const snap = session?.moodFilterSnapshot?.lineupPlacements || {};
                                // Lookup par userId + sceneId + plageId (plus précis que userId+plageId seul)
                                // Fallback : userId+plageId si la clé sceneId ne matche pas (ancien format)
                                const snapPl = Object.values(snap).find(p =>
                                  p?.userId === placedItem.candidateUserId &&
                                  p?.sceneId === scene.sceneId &&
                                  p?.plageId === plage.plageId
                                ) || Object.values(snap).find(p =>
                                  p?.userId === placedItem.candidateUserId &&
                                  p?.plageId === plage.plageId
                                );
                                const propStatus = snapPl?.proposalStatus;
                                // Permission : organisateur voit tout, talent uniquement sa propre assignation
                                const canOpenPad = isOrganizer || placedItem.candidateUserId === currentUserId;
                                const isThisSelected = selectedAssignment &&
                                  selectedAssignment.sceneId === scene.sceneId &&
                                  selectedAssignment.plageId === plage.plageId &&
                                  selectedAssignment.candidateUserId === placedItem.candidateUserId;
                                return (
                                  <div
                                    key={`${placedItem.slotId}-${placedItem.candidateUserId}`}
                                    onClick={() => {
                                      if (!canOpenPad) return;
                                      if (isThisSelected) { closePad(); return; }
                                      openAssignmentPad({
                                        slotId:                  placedItem.realSlotId || placedItem.slotId?.split(':')?.[0] || placedItem.slotId,
                                        sceneId:                 scene.sceneId,
                                        sceneLabel:              scene.label || scene.sceneId,
                                        plageId:                 plage.plageId,
                                        plageLabel:              plage.label || '',
                                        candidateUserId:         placedItem.candidateUserId,
                                        proposalId:              snapPl?.proposalId || null,
                                        roleSystemId:            placedItem.roleSystemId || null,
                                        candidateStyleSystemIds: placedItem.candidateStyleSystemIds || [],
                                      });
                                      setSelectedSlotId(null); // reset placement mode
                                    }}
                                    className={`rounded p-1 flex items-center justify-between gap-1 border group mb-0.5 last:mb-0 transition-all
                                      ${canOpenPad ? 'cursor-pointer' : ''}
                                      ${isThisSelected
                                        ? 'ring-2 ring-purple-500 bg-purple-50 border-purple-400'
                                        : propStatus === 'pending_talent' ? 'bg-amber-50 border-amber-200 hover:border-amber-400' :
                                          propStatus === 'accepted'       ? 'bg-green-50 border-green-200 hover:border-green-400' :
                                          'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200 hover:border-indigo-400'}`}
                                  >
                                    <div className="flex items-center gap-1 min-w-0">
                                      <div className="w-4 h-4 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                                        {prof?.avatarUrl ? <img src={prof.avatarUrl} alt={name} className="w-full h-full object-cover" /> : <span className="text-white text-[8px] font-bold">{name?.[0]?.toUpperCase() || '?'}</span>}
                                      </div>
                                      <div className="min-w-0">
                                        <p className={`text-[9px] font-semibold truncate ${isThisSelected ? 'text-purple-900' : 'text-indigo-900'}`}>{name}</p>
                                        <span className={`text-[8px] font-medium px-1 rounded ${getRoleBadgeColor(placedItem.roleSystemId, roleMap)}`}>{role?.nameFr || placedItem.roleSystemId}</span>
                                        {propStatus === 'pending_talent'    && <span className="text-[8px] text-amber-600 ml-1">⏳</span>}
                                        {propStatus === 'pending_organizer' && <span className="text-[8px] text-blue-600 ml-1">💬</span>}
                                        {propStatus === 'accepted'          && <span className="text-[8px] text-green-600 ml-1">✓</span>}
                                      </div>
                                    </div>
                                    {isOrganizer && (
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); onUnassign(placedItem.realSlotId || placedItem.slotId?.split(':')?.[0] || placedItem.slotId, placedItem.candidateUserId, scene.sceneId, plage.plageId); }}
                                        className="w-4 h-4 rounded-full flex items-center justify-center text-red-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 flex-shrink-0"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Colonne droite : pad de négociation ────────────────────────────── */}
      <div className={`w-72 flex-shrink-0 rounded-2xl border overflow-hidden transition-all duration-300
        ${showNegotiationPanel
          ? 'border-purple-700 bg-gradient-to-b from-[#1e1030] to-[#150d25] shadow-[0_0_32px_rgba(168,85,247,0.25)]'
          : 'border-dashed border-gray-200 bg-gray-50'
        }`}
      >
        {!showNegotiationPanel ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <DollarSign className="w-8 h-8 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm font-medium">Négociation du cachet</p>
            <p className="text-gray-300 text-xs mt-1">
              {isOrganizer
                ? 'Cliquez sur une assignation dans le plateau pour voir la négociation'
                : 'Cliquez sur votre assignation dans le plateau'}
            </p>
          </div>

        ) : showAssignmentPad ? (
          /* ── Pad d'assignation — déclenché par clic sur le plateau ── */
          <div className="h-full flex flex-col overflow-y-auto">
            <div className="px-4 py-2 flex items-center justify-between border-b border-purple-800/40 flex-shrink-0">
              <span className="text-[10px] text-purple-400 uppercase tracking-wider font-semibold">
                Assignation · {selectedAssignment?.sceneLabel} · {selectedAssignment?.plageLabel}
              </span>
              <button type="button" onClick={closePad} className="text-purple-500 hover:text-purple-300 text-lg leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AssignmentNegotiationPad
                assignment={selectedAssignment}
                proposal={activeProposal}
                prof={profileMap[selectedAssignment?.candidateUserId]}
                eventTitle={session?.title || 'cet événement'}
                isOrganizer={isOrganizer}
                loading={proposalLoading}
                onAccept={handlePadAccept}
                onReject={handlePadReject}
                onCounter={handlePadCounter}
                actionLoading={actionLoading}
                profileMap={profileMap}
                styleMap={styleMap}
                roleMap={roleMap}
              />
            </div>
            {/* Bouton placement additionnel — organisateur uniquement */}
            {isOrganizer && (
              <div className="p-3 border-t border-purple-800/40 flex-shrink-0">
                <button type="button"
                  onClick={() => {
                    closePad();
                    setSelectedSlotId(selectedAssignment?.slotId ? `${selectedAssignment.slotId}:${selectedAssignment.candidateUserId}` : null);
                  }}
                  className="w-full py-2 rounded-lg border border-purple-700 text-purple-400 hover:text-purple-200 hover:border-purple-500 text-xs font-medium transition-colors"
                >
                  + Envoyer une nouvelle proposition
                </button>
              </div>
            )}
          </div>

        ) : showPlacementPanel && isOrganizer ? (
          /* ── Panel placement — déclenché par clic sur une carte talent non encore placée ── */
          <NegotiationPanelOrganizer
            slot={selectedSlot}
            prof={selectedProf}
            placedPlages={selectedPlacedPlages}
            schedule={schedule}
            confirmedSlots={confirmedSlots}
            priceDraft={priceDraft}
            setPriceDraft={setPriceDraft}
            priceRange={priceRange}
            setPriceRange={setPriceRange}
            pricingMeta={pricingMeta}
            activePlage={activePlage}
            onConfirmPlacement={handleConfirmPlacement}
            actionLoading={actionLoading}
            profileMap={profileMap}
            styleMap={styleMap}
            roleMap={roleMap}
          />

        ) : !isOrganizer ? (
          <NegotiationPanelTalent
            placement={activeProposal || Object.values(myPlacementsMap)[0]}
            organizerName={null}
            eventTitle={session?.title || 'cet événement'}
            prof={profileMap[currentUserId]}
            styleMap={styleMap}
            roleMap={roleMap}
            candidatureStyles={(() => {
              // Styles soumis à la candidature pour ce talent — sur le bon slot
              // Si activeProposal a un slotId, l'utiliser pour trouver le bon slot
              // (cas multi-slot : DJ + Humoriste — on veut le slot de la proposition)
              const proposalSlotId = activeProposal?.slotId;
              const matchingSlot = proposalSlotId
                ? confirmedSlots.find(s =>
                    s.candidateUserId === currentUserId &&
                    (s.slotId === proposalSlotId || s.slotId?.split(':')?.[0] === proposalSlotId)
                  )
                : confirmedSlots.find(s => s.candidateUserId === currentUserId);
              return matchingSlot?.candidateStyleSystemIds || [];
            })()}
            onAccept={async (styleIds = []) => {
              const _proposalId = activeProposal?.id || Object.values(myPlacementsMap)[0]?.proposalId;
              if (!_proposalId) return;
              try {
                setActionLoading(true);
                await base44.functions.invoke('respondToPriceProposal', {
                  proposalId: _proposalId,
                  action: 'accept',
                  ...(Array.isArray(styleIds) && styleIds.length > 0 ? { styleSystemIds: styleIds } : {}),
                });
                await refreshLobby?.();
                toast?.({ title: '✓ Proposition acceptée !' });
              } catch (err) {
                toast?.({ title: 'Erreur', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
              } finally { setActionLoading(false); }
            }}
            onReject={async () => {
              const _proposalId = activeProposal?.id || Object.values(myPlacementsMap)[0]?.proposalId;
              if (!_proposalId) return;
              try {
                setActionLoading(true);
                await base44.functions.invoke('respondToPriceProposal', {
                  proposalId: _proposalId,
                  action: 'reject',
                });
                await refreshLobby?.();
                toast?.({ title: 'Proposition refusée.' });
              } catch (err) {
                toast?.({ title: 'Erreur', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
              } finally { setActionLoading(false); }
            }}
            onCounter={async (price, note, styleIds = []) => {
              const _proposalId = activeProposal?.id || Object.values(myPlacementsMap)[0]?.proposalId;
              if (!_proposalId) return;
              try {
                setActionLoading(true);
                await base44.functions.invoke('respondToPriceProposal', {
                  proposalId: _proposalId,
                  action: 'counter',
                  counterPrice: price,
                  counterNote: note || '',
                  ...(Array.isArray(styleIds) && styleIds.length > 0 ? { styleSystemIds: styleIds } : {}),
                });
                await refreshLobby?.();
                toast?.({ title: '↩ Contre-proposition envoyée !' });
              } catch (err) {
                toast?.({ title: 'Erreur', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
              } finally { setActionLoading(false); }
            }}
            actionLoading={actionLoading}
          />
        ) : null}



      </div>

    </div>
  );
}