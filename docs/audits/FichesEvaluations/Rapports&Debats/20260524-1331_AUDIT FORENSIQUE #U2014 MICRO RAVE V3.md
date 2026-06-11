AUDIT FORENSIQUE — MICRO RAVE V3
CELLULE D'INVESTIGATION DISTRIBUÉE
Base44 · 2026-05-24 13:31 EST
PÉRIMÈTRE D'AUDIT
Matériel disponible : createEngagement.js, pages/CreateEngagement.jsx, pages/EngagementDetail.jsx, pages/TalentCheckIn.jsx, pages/EventCompletion.jsx, schémas d'entités (Engagement, Event, LedgerRecord, SettlementInstruction, PolicyConfig, SessionPresence, SchedulerDueTask, etc.), App.jsx, structure globale.

Matériel indisponible : transitionEngagement, getEngagement, initiateDepositPayment, createSessionPresence, submitSOTSRating, stripeWebhookHandler, toute logique de garde côté backend.

================================================== POINT D'AUDIT #001
TITRE getEngagement — Fonction backend invoquée sans existence vérifiable

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [ZONE NOIRE]

EMPLACEMENT pages/EngagementDetail.jsx ligne 121, pages/TalentCheckIn.jsx ligne 58, pages/EventCompletion.jsx

OBSERVATION BRUTE

const res = await base44.functions.invoke('getEngagement', { engagementId });
Invoqué dans 3 pages distinctes. Non listé dans <existing_backend_functions> (qui ne liste que createEngagement et getPolicyConfig).

CE QUE LE SYSTÈME PRÉTEND Que cette fonction existe, retourne { ok, engagement }, et que les 3 surfaces s'appuient sur elle pour charger leurs données.

CE QUI EST RÉELLEMENT OBSERVABLE La fonction getEngagement n'est pas listée parmi les backend functions déployées. Son comportement, sa logique d'autorisation, et sa structure de retour sont entièrement inobservables.

CHAÎNE CAUSALE Invocations multiples dans l'UI ↓ Fonction absente du registre observable ↓ Invariant : toute surface affichant un engagement doit pouvoir le charger ↓ Rupture : les 3 pages rendent null ou affichent une erreur silencieuse ↓ Impact : EngagementDetail, TalentCheckIn, EventCompletion sont non-fonctionnelles en production

CONSÉQUENCE OPÉRATIONNELLE Les 3 pages critiques du MVP sont bloquées au chargement. Les champs engagement.cachetSigneCents, engagement.status, engagement.organizerUserId utilisés dans la logique d'autorisation et l'affichage financier ne sont jamais peuplés.

TYPE DE RISQUE Zone noire · Dysfonction silencieuse · MVP non-opérationnel

NIVEAU DE GRAVITÉ Bloquant. Le système ne peut pas exécuter son flux principal.

================================================== POINT D'AUDIT #002
TITRE transitionEngagement — Machine d'état invoquée sans implémentation observable

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [ABSENT]

EMPLACEMENT pages/EventCompletion.jsx lignes multiples

OBSERVATION BRUTE

await base44.functions.invoke('transitionEngagement', {
  engagementId,
  targetState: 'event_completed',
  actorUserId: user?.id,
  context: { confirmedByOrganizer: true, ... },
});
// puis encore :
targetState: 'sots_window_closed'
// puis encore :
targetState: 'contestation_window'
Trois appels distincts à transitionEngagement dans EventCompletion. Non listée dans les backend functions déployées.

CE QUE LE SYSTÈME PRÉTEND Une machine à 47 transitions (commentaire Engagement entity) est gouvernée par des guards (PlacementGuard, PresenceProofGuard, LedgerInvariantGuard, etc.) exécutés côté backend.

CE QUI EST RÉELLEMENT OBSERVABLE Aucun code de transitionEngagement n'est disponible. Les guards sont nommés dans les commentaires d'entités et dans les JSDoc des pages. Ils n'existent pas dans le matériel auditable.

CHAÎNE CAUSALE 47 transitions déclarées ↓ 0 transitions vérifiables ↓ Invariant : les guards doivent bloquer les transitions illégales ↓ Rupture : sans code observable, les guards sont des déclarations nominales ↓ Impact : n'importe quel appel à transitionEngagement avec n'importe quel targetState pourrait écrire directement en base si la fonction n'existe pas ou n'a pas de validation

CONSÉQUENCE OPÉRATIONNELLE L'intégrité de la machine d'état est entièrement non-vérifiable. Le statut Engagement.status pourrait être corrompu ou ignoré.

TYPE DE RISQUE Simulacre · Guards décoratifs · Corruption systémique possible

NIVEAU DE GRAVITÉ Critique structurel.

================================================== POINT D'AUDIT #003
TITRE initiateDepositPayment — Stripe Checkout sans implémentation observable

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [ABSENT]

EMPLACEMENT pages/EngagementDetail.jsx ligne 137

OBSERVATION BRUTE

const res = await base44.functions.invoke('initiateDepositPayment', {
  engagementId,
  payerUserId: user?.id,
  returnUrl: window.location.href,
});
if (!res?.data?.checkoutUrl) throw new Error(...);
window.location.href = res.data.checkoutUrl;
CE QUE LE SYSTÈME PRÉTEND Le bouton "Payer le dépôt" déclenche une session Stripe Checkout et redirige l'utilisateur.

CE QUI EST RÉELLEMENT OBSERVABLE La fonction n'existe pas dans le registre déployé. Le bouton est rendu sous condition canPay && isOrganizer — mais isOrganizer repose sur user?.id === engagement.organizerUserId, et engagement est chargé via getEngagement qui est elle-même absente (cf. #001).

CHAÎNE CAUSALE Bouton "Payer le dépôt" visible ↓ initiateDepositPayment absente ↓ getEngagement absente → engagement null → bouton jamais rendu ↓ Deux absences empilées neutralisent la fonctionnalité avant même l'appel Stripe ↓ Impact : le flux de paiement est doublement bloqué

CONSÉQUENCE OPÉRATIONNELLE Aucune transaction financière ne peut être initiée. Le flux économique central du système est inexistant au niveau backend.

TYPE DE RISQUE Absence fonctionnelle · MVP non-monétisable

NIVEAU DE GRAVITÉ Bloquant.

================================================== POINT D'AUDIT #004
TITRE createSessionPresence + submitSOTSRating — Fonctions absentes du registre

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [ABSENT]

EMPLACEMENT pages/TalentCheckIn.jsx ligne 95, pages/EventCompletion.jsx

OBSERVATION BRUTE

await base44.functions.invoke('createSessionPresence', { ... });
await base44.functions.invoke('submitSOTSRating', { ... });
CE QUI EST RÉELLEMENT OBSERVABLE Ni l'une ni l'autre ne figurent dans le registre. Le système possède les entités SessionPresence et SOTSSubmission mais aucune fonction pour les alimenter.

CONSÉQUENCE OPÉRATIONNELLE Le check-in talent échoue systématiquement au handleCheckIn. La notation SOTS ne peut pas être soumise. Le flux EventCompletion s'arrête à la première invocation backend.

TYPE DE RISQUE Absence fonctionnelle en cascade

NIVEAU DE GRAVITÉ Bloquant sur surfaces #3 et #4.

================================================== POINT D'AUDIT #005
TITRE Constante financière tauxPpm = 120000 hardcodée dans le backend

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [CONTRADICTOIRE]

EMPLACEMENT functions/createEngagement.js ligne 42

OBSERVATION BRUTE

// Calcul waterfall (taux Freemium par défaut 12% = 120000 PPM)
const tauxPpm = 120000;
CE QUE LE SYSTÈME PRÉTEND PolicyConfig est la "table de configuration souveraine" avec l'axiome "aucune constante financière dans le code" (description de l'entité PolicyConfig). getPolicyConfig existe comme fonction déployée.

CE QUI EST RÉELLEMENT OBSERVABLE Le taux de commission est hardcodé directement dans createEngagement.js. getPolicyConfig n'est pas appelé. La valeur tauxPpm est écrite dans le champ Engagement.tauxPpm comme si elle provenait du plan de l'organisateur, mais elle est fixe pour tous.

CHAÎNE CAUSALE PolicyConfig déclare souveraineté sur les constantes financières ↓ createEngagement ignore PolicyConfig et hardcode 12% ↓ Invariant : tout engagement doit calculer sa commission selon le plan memberships de l'organisateur ↓ Rupture : le taux est identique pour tous, indépendamment du plan MembershipPlan ↓ Impact : MembershipPlan (5 tiers) est inutilisé ; tous les engagements paient 12%

CONSÉQUENCE OPÉRATIONNELLE Le système de tiers (Freemium/Base/Pro/Studio/Fondateur) est décoratif. La différenciation financière par abonnement n'existe pas. UserMembership n'est jamais consulté.

TYPE DE RISQUE Double vérité · Simulacre · Dette latente

NIVEAU DE GRAVITÉ Élevé — produit une corruption silencieuse des montants sur tout engagement non-Freemium.

================================================== POINT D'AUDIT #006
TITRE depositCents : double signification mathématique incohérente

NIVEAU DE CERTITUDE [DÉMONTRÉ]

CLASSIFICATION [CONTRADICTOIRE]

EMPLACEMENT functions/createEngagement.js lignes 45-46, pages/EngagementDetail.jsx lignes 177-264

OBSERVATION BRUTE Backend :

const depositCents  = Math.floor(cachetSigneCents * 200000 / 1_000_000); // 20%
const balanceCents  = cachetSigneCents - depositCents;                    // 80% du cachet
Frontend :

const depositCents = engagement.depositAmountCents || 0;  // champ inexistant
// ...
{ label: 'Balance restante', value: cachetCents - depositCents }         // 80% du cachet
CE QUI EST RÉELLEMENT OBSERVABLE

Le backend stocke depositCents (20% du cachet) dans Engagement.depositCents.
Le frontend lit engagement.depositAmountCents — champ inexistant dans le schéma Engagement. Il vaut toujours 0.
Le waterfall frontend affiche donc dépôt = 0 $ et balance = 100% du cachet — chiffres faux.
La balanceCents backend = cachet − dépôt (80% du cachet), mais talentNetCents = cachet − commission (88%). Ces deux grandeurs ne sont pas réconciliées : balanceCents n'est pas le solde dû au talent.
CHAÎNE CAUSALE Backend écrit depositCents ↓ Frontend lit depositAmountCents (champ inexistant) ↓ Affichage dépôt = 0 $ systématiquement ↓ Le waterfall UI est structurellement faux dès qu'un dépôt existe ↓ Impact : information financière erronée présentée à l'organisateur

CONSÉQUENCE OPÉRATIONNELLE L'organisateur ne voit jamais le montant du dépôt correct dans l'UI détail. La divergence entre balanceCents (solde paiement) et talentNetCents (solde talent) n'est jamais expliquée ni réconciliée.

TYPE DE RISQUE Divergence runtime/UI · Double vérité financière

NIVEAU DE GRAVITÉ Élevé — affichage financier incorrect, confusion organisateur garantie.

================================================== POINT D'AUDIT #007
TITRE roleMetier hardcodé à 'DJ' pour tous les engagements

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [DÉCORATIF]

EMPLACEMENT functions/createEngagement.js ligne 71

OBSERVATION BRUTE

roleMetier: 'DJ',
CE QUE LE SYSTÈME PRÉTEND Le champ Engagement.roleMetier est décrit comme "DJ, photographe, MC, technicien, etc." — indiquant un champ variable.

CE QUI EST RÉELLEMENT OBSERVABLE Le formulaire CreateEngagement ne contient aucun champ pour saisir le rôle. La valeur est fixée à 'DJ' pour tout engagement créé.

CONSÉQUENCE OPÉRATIONNELLE Tout engagement, quel que soit le talent, est enregistré comme "DJ". Les métriques par rôle, les filtres, les règles métier différenciées par roleMetier sont inexploitables.

TYPE DE RISQUE Donnée corrompue systématiquement · Dette latente

================================================== POINT D'AUDIT #008
TITRE LedgerRecord — Double entrée déclarée, aucune écriture observable

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [DÉCORATIF]

EMPLACEMENT Schéma LedgerRecord, functions/createEngagement.js (intégralité)

OBSERVATION BRUTE Schéma LedgerRecord :

"description": "Écriture comptable append-only en double-entrée. LOI LEDGER-01/02."
"transactionGroupId": "INVARIANT : sum(DEBIT) = sum(CREDIT) pour chaque TXG-*"
createEngagement.js : aucun appel à base44.asServiceRole.entities.LedgerRecord.create().

CE QUE LE SYSTÈME PRÉTEND Toute transaction financière doit générer des écritures LedgerRecord équilibrées (DEBIT = CREDIT par TXG-*).

CE QUI EST RÉELLEMENT OBSERVABLE La création d'un engagement (événement financier de premier ordre) ne produit aucune écriture comptable. LedgerRecord n'est jamais alimenté par aucune fonction observable.

CHAÎNE CAUSALE Engagement créé avec cachet, commission, dépôt calculés ↓ Zéro écriture LedgerRecord ↓ Invariant LOI LEDGER-01 : tout mouvement financier doit être enregistré ↓ Rupture totale dès le premier engagement ↓ Impact : le grand livre est vide ; aucune réconciliation comptable possible

CONSÉQUENCE OPÉRATIONNELLE Le système comptable est entièrement fictif. Les audits financiers, rapports, et réconciliations sont impossibles. L'invariant sum(DEBIT)=sum(CREDIT) ne peut pas être vérifié car aucune écriture n'existe.

TYPE DE RISQUE Simulacre · Ledger non souverain · Corruption systémique

NIVEAU DE GRAVITÉ Critique structurel — si le système prétend à une comptabilité conforme, cette prétention est entièrement non-fondée.

================================================== POINT D'AUDIT #009
TITRE PresenceWindowGuard / PresenceProofGuard — Guards nommés sans implémentation observable

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [DÉCORATIF]

EMPLACEMENT Commentaires TalentCheckIn.jsx (lignes 6-9), EventCompletion.jsx (lignes 10-13), entité SessionPresence

OBSERVATION BRUTE

// → event_sealed → performed (via PresenceWindowGuard)
// → performed → event_completed (EventCompletionGuard)
// → contestation_window → payable (PresenceProofGuard)
CE QUI EST RÉELLEMENT OBSERVABLE Ces guards sont des noms dans des commentaires JSDoc. Aucun fichier backend correspondant n'est observable. Leur logique d'enforcement (vérification de SessionPresence avant autorisation de transition) est invérifiable.

CONSÉQUENCE OPÉRATIONNELLE Si transitionEngagement existe mais sans ces guards, n'importe quel acteur peut passer performed → event_completed → payable sans qu'aucune présence physique n'ait été enregistrée. Le payout serait déclenché sans preuve de prestation.

TYPE DE RISQUE Guards décoratifs · Bypass possible · Risque financier direct

NIVEAU DE GRAVITÉ Critique — risque de payout sans prestation dans un scénario de fraude.

================================================== POINT D'AUDIT #010
TITRE TalentCheckIn — Affirmation sans fondement

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [SIMULACRE]

EMPLACEMENT pages/TalentCheckIn.jsx ligne 257

OBSERVATION BRUTE

<div>Votre présence est enregistrée.</div>
CE QUI EST RÉELLEMENT OBSERVABLE La présence est enregistrée (si createSessionPresence existe) dans une base de données Base44. Aucune blockchain, aucune infrastructure distribuée, aucun registre immuable cryptographiquement attesté n'est observable dans le système.

CONSÉQUENCE OPÉRATIONNELLE Affirmation fausse présentée à l'utilisateur. Dans un contexte légal ou de litige, cette déclaration pourrait créer une attente contractuelle non-fondée.

TYPE DE RISQUE Simulacre · Risque légal

================================================== POINT D'AUDIT #011
TITRE SchedulerDueTask + SchedulerRun — Infrastructure de cron sans automation déployée

NIVEAU DE CERTITUDE [INFÉRÉ MINIMAL]

CLASSIFICATION [DÉCORATIF]

EMPLACEMENT Schémas SchedulerDueTask, SchedulerRun, pages/EventCompletion.jsx (référence à sots_window_closed automatique)

OBSERVATION BRUTE EventCompletion appelle manuellement transitionEngagement vers sots_window_closed et contestation_window dans la même séquence synchrone. Les entités SchedulerDueTask et SchedulerRun existent mais aucune automation listée n'invoque de scheduler backend.

CE QUE LE SYSTÈME PRÉTEND Les fenêtres SOTS et contestation ont des délais temporels automatiques gérés par un scheduler.

CE QUI EST RÉELLEMENT OBSERVABLE La page EventCompletion enchaîne les trois transitions immédiatement sans aucun délai, contournant tout scheduler. La fenêtre de contestation dure zéro secondes en pratique.

CONSÉQUENCE OPÉRATIONNELLE La "contestation_window" est une étape instantanée dans le flux actuel. Aucune protection temporelle réelle pour le talent. Le scheduler est une infrastructure déclarée sans exécution observable.

TYPE DE RISQUE Simulacre · Protection temporelle fictive · Risque talent

================================================== POINT D'AUDIT #012
TITRE organizerUserId transmis du frontend et utilisé sans vérification

NIVEAU DE CERTITUDE [OBSERVÉ]

CLASSIFICATION [DETTE LATENTE]

EMPLACEMENT functions/createEngagement.js lignes 21, 39

OBSERVATION BRUTE

const { organizerUserId, ... } = await req.json();
const actorId = organizerUserId || user.id;
CE QUE LE SYSTÈME PRÉTEND L'organisateur est l'utilisateur authentifié.

CE QUI EST RÉELLEMENT OBSERVABLE Si organizerUserId est fourni dans le payload, il remplace user.id. N'importe quel utilisateur authentifié peut créer un engagement au nom d'un autre utilisateur en fournissant un organizerUserId arbitraire.

CHAÎNE CAUSALE organizerUserId contrôlable par le client ↓ actorId = organizerUserId || user.id sans vérification d'égalité ↓ Engagement créé avec organizerUserId d'un tiers ↓ Impact : usurpation d'identité d'organisateur possible

CONSÉQUENCE OPÉRATIONNELLE Un utilisateur malveillant peut créer des engagements imputés à d'autres organisateurs, corrompre leurs historiques, et potentiellement déclencher des flux financiers en leur nom.

TYPE DE RISQUE Vulnérabilité d'autorisation · Usurpation

NIVEAU DE GRAVITÉ Élevé.

SYNTHÈSE FINALE
1. CE QUI EST RÉELLEMENT SOLIDE
[OBSERVÉ / EXÉCUTÉ]

createEngagement déployé et fonctionnel — crée Event + Engagement avec waterfall calculé.
getPolicyConfig déployé.
Schémas d'entités bien structurés, champs cohérents entre eux.
UI CreateEngagement fonctionnelle — formulaire, validation locale, aperçu waterfall.
Authentification Base44 vérifiée dans createEngagement (base44.auth.me()).
Structure de routage App.jsx cohérente avec les 4 surfaces déclarées.
2. CE QUI EST DÉCORATIF
LedgerRecord — schéma complet, jamais alimenté.
MembershipPlan / UserMembership — 5 tiers définis, jamais consultés.
PolicyConfig — souveraineté déclarée sur les constantes financières, contournée par hardcode.
SchedulerDueTask / SchedulerRun — infrastructure de tâches planifiées, sans automation observable.
SettlementInstruction — schéma payout, aucun mécanisme d'alimentation observable.
Guards nommés dans les commentaires (PlacementGuard, PresenceProofGuard, etc.) — non vérifiables.
3. CE QUI EST CONTRADICTOIRE
tauxPpm = 120000 hardcodé vs PolicyConfig souverain → double vérité financière.
depositCents (champ réel) vs depositAmountCents (champ lu en frontend, inexistant) → affichage faux.
balanceCents ≠ talentNetCents — deux grandeurs financières non réconciliées coexistent.
contestation_window : délai temporel déclaré vs transitions immédiates dans le code.
organizerUserId : "acteur = utilisateur authentifié" vs paramètre client-contrôlable.
4. CE QUI EST INVISIBLE OU NON AUDITABLE
transitionEngagement — logique complète, 47 transitions, tous les guards.
getEngagement — structure de réponse, filtrage, autorisation.
initiateDepositPayment — intégration Stripe, gestion des états Checkout.
createSessionPresence — validation GPS, persistance, réponse.
submitSOTSRating — logique de notation, consolidation.
Webhook Stripe — handler de paiement, transition deposit_pending → deposit_secured.
PayoutExecutor — mécanique d'exécution du payout talent.
5. DETTES LATENTES MAJEURES
Ledger vide — chaque engagement créé sans écriture comptable. À mesure que les engagements s'accumulent, la divergence entre état opérationnel et état comptable croît sans signal d'alerte.
roleMetier = 'DJ' universel — toutes les données historiques seront contaminées. Impossible à corriger rétroactivement sans migration.
organizerUserId injectable — devient exploitable dès que plusieurs utilisateurs accèdent au système.
Scheduler sans exécution — les fenêtres temporelles (SOTS, contestation) deviennent des étapes instantanées en production. Les protections temporelles du talent sont inexistantes.
Constante financière hardcodée — tout changement de taux nécessite un redéploiement. PolicyConfig est contourné dès le premier engagement.
6. ZONES MÉRITANT UN AUDIT VERTICAL APPROFONDI
Sous-système	Risque	Raison
transitionEngagement	Systémique	Cœur de la machine d'état, entièrement non-auditable
Webhook Stripe	Financier	Aucun handler observable, sécurité de signature invérifiable
PayoutExecutor	Financier	Aucune implémentation observable pour un flux irréversible
LedgerRecord	Comptable	Entité centrale vide — toute réconciliation future impossible
Guards (tous)	Intégrité	Nommés, documentés, non-vérifiables — risque de bypass
GPS check-in	Légal	Validation de distance venue non observable, "blockchain" fictive
VERDICT SYNTHÉTIQUE

Le système possède une architecture déclarative cohérente et un vocabulaire métier précis. La surface observable déployée (createEngagement) fonctionne. Les quatre surfaces UI sont structurellement correctes.

Le système ne peut pas exécuter son flux principal de bout en bout. Cinq des six fonctions backend nécessaires au MVP sont absentes du registre déployé. Le ledger comptable est vide. Les guards sont des noms. La fenêtre de contestation est instantanée. L'affichage financier du dépôt est structurellement faux.

La fiction architecturale est sophistiquée. Le système opérationnel est incomplet.
