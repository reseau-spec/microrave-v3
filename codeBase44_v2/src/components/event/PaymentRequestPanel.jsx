/**
 * PaymentRequestPanel — Section "Paiement" dans EventLobby.
 * Visible pour l'organisateur uniquement.
 *
 * CHANGEMENTS v2 :
 *   - Bouton "Régler la balance maintenant" quand escrow=secured + aucune balance request
 *   - Résolution des noms des payeurs dans l'historique (TalentProfile lookup)
 *   - Balance due date affichée dans le résumé financier
 *   - Indicateur visuel quand balance en attente
 */
import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Send, Copy, CheckCircle2, Clock, XCircle,
  RefreshCw, ExternalLink, Search, User, AlertCircle, DollarSign,
  CreditCard, Info, Unlock, TrendingUp, Users, Award, CreditCard as BalanceIcon,
  Calendar, AlertTriangle
} from 'lucide-react';

// ── Statut visuel ──────────────────────────────────────────────────────────────
const STATUS_MAP = {
  draft:    { label: 'Brouillon',  color: 'bg-gray-100 text-gray-600',    icon: Clock },
  sent:     { label: 'Envoyée',    color: 'bg-blue-100 text-blue-700',     icon: Send },
  viewed:   { label: 'Vue',        color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: 'Payée ✓',    color: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  rejected: { label: 'Refusée',    color: 'bg-red-100 text-red-700',      icon: XCircle },
  expired:  { label: 'Expirée',    color: 'bg-gray-100 text-gray-500',    icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] || STATUS_MAP.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

// ── Recherche de membre ────────────────────────────────────────────────────────
function MemberSearch({ onSelect }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const profiles = await base44.entities.TalentProfile.list().catch(() => []);
        const q = query.toLowerCase();
        setResults((profiles || []).filter(p => p.displayName?.toLowerCase().includes(q)).slice(0, 8));
      } finally { setLoading(false); }
    }, 400);
  }, [query]);

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
        <Input
          placeholder="Rechercher un membre par nom…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-8 text-sm"
        />
        {loading && <Loader2 className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-400 animate-spin" />}
      </div>
      {results.length > 0 && (
        <div className="border rounded-lg divide-y max-h-40 overflow-y-auto bg-white shadow-sm">
          {results.map(p => (
            <button key={p.id} type="button"
              onClick={() => { onSelect(p); setQuery(''); setResults([]); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left text-sm"
            >
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                {p.avatarUrl
                  ? <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                  : <User className="w-3 h-3 text-indigo-600" />}
              </div>
              <span className="text-gray-700 font-medium truncate">{p.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function splitRoleLabel(roleType) {
  const map = {
    talent_payout:        'Talent',
    talent_noshow_refund: 'No-show (remboursé)',
    platform_fee:         'Commission plateforme',
    platform_production:  'Plateforme (production)',
    seller_commission:    'Commission vendeur',
    talent_video:         'Vidéo',
    deposit_proportional: 'Part dépôt',
  };
  return map[roleType] || roleType;
}

function splitColor(roleType) {
  if (roleType === 'talent_payout')        return 'text-green-700 bg-green-50 border-green-200';
  if (roleType === 'talent_noshow_refund') return 'text-orange-700 bg-orange-50 border-orange-200';
  if (roleType?.startsWith('platform'))    return 'text-gray-600 bg-gray-50 border-gray-200';
  if (roleType === 'seller_commission')    return 'text-purple-700 bg-purple-50 border-purple-200';
  return 'text-gray-600 bg-gray-50 border-gray-200';
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function PaymentRequestPanel({ eventId, eventBudget, isOrganizer, event }) {
  const [requests,       setRequests]       = useState([]);
  const [loadingReqs,    setLoadingReqs]    = useState(true);
  const [splits,         setSplits]         = useState([]);
  const [payout,         setPayout]         = useState(null);
  const [splitsLoading,  setSplitsLoading]  = useState(false);
  const [talentNames,    setTalentNames]    = useState({});
  const [payerNames,     setPayerNames]     = useState({}); // résolution noms payeurs

  const [payerEmail,     setPayerEmail]     = useState('');
  const [payerUserId,    setPayerUserId]    = useState('');
  const [payerDisplayName, setPayerDisplayName] = useState('');
  const [message,        setMessage]        = useState('');
  const [sending,        setSending]        = useState(false);
  const [sendError,      setSendError]      = useState('');

  const [releasing,      setReleasing]      = useState(false);
  const [releaseError,   setReleaseError]   = useState('');
  const [releaseSuccess, setReleaseSuccess] = useState(false);

  // Balance payment state
  const [requestingBalance,     setRequestingBalance]     = useState(false);
  const [balanceError,          setBalanceError]          = useState('');
  const [showAdjustModal,       setShowAdjustModal]       = useState(false);
  const [adjustReason,          setAdjustReason]          = useState('');
  const [adjustAmount,          setAdjustAmount]          = useState('');
  const [requestingAdjust,      setRequestingAdjust]      = useState(false);
  const [adjustError,           setAdjustError]           = useState('');
  const [requestingDepositGap,  setRequestingDepositGap]  = useState(false);
  const [depositGapError,       setDepositGapError]       = useState('');
  const [requestingFullSettle,  setRequestingFullSettle]  = useState(false);
  const [fullSettleError,       setFullSettleError]       = useState('');

  const [copiedId, setCopiedId] = useState(null);

  const budget        = Number(eventBudget) || 0;
  const depositAmount = Math.round(budget * 0.20 * 100) / 100;

  // balanceAmount = budget canonique - total net déjà perçu par MR.
  // Source de vérité : sum(EPR.netAmount WHERE status='approved').
  // netAmount = montant net reçu par MR après déduction frais Stripe.
  // Pour les EPR historiques sans netAmount :
  //   - EPR de type deposit sans netAmount → approx budget × 20% (net standard)
  //   - EPR de type adjustment → utiliser requestedAmount comme approximation
  // Cette formule couvre : dépôt partiel, double dépôt, modification programme,
  // ajustement après paiement — sans jamais utiliser escrowAmount (brut payeur).
  const STRIPE_RATE_APPROX = 0.029;
  const STRIPE_FIXED_APPROX = 0.30;
  const totalPercuNet = Math.round(
    (requests || [])
      .filter(r => r.requestStatus === 'approved')
      .reduce((sum, r) => {
        if (r.netAmount) return sum + Number(r.netAmount);
        // Fallback pour EPR historiques sans netAmount :
        // reconstruire le net depuis le brut (inverser la formule Stripe)
        const brut = Number(r.requestedAmount) || 0;
        const net  = brut > 0
          ? Math.round(((brut * (1 - STRIPE_RATE_APPROX)) - STRIPE_FIXED_APPROX) * 100) / 100
          : 0;
        return sum + Math.max(0, net);
      }, 0) * 100
  ) / 100;

  const balanceAmount = Math.round(Math.max(0, budget - totalPercuNet) * 100) / 100;

  const escrowStatus      = event?.escrowStatus || 'none';
  const isSecured         = escrowStatus === 'secured';
  const isReleased        = escrowStatus === 'released';
  const balanceDueDate    = event?.balanceDueDate ? new Date(event.balanceDueDate) : null;
  const daysUntilDue      = balanceDueDate
    ? Math.floor((balanceDueDate - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Dépôt partiel : budget modifié après le premier dépôt
  // v2 fix : utiliser fundsAuthorized (secured OU released) au lieu de isSecured seul.
  // Quand escrow=released, le dépôt peut être partiel si le budget a changé après paiement.
  // Dans ce cas, on traite comme "partiel" pour afficher le bouton full_settlement.
  const DEPOSIT_GAP_MIN  = 5;
  const escrowCaptured   = Number(event?.escrowAmount) || 0;
  const depositGap       = Math.round(Math.max(0, depositAmount - escrowCaptured) * 100) / 100;
  // fundsAuthorized défini plus bas — on anticipe ici avec la même logique
  const _fundsAuth       = (event?.escrowStatus === 'secured') || (event?.escrowStatus === 'released');
  const depositIsPartial  = _fundsAuth && depositGap >= DEPOSIT_GAP_MIN;
  const depositIsComplete = _fundsAuth && depositGap < DEPOSIT_GAP_MIN;

  // ── Chargements ─────────────────────────────────────────────────────────────
  const loadRequests = async () => {
    setLoadingReqs(true);
    try {
      const all = await base44.entities.EventPaymentRequest
        .filter({ eventId }, '-created_date', 20).catch(() => []);
      setRequests(all || []);

      // Résoudre les noms des payeurs
      const payerIds = [...new Set(
        (all || []).filter(r => r.payerUserId).map(r => r.payerUserId)
      )];
      if (payerIds.length > 0) {
        const profiles = await base44.entities.TalentProfile
          .filter({ userId: { $in: payerIds } }).catch(() => []);
        const nameMap = {};
        (profiles || []).forEach(p => { nameMap[p.userId] = p.displayName || null; });
        setPayerNames(nameMap);
      }
    } finally {
      setLoadingReqs(false);
    }
  };

  const loadSplits = async () => {
    if (!eventId) return;
    setSplitsLoading(true);
    try {
      const payouts = await base44.entities.EventPayout.filter({ eventId }).catch(() => []);
      const activePayout = (payouts || []).find(p =>
        ['pending', 'processing', 'completed'].includes(p.status)
      ) || null;
      setPayout(activePayout);

      if (activePayout?.id) {
        const payoutSplits = await base44.entities.PayoutSplit
          .filter({ payoutId: activePayout.id }).catch(() => []);
        setSplits(payoutSplits || []);

        const talentIds = [...new Set(
          (payoutSplits || [])
            .filter(s => s.recipientUserId && s.roleType === 'talent_payout')
            .map(s => s.recipientUserId)
        )];
        if (talentIds.length > 0) {
          const profiles = await base44.entities.TalentProfile
            .filter({ userId: { $in: talentIds } }).catch(() => []);
          const nameMap = {};
          (profiles || []).forEach(p => { nameMap[p.userId] = p.displayName || 'Talent'; });
          setTalentNames(nameMap);
        }
      }
    } catch (err) {
      console.warn('[PaymentRequestPanel] loadSplits error:', err);
    } finally {
      setSplitsLoading(false);
    }
  };

  useEffect(() => { if (eventId) loadRequests(); }, [eventId]);
  useEffect(() => { if (eventId) loadSplits();   }, [eventId]);

  const handleSelectMember = (profile) => {
    setPayerUserId(profile.userId);
    setPayerEmail('');
    setPayerDisplayName(profile.displayName || '');
  };

  const handleSendRequest = async () => {
    if (!payerEmail && !payerUserId) {
      setSendError('Indiquez un payeur (membre ou email externe).');
      return;
    }
    setSendError('');
    setSending(true);
    try {
      await base44.functions.invoke('sendPaymentRequest', {
        eventId,
        payerEmail,
        payerUserId: payerUserId || undefined,
        messageToPayer: message || undefined,
      });
      setPayerEmail(''); setPayerUserId(''); setMessage('');
      await loadRequests();
    } catch (err) {
      setSendError(err?.response?.data?.error || err?.message || "Erreur lors de l'envoi.");
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = (req) => {
    const url = `${window.location.origin}/PaymentPage?token=${req.secureToken}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(req.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDepositGap = async () => {
    setRequestingDepositGap(true); setDepositGapError('');
    try {
      // forceResend:true — permet de renvoyer même si balanceRequestSentAt est déjà rempli
      const result = await base44.functions.invoke('requestBalancePayment', { eventId, mode: 'deposit_gap', forceResend: true });
      const url = result?.data?.paymentUrl;
      if (url) { window.open(url, '_blank', 'noopener,noreferrer'); await loadRequests(); }
      else setDepositGapError(result?.data?.error || 'Lien non disponible.');
    } catch (err) { setDepositGapError(err?.response?.data?.error || err?.message || 'Erreur.'); }
    finally { setRequestingDepositGap(false); }
  };

  const handleFullSettlement = async () => {
    setRequestingFullSettle(true); setFullSettleError('');
    try {
      // forceResend:true — idem, toujours autoriser depuis l'UI organisateur
      const result = await base44.functions.invoke('requestBalancePayment', { eventId, mode: 'full_settlement', forceResend: true });
      const url = result?.data?.paymentUrl;
      if (url) { window.open(url, '_blank', 'noopener,noreferrer'); await loadRequests(); }
      else setFullSettleError(result?.data?.error || 'Lien non disponible.');
    } catch (err) { setFullSettleError(err?.response?.data?.error || err?.message || 'Erreur.'); }
    finally { setRequestingFullSettle(false); }
  };

  const handleAdjustment = async () => {
    if (!adjustReason.trim()) { setAdjustError('Décrivez la modification du programme.'); return; }
    const amount = adjustAmount ? Number(adjustAmount) : null;
    if (amount !== null && (isNaN(amount) || amount <= 0)) {
      setAdjustError('Montant invalide.');
      return;
    }
    setRequestingAdjust(true); setAdjustError('');
    try {
      const result = await base44.functions.invoke('requestBalancePayment', {
        eventId,
        mode: 'adjustment',
        forceResend: true,
        adjustmentReason: adjustReason.trim(),
        ...(amount ? { adjustmentAmount: amount } : {}),
      });
      const url = result?.data?.paymentUrl;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        await loadRequests();
        setShowAdjustModal(false);
        setAdjustReason('');
        setAdjustAmount('');
      } else {
        setAdjustError(result?.data?.error || 'Lien non disponible.');
      }
    } catch (err) {
      setAdjustError(err?.response?.data?.error || err?.message || 'Erreur.');
    } finally {
      setRequestingAdjust(false);
    }
  };

  const handleReleaseEscrow = async () => {
    if (!window.confirm("Confirmer la libération de l'escrow ? Cette action est irréversible.")) return;
    setReleasing(true); setReleaseError('');
    try {
      await base44.functions.invoke('releaseEventEscrow', { eventId });
      setReleaseSuccess(true);
      await loadSplits();
    } catch (err) {
      setReleaseError(err?.response?.data?.error || err?.message || 'Erreur lors de la libération.');
    } finally {
      setReleasing(false);
    }
  };

  // ── Payer la balance — appelle requestBalancePayment puis ouvre le lien ─────
  const handlePayBalance = async () => {
    setRequestingBalance(true);
    setBalanceError('');
    try {
      const result = await base44.functions.invoke('requestBalancePayment', { eventId, forceResend: true });
      const paymentUrl = result?.data?.paymentUrl;
      if (paymentUrl) {
        window.open(paymentUrl, '_blank', 'noopener,noreferrer');
        await loadRequests(); // rafraîchit l'historique
      } else {
        setBalanceError('Lien de paiement non disponible. Réessayer dans quelques secondes.');
      }
    } catch (err) {
      setBalanceError(err?.response?.data?.error || err?.message || 'Erreur lors de la demande de balance.');
    } finally {
      setRequestingBalance(false);
    }
  };

  if (!isOrganizer) return null;

  const depositRequests    = requests.filter(r => !r.requestType || r.requestType === 'deposit');
  const balanceRequests    = requests.filter(r => r.requestType === 'balance');
  const hasApprovedDeposit = depositRequests.some(r => r.requestStatus === 'approved');
  const hasApprovedBalance = balanceRequests.some(r => r.requestStatus === 'approved');
  const hasPendingBalance  = balanceRequests.some(r => ['sent','viewed'].includes(r.requestStatus));

  // Bouton balance classique : dépôt complet + pas encore de balance
  // v2 fix : s'affiche aussi quand escrow=released (flux démarrage+capture lié)
  // car releaseEventEscrow est maintenant déclenché au démarrage de session,
  // avant que la balance soit payée. !isReleased retiré — l'état released ne
  // signifie plus "balance déjà réglée", il signifie "dépôt capturé".
  const fundsAuthorized    = isSecured || isReleased; // dépôt en caisse ou autorisé
  const showBalanceButton  = fundsAuthorized && !hasApprovedBalance && !hasPendingBalance && depositIsComplete;
  // Boutons dépôt partiel : budget modifié après le premier dépôt
  const showPartialButtons = fundsAuthorized && !hasApprovedBalance && !hasPendingBalance && depositIsPartial;
  // Afficher le lien si demande balance envoyée mais pas encore payée
  const pendingBalanceReq = balanceRequests.find(r => ['sent','viewed'].includes(r.requestStatus));

  const talentSplits   = splits.filter(s => s.roleType === 'talent_payout');
  const platformSplits = splits.filter(s => s.roleType?.startsWith('platform') || s.roleType === 'platform_fee');
  const noshowSplits   = splits.filter(s => s.roleType === 'talent_noshow_refund');
  const totalTalent    = talentSplits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalPlatform  = platformSplits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalNoshow    = noshowSplits.reduce((s, x) => s + (Number(x.amount) || 0), 0);

  const nextPayoutDate = payout?.triggerDate
    ? new Date(payout.triggerDate).toLocaleDateString('fr-CA', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
      })
    : null;

  return (
    <div className="space-y-6">

      {/* ── Résumé financier ──────────────────────────────────────────────── */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-600" />
          Résumé financier
        </h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Budget total</p>
            <p className="font-bold text-gray-900">{budget.toFixed(2)} $</p>
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Dépôt (20%)</p>
            {depositIsPartial ? (
              <div>
                <p className="font-bold text-amber-600">{escrowCaptured.toFixed(2)} $ / {depositAmount.toFixed(2)} $ ⚠</p>
                <p className="text-xs text-amber-500 mt-0.5">{depositGap.toFixed(2)} $ manquant</p>
              </div>
            ) : (
              <p className={`font-bold ${hasApprovedDeposit || isSecured || isReleased ? 'text-green-600' : 'text-gray-700'}`}>
                {depositAmount.toFixed(2)} $
                {(hasApprovedDeposit || isSecured || isReleased) && ' ✓'}
              </p>
            )}
          </div>
          <div className="bg-white border rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Balance (80%)</p>
            <p className={`font-bold ${hasApprovedBalance ? 'text-green-600' : hasPendingBalance ? 'text-amber-600' : isReleased ? 'text-blue-600' : 'text-gray-700'}`}>
              {balanceAmount.toFixed(2)} $
              {hasApprovedBalance && ' ✓'}
              {!hasApprovedBalance && hasPendingBalance && (
                <span className="ml-1 text-xs font-normal text-amber-500">en attente</span>
              )}
              {!hasApprovedBalance && !hasPendingBalance && isReleased && (
                <span className="ml-1 text-xs font-normal text-blue-500">non réclamée</span>
              )}
            </p>
          </div>
        </div>

        {/* Note frais Stripe — transparence pour l'organisateur */}
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Les montants facturés incluent les frais de traitement Stripe (2,9 % + 0,30 $).
          Le budget contractuel ci-dessus représente les montants nets reversés aux talents.
        </p>

        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <span className="text-xs text-gray-500">Escrow :</span>
          {escrowStatus === 'none'     && <Badge variant="outline" className="text-xs">Aucun</Badge>}
          {escrowStatus === 'securing' && <Badge className="text-xs bg-yellow-100 text-yellow-700">En cours…</Badge>}
          {escrowStatus === 'secured'  && <Badge className="text-xs bg-blue-100 text-blue-700">🔒 Sécurisé</Badge>}
          {escrowStatus === 'released' && <Badge className="text-xs bg-green-100 text-green-700">✅ Libéré</Badge>}
          {escrowStatus === 'disputed' && <Badge className="text-xs bg-red-100 text-red-700">⚠️ Litigieux</Badge>}
          {event?.escrowAmount > 0 && (
            <span className="text-xs text-gray-500 ml-auto">
              {Number(event.escrowAmount).toFixed(2)} $ en séquestre
            </span>
          )}
        </div>

        {/* Date limite balance */}
        {balanceDueDate && !hasApprovedBalance && fundsAuthorized && (
          <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
            daysUntilDue !== null && daysUntilDue <= 3
              ? 'bg-red-50 text-red-700 border border-red-200'
              : daysUntilDue !== null && daysUntilDue <= 7
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}>
            {daysUntilDue !== null && daysUntilDue <= 7
              ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              : <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            }
            <span>
              Balance à régler avant le <strong>{balanceDueDate.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}</strong>
              {daysUntilDue !== null && (
                <span className="ml-1">
                  {daysUntilDue > 0
                    ? `— ${daysUntilDue} jour${daysUntilDue > 1 ? 's' : ''} restant${daysUntilDue > 1 ? 's' : ''}`
                    : daysUntilDue === 0
                      ? '— Dernier jour !'
                      : '— Date dépassée'}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* ── Bouton payer la balance ────────────────────────────────────────── */}
      {showBalanceButton && (
        <div className="border border-purple-200 bg-purple-50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-purple-900 flex items-center gap-2">
            <BalanceIcon className="w-4 h-4" />
            Régler la balance (80%)
          </h3>
          <p className="text-sm text-purple-800">
            Le dépôt de {depositAmount.toFixed(2)} $ a été reçu. Réglez le solde de{' '}
            <strong>{balanceAmount.toFixed(2)} $</strong> pour confirmer définitivement votre réservation.
          </p>
          {balanceError && (
            <div className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5" /> {balanceError}
            </div>
          )}
          <Button
            onClick={handlePayBalance}
            disabled={requestingBalance}
            className="bg-purple-600 hover:bg-purple-700 text-white w-full"
            size="sm"
          >
            {requestingBalance
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <BalanceIcon className="w-3.5 h-3.5 mr-1.5" />}
            Régler la balance — {balanceAmount.toFixed(2)} $
          </Button>
        </div>
      )}

      {/* ── Dépôt partiel ─────────────────────────────────────────────────── */}
      {showPartialButtons && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-amber-900 flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Dépôt incomplet — budget modifié
          </h3>
          <p className="text-sm text-amber-800">
            Budget actuel : <strong>{budget.toFixed(2)} $</strong>.
            Dépôt reçu : <strong>{escrowCaptured.toFixed(2)} $</strong>.
            Manque : <strong>{depositGap.toFixed(2)} $</strong>.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Option A — Compléter le dépôt seulement si pas encore released */}
            {!isReleased && (
              <div className="bg-white border border-amber-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-800">A — Compléter le dépôt</p>
                <p className="text-xs text-amber-700">Régler <strong>{depositGap.toFixed(2)} $</strong>. La balance sera demandée séparément.</p>
                {depositGapError && <p className="text-xs text-red-600">{depositGapError}</p>}
                <Button onClick={handleDepositGap} disabled={requestingDepositGap}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white" size="sm">
                  {requestingDepositGap ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CreditCard className="w-3.5 h-3.5 mr-1" />}
                  Compléter — {depositGap.toFixed(2)} $
                </Button>
              </div>
            )}
            {/* Option B — Tout régler (pleine largeur si released, demi sinon) */}
            <div className={`bg-white border border-purple-200 rounded-lg p-3 space-y-2 ${isReleased ? 'sm:col-span-2' : ''}`}>
              <p className="text-xs font-semibold text-purple-800">{isReleased ? 'Régler le solde complet' : 'B — Tout régler maintenant'}</p>
              <p className="text-xs text-purple-700">Régler <strong>{(budget - escrowCaptured).toFixed(2)} $</strong> en une seule fois.</p>
              {fullSettleError && <p className="text-xs text-red-600">{fullSettleError}</p>}
              <Button onClick={handleFullSettlement} disabled={requestingFullSettle}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white" size="sm">
                {requestingFullSettle ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <BalanceIcon className="w-3.5 h-3.5 mr-1" />}
                Tout régler — {(budget - escrowCaptured).toFixed(2)} $
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lien de balance déjà envoyé mais pas encore payé */}
      {!showBalanceButton && !showPartialButtons && pendingBalanceReq && !hasApprovedBalance && fundsAuthorized && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-2">
          <h3 className="font-semibold text-amber-900 flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4" />
            Balance en attente de paiement
          </h3>
          <p className="text-xs text-amber-800">
            Un lien de paiement a été envoyé pour la balance de{' '}
            <strong>{(Number(pendingBalanceReq.requestedAmount) || 0).toFixed(2)} $</strong>.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopyLink(pendingBalanceReq)}
              className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900"
            >
              {copiedId === pendingBalanceReq.id
                ? <><CheckCircle2 className="w-3 h-3 text-green-500" /> Copié !</>
                : <><Copy className="w-3 h-3" /> Copier le lien</>
              }
            </button>
            <a
              href={`${window.location.origin}/PaymentPage?token=${pendingBalanceReq.secureToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-900"
            >
              <ExternalLink className="w-3 h-3" /> Ouvrir
            </a>
          </div>
        </div>
      )}

      {/* ── Dashboard splits ──────────────────────────────────────────────── */}
      {(payout || splitsLoading) && (
        <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              Distribution aux talents
            </h3>
            {nextPayoutDate && payout?.status !== 'completed' && (
              <span className="text-xs text-indigo-600 font-medium">
                Déclenchement : {nextPayoutDate}
              </span>
            )}
            {payout?.status === 'completed' && (
              <Badge className="text-xs bg-green-100 text-green-700">✅ Complété</Badge>
            )}
            {payout?.status === 'pending' && (
              <Badge className="text-xs bg-yellow-100 text-yellow-700">⏳ En attente</Badge>
            )}
          </div>

          {splitsLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            </div>
          ) : splits.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">
              Les splits seront générés automatiquement avant le déclenchement.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white border border-green-200 rounded-lg p-2 text-center">
                  <Users className="w-3.5 h-3.5 text-green-600 mx-auto mb-1" />
                  <p className="font-bold text-green-700">{totalTalent.toFixed(2)} $</p>
                  <p className="text-gray-500">Talents ({talentSplits.length})</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-2 text-center">
                  <Award className="w-3.5 h-3.5 text-gray-500 mx-auto mb-1" />
                  <p className="font-bold text-gray-700">{totalPlatform.toFixed(2)} $</p>
                  <p className="text-gray-500">Plateforme</p>
                </div>
                {totalNoshow > 0 && (
                  <div className="bg-white border border-orange-200 rounded-lg p-2 text-center">
                    <XCircle className="w-3.5 h-3.5 text-orange-500 mx-auto mb-1" />
                    <p className="font-bold text-orange-700">{totalNoshow.toFixed(2)} $</p>
                    <p className="text-gray-500">No-show</p>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                {splits.map(s => (
                  <div key={s.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${splitColor(s.roleType)}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{splitRoleLabel(s.roleType)}</span>
                      {s.recipientUserId && talentNames[s.recipientUserId] && (
                        <span className="opacity-70">— {talentNames[s.recipientUserId]}</span>
                      )}
                      {s.effectiveCommissionRate && (
                        <span className="opacity-50 italic">
                          ({(Number(s.effectiveCommissionRate) * 100).toFixed(1)}% comm.)
                        </span>
                      )}
                    </div>
                    <span className="font-bold whitespace-nowrap">{Number(s.amount || 0).toFixed(2)} $</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Ajustement de programme ──────────────────────────────────────────
           Visible dès qu'un premier paiement a été encaissé (dépôt ou balance).
           Permet de facturer un supplément après modification du lineup :
           ajout de talent, augmentation de cachet, changement de scène.
           Le motif est obligatoire et apparaît dans la timeline ContractView. */}
      {fundsAuthorized && (hasApprovedDeposit || hasApprovedBalance) && (
        <div className="border border-orange-200 bg-orange-50/40 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-orange-900 flex items-center gap-2 text-sm">
                <TrendingUp className="w-4 h-4" />
                Ajustement de programme
              </h3>
              <p className="text-xs text-orange-700 mt-0.5">
                Programme modifié après paiement ? Créez une demande complémentaire.
              </p>
            </div>
            <Button
              onClick={() => setShowAdjustModal(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              size="sm"
            >
              + Demande
            </Button>
          </div>
        </div>
      )}

      {/* Modal ajustement */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-500" />
              Ajustement de programme
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Motif de l'ajustement <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="Ex : Talent Dupont ajouté au lineup — Peak 20h-22h"
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Montant à facturer ($ CAD)
                  <span className="ml-1 font-normal text-gray-400">— laisser vide pour calcul automatique</span>
                </label>
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(e.target.value)}
                  placeholder="Ex : 150.00"
                  min="0"
                  step="0.01"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Si vide : calculé automatiquement (nouveau budget − total encaissé)
                </p>
              </div>
              {adjustError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {adjustError}
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowAdjustModal(false); setAdjustReason(''); setAdjustAmount(''); setAdjustError(''); }}
                disabled={requestingAdjust}
              >
                Annuler
              </Button>
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold"
                onClick={handleAdjustment}
                disabled={requestingAdjust || !adjustReason.trim()}
              >
                {requestingAdjust
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> En cours…</>
                  : 'Envoyer la demande'
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Libérer l'escrow ──────────────────────────────────────────────── */}
      {/* Ce bloc n'apparaît que si l'escrow est encore secured ET la balance est payée.
          Si escrow=released, la libération a déjà eu lieu (déclenchée au démarrage). */}
      {isSecured && !isReleased && hasApprovedBalance && (
        <div className="border border-green-200 bg-green-50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-green-900 flex items-center gap-2">
            <Unlock className="w-4 h-4" />
            Libérer les fonds
          </h3>
          <p className="text-sm text-green-800">
            Dépôt et balance reçus. Libérez les fonds pour déclencher les paiements aux talents.
          </p>
          {releaseSuccess ? (
            <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
              <CheckCircle2 className="w-4 h-4" /> Fonds libérés avec succès !
            </div>
          ) : (
            <>
              {releaseError && <p className="text-xs text-red-600">{releaseError}</p>}
              <Button
                onClick={handleReleaseEscrow}
                disabled={releasing}
                className="bg-green-600 hover:bg-green-700 text-white"
                size="sm"
              >
                {releasing
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Unlock className="w-3.5 h-3.5 mr-1.5" />}
                Libérer l'escrow
              </Button>
            </>
          )}
        </div>
      )}

      {/* Libérer sans balance (dépôt seulement — cas dépôt-only)
          N'apparaît que si secured et qu'aucune balance n'est en cours/payée. */}
      {isSecured && !isReleased && !hasApprovedBalance && !showBalanceButton && !pendingBalanceReq && (
        <div className="border border-gray-200 bg-gray-50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Unlock className="w-4 h-4 text-gray-500" />
            Libérer les fonds
          </h3>
          <p className="text-sm text-gray-600">
            Vous pouvez libérer le dépôt uniquement pour cet événement.
          </p>
          {releaseSuccess ? (
            <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
              <CheckCircle2 className="w-4 h-4" /> Fonds libérés.
            </div>
          ) : (
            <>
              {releaseError && <p className="text-xs text-red-600">{releaseError}</p>}
              <Button
                onClick={handleReleaseEscrow}
                disabled={releasing}
                variant="outline"
                size="sm"
              >
                {releasing
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <Unlock className="w-3.5 h-3.5 mr-1.5" />}
                Libérer l'escrow
              </Button>
            </>
          )}
        </div>
      )}

      {/* ── Envoyer une demande de dépôt ─────────────────────────────────── */}
      {!isSecured && !isReleased && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-600" />
            Envoyer une demande de paiement
          </h3>
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-start gap-2 text-xs text-indigo-700">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Le dépôt demandé sera <strong>{depositAmount.toFixed(2)} $</strong> (20% du budget).
              Le backend calcule toujours le montant réel.
            </span>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Membre de la plateforme</Label>
              <MemberSearch onSelect={handleSelectMember} />
              {payerUserId && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Membre sélectionné : <strong>{payerDisplayName}</strong>
                  <button type="button"
                    onClick={() => { setPayerUserId(''); setPayerEmail(''); setPayerDisplayName(''); }}
                    className="ml-1 text-gray-400 hover:text-red-500"
                  >✕</button>
                </p>
              )}
            </div>
            {!payerUserId && (
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Email externe</Label>
                <Input
                  type="email"
                  placeholder="payeur@exemple.com"
                  value={payerEmail}
                  onChange={e => setPayerEmail(e.target.value)}
                  className="text-sm"
                />
              </div>
            )}
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Message personnalisé (optionnel)</Label>
              <Input
                placeholder="Ex : Merci de régler avant le 15 janvier."
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          {sendError && (
            <div className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5" /> {sendError}
            </div>
          )}
          <Button
            onClick={handleSendRequest}
            disabled={sending || (!payerEmail && !payerUserId)}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            size="sm"
          >
            {sending
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Envoyer la demande ({depositAmount.toFixed(2)} $)
          </Button>
        </div>
      )}

      {/* ── Historique des demandes ───────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">
            Historique ({requests.length})
          </h3>
          <button type="button" onClick={loadRequests} className="text-gray-400 hover:text-gray-600" title="Rafraîchir">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loadingReqs && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {!loadingReqs && requests.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Aucune demande envoyée pour l'instant.</p>
        )}

        {!loadingReqs && requests.map(req => {
          const isBalance  = req.requestType === 'balance';
          const paymentUrl = `${window.location.origin}/PaymentPage?token=${req.secureToken}`;
          // Résoudre le nom du payeur
          const payerName  = req.payerDisplayName
            || (req.payerUserId ? payerNames[req.payerUserId] : null)
            || (req.payerEmail || null);

          return (
            <div key={req.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={req.requestStatus} />
                    {isBalance && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                        Balance 80%
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-800">
                    {(() => {
                      const amt = Number(req.requestedAmount) || 0;
                      // Fix : si requestedAmount=0 et demande encore active,
                      // l'EPR a été créée avant que le budget soit connu.
                      // On affiche le montant actuel (depositAmount ou requestedAmount)
                      // avec une note "(recalculé)" pour indiquer la correction.
                      // getPaymentRequest v2 mettra à jour la DB quand le lien est ouvert.
                      const isPending = ['sent', 'viewed', 'draft'].includes(req.requestStatus);
                      const isDeposit = !req.requestType || req.requestType === 'deposit';
                      if (amt === 0 && isPending && isDeposit && depositAmount > 0) {
                        return (
                          <span>
                            {depositAmount.toFixed(2)} $ CAD
                            <span className="ml-1 text-xs text-amber-500 font-normal">(recalculé)</span>
                          </span>
                        );
                      }
                      return <>{amt.toFixed(2)} $ CAD</>;
                    })()}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <CreditCard className="w-3 h-3" />
                    {payerName || '(payeur inconnu)'}
                  </p>
                </div>
                <div className="text-xs text-gray-400 text-right">
                  {req.createdAt
                    ? new Date(req.createdAt).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
                    : '—'}
                  {req.expiresAt && (
                    <p className="text-gray-300">
                      exp. {new Date(req.expiresAt).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </div>
              </div>

              {req.messageToPayer && (
                <p className="text-xs text-gray-500 italic">"{req.messageToPayer}"</p>
              )}

              {['sent', 'viewed', 'draft'].includes(req.requestStatus) && req.secureToken && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => handleCopyLink(req)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    {copiedId === req.id
                      ? <><CheckCircle2 className="w-3 h-3 text-green-500" /> Copié !</>
                      : <><Copy className="w-3 h-3" /> Copier le lien</>}
                  </button>
                  <a href={paymentUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                  >
                    <ExternalLink className="w-3 h-3" /> Ouvrir
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}