━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — J. Acteurs et onboarding
(profils, KYC Stripe, TalentRolePreference, Checkpoint)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-011, D-017, D-026, D-027, D-053, D-056, D-091,
     D-092, D-097, D-116, FIRST_EVENT_REGISTER,
     OBJECT_REGISTRY)
  • StripeConnectService.js · PayoutExecutor.js
  • MissionConversionGuard.js · IDFactory.js
  • scripts/run-j9-pilot.js · tests/p0/MISSIONCONVERSION-01.js
  • database/PolicyConfig_export (3).csv
Niveau de confiance : HAUTE sur KYC Stripe (implémenté, 19/19 PASSED)
                      PARTIELLE sur MembershipPlan (schéma défini,
                        résolution non implémentée côté code)
                      INFÉRENCE sur Checkpoint, TalentTaxProfile,
                        et acteurs réels Base44
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- TalentPaymentProfile créé avec stripeAccountId pour
  DJ Alex — KYCStatus = VERIFIED avant payout — D-097
  règle 5, EXPORT_BRUT section D-097 + checklist pré-Event 1
  "KYC = VERIFIED"
- MembershipPlan Freemium seeded en database avec taux
  de commission — D-027 : "les taux de membership ne sont
  jamais dans le code", résolution : chercher UserMembership
  actif → fallback Freemium → FINANCIAL_CONFIG_MISSING si
  absent — EXPORT_BRUT section D-027
- tauxPpm résolu depuis MembershipPlan avant
  proposed→accepted (passé en context à
  MissionConversionGuard) — D-027 + D-035 : CS phase 1
  snapshote "talent_platform_commission_rate_snapshot"
- SOTS score default 3/5 = 3000 units seeded pour DJ Alex
  — D-026 : "tout nouveau talent sans historique reçoit
  un score SOTS par défaut de 3/5", EXPORT_BRUT D-026
- Checkpoint CP-PLATEAU-0001 (Le Trèfle) créé dans Base44
  avec systemId CKP-* et EventLocation/geoCoordinates —
  OS V15 section 14.9 C01 : "CP-PLATEAU le reconnaît
  comme talent local"
- USR-* systemIds créés pour DJ Alex et Le Trèfle dans
  Base44 — D-127 : "le Base44 id n'est JAMAIS un
  identifiant métier souverain"
- TalentTaxProfile minimum créé pour DJ Alex :
  taxCollectionMode = NOT_REGISTERED si non inscrit TPS/TVQ
  — D-053, D-056

Ce domaine bloque tout le reste si :

- KYCStatus ≠ VERIFIED pour le talent → PayoutExecutor
  Verrou 4 bloque le Transfer Stripe → payable→settled
  impossible — D-097 règle 5 + EXPORT_BRUT D-101
- MembershipPlan Freemium absent → FINANCIAL_CONFIG_MISSING
  → MissionConversionGuard ne peut pas créer le
  ContractSnapshot phase 1 avec tauxPpm — D-027

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

KYC Stripe Connect — implémenté et testé.
  • StripeConnectService.js : initiateTalentOnboarding(),
    verifyKYCStatus(), KYC_STATUS (PENDING/IN_REVIEW/
    VERIFIED/RESTRICTED) — source : StripeConnectService.js.
  • Logique KYC : details_submitted=true + charges_enabled=
    true → VERIFIED — source : StripeConnectService.js.
  • Webhook account.updated → mise à jour KYC en temps réel
    — source : WebhookProcessor.js.
  • STRIPE-J8-01 : 19/19 PASSED, incluant T-03 (KYC PENDING
    bloque payout), T-11 (onboarding idempotent), T-12 (KYC
    VERIFIED après account.updated) — source : exécution
    directe.
  • run-j9-pilot.js : script d'orchestration onboarding DJ
    Alex avec URL de retour configurée —
    source : run-j9-pilot.js.

IDFactory — prefixes acteurs définis.
  • User 'USR', Talent 'TAL', Checkpoint 'CKP',
    TalentRolePreference 'TRP' — source : IDFactory.js.

roleMetier validé dans MissionConversionGuard.
  • roleMetier obligatoire à proposed→negotiating et
    proposed→accepted — source : MissionConversionGuard.js.
  • tauxPpm et tier passés via context, validés comme entiers
    — source : MissionConversionGuard.js.
  • MISSIONCONVERSION-01 : 14/14 PASSED avec Freemium /
    tauxPpm=120000 — source : exécution directe.

D-026 SOTS default 3/5 — doctrinalement défini.
  • "Tout nouveau talent sans historique reçoit un score
    SOTS par défaut de 3/5 = 3000 score_units" — D-026.
  • Ce score module le taux effectif via
    SOTSCommissionModulationConfig (multiplicateur neutre
    sous 10 soumissions — D-083).

D-116 Coefficient = 1 pour Event 1 sans vendeur.
  • "Sans vendeur : coefficient = 1 forcé" — D-116.
  • Pour SC-01 (DJ Alex, sans seller), le coefficient = 1
    exactement (prix vendu = cachet signé) — non bloquant.

D-027 architecture MembershipPlan — doctrinalement définie.
  • Résolution Freemium en 3 étapes documentées.
  • MembershipPlan non dans PolicyConfig_export.csv —
    c'est une table séparée dans Base44 (CRITIQUE,
    double validation) — source : EXPORT_BRUT POLICYCONFIG_
    REGISTER.

Ce qui vient de V1 et est encore actif :
  V1 (microrave.ca) a des comptes utilisateurs actifs pour
  DJ Alex Dubois et Le Trèfle. Les profils Base44 Auth
  existent. KYC Stripe Connect : INFÉRENCE — si DJ Alex
  a complété son onboarding Stripe en V1, son
  stripeAccountId est peut-être réutilisable. ACQUIS :
  réseau existant, consentement pilote acquis depuis V1.
  DETTE : aucun systemId souverain sur les objets V1
  (fiche H).

Ce qui vient de V2 :
  Néant. V2 abandonnée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-J1 — MembershipPlan Freemium non seeded
  dans la table dédiée Base44.
  D-027 exige MembershipPlan en database avec taux et
  dates de validité. La table MembershipPlan n'est pas
  dans PolicyConfig_export.csv — source : diff CSV/schéma.
  MembershipPlan est une table distincte (CRITIQUE,
  double validation requise) — source : EXPORT_BRUT
  POLICYCONFIG_REGISTER "MembershipPlan | CRITIQUE |
  FOUNDER + FINANCE_ADMIN | Oui".
  CONSÉQUENCE : avant proposed→accepted, la couche
  appelante doit résoudre tauxPpm depuis MembershipPlan.
  Si aucun record Freemium n'existe → FINANCIAL_CONFIG_
  MISSING → ContractSnapshot phase 1 impossible.
  Pour Event 1 (SC-01, taux 12%), si le fondateur passe
  manuellement tauxPpm=120000 dans le contexte, ce
  bloquant est contourné — mais non conforme à D-027.

- BLOQUANT-J2 — Aucun service de résolution
  MembershipPlan → tauxPpm dans le code V3.
  MissionConversionGuard reçoit tauxPpm comme paramètre
  de contexte (passé par l'appelant) — source :
  MissionConversionGuard.js. Aucun service ne lit
  MembershipPlan en database pour calculer tauxPpm.
  La couche qui fait cette résolution n'existe pas dans
  src/ — source : grep MembershipPlan sur src/ retourne
  zéro. L'appelant (Base44 UI / API) doit faire cette
  résolution — sans guide ni service implémenté.

- BLOQUANT-J3 — TalentPaymentProfile DJ Alex : statut
  KYC inconnu depuis ce zip.
  StripeConnectService est implémenté, mais l'état réel
  du TalentPaymentProfile de DJ Alex dans Base44 est
  INFÉRENCE — source : aucune donnée dans les fichiers
  soumis. Si DJ Alex n'a pas complété son onboarding
  Stripe Connect Express V3, KYCStatus = PENDING →
  PayoutExecutor Verrou 4 bloque → payout impossible.
  CONDITION : valider en production que KYCStatus = VERIFIED.

- BLOQUANT-J4 — USR-* systemIds pour les acteurs réels.
  DJ Alex, Le Trèfle / CP-PLATEAU-0001 doivent avoir des
  systemIds souverains USR-* et CKP-* dans Base44 avant
  que les guards puissent les référencer — D-127, checklist
  pré-Event 1 "systemId sur tous les objets critiques".
  Ces IDs ne sont pas dans les fichiers soumis.
  INFÉRENCE : si les objets existent en Base44 sans
  systemId (V1 legacy), ils doivent être créés/migrés.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- TalentTaxProfile : données collectées MVP mais UI
  post-MVP — source : EXPORT_BRUT "TalentTaxProfile UI
  complète | Données collectées MVP, UI post-MVP | V3.0.1".
  Pour Event 1, taxCollectionMode = NOT_REGISTERED
  suffit si DJ Alex n'est pas inscrit TPS/TVQ.
  AnnualTalentPaymentSummary est requis "dès le MVP"
  (D-053) mais n'est pas bloquant pour la première
  transaction.

- D-026 SOTS score default 3/5 : le score initial de
  DJ Alex doit être créé en database (SOTSScoreSnapshot
  avec score_units = 3000). Sans ce record, le
  multiplicateur de commission sera par défaut à
  1 000 000 ppm (neutre, conforme à D-083 < 10
  soumissions) — non bloquant pour Event 1.

- TalentRolePreference (TRP-*) non créée. D-114/D-120
  présuppose des préférences QuickPlay mais pour SC-01
  voie CreateEvent, TalentRolePreference n'est pas
  nécessaire — reportable à Event 2 (QuickPlay).

- Checkpoint CP-PLATEAU-0001 (Le Trèfle) : l'EventLocation
  suffit pour SC-01 voie CreateEvent avec EventLocation
  — D-091 : "EventLocation = endroit où un event a lieu.
  Checkpoint = lieu reconnu, programmable". Pour Event 1
  sans QuickPlay, un EventLocation (ad hoc) est suffisant.
  Le Checkpoint complet (calendrier, réputation) peut
  attendre Event 2.

REPORTABLE (peut attendre l'événement 2+) :

- TalentRolePreference complète + QuickPlay captain
  (D-120-A) — post-Event 1.
- CheckpointCulturalProfile EMA (D-092) — post-Event 1.
- D-056 taxCollectionMode MR_COLLECTS_FOR_TALENT —
  validation légale requise, post-MVP.
- D-053 AnnualTalentPaymentSummary UI — V3.0.1.
- D-055 Commandites (SponsorshipContract) — V3.3.
- D-054 Billetterie payante (TicketAdmissionRight) — V3.2.

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE 1 : D-027 dit que le tauxPpm
  est résolu depuis MembershipPlan pour chaque talent
  au moment de proposed→accepted. Mais MissionConversionGuard
  reçoit tauxPpm comme input (le caller le passe). La
  couche Base44 UI (page de négociation) doit lire
  MembershipPlan, calculer le taux effectif, et le passer
  à transitionEngagement(). Cette responsabilité n'est
  documentée nulle part dans le code V3. À valider : est-ce
  que la page de négociation Base44 V1 fait déjà cette
  résolution ? Sinon, qui la fait pour Event 1 ?

→ INFÉRENCE NON DOCUMENTÉE 2 : Le ContractSnapshot phase 1
  stocke "talent_platform_commission_rate_snapshot" —
  source : D-035. Ce taux doit être "le taux effectif
  après modulation SOTS" — cachet brut × SOTS multiplier.
  Pour DJ Alex au premier event (SOTS = 3/5 = multiplicateur
  neutre = 1 000 000 ppm), taux effectif = taux de base
  Freemium. Si MembershipPlan n'est pas seeded, ce snapshot
  ne peut pas être calculé correctement.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : profils utilisateurs existants (DJ Alex, Le Trèfle)
  en Base44. ACQUIS direct : pas besoin de re-créer les
  comptes depuis zéro. DETTE : aucun systemId souverain
  USR-* / CKP-*, potentiellement aucun TalentPaymentProfile
  Stripe Connect V3 si l'onboarding n'a pas été refait
  sur le compte Base44 V3.

De la structure Guards-only : MissionConversionGuard
  valide le taux mais ne le résout pas. C'est intentionnel
  (séparation des responsabilités, D-127), mais cela
  transfère la responsabilité de résolution à une couche
  appelante non implémentée.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Seeder MembershipPlan Freemium en Base44 (double validation
fondateur requise, D-108), implémenter le service de
résolution MembershipPlan → tauxPpm (ou documenter que
la couche Base44 UI le fait), vérifier que KYCStatus = VERIFIED
pour DJ Alex dans TalentPaymentProfile V3, et créer les
systemIds USR-* et CKP-* pour les acteurs de la Pierre de Rosette.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ PRÊT SOUS CONDITIONS → lesquelles :

  1. MembershipPlan Freemium seeded en database avec taux
     (ex: 12% = 120000 ppm pour Freemium) —
     double validation fondateur + FINANCE_ADMIN (D-108)
  2. KYCStatus = VERIFIED pour DJ Alex dans
     TalentPaymentProfile V3 (vérifier run-j9-pilot.js
     --step=kyc)
  3. USR-* systemId créé pour DJ Alex et Le Trèfle (ou
     EventLocation si Checkpoint non requis pour SC-01)
  4. Service ou procédure documentée pour résoudre
     MembershipPlan → tauxPpm avant proposed→accepted

  La majorité de l'infrastructure KYC/Stripe est
  opérationnelle (19/19 PASSED). Le gap principal est
  la résolution du taux de commission depuis MembershipPlan
  et la vérification des acteurs réels en production.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- A. Machine d'état (MissionConversionGuard) dépend de ce
  domaine pour le contexte {tauxPpm, tier} — sans
  MembershipPlan résolu, ContractSnapshot phase 1 ne peut
  pas être créé — source : OS V15 section 2.7.1 D-035.

- C. Stripe / Paiement dépend du KYC VERIFIED pour le
  Transfer final — source : D-097 règle 5, PayoutExecutor
  Verrou 4.

- E. SOTS dépend du score default 3/5 pour moduler le
  taux effectif — source : D-026 + D-083.

- INFÉRENCE : GoNoGoDecisionRecord = GO exige
  "Event spécifique : systemId sur tous les objets critiques"
  — source : EXPORT_BRUT FIRST_EVENT_REGISTER. Sans USR-*
  pour DJ Alex et CKP-* (ou EVL-*) pour Le Trèfle,
  cette condition n'est pas satisfaite.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — J. Acteurs et onboarding
Conserver cette fiche pour le Prompt de Synthèse.