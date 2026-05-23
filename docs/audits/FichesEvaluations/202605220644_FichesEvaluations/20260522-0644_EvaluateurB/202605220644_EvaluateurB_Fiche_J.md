Le D-126 (composition des 20 premiers talents) n'est pas dans le plan court terme — c'est une cible commerciale pour la liquidité, pas un prérequis MVP Event 0.
J'ai assez d'éléments. Production de la fiche.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — J. ACTEURS ET ONBOARDING
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : EXPORT_BRUT (D-005 promesse talent, D-006 promesse organisateur, D-015 ontologie vendeur-courtier, D-016 hiérarchie Event→Lineup→Engagement, D-017 Checkpoint ad hoc lieux privés/virtuels, D-018 coffre-fort bancaire, D-027 plans Freemium/Base/Pro/Studio/Fondateur, D-046 et D-047 droits dispute par acteur, D-091 triptyque talent ↔ organisateur ↔ checkpoint, D-092 Checkpoint comportemental vs déclaratif, D-097 KYC Stripe Connect règle 5, D-105 10 rôles admin, D-126 composition 20 premiers talents), OS V15 §1.3 et §2.7.1, code src/services/StripeConnectService.js (258 l., 5 étapes onboarding), src/services/MembershipPlanService.js (113 l.), src/repositories/MembershipRepository.js (116 l.), src/repositories/index.js (l. 84-102 talentPaymentProfiles inline), src/core/IDFactory.js (préfixes User='USR', Talent='TAL', Checkpoint='CKP', EventLocation='EVL', TalentRolePreference='TRP'), scripts/seed-pilot-data.js (238 l., crée DJ Alex + Le Trèfle + Freemium + Engagement), scripts/run-j9-pilot.js (steps onboard + kyc), tests STRIPE-J8-01 (couvre KYC et PAYOUT_BLOCK_KYC).
Niveau de confiance : HAUTE sur le flux StripeConnect (5 étapes documentées et câblées) et le seedage SC-01 ; PARTIELLE sur la couverture des rôles canoniques (FOUNDER/admin non seedés) ; INFÉRENCE sur l'absence de UserRepository et CheckpointRepository (cf. Fiche H BLOQUANT).
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

Le talent DJ Alex existe avec un USR-* souverain — D-091 + D-015 (talent comme acteur du triptyque). Le User.systemId doit être généré par IDFactory.generate('User') avant insertion.
L'organisateur Le Trèfle existe avec un USR-* souverain — D-091 "l'organisateur crée le besoin". Même contrainte d'IDFactory.
Le TalentPaymentProfile de DJ Alex est créé et KYC VERIFIED — D-097 règle 5 : "Avant tout payout, KYC.status doit être VERIFIED." PayoutExecutor verrou 1 vérifie cette précondition. Flux : initiateTalentOnboarding → createOnboardingLink → DJ Alex complète Stripe Express → verifyKYCStatus → details_submitted=true + charges_enabled=true → kycStatus=VERIFIED + payoutsEnabled=true.
Le MembershipPlan Freemium existe avec commissionRatePpm=120000 — D-027 "Freemium : 12% commission = 120 000 ppm".
Un UserMembership actif lie DJ Alex au plan Freemium — status='active', commissionRatePpm dénormalisé pour résolution rapide. D-027.
L'Engagement est créé en état proposed avec tous les champs canoniques : talentUserId, organizerUserId, roleMetier, cachetSigneCents, prixVenduClientCents, depositCents, tauxPpm, currency='cad'. D-019-A initial state.
MembershipPlanService.getTauxPpmForUser() résout fail-closed le taux — D-027 + D-064 : pas de fallback silencieux, pas de float (entier ppm strict).
Pour Pierre de Rosette nominale (SC-01) : 2 utilisateurs (talent + organisateur), 1 MembershipPlan, 1 UserMembership, 1 Event, 1 Engagement, 1 TalentPaymentProfile KYC VERIFIED. Pas de Checkpoint formel requis (le venue est un string libre dans l'Event — voir LACUNE).
D-126 composition 20 premiers talents — règle de gouvernance commerciale (10 DJs / 3 photographes-vidéastes / 2 VJ / 2 MC-hôtes / 2 techniciens / 1 hybride). N'est pas un prérequis MVP — c'est la cible commerciale pour atteindre la liquidité minimale (D-124 phase 3, 15-30 events). Pour Pierre de Rosette : 1 talent suffit.
D-091 triptyque représenté ontologiquement : talent ↔ organisateur/payeur ↔ checkpoint. Pour SC-01, le triptyque se compresse en deux acteurs (organisateur = payeur ; checkpoint absorbé dans Event.venue).

Ce domaine bloque tout le reste si :

Le TalentPaymentProfile.kycStatus !== 'VERIFIED' au moment du payout → PAYOUT_BLOCK_KYC (D-097 règle 5, vérifié par PayoutExecutor.executePayout l. 95-105).
payoutsEnabled !== true → blocage. Test STRIPE-J8-01 couvre cette condition explicitement.
Le MembershipPlan actif est absent → MEMBERSHIP_PLAN_ERROR (MembershipPlanService.getTauxPpmForUser fail-closed).
Le USR-* du talent ou de l'organisateur est manquant ou mal formé → toute la chaîne tombe (cf. Fiche H — IDFactory USR-* est prérequis).

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

StripeConnectService.js (258 l.) — orchestration complète onboarding :

Étape 1 initiateTalentOnboarding() (l. 51-93) — création Stripe Express + persistance TalentPaymentProfile {kycStatus: 'PENDING'}. Idempotency : si profile existe déjà avec stripeAccountId, retourne {alreadyOnboarded: true} sans recréer.
Étape 2 createOnboardingLink() (l. 106-129) — génère URL Stripe expirant ~10 min. Commentaire l. 97 : "Ne jamais persister l'URL." Conforme D-097 règle 9 "Aucune clé prod dans logs".
Étape 3 refreshOnboardingLink() (l. 135-156) — type='account_update' pour relance.
Étape 4 verifyKYCStatus() (l. 177-222) — dérivation 4-états canoniques :

details_submitted=false → PENDING
details_submitted=true + charges_enabled=false → IN_REVIEW
details_submitted=true + charges_enabled=true + payouts_enabled=false → RESTRICTED
tout VERIFIED → VERIFIED


Étape 5 getTalentPaymentProfile() (l. 233-249) — utilisé par PayoutExecutor avant tout Transfer (PayoutExecutor verrou 1, Fiche C).


KYC_STATUS enum exhaustif : 4 valeurs strict (PENDING, IN_REVIEW, VERIFIED, RESTRICTED). Pas de string libre.
MembershipPlanService.js (113 l.) :

getTauxPpmForUser({userId, repositories}) fail-closed : userId obligatoire (l. 49-54), repositories.membership obligatoire (l. 55-60), plan actif obligatoire (l. 64-70), commissionRatePpm entier ∈ [0, 1 000 000] strict (l. 74-87). Trois conditions de blocage explicites, message d'erreur référant à D-027.
getActivePlanForUser() — wrapper pour accéder au plan complet (nom, tier, etc.).


MembershipRepository.js (116 l.) — pattern résolution :

findActiveByUserId(userId) filtre UserMembership par userId + status='active'.
Optimisation : si commissionRatePpm est dénormalisé directement sur UserMembership (l. 75-77), retourne immédiatement. Sinon résout via findPlanById(planId).
Cohérent avec D-027 + D-128 (interface portable).


talentPaymentProfiles inline dans src/repositories/index.js (l. 84-102) :

findByTalentUserId(talentUserId) requête entité Base44 TalentPaymentProfile.
create(data) et update(base44Id, data) câblés. Pas d'upsert() exposé directement — c'est StripeConnectService qui choisit create ou update selon l'existence.
Note : sub-objet inline, pas un fichier .js séparé — diffère du pattern des autres repositories (par exemple ContractSnapshotRepository.js). Choix architectural : la séparation interface/adapter n'est pas appliquée pour TalentPaymentProfile.


scripts/seed-pilot-data.js (238 l.) — idempotent, crée SC-01 complet :

DJ Alex (USR-DJALE-*) avec role: 'talent', email = dj.alex.pilot@microrave.ca.
Bar Le Trèfle (USR-TREFLE-*) avec role: 'organisateur', email = contact.pilot@letrefle.ca.
MembershipPlan Freemium : tier='A', commissionRatePpm=120000.
UserMembership DJ Alex → Freemium, status='active', commissionRatePpm=120000 (dénormalisé).
Event SC-01 : EVT-PILOT-*, venue='Bar Le Trèfle, Montréal', scheduledStartAt = J+7, status='draft'.
Engagement ENG-PILOT-* : roleMetier='DJ', cachetSigneCents=20000 (200$), tauxPpm=120000, prixVenduClientCents=30000 (300$), depositCents=6000 (60$), currency='cad', status='proposed'.
Persistance des IDs dans .pilot-ids.json pour run-j9-pilot.js.


run-j9-pilot.js flux complet : --step=onboard (initiateTalentOnboarding + createOnboardingLink → URL Stripe à ouvrir manuellement) → --step=kyc (verifyKYCStatus après que DJ Alex a complété Stripe) → --step=settle (création SettlementInstruction) → --step=payout (exécution 6 verrous D-101).
Tests P0 STRIPE-J8-01 (19/19 PASSED) couvrent la chaîne onboarding/KYC :

T-12 : KYC VERIFIED après webhook account.updated.
PAYOUT_BLOCK_KYC explicite (l. 267 du test) : tentative payout avec kycStatus !== 'VERIFIED' → bloqué fail-closed.
9 sub-tests utilisent des stripeAccountId: 'acct_VERIFIED' pour simuler le talent OK.


PaymentRepository.payoutBlocked codes définis : PAYOUT_BLOCK_KYC, PAYOUT_BLOCK_RESTRICTED. Conformes D-097 règle 5.
Repository membership exposé dans src/repositories/index.js (l. 121). Câblé.
Préfixes IDFactory enregistrés : User='USR', Talent='TAL', Checkpoint='CKP', EventLocation='EVL', TalentRolePreference='TRP'. Les préfixes sont prêts mais seul USR est effectivement utilisé pour SC-01.

Ce qui vient de V1 et est encore actif :

Probable existence pré-V3 de comptes utilisateurs V1 (DJ Alex potentiellement déjà inscrit microrave.ca) — à valider hors archive. Si oui, seed-pilot-data.js créera un nouveau User V3 avec un nouveau systemId, dissocié du V1 — risque de doublon utilisateur. Le commentaire seed-pilot-data parle de IDFactory.generate('User') sans réutiliser un id pré-existant. À vérifier opérationnellement.
Identité de marque V1 : DJ Alex connu de la communauté, organisateur Le Trèfle reconnu localement. Acquis : adoption naturelle, pas de recrutement pur. Pertinent pour la sélection des 20 premiers talents (D-126).

Ce qui vient de V2 et a survécu :

Rien. Onboarding V3 est entièrement nouveau (Stripe Connect Express n'existait pas comme fondation V2).

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

Le KYC effectif de DJ Alex doit avoir été complété sur le portail Stripe — seed-pilot-data.js crée juste l'utilisateur. run-j9-pilot.js --step=onboard génère l'URL. DJ Alex doit cliquer le lien, remplir le formulaire Stripe Express (informations personnelles, IBAN/compte bancaire, vérification d'identité) — ces étapes humaines ne sont pas dans le code. Pour la première transaction Pierre de Rosette : prérequis opérationnel hors-code obligatoire, à valider avant tout dépôt. Si DJ Alex n'a pas complété Stripe, verifyKYCStatus retournera PENDING ou IN_REVIEW → PAYOUT_BLOCK_KYC strict → pas de payout.

DÉGRADANT (réduit la qualité, n'empêche pas) :

UserRepository absent — Fiche H BLOQUANT. La gestion User est dispersée dans seed-pilot-data.js (qui POST directement /entities/User). Pour SC-01, c'est suffisant (deux utilisateurs pré-seedés). Pour scale : nécessaire. Source : ls src/repositories/ → pas de UserRepository.js.
CheckpointRepository absent — cascade depuis Fiche D. Pas de coordonnées GPS persistées du lieu. Pour SC-01 nominal : le venue est un string Event (l. 180 seed). Pour le calcul gpsDistanceMeters du check-in talent : aucune source de coordonnées disponible. Le calcul, si fait, doit récupérer les coordonnées d'ailleurs (Base44 entité non auditée, ou Google Maps API, ou hardcoded). À valider.
TalentRolePreference enregistré comme préfixe TRP mais aucun service ne le crée ou ne le lit. Source : grep -rnE "TalentRolePreference" src/ → seule occurrence dans IDFactory.PREFIXES. Pour SC-01, DJ Alex a roleMetier='DJ' directement sur l'Engagement (pas de préférence multi-rôles). Mais pour D-126 (talent hybride DJ+photo), le mécanisme manque. Hors scope SC-01.
Aucun Checkpoint ou EventLocation formel n'est créé pour SC-01. Le venue est un string libre dans Event. D-091 "Le checkpoint est comme un listing Airbnb, mais pour la performance événementielle" — non incarné en code. Pour DJ Alex au Trèfle : tolérable (lieu unique, contractualisation hors plateforme). Pour scale + matching automatique D-124 : nécessaire.
Aucun payeur distinct de l'organisateur. seed-pilot-data.js crée seulement talent et organisateur — implicitement, organisateur = payeur. Pour D-091 "organisateur/payeur" (les deux peuvent diverger) : non couvert. Pour SC-01 : OK (Le Trèfle paye lui-même). Pour scale (agence paye pour organisateur) : nécessaire.
Aucun FOUNDER ou rôle admin seedé. Les rôles canoniques D-105 (10 rôles, dont FOUNDER niveau 5) ne sont pas créés par le script. Pour SC-01, l'invocation de transitionEngagement(actor='USR-FOUNDER-XYZ') (pour des transitions admin) requiert un USR-* existant correspondant. À créer manuellement avant Event 0.
stripeConnect repository ou wrapper non distinct de StripeAdapter. StripeConnectService appelle directement StripeAdapter (le wrapper Stripe générique). Cohérent architecturalement, mais signifie qu'il n'y a pas d'abstraction propre pour migrer vers un autre KYC provider (Plaid, Ondato, Persona) — couplage Stripe Connect strict. Acceptable MVP.
PILOT_TALENT_EMAIL par défaut dj.alex.pilot@microrave.ca — adresse mail qui doit exister réellement pour que Stripe envoie les emails KYC. À valider opérationnellement.

REPORTABLE (peut attendre l'événement 2+) :

D-126 composition 20 premiers talents : 10 DJs / 3 photographes-vidéastes / 2 VJ / 2 MC-hôtes / 2 techniciens / 1 hybride. Pour Event 0 / Pierre de Rosette : 1 talent suffit (D-122 séquence). Cible commerciale liquidité, hors MVP V3.0.
Talent (préfixe TAL) comme entité distincte de User : User avec role='talent' suffit MVP. Hors scope.
Onboarding organisateur (KYC pour recevoir des refunds ? Pour identifier le payeur ?) : non documenté dans l'OS — l'organisateur paye via PaymentIntent, donc Stripe traite les KYC payeur côté carte. Pas de Stripe Connect côté organisateur en MVP.
Onboarding vendeur (D-015 ClientActivation, ResidualCommission) : entièrement hors MVP V3.0 (D-119).
PortfolioTransfer, SellerPortfolio : doctrine D-015 ratifiée mais hors MVP.
Email/SMS/notifications onboarding : hors archive, probablement délégué à Stripe (emails automatiques de Stripe Express).
Profil utilisateur public (page talent profile, bio, portfolio) : couche UX, hors archive V3 (Fiche I).
Following mutuel D-023 (visibilité events PRIVÉ) : doctrine ratifiée, non câblée — hors MVP nominal.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — quatre INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

DJ Alex est-il un compte V1 pré-existant ou un nouveau compte V3 ? seed-pilot-data.js génère un nouveau USR-* via IDFactory.generate('User') — donc nouveau compte côté V3, dissocié du V1. INFÉRENCE : si DJ Alex existe déjà sur microrave.ca avec un compte V1, il aura deux comptes (V1 et V3) — l'expérience utilisateur sera incohérente (où se connecte-t-il ? L'historique V1 est-il importé ?). Soit (a) seed-pilot-data.js doit accepter un V1 user-id existant en input ; soit (b) on accepte le doublon et on documente la rupture. À valider. Pour Pierre de Rosette pilote (un talent connu de fond), le founder peut gérer la dissonance à la main, mais pour scale c'est problématique.
Quelle entité authentifie DJ Alex au moment où il clique le bouton "Accepter" / "Je suis arrivé" ? Le V3 reçoit un actor: 'USR-DJALE-*' en input de transitionEngagement() (Fiche G INFÉRENCE 1). INFÉRENCE : l'authentification est gérée par Base44 (auth UI native) ou par une couche front sur microrave.ca avec session/JWT. Aucun lien démontré entre l'identité Stripe Connect (stripeAccountId) et l'identité Micro Rave (USR-*) — sauf via le talentUserId champ sur TalentPaymentProfile. Si DJ Alex ouvre son onboarding Stripe avec un email différent de celui dans son User V3, cela peut créer une dissociation silencieuse. À valider — politique d'unicité email-stripeAccount.
Le MembershipPlan Freemium est-il un produit Stripe (subscription) ou juste une référence en base ? D-027 dit "Memberships SaaS — réévaluer V3.1" (donc pas de SaaS facturé MVP). Mais MembershipPlanService lit commissionRatePpm depuis UserMembership — c'est une référence métier, pas un produit Stripe payant. INFÉRENCE : Freemium est gratuit, pas de paiement récurrent associé. DJ Alex est sur Freemium par défaut sans rien faire. À valider — sinon il y a une confusion possible entre "Freemium gratuit en MVP" et "Freemium payant V3.1".
Bar Le Trèfle (organisateur) doit-il avoir un TalentPaymentProfile ou un équivalent pour recevoir un refund éventuel ? Si l'event est annulé J-7 (LOI ANNULATION-02) → refund vers le payeur via Stripe Refund. Le refund retourne au moyen de paiement utilisé (carte bancaire de Le Trèfle), pas vers un Stripe Connect account. Donc pas besoin de KYC organisateur. Mais pour SC-09 voies B et C (refunds post-event) — D-046 — c'est plus complexe. INFÉRENCE : pour Pierre de Rosette nominale (pas de refund attendu), non nécessaire. À valider que cette branche est volontairement non couverte MVP.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : possible base utilisateur existante sur microrave.ca avec DJ Alex inscrit et un organisateur Le Trèfle potentiellement existant. C'est à la fois un acquis (relations établies, confiance préexistante, pas de recrutement à froid) et une dette (deux systèmes utilisateurs V1 et V3 potentiellement en parallèle, sauf import explicite documenté). Pour Pierre de Rosette pilote (un talent, un organisateur), gérable à la main. À standardiser avant scale.
De V2 : rien d'opérationnel. V2 n'a jamais déployé d'onboarding Stripe Connect — c'est V3 native.
De l'OS V3 lui-même : doctrine acteurs étalée sur de nombreuses décisions (D-005, D-006, D-015, D-016, D-017, D-018, D-027, D-091, D-092, D-105, D-126). Le code implémente le minimum pour SC-01 (deux utilisateurs, un plan, un onboarding Stripe). C'est une simplification volontaire — la complexité acteurs (vendeur, payeur distinct, checkpoint reconnu, délégué sur place, TalentRolePreference) est différée. C'est une dette qui accélère SC-01 mais complique le scale : chaque ajout de rôle nécessitera de revenir sur les services et tests.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Exécuter seed-pilot-data.js puis run-j9-pilot.js --step=onboard pour générer l'URL Stripe Connect, faire compléter à DJ Alex en personne le formulaire KYC Stripe Express (informations bancaires + vérification d'identité), exécuter run-j9-pilot.js --step=kyc pour confirmer VERIFIED + payouts_enabled=true, et obtenir validation fondateur sur les quatre INFÉRENCES (compte V1 vs V3, authentification, Freemium MVP gratuit, KYC organisateur non requis).
──────────────────────────────────────────────────
6. STATUT FINAL
☒ PRÊT SOUS CONDITIONS →
Conditions :

DJ Alex complète effectivement son onboarding Stripe Express (action humaine hors-code) jusqu'à kycStatus=VERIFIED + payoutsEnabled=true. Sans cette étape, Pierre de Rosette est strictement bloquée par PayoutExecutor verrou 1 (PAYOUT_BLOCK_KYC).
seed-pilot-data.js est exécuté sur la base Base44 cible pour créer les deux utilisateurs et le MembershipPlan Freemium.
Pour la première transaction, l'absence de Checkpoint formel et de TalentRolePreference est acceptée (SC-01 mono-rôle, lieu unique connu hors plateforme).
Compte V1 de DJ Alex est ignoré ou réconcilié manuellement par le fondateur — pas de mécanisme automatique d'unification V1/V3 utilisateurs.

Décomposition de l'estimation :

✅ StripeConnectService (5 étapes, KYC 4-états, idempotency, fail-closed) : 100 %
✅ MembershipPlanService (fail-closed, PPM strict, plans D-027 canoniques) : 100 %
✅ MembershipRepository (interface portable) : 100 %
✅ talentPaymentProfiles inline dans index.js (find / create / update) : 100 %
✅ seed-pilot-data.js idempotent, complet pour SC-01 : 100 %
✅ run-j9-pilot.js --step=onboard / --step=kyc opérationnel : 100 %
✅ Tests STRIPE-J8-01 couvrent KYC + PAYOUT_BLOCK_KYC : 100 %
❌ KYC humain de DJ Alex effectivement complété : 0 % (étape opérationnelle hors-code)
❌ UserRepository séparé de seed-pilot-data : 0 % (cascade Fiche H)
❌ CheckpointRepository + coordonnées GPS lieu : 0 % (cascade Fiche D + Fiche H)
❌ TalentRolePreference : 0 % (préfixe réservé, non implémenté)
❌ Rôle FOUNDER seedé : 0 % (à créer manuellement)
⚠ Réconciliation comptes V1 ↔ V3 : non-évaluable (hors archive)

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine A (Ontologie) : la transition proposed → negotiating exige talentUserId, organizerUserId, roleMetier (MissionConversionGuard.validateNegotiationOpening l. 86-92). Sans DJ Alex et Le Trèfle seedés : la machine d'état ne démarre pas. Source : MissionConversionGuard.js.
Domaine B (Finance et ledger) : la commission Micro Rave dépend du tauxPpm résolu via MembershipPlanService.getTauxPpmForUser() à partir du UserMembership actif de DJ Alex. Sans UserMembership : MEMBERSHIP_PLAN_ERROR fail-closed → pas de ContractSnapshot V1 → pas d'engagement valide. Source : MembershipPlanService.js l. 64-70.
Domaine C (Stripe et paiements) : StripeConnectService produit le stripeAccountId requis par PayoutExecutor.executePayout() pour créer le Transfer. Verrou 1 KYC bloque tout payout sans kycStatus='VERIFIED'. Source : Fiche C STRIPE-J8-01 T-12 PAYOUT_BLOCK_KYC.
Domaine D (Présence) : SessionPresenceService.create() exige talentUserId, engagementId. Sans User et Engagement créés : check-in impossible. Indirectement : sans Checkpoint avec GPS, calcul gpsDistanceMeters impossible — cascade vers Fiche D BLOQUANT.
Domaine E (SOTS) : SOTSSubmissionService.submit() exige submittedBy (USR-*) et la matrice D-078 dépend du rôle du noteur. Sans rôles propres en place : le service accepte mais ne valide pas. Cf. Fiche E DÉGRADANT.
Domaine F (Scheduler) : SchedulerService utilise actor='USR-SYSTEM-SCHED01' (acteur souverain virtuel non seedé). Tolérable : c'est juste une string traçable, pas un User réel.
Domaine G (Admin et sécurité) : D-105 10 rôles canoniques — Fiche G DÉGRADANT : seuls 'admin' et 'FOUNDER' apparaissent dans le code. Sans FOUNDER seedé, SOLO_FOUNDER_OVERRIDE est une string magique sans backing User. Cf. Fiche G INFÉRENCE 1.
Domaine I (UX et vérité perçue) : D-005 "Ce que tu acceptes est transparent. Tu vois exactement ce que tu recevras avant d'accepter" — l'UX D-024 (ventilation) est destinée au User talent, dont l'identité doit être connue côté UI. Sans onboarding talent : pas d'UX talent.
→ INFÉRENCE non documentée explicitement dans l'OS : le domaine J est le point d'entrée temporel de toute la chaîne. Sans DJ Alex inscrit + KYC VERIFIED, aucune autre fiche n'a de raison d'être évaluée pour Pierre de Rosette. C'est le seul domaine où une action humaine non-codable (DJ Alex remplit Stripe) est strictement bloquante. À valider — le statut "PRÊT SOUS CONDITIONS" repose sur le geste opérationnel de finalisation KYC. C'est moins une dépendance code-vers-code qu'une dépendance code-vers-humain.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — J. ACTEURS ET ONBOARDING
Fiche conservée pour le Prompt de Synthèse.