━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 1 — TABLEAU DE BORD ACTUEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLAUSE DE COMPLÉTUDE (9 conditions · mettre à jour après chaque session)
─────────────────────────────────────────────────────────────────────
❌  1. Chemin nominal sans intervention manuelle
✅  2. Talent réel payé via Stripe Connect (264$, tr_1TaHDt2)
✅  3. Ledger à zéro cent (53 TXGs, DR=CR prouvé)
❌  4. ContractSnapshot WORM phases 1 et 2
❌  5. Présence prouvée GPS (distanceMeters null)
❌  6. SOTS dans ReputationLedger (0 records)
❌  7. Archivage WORM via garde (fait via bypass direct)
⬜  8. Zéro BugReplayRecord P0 non PASSED (entité non définie)
✅  9. GoNoGoDecisionRecord = GO (AdminAction en production)
COMPLÉTUDE : 3/9 VRAI · Ce prompt reste actif.
ÉTAT DES TÂCHES (mettre à jour après chaque tâche DONE)
─────────────────────────────────────────────────────────────────────
LÉGENDE : ✅ DONE · 🔶 EN COURS · ❌ OUVERT · ⬜ NON COMMENCÉ
PHASE 0 — DÉCISIONS (complété)
✅  D-001  Souveraineté : src/ fait loi, Base44 réaligné
PHASE 1 — PORTAGE CANONIQUE (prérequis de tout le reste)
❌  PORT-1  Convertir src/core/.js et src/services/.js → ESM
❌  PORT-2  Créer src/repositories/adapters/base44-adapter.ts
❌  PORT-3  Vérifier que transitionEngagement.ts s'importe dans Base44
PHASE 2 — FONDATIONS TECHNIQUES (parallélisables)
❌  1A-1   IDFactory Crockford (alphabet sans 0/O/I/1)
❌  1A-2   Checkpoint entity + seed CP-PLATEAU-0001 (geoLat/geoLng)
❌  1B-1   Schéma ContractSnapshot enrichi (champs CS1 + CS2)
❌  1B-2   CS1 créé à accepted (CS1-CREATION-01 PASSED)
❌  1B-3   CS2 créé à event_sealed (CS2-CREATION-01 PASSED)
PHASE 3 — RÉALIGNEMENT BASE44 (séquentiel après PHASE 1+2)
❌  2-1    Éliminer les 4 bypasses LOI TRANSITION-01
❌  2-2    GPS Haversine dans createSessionPresence
❌  2-3    AuditLogger branché (DataAccessLedgerEntry auto)
❌  2-4    WORM_STATES = 6 moments dans Base44 déployé
PHASE 4 — SOTS, SCHEDULER, UX (parallélisables)
❌  3-1    Runbook scheduler Event 1 (ou cron déployé)
❌  3-2    SOTS dry-run (1 REP-* en production)
❌  3-3    Bouton "Payer la balance" dans EngagementView
❌  3-4    Waterfall preview au taux réel (pas 12% hardcodé)
❌  3-5    5 plans D-027 seedés (Base, Pro, Studio, Fondateur)
PHASE 5 — VALIDATION FINALE
❌  4-1    Dry-run complet (7/9 Clause de Complétude VRAI)
❌  4-2    Pierre de Rosette Event 1 réel (9/9 VRAI)
COMPLÉTUDE TÂCHES : 1 / 21 DONE (D-001)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 2 — MARCHE À SUIVRE DÉTAILLÉE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
══════════════════════════════════════════════════════════════
PHASE 1 — PORTAGE CANONIQUE
Objectif : Rendre src/ importable depuis Base44 (Deno).
Prérequis de TOUT le reste. Sans ça, rien ne peut être réaligné.
Durée estimée : 1 session (4–8 heures).
══════════════════════════════════════════════════════════════
CONTEXTE TECHNIQUE :
Base44 (Deno) utilise déjà des imports ESM natifs :
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25'
Les fichiers src/*.js utilisent CommonJS (require/module.exports).
La conversion est mécanique et ne change pas la logique.
35 fichiers concernés. 9 guards nécessitent un adapteur repository.
─────────────────────────────────────────────────────
TÂCHE PORT-1 — CONVERTIR src/core/ ET src/services/ → ESM
─────────────────────────────────────────────────────
Périmètre : 35 fichiers .js dans src/core/ et src/services/
Transformation par fichier :
AVANT :
const IDFactory = require('./IDFactory');
module.exports = { transitionEngagement };
APRÈS :
import IDFactory from './IDFactory.ts';
export { transitionEngagement };
Renommer : *.js → *.ts (optionnel mais recommandé pour Deno)
Aucun changement de logique. Aucun test ne doit régresser.
Fichiers à convertir (par ordre de dépendance) :

src/core/IDFactory.js          → aucune dépendance (pur)
src/core/MoneyMath.js          → aucune dépendance (pur)
src/core/guards/*.js           → dépendent de IDFactory/MoneyMath
src/services/FinancialLedgerService.js
src/services/PayoutExecutor.js
src/services/SessionPresenceService.js
src/core/transitionEngagement.js → dépend de tous les guards

DONE QUAND : Tous les tests P0 existants passent après conversion.
cd src && node --experimental-vm-modules tests/p0/TRANSITION-01.js
doit donner 34/34 PASSED.
─────────────────────────────────────────────────────
TÂCHE PORT-2 — CRÉER src/repositories/adapters/base44-adapter.ts
─────────────────────────────────────────────────────
Problème : Les 9 guards qui ont besoin de repositories les reçoivent
via injection de dépendance (paramètre repositories). En tests,
les mocks fonctionnent. En Base44, le SDK (base44.entities.X) est
la source de persistance — mais il a une API différente de base44Post.
Solution : Créer un adapteur qui transforme l'API Base44 SDK en
l'interface attendue par les guards.
Fichier à créer : src/repositories/adapters/base44-adapter.ts
Contenu — une fonction qui prend base44 (le SDK injecté) et
retourne l'objet repositories attendu par transitionEngagement :
export function createBase44Repositories(base44) {
return {
engagements: {
findById: (id) => base44.entities.Engagement.filter({ systemId: id }),
updateStatus: () => { throw new Error('Interdit - utiliser transitionEngagement'); }
},
contractSnapshots: {
create: (data) => base44.entities.ContractSnapshot.create(data),
findByEngagementId: (id) => base44.entities.ContractSnapshot.filter({ engagementId: id })
},
ledgerRecords: {
append: (data) => base44.entities.LedgerRecord.create(data),
findByEngagementId: (id) => base44.entities.LedgerRecord.filter({ engagementId: id }),
findByTransactionGroupId: (txgId) => base44.entities.LedgerRecord.filter({ transactionGroupId: txgId })
},
admin: {
appendToDataAccessLedger: (data) => base44.entities.DataAccessLedgerEntry.create(data),
createAdminIncidentRecord: (data) => base44.entities.AdminIncidentRecord.create(data)
},
scheduler: {
createTask: (data) => base44.entities.SchedulerDueTask.create(data)
},
policyConfig: {
get: async (key) => {
const rows = await base44.entities.PolicyConfig.filter({ key });
return rows?.[0]?.value ?? null;
}
}
// Ajouter les autres interfaces au besoin
};
}
Note architecturale : updateStatus lance une Error — c'est intentionnel.
Rend la violation de LOI TRANSITION-01 impossible dans ce contexte.
DONE QUAND : Le fichier existe et est importable depuis une fonction Base44.
─────────────────────────────────────────────────────
TÂCHE PORT-3 — VÉRIFIER L'IMPORT DANS UNE FONCTION BASE44 DE TEST
─────────────────────────────────────────────────────
Créer une fonction Base44 de test minimale qui importe et appelle
le transitionEngagement canonique avec l'adapteur :
// test-import/entry.ts
import { transitionEngagement } from '../../../src/core/transitionEngagement.ts';
import { createBase44Repositories } from '../../../src/repositories/adapters/base44-adapter.ts';
export default async function handler(req, context) {
const { base44, auth } = context;
const repos = createBase44Repositories(base44);
// Appel canonique
const result = await transitionEngagement({ ... }, repos, { ... });
return result;
}
Si les imports fonctionnent → architecture validée.
DONE QUAND : La fonction de test se déploie sans erreur d'import.
══════════════════════════════════════════════════════════════
PHASE 2 — FONDATIONS TECHNIQUES (parallèles)
Objectif : Corriger les préconditions qui contaminent tous les domaines.
Durée estimée : 2–3 sessions.
Peut être répartie en deux pistes parallèles.
══════════════════════════════════════════════════════════════
─────────── PISTE A : IDFactory + Checkpoint ───────────
TÂCHE 1A-1 — IDFACTORY CROCKFORD
Modifier IDFactory.ts pour utiliser l'alphabet
ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (sans 0, O, I, 1).
Vérifier les exports CSV pour des IDs ambigus existants.
DONE : ADMIN-ABS-SYSTEMID PASSED + aucun new ID avec 0/O/I/1.
TÂCHE 1A-2 — CHECKPOINT ENTITY + SEED CP-PLATEAU-0001
Créer Checkpoint.jsonc dans Base44 :
systemId (CPT-), name, geoLat (float), geoLng (float),
address, city, isActive (boolean).
Ajouter checkpointId (nullable) à Event.jsonc.
Seeder CP-PLATEAU-0001 : "Le Trèfle Bar", Montréal, lat/lng réels.
DONE : CPT- en production avec coordonnées.
─────────── PISTE B : ContractSnapshot ───────────
TÂCHE 1B-1 — ENRICHIR ContractSnapshot.jsonc
Ajouter à l'entité Base44 :
Phase 1 (CS1, à accepted) :
cachetSigneCents, tauxPpm, commissionMrCents, talentNetCents,
depositCents, balanceCents, tierName, negotiationRoundsCount
Phase 2 (CS2, à event_sealed) :
cachetBrutFinalCents, stripeFeesEstimateCents, tpsCents,
tvqCents, sealedAt
Commun : engagementId, phase (1|2), createdAt, createdByTransition
DONE : Schéma déployé en production.
TÂCHE 1B-2 — CS1 À ACCEPTED
Dans transitionEngagement canonique (après PORT-1+2), à la transition
accepted : créer CS1 via repositories.contractSnapshots.create().
Ce code existe déjà dans SealingGuard.js — le vérifier et l'activer.
DONE : CS1-CREATION-01 test PASSED + 1 CS1-* en production.
TÂCHE 1B-3 — CS2 À EVENT_SEALED
À la transition event_sealed : créer CS2 avec snapshot financier complet.
Stocker cs2SystemId dans l'Engagement (nouveau champ).
DONE : CS2-CREATION-01 test PASSED + 1 CS2-* en production.
══════════════════════════════════════════════════════════════
PHASE 3 — RÉALIGNEMENT BASE44
Objectif : Chaque fonction Base44 devient un pur adapteur.
Prérequis : PHASE 1 (portage) terminée.
Durée estimée : 2–3 sessions (la plus longue phase).
══════════════════════════════════════════════════════════════
PRINCIPE D'EXÉCUTION : Pour chaque fonction Base44 à réaligner,
appliquer ce pattern exact :
AVANT (inline logic) :
export default async function handler(req, { base44, auth }) {
const eng = await base44.entities.Engagement.filter({...});
// 300 lignes de logique métier
await base44.entities.Engagement.update(eng.id, { status: 'deposit_secured' });
}
APRÈS (Règle 9 — pure adapter) :
import { transitionEngagement } from '../../../src/core/transitionEngagement.ts';
import { createBase44Repositories } from '../../../src/repositories/adapters/base44-adapter.ts';
export default async function handler(req, { base44, auth }) {
  const { engagementId, targetState } = await req.json();
  const me = auth.me();
  const repos = createBase44Repositories(base44);
  const eng = (await base44.entities.Engagement.filter({ systemId: engagementId }))[0];
  const result = await transitionEngagement(eng, repos, {
    actorId: me.id, actorRole: me.role, targetState
  });
  return new Response(JSON.stringify(result), { status: result.ok ? 200 : 422 });
}
─────────────────────────────────────────────────────
TÂCHE 2-1 — RÉALIGNER transitionEngagement/entry.ts
─────────────────────────────────────────────────────
C'est la tâche pivot. Toutes les autres en dépendent.
Avant : 255 lignes avec 15 transitions inline, 5 guards inline,
WORM_STATES = 3 états.
Après : ~30 lignes. Import de src/core/transitionEngagement.ts.
Adapteur Base44-natif. WORM = 6 moments. 47 transitions.
DONE : TRANSITION-01 34/34 PASSED après réalignement.
Plus aucune logique métier dans entry.ts.
─────────────────────────────────────────────────────
TÂCHE 2-2 — ÉLIMINER LES 4 BYPASSES LOI TRANSITION-01
─────────────────────────────────────────────────────
4 fonctions mutent Engagement.status directement :
createEngagement/entry.ts l.324
stripeWebhookHandler/entry.ts l.298
executePayoutTransfer/entry.ts l.343
recognizeRevenue/entry.ts l.174
Pour chacune, remplacer la mutation directe par un appel à
transitionEngagement() avec le bon context :
stripeWebhookHandler : deposit_pending → deposit_secured
→ transitionEngagement(eng, repos, { actorRole: 'system',
targetState: 'deposit_secured',
stripePaymentIntentId: pi.id })
executePayoutTransfer : n'a pas à changer le status directement.
→ Le status payable → settled est géré par transitionEngagement()
→ executePayoutTransfer ne fait QUE le Transfer Stripe
recognizeRevenue : idem, ne gère que la reconnaissance comptable.
→ La transition settled → archived passe par transitionEngagement()
Test de conformité :
grep -r "Engagement.update({.*status" codeBase44_v3/base44/functions/
→ doit retourner 0 résultat.
DONE : grep → 0 + TRANSITION-01 34/34 PASSED.
─────────────────────────────────────────────────────
TÂCHE 2-3 — GPS HAVERSINE DANS createSessionPresence
─────────────────────────────────────────────────────
Créer src/core/GeoMath.ts :
export function haversineMeters(lat1, lon1, lat2, lon2): number
(formule standard Haversine, retourne des mètres entiers)
Modifier createSessionPresence/entry.ts pour :
(1) Lire les coordonnées du lieu depuis Checkpoint (via checkpointId)
(2) Calculer la distance via GeoMath.haversineMeters()
(3) Stocker gpsDistanceMeters (int) dans SessionPresence
(4) Ajouter checkOutAt et finalDurationMinutes (appelés via nouveau
bouton "Check-out" dans TalentPresence.jsx)
DONE : GPS-DISTANCE-01 test PASSED + 1 SessionPresence avec
gpsDistanceMeters ≠ null en production.
─────────────────────────────────────────────────────
TÂCHE 2-4 — AUDITLOGGER AUTOMATIQUE (GUARD 5)
─────────────────────────────────────────────────────
Après réalignement de transitionEngagement/entry.ts, l'AuditLogger
du canonical transitionEngagement.ts est automatiquement actif
(il est le guard #5 dans la chaîne).
Il nécessite repos.admin.appendToDataAccessLedger — fourni par
l'adapteur Base44 créé en PORT-2.
Action : Vérifier que repos.admin est correctement passé.
DONE : Chaque transition génère automatiquement un DAL entry.
══════════════════════════════════════════════════════════════
PHASE 4 — SOTS, SCHEDULER, UX
Objectif : Fermer le cycle complet.
Durée estimée : 1–2 sessions.
Tout parallélisable.
══════════════════════════════════════════════════════════════
TÂCHE 3-1 — RUNBOOK SCHEDULER EVENT 1
Rédiger la procédure manuelle :
J+24h : déclencher event_completed → sots_window_closed
J+48h : déclencher sots_window_closed → contestation_window → payable
Format : checklist dans ce STATE.md, section RUNBOOK EVENT 1.
DONE : Checklist complète + fondateur confirme disponibilité J+24h.
TÂCHE 3-2 — SOTS DRY-RUN
Exécuter sur un engagement test (pas Event 1) :
submitSOTSRating → SOTSSubmission créé → ReputationLedger REP-* créé.
DONE : 1 REP-* en production.
TÂCHE 3-3 — BOUTON "PAYER LA BALANCE"
Dans EngagementView.jsx (état deposit_secured), ajouter un bouton
identique au bouton "Payer le dépôt" qui appelle initiateBalancePayment.
DONE : L'organisateur peut payer la balance via l'interface.
TÂCHE 3-4 — WATERFALL PREVIEW AU TAUX RÉEL
Dans EngagementForm.jsx, remplacer le tauxPpm=120000 hardcodé
par une lecture du UserMembership du talent sélectionné.
DONE : La preview affiche le bon taux pour chaque talent.
TÂCHE 3-5 — SEEDER LES 4 PLANS D-027
Ajouter Base (9%), Pro (6%), Studio (3.5%), Fondateur (5%)
dans MembershipPlan.
DONE : 5 plans en production.
══════════════════════════════════════════════════════════════
PHASE 5 — VALIDATION FINALE
══════════════════════════════════════════════════════════════
TÂCHE 4-1 — DRY-RUN COMPLET
Cycle complet sur un engagement test avant Event 1 :
créer → payer dépôt → sceller → check-in GPS → performed →
SOTS → contestation_window → payable → payout → archived
Checklist de validation :
□ CS1-* créé à accepted
□ CS2-* créé à event_sealed
□ SessionPresence avec gpsDistanceMeters ≠ null
□ SOTSSubmission + ReputationLedger REP-*
□ grep Engagement.update status → 0 résultat dans logs
□ DataAccessLedgerEntry à chaque transition
□ Ledger DR=CR équilibré
□ GoNoGo AdminAction créé avant archived
DONE : 7/9 Clause de Complétude VRAI.
TÂCHE 4-2 — PIERRE DE ROSETTE EVENT 1 RÉEL
DJ Alex + Le Trèfle CP-PLATEAU-0001 + payout Stripe Connect VERIFIED.
Sans intervention manuelle d'urgence.
DONE : 9/9 Clause de Complétude VRAI.
→ "100% complété — nous avons atteint notre objectif."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 3 — RUNBOOK EVENT 1 (à compléter en Phase 4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[ À remplir lors de la Tâche 3-1 ]
JOUR J — Pendant l'événement :
□ [heure] Talent check-in via TalentPresence.jsx
□ [heure] Vérifier SessionPresence.gpsDistanceMeters ≤ 500m
□ [heure] Déclencher performed après vérification
JOUR J+24H :
□ Vérifier que l'organisateur a soumis sa note SOTS
□ Si non : relancer l'organisateur
□ Déclencher event_completed → sots_window_closed
□ Vérifier SOTSScoreSnapshot créé
JOUR J+48H :
□ Fenêtre de contestation expirée
□ Déclencher contestation_window → payable
□ Vérifier PresenceProofGuard 11/11 conditions PASSED
□ Déclencher payable → settled (exécution payout automatique)
□ Vérifier Stripe Transfer créé
□ Créer AdminAction GO_NO_GO_DECISION
□ Déclencher settled → archived
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 4 — NOTES ARCHITECTURALES (faits, pas sujets de débat)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Node.js → ESM est une conversion mécanique (require → import).
Pas une réécriture. Pas une migration de runtime. 35 fichiers,
1 session, aucun risque de régression logique.
Deno importe directement les fichiers ESM locaux avec des chemins
relatifs. Confirmé : Base44 utilise déjà
import ... from 'npm:@base44/sdk'. La convention fonctionne.
60% du ledger actuel sont des corrections (86/143 records).
Ce ratio descend à 0% quand LOI TRANSITION-01 est respectée.
Les corrections passées restent en append-only — elles ne sont
pas supprimées, elles témoignent du pilote.
SoloFounderOverride dans le code déployé = bug P0, pas feature.
Les 5 AdminIncidentRecord SOLO_FOUNDER_OVERRIDE sur le même Transfer
sont la preuve que c'était un contournement d'architecture, pas une
exception métier légitime.
createEngagement saute proposed → negotiating → accepted → placed.
Ce raccourci élimine le Moment WORM 1 (CS1 à accepted) et la
transparence avant acceptation (OS §1.4). À corriger dans Phase 3.
README pointe vers OS V7. L'OS actuel est V15. Mettre à jour le
README après chaque session qui crée une décision D-XXX.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECTION 5 — COMMENT DÉMARRER LA PROCHAINE SESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Charger ce STATE.md en contexte.
Charger l'OS actuel (MICRORAVE_V3_OPERATING_SYSTEM_V15.md).
Charger les fichiers sources de la tâche à traiter.
L'IA doit annoncer : "Il reste [N] tâches ouvertes. La prochaine
selon la phase est PORT-1 (conversion ESM). On commence ?"
Chaque session commence par PORT-1 tant qu'elle n'est pas DONE.

ORDRE DE PRIORITÉ ABSOLU :
PORT-1 → PORT-2 → PORT-3 → (1A-1 ∥ 1A-2 ∥ 1B-1) → 1B-2 → 1B-3
→ 2-1 → 2-2 → 2-3 → 2-4 → (3-1 ∥ 3-2 ∥ 3-3 ∥ 3-4 ∥ 3-5)
→ 4-1 → 4-2
Symbole ∥ = en parallèle dans des sessions séparées si possible.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
