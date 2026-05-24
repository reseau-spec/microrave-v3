/**
 * ContractView.jsx — Onglet Contrat de l'EventLobby
 *
 * Affiche le contrat de service complet entre l'organisateur et chaque talent :
 *   - Identité des parties (organisateur, talents)
 *   - Détail des prestations par talent (plage, scène, durée, prix)
 *   - Commission Micro Rave par talent (tier, taux SOTS, montant retenu, net talent)
 *   - Récapitulatif financier global
 *   - Statut de chaque contrat individuel (accepted / pending / rejected)
 *   - Clause de libération des fonds et conditions d'annulation
 *
 * Sources de données :
 *   session.slots[].candidates[].placements[] → prix et plages
 *   session.moodFilterSnapshot.lineupPlacements → proposalStatus, effectiveCommissionRate
 *   PriceProposal (via base44.entities) → rounds, commissionTier, effectiveCommissionRate
 *   event.escrowAmount, event.balancePaid → fonds collectés
 *   profileMap → identité des talents
 *   roleMap → libellés de rôles
 *
 * Règles d'affichage :
 *   - Organisateur : voit tout (prix, commissions, nets)
 *   - Talent : voit uniquement son propre contrat
 *   - Audience : vue réduite (programme sans prix)
 */

import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  FileText, CheckCircle2, Clock, XCircle, AlertTriangle,
  TrendingDown, Percent, User, Calendar, MapPin, Shield,
  ChevronDown, ChevronUp, Award, Banknote, Receipt, Info,
  Wallet, CheckCheck, ExternalLink, CreditCard
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n, digits = 2) {
  return Number(n || 0).toFixed(digits);
}
function fmtHHMM(iso) {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d)) return '--:--';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function durationLabel(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const min = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
  if (min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? `${m}` : ''}` : `${m}min`;
}

// ── computeCommissionPreview ──────────────────────────────────────────────────
// Réplique exactement buildCommissionSnapshot (respondToPriceProposal v10 backend).
// UI_snapshot === DB_snapshot — ce qui est affiché = ce qui sera figé à l'acceptation.
//
// ⚠️ SYNCHRONISATION OBLIGATOIRE — Grille SOTS identique à :
//   respondToPriceProposal/entry.ts → sotsModulationFactor()
//   generatePayoutSplits/entry.ts   → sotsModulation() [fallback]
//   LineupBoard.jsx                 → sotsModulationFactor()
//
// Grille v10 :
//   score ≥ 4.5  → ×0.90 | score ≥ 4.0 → ×0.95 | score ≥ 3.5 → ×1.00
//   score >  3.0 → ×1.05 | score ≤ 2.0 → ×1.20 | score ≤ 2.5 → ×1.15
//   score ≤ 3.0  → ×1.10 | score = 0   → ×1.00
const CV_COMMISSION_RATES_FALLBACK = { A: 0.120, B: 0.090, C: 0.060, D: 0.035, E: 0.050 };
const CV_TIER_LABELS = { A: 'Freemium', B: 'Base', C: 'Pro', D: 'Studio', E: 'Fondateur' };

function cvSotsModulationFactor(score) {
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

function useCommissionPreview(talentUserId, profileMap) {
  const [preview, setPreview] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!talentUserId) { setPreview(null); return; }
    setLoading(true);
    setPreview(null);

    const profile = profileMap?.[talentUserId] || null;

    base44.entities.UserMembership
      .filter({ userId: talentUserId, status: 'active' })
      .catch(() => [])
      .then(async (memberships) => {
        const tier = memberships?.[0]?.tier || 'A';
        let baseRate = CV_COMMISSION_RATES_FALLBACK[tier] ?? 0.120;
        try {
          const plans = await base44.entities.MembershipPlan.filter({ tier }).catch(() => []);
          const now = new Date().toISOString();
          const active = (plans || [])
            .filter(p => p.activeFrom <= now && (!p.activeTo || p.activeTo > now) && !p.isLegacy)
            .sort((a, b) => a.commissionRate - b.commissionRate);
          if (active[0]?.commissionRate != null) baseRate = Number(active[0].commissionRate);
        } catch { /* fallback */ }

        const sotsScore    = Number(profile?.sotsRecent30Score || profile?.sotsGlobalScore || 0);
        const modulation   = cvSotsModulationFactor(sotsScore);
        const effectiveRate = Math.round(baseRate * modulation * 10000) / 10000;

        setPreview({
          commissionTier:          tier,
          commissionBaseRate:      baseRate,
          sotsScore,
          sotsModulation:          modulation,
          effectiveCommissionRate: effectiveRate,
          isReady:                 true,
        });
      })
      .catch(() => {
        const tier = 'A';
        const sotsScore = Number(profile?.sotsRecent30Score || 0);
        const modulation = cvSotsModulationFactor(sotsScore);
        setPreview({
          commissionTier: tier, commissionBaseRate: 0.120,
          sotsScore, sotsModulation: modulation,
          effectiveCommissionRate: Math.round(0.120 * modulation * 10000) / 10000,
          isReady: true,
        });
      })
      .finally(() => setLoading(false));
  }, [talentUserId]);

  return { preview, loading };
}

// ── Statut du contrat d'un talent ────────────────────────────────────────────
function ContractStatusBadge({ status }) {
  const config = {
    accepted:         { label: 'Signé',          icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pending_talent:   { label: 'En attente',      icon: Clock,        cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    pending_organizer:{ label: 'En négociation',  icon: Clock,        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    rejected:         { label: 'Refusé',          icon: XCircle,      cls: 'bg-red-50 text-red-700 border-red-200' },
    none:             { label: 'Non contractualisé', icon: AlertTriangle, cls: 'bg-gray-50 text-gray-500 border-gray-200' },
  };
  const { label, icon: Icon, cls } = config[status] || config.none;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cls}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// ── Section : un talent, ses plages, sa commission ───────────────────────────
function TalentContractCard({
  talent, placements, proposal, schedule, scenes,
  isOrganizer, isOwnContract, roleMap, profileMap,
  escrowAmount, balancePaid,
  styleSystemIds,  // v11 — styles contractualisés (figés à l'acceptation)
  styleMap,        // v11 — requis pour résoudre les displayName
}) {
  const canExpand = isOrganizer || isOwnContract;
  const [expanded, setExpanded] = useState((isOwnContract || isOrganizer) ? false : false);

  const prof        = profileMap?.[talent.userId];
  const displayName = prof?.displayName || `Talent …${talent.userId.slice(-4)}`;
  const roleName    = roleMap?.[talent.roleSystemId]?.nameFr || talent.roleSystemId;
  const avatarUrl   = prof?.avatarUrl;

  const totalPrice  = placements.reduce((s, p) => s + (Number(p.assignedPrice) || 0), 0);

  const contractStatus = proposal?.finalStatus || proposal?.status || 'none';
  const canSeeFinancials = isOrganizer || isOwnContract;

  // ── Source de vérité commission ───────────────────────────────────────────
  // RÈGLE : UI_snapshot === DB_snapshot à tout moment.
  //
  // CAS 1 — Contrat accepté (commissionSnapshotAt != null) :
  //   Lire le snapshot T1 figé dans PriceProposal.
  //   Ces valeurs sont IMMUABLES. C'est ce qui est dans LineupPlacement.
  //
  // CAS 2 — Contrat en attente / non signé (commissionSnapshotAt == null) :
  //   Calculer en live avec useCommissionPreview — même logique que buildCommissionSnapshot
  //   backend. Ce que le talent voit = ce qui SERA figé s'il accepte maintenant.
  //
  // CAS 3 — Ancien contrat accepté sans snapshot (migration antérieure à v10) :
  //   effectiveCommissionRate peut être non null mais commissionTier absent.
  //   Fallback : afficher le taux effectif, tier déduit.

  const hasSnapshot   = !!proposal?.commissionSnapshotAt;
  const isAccepted    = contractStatus === 'accepted';

  // Preview live — chargé uniquement si le snapshot T1 est absent
  const { preview: livePreview, loading: liveLoading } = useCommissionPreview(
    (!hasSnapshot && canSeeFinancials) ? talent.userId : null,
    profileMap
  );

  // Résolution finale des valeurs affichées
  const commRate     = hasSnapshot
    ? Number(proposal.effectiveCommissionRate)
    : (livePreview?.effectiveCommissionRate ?? null);

  const commTier     = hasSnapshot
    ? (proposal.commissionTier || null)
    : (livePreview?.commissionTier || null);

  const baseRate     = hasSnapshot
    ? (proposal.commissionBaseRate != null ? Number(proposal.commissionBaseRate) : null)
    : (livePreview?.commissionBaseRate ?? null);

  const sotsScore    = hasSnapshot
    ? Number(proposal.sotsScoreAtAcceptance ?? 0)
    : (livePreview?.sotsScore ?? 0);

  const sotsModulation = hasSnapshot
    ? Number(proposal.sotsModulationFactor ?? 1.0)
    : (livePreview?.sotsModulation ?? 1.0);

  const commAmount   = commRate != null ? Math.round(totalPrice * commRate * 100) / 100 : null;
  const netAmount    = commAmount != null ? Math.round((totalPrice - commAmount) * 100) / 100 : null;

  const commIsLoading = !hasSnapshot && canSeeFinancials && liveLoading;
  const commIsReady   = commRate != null;

  return (
    <div className={`rounded-2xl border transition-all ${
      contractStatus === 'accepted'
        ? 'border-emerald-200 bg-gradient-to-br from-white to-emerald-50/30'
        : contractStatus === 'rejected'
        ? 'border-red-100 bg-red-50/20'
        : 'border-gray-200 bg-white'
    }`}>
      {/* ── Header talent ── */}
      <button
        type="button"
        onClick={() => canExpand && setExpanded(v => !v)}
        disabled={!canExpand}
        className={`w-full flex items-center gap-4 p-4 text-left ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
          {avatarUrl
            ? <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            : <span className="text-white text-sm font-bold">{displayName[0]?.toUpperCase()}</span>
          }
        </div>

        {/* Identité + rôle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
              {roleName}
            </span>
            <ContractStatusBadge status={contractStatus} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {placements.length} plage{placements.length > 1 ? 's' : ''}
            {canSeeFinancials && ` · ${fmt(totalPrice)} $ CAD`}
          </p>
        </div>

        {/* Prix brut total — organisateur voit le coût, talent voit son net */}
        {canSeeFinancials && (
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-400">{isOrganizer ? 'Cachet total' : 'Votre net'}</p>
            {isOrganizer ? (
              <p className="font-bold text-gray-900 text-base">{fmt(totalPrice)} $</p>
            ) : commIsLoading ? (
              <div className="w-4 h-4 border border-gray-300 border-t-transparent rounded-full animate-spin ml-auto mt-1" />
            ) : netAmount != null ? (
              <p className="font-bold text-gray-900 text-base">{fmt(netAmount)} $</p>
            ) : (
              <p className="font-bold text-gray-400 text-base">—</p>
            )}
          </div>
        )}

        {canExpand
          ? <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`} />
          : <Shield className="w-4 h-4 text-gray-300 flex-shrink-0" title="Contrat confidentiel" />
        }
      </button>

      {/* ── Détail expandable ── */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">

          {/* Plages */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Prestations</p>
            {placements.map((p, i) => {
              const plage   = schedule.find(s => s.plageId === p.plageId);
              const scene   = scenes.find(s => s.sceneId === p.sceneId);
              return (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-gray-800">
                      {plage?.label || p.plageId}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {scene?.label || p.sceneId}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {fmtHHMM(plage?.timeStart)} – {fmtHHMM(plage?.timeEnd)}
                      {' · '}{durationLabel(plage?.timeStart, plage?.timeEnd)}
                    </p>
                  </div>
                  {canSeeFinancials && (
                    <p className="font-semibold text-gray-900 text-sm">{fmt(p.assignedPrice)} $</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Commission — visible par le talent pour son propre contrat uniquement */}
          {isOwnContract && totalPrice > 0 && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5" />
                Votre ventilation de cachet
              </p>

              {/* Badge source : figé (snapshot T1) ou calculé en live */}
              <div className="flex items-center gap-2">
                {hasSnapshot ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" />
                    Taux contractuel figé
                  </span>
                ) : commIsLoading ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                    <div className="w-2.5 h-2.5 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                    Calcul en cours…
                  </span>
                ) : commIsReady ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock className="w-3 h-3" />
                    Sera figé à l'acceptation
                  </span>
                ) : null}
              </div>

              {/* Détail du taux */}
              {commIsLoading ? (
                <div className="py-3 text-center text-xs text-slate-400">Chargement du taux…</div>
              ) : commIsReady ? (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <span className="text-slate-500">Tier abonnement</span>
                    <span className="font-medium text-slate-800">
                      {commTier ? `${CV_TIER_LABELS[commTier] || commTier} (${commTier})` : '—'}
                    </span>
                    {baseRate != null && (
                      <>
                        <span className="text-slate-500">Taux de base</span>
                        <span className="font-medium text-slate-800">{fmt(baseRate * 100, 1)} %</span>
                      </>
                    )}
                    {(sotsScore > 0 || sotsModulation !== 1.0) && (
                      <>
                        <span className="text-slate-500">Score SOTS</span>
                        <span className="font-medium text-slate-800">
                          {sotsScore > 0 ? `${fmt(sotsScore, 2)} / 5` : '—'}
                          <span className={`ml-1.5 font-semibold ${
                            sotsModulation < 1 ? 'text-emerald-600' :
                            sotsModulation > 1 ? 'text-amber-600' :
                            'text-slate-400'
                          }`}>
                            {sotsModulation < 1
                              ? `−${fmt((1 - sotsModulation) * 100, 0)} % (bonus)`
                              : sotsModulation > 1
                              ? `+${fmt((sotsModulation - 1) * 100, 0)} % (malus)`
                              : '±0 %'}
                          </span>
                        </span>
                      </>
                    )}
                    <span className="text-slate-500 font-semibold">Taux effectif</span>
                    <span className="font-bold text-slate-900">{fmt(commRate * 100, 2)} %</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 mt-1 grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-1.5 rounded-lg bg-white border border-slate-200">
                      <p className="text-slate-400 mb-0.5">Cachet brut</p>
                      <p className="font-bold text-slate-800">{fmt(totalPrice)} $</p>
                    </div>
                    <div className="text-center p-1.5 rounded-lg bg-white border border-slate-200">
                      <p className="text-slate-400 mb-0.5">Commission</p>
                      <p className="font-bold text-amber-700">{fmt(commAmount)} $</p>
                    </div>
                    <div className="text-center p-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-emerald-600 mb-0.5">
                        {hasSnapshot ? 'Net figé' : 'Net estimé'}
                      </p>
                      <p className="font-bold text-emerald-800">{fmt(netAmount)} $</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 py-2">Taux non disponible</p>
              )}
            </div>
          )}

          {/* Net talent en gros — version condensée pour le talent (complément visuel) */}
          {isOwnContract && !isOrganizer && totalPrice > 0 && commIsReady && netAmount != null && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between">
              <p className="text-xs text-emerald-600 font-medium">
                {hasSnapshot ? 'Votre cachet net à recevoir' : 'Votre cachet net estimé'}
              </p>
              <p className="text-2xl font-bold text-emerald-800">{fmt(netAmount)} $</p>
            </div>
          )}

          {/* Historique de négociation
              CONFIDENTIEL — visible uniquement par l'organisateur et le talent concerné.
              Un talent ne peut pas voir l'historique de négociation d'un autre talent. */}
          {(isOrganizer || isOwnContract) && proposal?.rounds && proposal.rounds.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Historique de négociation</p>
              {proposal.rounds.map((r, i) => {
                const roundStyles = Array.isArray(r.styleSystemIds)
                  ? r.styleSystemIds.map(sid => styleMap?.[sid]).filter(Boolean)
                  : [];
                return (
                  <div key={i} className="flex flex-col gap-1 text-xs text-gray-600 py-1.5 px-2 rounded-lg bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${r.proposedBy === 'organizer' ? 'text-indigo-700' : 'text-purple-700'}`}>
                        {r.proposedBy === 'organizer' ? 'Organisateur' : 'Talent'}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="font-semibold">{fmt(r.price)} $</span>
                      <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                        r.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        r.status === 'countered' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {r.status === 'accepted' ? 'Accepté' :
                         r.status === 'rejected' ? 'Refusé' :
                         r.status === 'countered' ? 'Contre-offre' : 'En attente'}
                      </span>
                    </div>
                    {roundStyles.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-1">
                        {roundStyles.map(style => (
                          <span key={style.systemId}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600 border border-purple-100">
                            {style.displayName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* v11 — Styles contractualisés — visibles organisateur ET talent concerné */}
          {(isOrganizer || isOwnContract) && (() => {
            const styles = Array.isArray(styleSystemIds)
              ? styleSystemIds.map(sid => styleMap?.[sid]).filter(Boolean)
              : [];
            if (!styles.length) return null;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Styles contractualisés
                  </p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                    Figé · contrat
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {styles.map(style => (
                    <span key={style.systemId}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {style.displayName}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function ContractView({
  session, event, roleMap, styleMap, profileMap,
  currentUserId, isOrganizer,
}) {
  const [proposals, setProposals]         = useState([]);
  const [loadingProps, setLoadingProps]   = useState(true);
  const [venueName, setVenueName]         = useState('');
  const [paymentRequests, setPaymentRequests] = useState([]);
  const [payerProfile, setPayerProfile]   = useState(null); // TalentProfile ou null

  const slots    = session?.slots    || [];
  const snap     = session?.moodFilterSnapshot || {};
  const schedule = session?.schedule || snap.lineupSchedule || [];
  const scenes   = session?.scenes   || snap.lineupScenes   || [];

  // ── Chargement centralisé ──────────────────────────────────────────────────
  // Charge en parallèle :
  //   1. PriceProposal  — historique de négociation de chaque talent
  //   2. Checkpoint     — nom du lieu (systemId → name)
  //   3. EventPaymentRequest — historique des paiements (dépôt + balance)
  //   4. TalentProfile du payeur — si event.payerUserId est distinct de l'organisateur
  //
  // Le payeur peut être :
  //   A. L'organisateur lui-même     → payerUserId == organizerId ou null
  //   B. Un membre de la plateforme  → payerUserId distinct, a un TalentProfile
  //   C. Un tiers externe            → payerUserId null, payerEmail renseigné
  useEffect(() => {
    if (!event?.id) return;
    setLoadingProps(true);

    const checkpointId  = event.checkpointId;
    const payerUserId   = event.payerUserId;
    const organizerId   = event.organizerId || event.organizerUserId;
    const payerIsExternal = !payerUserId;
    const payerIsOrganizer = payerUserId && payerUserId === organizerId;
    const payerIsMember   = payerUserId && !payerIsOrganizer;

    Promise.all([
      // 1. Propositions
      base44.entities.PriceProposal
        .filter({ eventId: event.id }).catch(() => []),
      // 2. Checkpoint
      checkpointId
        ? base44.entities.Checkpoint.filter({ systemId: checkpointId }).catch(() => [])
        : Promise.resolve([]),
      // 3. Historique paiements
      base44.entities.EventPaymentRequest
        .filter({ eventId: event.id }).catch(() => []),
      // 4. Profil payeur (seulement si membre distinct de l'organisateur)
      payerIsMember
        ? base44.entities.TalentProfile.filter({ userId: payerUserId }).catch(() => [])
        : Promise.resolve([]),
    ]).then(([props, checkpoints, eprs, payerProfiles]) => {
      setProposals(props || []);
      setVenueName(checkpoints?.[0]?.name || '');
      // Trier EPR par createdAt desc — dépôt puis balance
      const sorted = (eprs || []).sort((a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
      setPaymentRequests(sorted);
      setPayerProfile(payerProfiles?.[0] || null);
    }).catch(() => {}).finally(() => setLoadingProps(false));
  }, [event?.id]);

  // Construire la liste des talents avec leurs placements
  const talentContracts = [];
  const seen = new Set();

  for (const slot of slots) {
    for (const candidate of (slot.candidates || [])) {
      if (candidate.status !== 'confirmed') continue;
      const uid = candidate.userId;
      if (seen.has(uid)) continue;
      seen.add(uid);

      const allPlacements = slots.flatMap(s =>
        (s.candidates || [])
          .filter(c => c.userId === uid)
          .flatMap(c => (c.placements || []).map(p => ({ ...p, roleSystemId: s.roleSystemId })))
      ).filter(p => p.sceneId && p.plageId);

      const talentProposals = proposals
        .filter(p => p.talentUserId === uid && p.eventId === event?.id)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      const activeProposal = talentProposals.find(p =>
        ['accepted', 'pending_talent', 'pending_organizer'].includes(p.status || p.finalStatus)
      ) || talentProposals[0] || null;

      // effectiveCommissionRate : snapshot T1 figé (si accepté) ou null (chargé en live dans TalentContractCard)
      // NE PAS fallback sur 0.12 — ça injecte un taux faux avant que le taux réel soit connu.
      const snapPl = Object.values(snap.lineupPlacements || {}).find(p => p?.userId === uid);
      const snapshotRate = snapPl?.effectiveCommissionRate ?? activeProposal?.effectiveCommissionRate ?? null;

      talentContracts.push({
        userId:                uid,
        roleSystemId:          slot.roleSystemId,
        placements:            allPlacements,
        proposal:              activeProposal,
        effectiveCommissionRate: snapshotRate,
        // v11 — styles contractualisés (figés à l'acceptation dans PriceProposal)
        styleSystemIds:        Array.isArray(activeProposal?.styleSystemIds)
          ? activeProposal.styleSystemIds
          : [],
      });
    }
  }

  // Totaux globaux — basés uniquement sur les taux connus (snapshot T1 figé)
  // Les talents sans snapshot sont exclus du total commission (taux non encore certifié).
  const totalBrut     = talentContracts.reduce((s, t) =>
    s + t.placements.reduce((ps, p) => ps + (Number(p.assignedPrice) || 0), 0), 0);
  const totalComm     = talentContracts.reduce((t, tc) => {
    const rate = tc.effectiveCommissionRate;
    if (rate == null) return t; // taux non certifié → ne pas inclure dans le total
    const price = tc.placements.reduce((s, p) => s + (Number(p.assignedPrice) || 0), 0);
    return t + Math.round(price * rate * 100) / 100;
  }, 0);
  const totalNet      = Math.round((totalBrut - totalComm) * 100) / 100;

  // totalCollecteNet = total net perçu par MR (sans frais Stripe du payeur).
  // Source : EPR approuvés → netAmount (v5+) ou reconstruction depuis requestedAmount (historique).
  // NE PAS utiliser escrowAmount + balancePaid : ces champs stockent le BRUT payé par le payeur
  // (incluant les frais Stripe). Les comparer au budget contractuel (net) donne 103.61$ vs 100$
  // → confusion : le contrat semble sur-encaissé alors que MR a reçu exactement 100$ net.
  const STRIPE_RATE_C  = 0.029;
  const STRIPE_FIXED_C = 0.30;
  const totalCollecteNet = Math.round(
    (paymentRequests || [])
      .filter(r => r.requestStatus === 'approved')
      .reduce((sum, r) => {
        if (r.netAmount) return sum + Number(r.netAmount);
        // Fallback historique : inverser la formule Stripe
        const brut = Number(r.requestedAmount) || 0;
        const net  = brut > 0
          ? Math.max(0, Math.round(((brut * (1 - STRIPE_RATE_C)) - STRIPE_FIXED_C) * 100) / 100)
          : 0;
        return sum + net;
      }, 0) * 100
  ) / 100;

  // totalCollecte brut = ce que le payeur a réellement versé (affiché dans historique paiements)
  const totalCollecteBrut = Math.round(
    (paymentRequests || [])
      .filter(r => r.requestStatus === 'approved')
      .reduce((sum, r) => sum + (Number(r.requestedAmount) || 0), 0) * 100
  ) / 100;

  const remaining = Math.round((totalBrut - totalCollecteNet) * 100) / 100;

  const allSigned     = talentContracts.length > 0 &&
    talentContracts.every(t => (t.proposal?.finalStatus || t.proposal?.status) === 'accepted');

  const eventDate = event?.dateStart
    ? new Date(event.dateStart).toLocaleDateString('fr-CA', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
    : '—';

  // ── Identité et historique du payeur ─────────────────────────────────────
  // Trois cas architecturaux :
  //   A. payerUserId == organizerId (ou payerUserId null) → organisateur paie lui-même
  //   B. payerUserId distinct + TalentProfile trouvé     → membre plateforme délégué
  //   C. payerUserId null + payerEmail renseigné         → tiers externe (no-account)
  //
  // Les EPR sont triés par createdAt asc pour afficher dépôt puis balance.
  const payerUserId   = event?.payerUserId || null;
  const payerEmail    = event?.payerEmail  || null;
  const organizerId   = event?.organizerId || event?.organizerUserId;
  const payerIsOrganizer = !payerUserId || payerUserId === organizerId;
  const payerIsMember    = payerUserId && !payerIsOrganizer;
  const payerIsExternal  = !payerUserId && !!payerEmail;

  // Nom du payeur DÉSIGNÉ — qui a reçu le lien de paiement
  // Ce n'est PAS nécessairement qui a payé. C'est qui l'organisateur a désigné.
  const designatedPayerName =
    payerIsOrganizer
      ? (profileMap?.[organizerId]?.displayName || `…${(organizerId||'').slice(-6)}`)
      : payerIsMember
        ? (payerProfile?.displayName || profileMap?.[payerUserId]?.displayName || `…${payerUserId?.slice(-6)}`)
        : (payerEmail?.split('@')[0] || 'Tiers externe');

  const payerType =
    payerIsOrganizer ? 'Organisateur' :
    payerIsMember    ? 'Membre plateforme' :
    'Tiers externe';

  // Payeur réel — extrait des données Stripe vérifiées sur les EPR (actualPayerName/Email)
  // Seulement affiché si DIFFÉRENT du payeur désigné OU si le payeur désigné est inconnu.
  // Priorité : prendre le nom du 1er EPR approved qui a actualPayerName renseigné.
  const confirmedEPRs = paymentRequests.filter(r => r.requestStatus === 'approved');
  const firstEPRWithActualPayer = confirmedEPRs.find(r => r.actualPayerName || r.actualPayerEmail);
  const actualPayerNameResolved  = firstEPRWithActualPayer?.actualPayerName  || null;
  const actualPayerEmailResolved = firstEPRWithActualPayer?.actualPayerEmail || null;

  // Y a-t-il divergence entre payeur désigné et payeur réel ?
  const payerDivergence =
    actualPayerEmailResolved &&
    payerEmail &&
    actualPayerEmailResolved.toLowerCase() !== payerEmail.toLowerCase();

  // EPR séparés dépôt / balance, triés asc
  const eprSorted   = [...paymentRequests].sort((a, b) =>
    new Date(a.createdAt||0) - new Date(b.createdAt||0)
  );
  const depositEPR  = eprSorted.filter(r =>
    !r.requestType || r.requestType === 'deposit'
  );
  const balanceEPR  = eprSorted.filter(r => r.requestType === 'balance');

  const depositPaid = depositEPR.find(r => r.requestStatus === 'approved');
  const balancePaid = balanceEPR.find(r => r.requestStatus === 'approved');

  function fmtDateTime(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('fr-CA', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function EPRStatusBadge({ status }) {
    const map = {
      approved: { label: 'Payé ✓',       cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
      sent:     { label: 'Envoyé',        cls: 'bg-blue-100 text-blue-700 border-blue-200' },
      viewed:   { label: 'Consulté',      cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
      draft:    { label: 'Brouillon',     cls: 'bg-gray-100 text-gray-500 border-gray-200' },
      expired:  { label: 'Expiré',        cls: 'bg-red-100 text-red-600 border-red-200' },
      rejected: { label: 'Refusé',        cls: 'bg-red-100 text-red-700 border-red-200' },
    };
    const { label, cls } = map[status] || { label: status, cls: 'bg-gray-100 text-gray-500 border-gray-200' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cls}`}>
        {label}
      </span>
    );
  }

  return (
    <div className="space-y-6 pb-6">

      {/* ── En-tête contrat ── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-slate-400" />
              <span className="text-slate-400 text-xs font-medium uppercase tracking-widest">Contrat de service</span>
            </div>
            <h2 className="text-xl font-bold">{event?.title || 'Événement'}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-400">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {eventDate}
              </span>
              {(venueName || event?.checkpointId) && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {venueName || event.checkpointId}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {allSigned
              ? <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Tous signés
                </span>
              : <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                  <Clock className="w-4 h-4" /> En cours de signature
                </span>
            }
          </div>
        </div>

        {/* Récap financier — organisateur voit ce qu'il paie uniquement.
             Commission et net talents sont des données internes de la plateforme. */}
        {isOrganizer && (
          <div className="grid grid-cols-2 gap-3 mt-5">
            {[
              { label: 'Budget contracté', value: `${fmt(totalBrut)} $`, sub: `${talentContracts.length} prestataire${talentContracts.length > 1 ? 's' : ''}`, color: 'text-white' },
              { label: 'Récolté (net)', value: `${fmt(totalCollecteNet)} $`, sub: remaining > 0.5 ? `${fmt(remaining)} $ manquant` : 'Complet ✓', color: remaining > 0.5 ? 'text-red-300' : 'text-emerald-300' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-white/5 rounded-xl p-3 border border-white/10">
                <p className="text-xs text-slate-400 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Parties au contrat ── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <User className="w-3.5 h-3.5" />
          Parties au contrat
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Organisateur */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Award className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-indigo-500 font-medium">Organisateur</p>
              <p className="text-sm font-semibold text-gray-900">
                {/* EventLobby charge maintenant le TalentProfile de l'organisateur */}
                {profileMap?.[event?.organizerId]?.displayName
                  || profileMap?.[event?.organizerUserId]?.displayName
                  || profileMap?.[session?.hostUserId]?.displayName
                  || `…${(event?.organizerId || event?.organizerUserId || '').slice(-6)}`}
              </p>
            </div>
          </div>
          {/* Micro Rave */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-50 border border-purple-100">
            <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-purple-500 font-medium">Opérateur plateforme</p>
              <p className="text-sm font-semibold text-gray-900">Micro Rave</p>
              <p className="text-xs text-purple-400">Séquestre · Distribution · Arbitrage</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section Payeur ────────────────────────────────────────────────────
           Entité financièrement responsable de l'événement.
           Peut être l'organisateur, un membre délégué ou un tiers externe.
           Visible uniquement par l'organisateur (données financières confidentielles).
           ─────────────────────────────────────────────────────────────────────── */}
      {isOrganizer && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-white to-amber-50/40 overflow-hidden">
          {/* Header payeur */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-amber-100">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Payeur désigné</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 font-medium">
                  {payerType}
                </span>
              </div>
              {/* Payeur désigné — qui a reçu le lien */}
              <p className="text-sm font-bold text-gray-900 mt-0.5">{designatedPayerName}</p>
              {payerEmail && (
                <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> {payerEmail}
                </p>
              )}
              {/* Payeur réel — capturé par Stripe au checkout — affiché seulement si connu */}
              {actualPayerNameResolved && (
                <div className="mt-1.5 flex items-start gap-1.5">
                  <span className="text-[10px] text-gray-400 mt-0.5 flex-shrink-0">A payé :</span>
                  <div>
                    <span className="text-xs font-semibold text-gray-800">
                      {actualPayerNameResolved}
                    </span>
                    {actualPayerEmailResolved && (
                      <span className="text-[10px] text-gray-400 ml-1">— {actualPayerEmailResolved}</span>
                    )}
                    {payerDivergence && (
                      <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 font-medium">
                        ≠ désigné
                      </span>
                    )}
                  </div>
                </div>
              )}
              {/* Si aucun paiement confirmé avec identité — indiquer que l'identité n'est pas vérifiée */}
              {!actualPayerNameResolved && confirmedEPRs.length > 0 && (
                <p className="text-[10px] text-gray-400 mt-1 italic">
                  Identité du payeur réel non capturée (paiement antérieur à v2)
                </p>
              )}
            </div>
            {/* Statut global paiement */}
            <div className="text-right flex-shrink-0">
              {depositPaid && balancePaid ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                  <CheckCheck className="w-3.5 h-3.5" /> Soldé
                </span>
              ) : depositPaid ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold">
                  <CreditCard className="w-3.5 h-3.5" /> Dépôt reçu
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-500 text-xs font-semibold">
                  <Clock className="w-3.5 h-3.5" /> En attente
                </span>
              )}
            </div>
          </div>

          {/* Timeline des paiements */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Historique des paiements
            </p>

            {/* ── Timeline des EPR — tous types confondus, triés chronologiquement ──
                 Chaque EPR est affiché avec :
                 - son type (dépôt / balance / ajustement)
                 - son statut + badge coloré
                 - l'identité réelle du payeur (actualPayerName / actualPayerEmail)
                   capturée par confirmStripePayment v8 depuis Stripe billing_details
                 - la date exacte du paiement (paidAt) ou de la demande (createdAt)
                 - le motif si ajustement de programme (adjustmentReason)
                 - le delta budgétaire si applicable (deltaAmount)
            ── */}
            {eprSorted.length === 0 && (
              <div className="flex items-center gap-3 py-2 px-3 rounded-xl bg-gray-50 border border-dashed border-gray-200">
                <div className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                <p className="text-xs text-gray-400 italic">Aucune demande de paiement envoyée</p>
              </div>
            )}

            {eprSorted.map((epr, i) => {
              const typeLabel = {
                deposit:      'Dépôt 20 %',
                deposit_gap:  'Complément dépôt',
                balance:      'Balance 80 %',
                adjustment:   'Ajustement programme',
              }[epr.requestType] || 'Dépôt 20 %';

              const dotColor = epr.requestStatus === 'approved' ? 'bg-emerald-500'
                : epr.requestStatus === 'expired'  ? 'bg-red-400'
                : epr.requestStatus === 'rejected' ? 'bg-red-500'
                : 'bg-amber-400';

              // Identité réelle du payeur — priorité : données Stripe vérifiées
              const realPayerName  = epr.actualPayerName  || epr.payerEmail?.split('@')[0] || null;
              const realPayerEmail = epr.actualPayerEmail || epr.payerEmail || null;
              const payerChanged   = realPayerEmail && epr.payerEmail && realPayerEmail !== epr.payerEmail;

              return (
                <div key={epr.id || i} className={`rounded-xl border overflow-hidden ${
                  epr.requestStatus === 'approved' ? 'bg-white border-gray-100'
                  : epr.requestStatus === 'expired' ? 'bg-red-50/50 border-red-100'
                  : 'bg-amber-50/40 border-amber-100'
                }`}>
                  <div className="flex items-start gap-3 py-2.5 px-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
                    <div className="flex-1 min-w-0">
                      {/* Type + statut */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-gray-800">{typeLabel}</p>
                        <EPRStatusBadge status={epr.requestStatus} />
                        {epr.deltaAmount != null && epr.deltaAmount !== 0 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            epr.deltaAmount > 0
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {epr.deltaAmount > 0 ? '+' : ''}{epr.deltaAmount.toFixed(2)} $
                          </span>
                        )}
                      </div>

                      {/* Motif d'ajustement */}
                      {epr.adjustmentReason && (
                        <p className="text-[10px] text-orange-600 mt-0.5 italic">
                          ↳ {epr.adjustmentReason}
                        </p>
                      )}

                      {/* Identité réelle du payeur (v8 — Stripe billing_details) */}
                      {(realPayerName || realPayerEmail) && epr.requestStatus === 'approved' && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400">Payé par</span>
                          <span className="text-[10px] font-medium text-gray-700">
                            {realPayerName || realPayerEmail}
                          </span>
                          {realPayerEmail && realPayerName && (
                            <span className="text-[10px] text-gray-400">— {realPayerEmail}</span>
                          )}
                          {payerChanged && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium ml-1">
                              ≠ payeur désigné
                            </span>
                          )}
                        </div>
                      )}

                      {/* Dates */}
                      {epr.requestStatus === 'approved' && (epr.paidAt || epr.createdAt) && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {fmtDateTime(epr.paidAt || epr.createdAt)}
                        </p>
                      )}
                      {epr.requestStatus !== 'approved' && epr.createdAt && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Demande envoyée le {fmtDateTime(epr.createdAt)}
                        </p>
                      )}
                      {epr.expiresAt && !['approved','rejected'].includes(epr.requestStatus) && (
                        <p className="text-[10px] text-red-400 mt-0.5">
                          Expire le {fmtDateTime(epr.expiresAt)}
                        </p>
                      )}
                    </div>

                    {/* Montant */}
                    <p className={`text-sm font-bold flex-shrink-0 ${
                      epr.requestStatus === 'approved' ? 'text-emerald-700' : 'text-gray-600'
                    }`}>
                      {Number(epr.requestedAmount || 0).toFixed(2)} $
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Récap total */}
            {(depositPaid || balancePaid) && (
              <div className="pt-2 mt-1 border-t border-amber-100 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Total versé par le payeur</p>
                  <p className="text-sm font-bold text-emerald-700">
                    {totalCollecteBrut.toFixed(2)} $
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">dont frais Stripe (à la charge du payeur)</p>
                  <p className="text-xs text-gray-400">
                    {Math.round((totalCollecteBrut - totalCollecteNet) * 100) / 100 > 0
                      ? `${(Math.round((totalCollecteBrut - totalCollecteNet) * 100) / 100).toFixed(2)} $`
                      : '—'}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Net reçu par Micro Rave</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {totalCollecteNet.toFixed(2)} $
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Contrats individuels ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5" />
          Contrats de prestation ({talentContracts.length})
        </p>

        {loadingProps && (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            Chargement des contrats…
          </div>
        )}

        {!loadingProps && talentContracts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
            Aucun talent confirmé sur le plateau.
          </div>
        )}

        {!loadingProps && talentContracts.map(tc => (
          <TalentContractCard
            key={tc.userId}
            talent={tc}
            placements={tc.placements}
            proposal={tc.proposal}
            schedule={schedule}
            scenes={scenes}
            isOrganizer={isOrganizer}
            isOwnContract={tc.userId === currentUserId}
            roleMap={roleMap}
            profileMap={profileMap}
            escrowAmount={event?.escrowAmount}
            balancePaid={event?.balancePaid}
            styleSystemIds={tc.styleSystemIds}
            styleMap={styleMap}
          />
        ))}
      </div>

      {/* ── Clauses contractuelles ── */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          Conditions générales
        </p>
        <div className="space-y-2 text-xs text-gray-600 leading-relaxed">
          <p>
            <span className="font-semibold text-gray-800">Séquestre et remboursement :</span>{' '}
            Le dépôt de 20 % est immobilisé par Micro Rave à titre de réservation. Il est
            intégralement remboursable si l'organisateur annule plus de 30 jours avant l'événement.
            À partir de J-30, le dépôt n'est plus remboursable et est distribué aux talents
            au prorata de leur contrat.
          </p>
          <p>
            <span className="font-semibold text-gray-800">Annulation automatique à J-7 :</span>{' '}
            Si la balance de 80 % n'est pas réglée avant J-7, l'événement est automatiquement
            annulé par le système à J-6. Dans ce cas, les talents reçoivent leur part du dépôt
            de 20 % collecté, calculée au prorata du montant de leur contrat signé — le dépôt
            étant la seule somme effectivement levée.
          </p>
          <p>
            <span className="font-semibold text-gray-800">Présence :</span>{' '}
            Le versement du cachet net est conditionné à la présence physique validée du talent
            (score de présence ≥ 70 / 100, durée minimale 30 minutes). Tout talent non présent
            est traité comme no-show et sa part est remboursée à l'organisateur.
          </p>
          <p>
            <span className="font-semibold text-gray-800">Commission :</span>{' '}
            Le taux de commission est contractualisé au moment de l'acceptation de l'offre de
            cachet et ne peut être modifié après signature. Il est calculé sur le cachet brut
            et varie selon le tier d'abonnement du talent, modulé par son score SOTS des
            30 derniers jours.
          </p>
          <p>
            <span className="font-semibold text-gray-800">Arbitrage :</span>{' '}
            Tout litige est soumis à l'arbitrage de Micro Rave. La décision est finale et
            exécutoire sur les montants en séquestre.
          </p>
        </div>
      </div>

      {/* ── Note de confidentialité ── */}
      <p className="text-center text-xs text-gray-400">
        Ce contrat est confidentiel. Les prix et commissions sont visibles uniquement par les parties
        concernées. Document généré par Micro Rave · {new Date().toLocaleDateString('fr-CA')}.
      </p>
    </div>
  );
}