━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — J. ACTEURS ET ONBOARDING
(profils, KYC Stripe, TalentRolePreference, Checkpoint)

Date d'évaluation : 22 mai 2026 07:17 EST
Par Claude Sonnet 4.6
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-007, D-008, D-017, D-027, D-091, D-092, D-097,
     D-120-A roleMetier/lobbyStatus)
  • src/repositories/MembershipRepository.js
  • src/services/MembershipPlanService.js
  • src/services/StripeConnectService.js (relu fiche C)
  • src/repositories/index.js (talentPaymentProfiles)
  • scripts/seed-pilot-data.js
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md
    §1.2 + §1.3
  • tests/p0/MEMBERSHIP-PLAN-01.js
  • tests/p0/MISSIONCONVERSION-01.js (head)

Niveau de confiance : HAUTE pour le plan membership et KYC
  (service + repository + test PASSED présents).
  HAUTE pour seed-pilot-data.js (script complet et idempotent
  pour créer DJ Alex, Le Trèfle, Freemium, UserMembership,
  Event, Engagement pilotes).
  PARTIELLE pour TalentRolePreference (préfixe TRP dans
  IDFactory, aucun service ou repository spécifique visible).
  INFÉRENCE pour Checkpoint (D-091/092 validés en doctrine,
  aucune entité Checkpoint visible dans le code soumis).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- DJ Alex possède un compte User avec systemId USR-* et
  un UserMembership actif résolvant vers MembershipPlan
  Freemium (commissionRatePpm = 120 000).
  Source : OS V15 D-027 — *"Chercher un UserMembership
  actif → utiliser son commissionRateSnapshot."* Plan
  Implantation §1.2 — BLOQUANT-J1.

- DJ Alex possède un TalentPaymentProfile avec
  kycStatus = VERIFIED et un stripeAccountId valide.
  PayoutExecutor Verrou 4 l'exige avant tout Transfer.
  Source : OS V15 D-097 règle 5. Plan Implantation §1.3.

- Bar Le Trèfle possède un compte User avec systemId USR-*
  et le rôle organisateur — pour créer l'Event et le
  Lineup pilote.
  Source : OS V15 §1.1 triptyque talent ↔ organisateur/
  payeur ↔ lieu.

- L'Event pilote et l'Engagement pilote sont créés en base
  avec leurs systemIds souverains (EVT-*, ENG-*).
  Source : OS V15 §2.2 Engagement comme atome + D-127.

Ce domaine bloque tout le reste si :

- commissionRatePpm hardcodé dans l'appelant au lieu d'être
  résolu depuis MembershipPlan : violation D-027, risque de
  mauvaise commission appliquée sur le paiement réel.
  Source : Plan Implantation §1.2 — *"L'appelant doit 'savoir'
  que Freemium = 120 000 ppm — valeur hardcodée implicite,
  violant D-027."*

- KYC DJ Alex = PENDING : PayoutExecutor.Verrou4 bloque,
  payable→settled impossible, payout impossible.
  Source : Plan Implantation §1.3.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- MembershipPlanService : complet (revu fiche B). getTaux-
  PpmForUser() résout le taux depuis repositories.membership
  (jamais hardcodé), fail-closed si plan absent ou taux
  invalide (float ou > 1 000 000). Les 5 plans canoniques
  D-027 sont documentés en commentaire.
  Test MEMBERSHIP-PLAN-01 : 6 cas couverts, PASSED.
  Source : MembershipPlanService.js + MEMBERSHIP-PLAN-01.js.

- MembershipRepository : présent. findActiveByUserId() avec
  résolution en deux couches (UserMembership.commissionRate-
  Ppm dénormalisé ou jointure via planId). findPlanById()
  pour résolution secondaire.
  Source : MembershipRepository.js.

- StripeConnectService : complet (revu fiche C). Flux KYC
  en 5 étapes : initiateTalentOnboarding() idempotent,
  createOnboardingLink(), refreshOnboardingLink(), verify-
  KYCStatus() (dérivation depuis flags Stripe), get-
  TalentPaymentProfile() (utilisé par PayoutExecutor).
  Source : StripeConnectService.js.

- talentPaymentProfiles dans repositories/index.js : présent
  (findByTalentUserId, create, update). Trois lacunes
  identifiées en fiche C (findByStripeAccountId manquant,
  upsert manquant) — mais findByTalentUserId suffit pour
  PayoutExecutor Verrou 4.
  Source : src/repositories/index.js L.83–99.

- seed-pilot-data.js : script complet et idempotent.
  Crée en base (si absent) : User DJ Alex (USR-DJALE-*),
  User Bar Le Trèfle (USR-TREFLE-*), MembershipPlan
  Freemium (commissionRatePpm=120000), UserMembership DJ
  Alex Freemium (status=active, commissionRatePpm
  dénormalisé), Event pilote (EVT-PILOT-*), Engagement
  pilote (ENG-PILOT-*). Persiste les IDs dans .pilot-ids.json
  pour run-j9-pilot.js.
  Source : seed-pilot-data.js — liste complète des 6 étapes.

- run-j9-pilot.js : script pilote J9 couvrant les étapes
  onboard (création compte Stripe Connect), kyc (vérification
  KYCStatus), payout (exécution Transfer Stripe test).
  Source : run-j9-pilot.js (revu fiche C).

- MissionConversionGuard : dispatche correctement sur
  roleMetier (DJ pour DJ Alex), valide le tauxPpm reçu
  via context, construit ContractSnapshot phase 1.
  Test MISSIONCONVERSION-01 PASSED (16/16 selon Plan).
  Source : MISSIONCONVERSION-01.js head + Plan Implantation.

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : DJ Alex et Bar Le Trèfle ont potentiellement
  des comptes sur microrave.ca (V1). Ces comptes utilisent
  les IDs Base44 V1, non les systemIds V3. Le script
  seed-pilot-data.js crée de nouveaux objets V3 souverains
  — il ne migre pas les données V1. Les deux systèmes
  coexistent indépendamment.

Ce qui vient de V2 et a survécu :

- V2 abandonnée. Aucune dette identifiée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-J1 — MembershipPlan Freemium non seedé dans
  Base44 V3. seed-pilot-data.js crée le plan (étape 3),
  mais ce script n'a pas encore été exécuté en production.
  Sans MembershipPlan Freemium en base, MembershipRepository.
  findActiveByUserId() retourne null pour DJ Alex →
  MembershipPlanService lève MEMBERSHIP_PLAN_ERROR →
  MissionConversionGuard reçoit un contexte incomplet ou
  l'appelant utilise une valeur hardcodée.
  Source : Plan Implantation §1.2 — BLOQUANT-J1 : *"Seeder
  la table MembershipPlan dans Base44."*
  STATUT : Résolu dès exécution de `node scripts/seed-pilot-
  data.js` — opération de 5 minutes, pas de développement.

- BLOQUANT-J2 — KYC DJ Alex possiblement PENDING. Un
  TalentPaymentProfile avec kycStatus = VERIFIED est requis
  par PayoutExecutor Verrou 4 avant tout payout. Si DJ Alex
  n'a pas complété son onboarding Stripe Connect Express,
  le payout est bloqué indéfiniment.
  Source : Plan Implantation §1.3 — *"PayoutExecutor.Verrou4
  exige KYCStatus = VERIFIED."*
  VÉRIFICATION : `node scripts/run-j9-pilot.js --step=kyc`
  ou Base44 → TalentPaymentProfile → kycStatus.
  STATUT : INCONNU — dépend de l'état réel dans Stripe.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-J1 — UserRepository absent de D-128 dans
  les repositories implémentés. D-128 liste UserRepository
  dans les interfaces, mais aucun fichier UserRepository.js
  n'est visible dans src/repositories/. Les utilisateurs
  sont créés directement via des appels base44Post inline
  dans seed-pilot-data.js sans interface portable.
  Source : D-128 *"UserRepository"* vs src/repositories/ —
  aucun fichier UserRepository.js trouvé.

- DÉGRADANT-J2 — TalentRolePreference (TRP-*) dans IDFactory
  mais aucun service ni repository visible. La voie
  QuickPlay utilise TalentRolePreference pour les préférences
  tarifaires. Pour SC-01 (voie CreateEvent mono-talent),
  ce composant n'est pas requis. Non-bloquant pour Event 0A.
  Source : IDFactory.PREFIXES.TalentRolePreference = 'TRP' +
  absence de TalentRolePreferenceRepository.js.

- DÉGRADANT-J3 — Checkpoint (CKP-*) absent de l'implémen-
  tation. D-091 définit le Checkpoint comme troisième côté
  de la marketplace — rôle utilisateur à part entière avec
  calendrier, capacité d'acceptation, réputation EMA. IDFactory
  a le préfixe CKP-*, mais aucun CheckpointRepository ni
  CheckpointService n'est visible. Pour Event 0A (Bar Le
  Trèfle comme simple EventLocation, non comme Checkpoint
  reconnu), ce composant n'est pas requis.
  Source : registres D-091 + IDFactory.PREFIXES.Checkpoint
  = 'CKP' + absence de CheckpointRepository.js.

REPORTABLE (peut attendre l'événement 2+) :

- D-092 CheckpointCulturalProfile comportemental (EMA des
  events hébergés) : architecture documentée, non implémentée.
  Reportable post-Event 1.

- D-007 / D-008 vendeur et modèle cellule-succursale :
  non implémentés pour Event 0A (pas de vendeur attaché
  à SC-01 pilote). Reportable.

- D-017 Checkpoint ad hoc pour lieux privés : Bar Le Trèfle
  sera traité comme EventLocation pour Event 0A — Checkpoint
  Ad Hoc résolu plus tard.

- TalentProfile complet (TalentTaxProfile D-053) : données
  à collecter dès MVP, génération T4A post-MVP.

ANGLE MORT POTENTIEL :

- seed-pilot-data.js crée un User avec `role: 'talent'`
  pour DJ Alex — mais le système de rôles V3 (CELL_MANAGER,
  TALENT_STANDARD, FOUNDER, etc.) n'est pas le champ `role`
  d'un objet User Base44. Il n'est pas clair si ce champ
  role est utilisé pour l'autorisation dans la machine
  d'état ou seulement pour l'affichage.
  INFÉRENCE NON DOCUMENTÉE — à valider : quel champ dans
  l'objet User Base44 correspond au rôle D-105 utilisé
  par les guards (ex: AdminAuthorityResolver) ?

- seed-pilot-data.js crée l'Engagement pilote directement
  via base44Post sans passer par transitionEngagement().
  Cela crée un Engagement en état initial (probablement
  `proposed`) sans passer par MissionConversionGuard, sans
  ContractSnapshot phase 1. L'Engagement créé directement
  peut manquer les champs attendus par les guards aval.
  INFÉRENCE NON DOCUMENTÉE — à valider : l'Engagement créé
  par seed-pilot-data.js est-il dans un état compatible
  avec la transition accepted→placed→deposit_pending ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Neutre : Les acteurs pilotes (DJ Alex, Bar Le Trèfle) sont
nouveaux en V3. Pas de migration de données V1 requise —
seed-pilot-data.js crée des objets souverains V3 from scratch.

La dette principale est opérationnelle : deux scripts
(`seed-pilot-data.js` et `run-j9-pilot.js --step=kyc`)
doivent être exécutés avant Event 0A. Ce sont des
opérations ponctuelles, pas du développement.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction : exécuter dans l'ordre —
1) `node scripts/seed-pilot-data.js` (crée les 6 objets
pilotes), puis 2) `node scripts/run-j9-pilot.js --step=onboard`
(crée le compte Stripe Connect DJ Alex), puis 3) `node
scripts/run-j9-pilot.js --step=kyc` (vérifie VERIFIED).
Aucun développement requis — uniquement des exécutions de
scripts déjà écrits.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ PRÊT SOUS CONDITIONS

Conditions :
  C1 — Exécuter seed-pilot-data.js (BLOQUANT-J1 — 5 min).
  C2 — Compléter onboarding KYC DJ Alex via Stripe Dashboard
       et vérifier kycStatus = VERIFIED (BLOQUANT-J2 —
       délai Stripe inconnu mais préparable à l'avance).
  C3 — Valider que l'Engagement créé par seed-pilot-data.js
       est compatible avec la machine d'état V3 (ANGLE MORT).

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Domaine B (Finance) dépend de ce domaine pour que
  commissionRatePpm soit résolu depuis MembershipPlan
  en base — jamais hardcodé. MissionConversionGuard reçoit
  ce taux via le contexte fourni par l'appelant.
  Source : OS V15 D-027 + Plan Implantation §1.2.

- Domaine C (Stripe) dépend de ce domaine pour que
  TalentPaymentProfile avec kycStatus = VERIFIED existe
  avant l'appel à PayoutExecutor (Verrou 4).
  Source : PayoutExecutor.js Verrou 4, D-097 règle 5.

- Domaine A (Ontologie) dépend de ce domaine pour que
  les acteurs (talent, organisateur) aient des systemIds
  USR-* valides reconnus par IDFactory.validate() dans
  transitionEngagement().
  Source : transitionEngagement.js — IDFactory.validate(actor,
  'User') avant tout guard.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — J. ACTEURS ET ONBOARDING
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━