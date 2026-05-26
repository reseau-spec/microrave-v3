━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — J. Acteurs et onboarding
Date d'évaluation : 26 mai 2026
Documents sources :
  • docs/os/MICRORAVE_V3_OPERATING_SYSTEM_V15.md (§1.1
    triptyque, §1.4 promesses #1/#4, §14.9 Pierre de Rosette
    DJ Alex Dubois + Le Trèfle + CP-PLATEAU-0001)
  • docs/os/EXPORT_BRUT…REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-017 « Checkpoint ad hoc », D-022 SellerPortfolio
    POST-MVP, D-027 MembershipPlan, D-091 « Checkpoint =
    rôle utilisateur à part entière », D-092 « Checkpoint
    comportemental — EMA », D-097 règle 5 « KYC Stripe Connect
    obligatoire avant payout », D-120-A « Capitaine QuickPlay »,
    OBJECT_REGISTRY Checkpoint/EventLocation/
    CheckpointCulturalProfile)
  • codeBase44_v3/base44/entities/{User, TalentPaymentProfile,
    MembershipPlan, UserMembership}.jsonc
  • microrave-v3/src/core/IDFactory.js (préfixes
    Checkpoint=CKP, EventLocation=EVL, TalentRolePreference=TRP,
    Talent=TAL)
  • codeBase44_v3/base44/functions/createEngagement/entry.ts
    (acceptation des actorIds sans validation)
  • codeBase44_v3/dataBase/{TalentPaymentProfile,
    MembershipPlan, UserMembership, Engagement}_export.csv
  • Absent : User_export.csv, Checkpoint_export.csv (entité
    absente), EventLocation_export.csv (entité absente),
    TalentRolePreference_export.csv (entité absente)
  • codeBase44_v3/src/pages/*.jsx (5 pages, aucune dédiée
    à l'acteur, onboarding, KYC, profil)
  • 20260526-1030_RAPPORT-AUDIT-FORENSIQUE.md — FICHIER VIDE
    (0 octet, INCONNU)
Niveau de confiance : HAUTE pour les présences/absences
    d'entités et les données ; PARTIELLE pour l'évaluation
    de la voie d'onboarding réelle (le seul talent VERIFIED
    semble issu d'un onboarding hors application, non tracé)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

   Ce domaine est prêt pour la première transaction quand :

   • Le triptyque OS §1.1 a ses trois substrats en base :
     User (talent + organisateur/payeur) + Checkpoint (lieu
     reconnu) ou EventLocation (lieu ponctuel). « Micro Rave
     orchestre les trois côtés — pas deux. »
     — Source : OS V15 §1.1

   • Le talent a une TalentPaymentProfile avec
     `kycStatus = VERIFIED`, `detailsSubmitted = true`,
     `chargesEnabled = true`, `payoutsEnabled = true`. « KYC
     Stripe Connect obligatoire avant payout. »
     — Source : D-097 règle 5, EXPORT_BRUT §BLOC 11
     — Confirmé par OS §14.9 Carte C06 « 11 conditions »

   • Le talent a une UserMembership active avec un
     MembershipPlan référencé (commissionRatePpm).
     — Source : D-027, EXPORT_BRUT §BLOC 1

   • La référentielle Engagement → User est validée à la
     création : talentUserId et organizerUserId existent en
     base, sont au format USR-*, et ont les rôles cohérents.
     — Source : OS V15 §1.1 + D-107 #15 (interdit modifier
       systemId existant — implique format strict)

   • Pour Pierre de Rosette canonique : Checkpoint
     CP-PLATEAU-0001 (« Le Trèfle ») existe comme entité avec
     ses coordonnées géographiques (lien Domaine D).
     — Source : OS V15 §14.9

   • Promesse OS §1.4 au Checkpoint honorée par au minimum un
     écran qui matérialise « la marque, la plateforme, les
     règles, les outils et la structure » côté lieu.
     — Source : OS V15 §1.4

   Ce domaine bloque tout le reste si :

   • Pas de talent KYC VERIFIED en base → D-097 règle 5 →
     V4 du payout (KYC check) échoue → aucun payout possible.
     — Source : D-097 + executePayoutTransfer V4

   • Pas de Checkpoint en base → coordonnées du lieu absentes
     → C-04 D-075 (« géolocalisation cohérente avec
     maxDistancePolicy ») inévaluable → C-06 D-075 (11
     conditions) échoue (cf. fiche Domaine D §3 BLOQUANT).
     — Source : D-075 + OS §1.1 + §14.9

   • talentUserId/organizerUserId acceptés comme strings
     arbitraires → tout placeholder ('test', '012', '05')
     entre en base → la réputation, le ledger et le payout
     pointent vers du néant ou du désordre.
     — Source : observation Engagement_export.csv

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

   Ce qui existe et fonctionne selon les documents :

   • Entité User Base44 : systemId (USR-*), displayName, role
     (enum 5 valeurs : talent, organisateur, payeur, admin,
     FOUNDER), createdAt. Schéma minimal mais cohérent.
     — Source : entities/User.jsonc

   • Entité TalentPaymentProfile : talentUserId,
     stripeAccountId (acct_*), kycStatus
     (PENDING/IN_REVIEW/VERIFIED/RESTRICTED), detailsSubmitted,
     chargesEnabled, payoutsEnabled, country, kycVerifiedAt.
     Champs alignés sur l'API Stripe Connect Express.
     — Source : entities/TalentPaymentProfile.jsonc

   • Entité MembershipPlan : commission_rate_ppm, tier,
     is_active, description. 1 seed actif en base :
     « Freemium » à 120 000 ppm (12 % commission MR — D-027).
     — Source : entities/MembershipPlan.jsonc +
       dataBase/MembershipPlan_export.csv

   • Entité UserMembership : userId, planId, commissionRatePpm,
     status, startedAt. 2 records en base :
       — 1 actif : userId=`USR-MPIGOA0O-9CZ5JA`, planId
         pointant vers Freemium, status='active',
         commissionRatePpm=120000
       — 1 vierge (champs vides, marquée 'active' par défaut)
     — Source : entities/UserMembership.jsonc +
       dataBase/UserMembership_export.csv

   • Le talent pilote a un TalentPaymentProfile concret en
     production : talentUserId=`USR-MPIG0A0O-9CZ5JA`,
     stripeAccountId=`acct_1TaGqTKCWuw3ufQV`,
     kycStatus=`VERIFIED`, detailsSubmitted=true,
     chargesEnabled=true, payoutsEnabled=true. C'est le seul
     talent productisable.
     — Source : dataBase/TalentPaymentProfile_export.csv

   • IDFactory portable réserve les préfixes pour l'écosystème
     d'acteurs : `User='USR'`, `Talent='TAL'`,
     `Checkpoint='CKP'`, `EventLocation='EVL'`,
     `TalentRolePreference='TRP'`.
     — Source : src/core/IDFactory.js l.24-34

   • Le payout Stripe a effectivement transité par ce talent :
     PayoutExecutionRecord avec stripeTransferId
     `tr_1TaHDt2eLVUrCnnJyDflLNEa` et talentUserId
     `USR-MPIG0A0O-9CZ5JA` — preuve qu'un talent KYC VERIFIED
     peut, au moins une fois, recevoir un paiement.
     — Source : dataBase/PayoutExecutionRecord_export.csv

   Ce qui vient de V1 et est encore actif :

   • V1 (microrave.ca) avait son propre système de comptes —
     non décrit dans les fichiers soumis.
   • V1 référenciait `checkpointSystemId` dans SessionPresence
     (cf. fiche Domaine D §2 V1 archives) — la doctrine
     Checkpoint comme entité distincte existait
     opérationnellement en V1. La V3 a PERDU ce substrat.
     — Source : codeBase44_v1/dataBase/SessionPresence.csv
       champ checkpointSystemId

   Ce qui vient de V2 et a survécu :

   • La doctrine D-091/D-092 (Checkpoint comportemental EMA)
     et D-097 (KYC Stripe Connect) — V11/V12. ACQUIS doctrinal
     stable.
   • Les entités MembershipPlan / UserMembership et le tier
     Freemium 12 % sont des héritages opérationnels — la
     V3 n'a pas eu à les reconstruire.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

   BLOQUANT (empêche la première transaction) :

   • Entité Checkpoint ABSENTE de Base44. D-091 « Le Checkpoint
     est un rôle utilisateur à part entière avec : calendrier
     de disponibilités, propriétaire reconnu, capacité
     d'acceptation QuickPlay, pouvoir de créer des événements,
     contraintes techniques, réputation calculée par usage
     réel. » — sans entité, ce « rôle utilisateur à part
     entière » n'a aucun substrat. Pierre de Rosette §14.9 nomme
     « CP-PLATEAU-0001 » qui ne peut pas exister.
     — Source : codeBase44_v3/base44/entities/ (29 entités,
       aucune Checkpoint.jsonc) ; D-091 ; OS V15 §14.9

   • Entité EventLocation ABSENTE. D-017 « Un lieu privé/
     résidentiel = Checkpoint ad hoc avec statut private ou
     unverified » présuppose une entité EventLocation pour
     les lieux ponctuels sans Checkpoint stable. L'absence
     est aussi celle qui prive Domaine D des coordonnées GPS
     du lieu (fiche D §3 BLOQUANT).
     — Source : codeBase44_v3/base44/entities/ ; D-017

   • Entité TalentRolePreference (TRP-*) ABSENTE. Le préfixe
     est réservé dans IDFactory.js l.34 mais aucun
     TalentRolePreference.jsonc n'existe en Base44. Pour
     Pierre de Rosette mono-talent (roleMetier connu), cette
     absence est acceptable. Mais pour la doctrine §1.4 et
     QuickPlay D-120-A, ce vide structurel devra se combler.
     → Bloqueur conditionnel : reportable pour Pierre de
       Rosette uniquement, bloquant pour Event 1 multi-talent.

   • Conflit de préfixe IDFactory : TalentPaymentProfile.
     systemId.description dit « IDFactory TRP-* » (entities/
     TalentPaymentProfile.jsonc l.8), mais TRP est le préfixe
     officiel de TalentRolePreference dans IDFactory.js l.34.
     TalentPaymentProfile n'a aucun préfixe dédié dans
     IDFactory portable. Le schéma déclare un préfixe
     incorrect. Si on crée des TPP avec systemId='TRP-*', on
     écrase la convention prévue pour TRP. D-107 #16 (« Modifier
     les préfixes IDFactory d'objets déjà créés ») risque
     d'être violé silencieusement à la première vraie écriture
     TalentRolePreference.
     — Source : entities/TalentPaymentProfile.jsonc l.8 vs
       src/core/IDFactory.js l.34

   • createEngagement N'authentifie PAS les acteurs
     référencés. talentUserId et organizerUserId sont acceptés
     tels quels sans :
       — vérification d'existence (`base44.entities.User.filter
         ({systemId})`)
       — vérification de format (regex USR-*)
       — vérification de rôle cohérent
     Conséquence visible en base : sur 24 engagements, le
     champ talentUserId contient les placeholders 'test',
     'TEST', '10000', '05', '012', 'dj', '2000', des Base44
     internal hex et quelques USR-* propres (déjà noté fiche
     H §3). Aucune transition `proposed → accepted` ne contrôle
     l'identité du talent acceptant.
     — Source : codeBase44_v3/.../createEngagement/entry.ts
       (absence de validation)

   • Aucune fonction d'onboarding Stripe Connect dans
     codeBase44_v3/base44/functions/. Pas de
     `createConnectAccount`, pas de `createAccountLink`, pas
     de webhook `account.updated` (cf. Domaine C §3 BLOQUANT).
     Le seul TalentPaymentProfile VERIFIED en production a
     été créé par voie manuelle hors application (Stripe
     Dashboard + écriture Base44 directe). Aucun parcours
     reproductible n'existe pour Event 1.
     — Source : ls base44/functions/ + grep
       `accounts.create|accountLink` → 0 résultat

   • Aucune UI de profil/onboarding/KYC dans src/pages/ ni
     src/components/. Les 5 pages React couvrent uniquement
     les engagements et les policies. Aucun écran pour qu'un
     talent inscrive ses informations bancaires, déclenche
     KYC Stripe, ou voie son état KYC. Le pilote a fonctionné
     parce qu'un acteur (le fondateur) a court-circuité
     l'application — pas un modèle scalable.
     — Source : ls src/pages/ → 5 pages, aucune profil

   • CheckpointCulturalProfile (D-092 EMA comportemental) —
     pas d'entité Base44. « Un lieu devient ce qu'il accueille »
     ne peut pas être implémenté sans le substrat de
     l'historique cumulatif EMA.
     — Source : codeBase44_v3/base44/entities/ ; D-092

   • La phantom identity du talent pilote :
       — TalentPaymentProfile.talentUserId = `USR-MPIG0A0O-9CZ5JA`
         (avec chiffre 0)
       — UserMembership.userId            = `USR-MPIGOA0O-9CZ5JA`
         (avec lettre O)
     La même personne physique vit en DEUX identités selon
     l'axe (paiement vs subscription). Un join cross-table
     échoue. Cf. fiche Domaine H §3 pour le diagnostic IDFactory
     base36.
     — Source : croisement TalentPaymentProfile_export.csv +
       UserMembership_export.csv

   DÉGRADANT (réduit la qualité, n'empêche pas) :

   • User_export.csv ABSENT. Impossible d'auditer la liste
     des USR-* effectivement en base. Les références sortantes
     (talentUserId, organizerUserId) ne peuvent pas être
     vérifiées contre une source. Privacy probable, mais
     bloque la vérification d'intégrité.
     — Source : ls dataBase/

   • User.role enum collapse les 10 rôles admin D-105 en
     'admin' (cf. fiche G §3 BLOQUANT) ET ne distingue ni
     Checkpoint owner ni vendeur (D-022 reportable post-MVP)
     ni payeur tiers (distinct de l'organisateur dans
     l'OS §1.1 « organisateur/payeur »). Le typage des
     acteurs est sous-paramétré.
     — Source : entities/User.jsonc l.14-23

   • UserMembership #2 en base a tous champs vides
     (startedAt, planId, userId, commissionRatePpm) mais
     status='active' — record fantôme qui pourrait fausser des
     comptes.
     — Source : dataBase/UserMembership_export.csv

   • MembershipPlan unique « Freemium » : pas de tier B/C/D
     ou de plans dédiés (FoundingMember, BackBone, etc.).
     Acceptable pour MVP, mais le système assume implicitement
     que tout talent passe par 12 %. La doctrine §1.5 Pivot
     de Marché présuppose des plans modulables.
     — Source : MembershipPlan_export.csv (1 ligne)

   • Pas de fonction Base44 `createUser` / `assignRole` /
     `linkOrganizerToCheckpoint` — toute création de user
     passe par Base44's built-in auth (hors V3) + écritures
     manuelles. Le périmètre fonctionnel V3 commence après
     l'onboarding.

   REPORTABLE (peut attendre l'événement 2+) :

   • SellerPortfolio + ClientAttributionRight (D-022) —
     POST-MVP per ASSUMPTION_REGISTER A-006 « Légal non
     validé — post V3.3 ».
     — Source : EXPORT_BRUT A-006

   • TalentRolePreference + Capitaine QuickPlay (D-120-A) —
     reportable pour Pierre de Rosette mono-talent. Tests P0
     QUICKPLAY-CAPTAIN-01/02/03 + QUICKPLAY-AUTO-01 absents
     de tests/p0/ — reportables.

   • CheckpointCulturalProfile EMA (D-092) — reportable car
     l'EMA n'a aucun event antérieur à intégrer.

   • CELL_MANAGER admin (D-105) POST-MVP.

   • Onboarding multi-acteur (organisateur, lieu, vendeur)
     productisé — reportable au-delà de Pierre de Rosette,
     qui peut être complètement piloté manuellement.

   ANGLE MORT POTENTIEL :

   L'OS V15 §14.9 nomme « Checkpoint CP-PLATEAU-0001 (Le
   Trèfle, Montréal) » pour la Pierre de Rosette canonique.
   Mais Pierre de Rosette est explicitement un pilote
   interne : il est probable que « Le Trèfle » soit
   l'incarnation de Micro Rave elle-même en mode founder-
   acting-as-checkpoint (cf. D-105 « FOUNDER absorbe rôles
   vacants MVP. FOUNDER_ACTING_AS_[ROLE] dans
   DataAccessLedger »). Si oui, l'entité Checkpoint pour
   Pierre de Rosette peut se réduire à un record minimal
   (CP-PLATEAU-0001 + coordonnées GPS + ownerUserId=FOUNDER)
   et non à un parcours complet d'onboarding Checkpoint.
   → INFÉRENCE NON DOCUMENTÉE : pour Pierre de Rosette
     uniquement, le Checkpoint peut-il exister en base sans
     UI Checkpoint dédiée ? L'OS V15 §14.9 ne tranche pas.
     À valider par le fondateur — affecte le statut final de
     ce domaine (BLOQUÉ ou PRÊT SOUS CONDITIONS).

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

   La V3 hérite d'une doctrine d'acteurs en plusieurs strates
   (User, MembershipPlan, TalentPaymentProfile, Checkpoint,
   EventLocation, CheckpointCulturalProfile, TalentRolePreference)
   mais n'implémente que les 4 premières — et seulement
   schématiquement pour 2 d'entre elles.

   La V3 a PERDU le champ `checkpointSystemId` qui existait
   dans le V1 SessionPresence schema — un vrai recul
   structurel.

   La V3 a un acquis tangible : 1 talent KYC VERIFIED + 1
   Stripe Transfer réussi en production. C'est la preuve que
   le pipeline de paiement bout-en-bout PEUT fonctionner pour
   un acteur — à condition que cet acteur soit accompagné
   manuellement à chaque étape de son onboarding.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

   Pour que le domaine soit prêt : (i) créer l'entité
   Checkpoint Base44 avec ownerUserId, geoCoordinates
   (latitude/longitude/accuracy), name, type, status, et
   seeder CP-PLATEAU-0001 en base (résout aussi le Domaine D
   §3 BLOQUANT sur les coordonnées du lieu), (ii) créer
   l'entité EventLocation pour les lieux ponctuels D-017,
   (iii) corriger le préfixe systemId de TalentPaymentProfile
   dans le schéma (probablement TPP-* ou inclusion explicite
   dans IDFactory), (iv) ajouter la validation des actorIds
   dans createEngagement (filter User.filter({systemId})
   avant insertion), (v) résoudre la dérive phantom
   USR-MPIG[0|O]A0O-9CZ5JA par une migration append-only et
   choisir une forme canonique unique. L'onboarding Stripe
   Connect productisé est reportable post-Event 1 (le
   pilote peut continuer en mode manuel founder-known).

──────────────────────────────────────────────────
6. STATUT FINAL

   ☑ PRÊT SOUS CONDITIONS — pour Pierre de Rosette §14.9
     uniquement, en mode founder-acting-as-checkpoint avec
     les 5 conditions ci-dessous satisfaites manuellement :

     1. Créer l'entité Checkpoint en Base44 et seeder
        CP-PLATEAU-0001 avec geoCoordinates (débloque
        Domaine D simultanément).
     2. Choisir UNE forme canonique pour le talent pilote
        (USR-MPIG0A0O-9CZ5JA ou USR-MPIGOA0O-9CZ5JA) et
        produire une migration append-only pour aligner les
        références (Engagement, TalentPaymentProfile,
        SettlementInstruction, PayoutExecutionRecord,
        UserMembership) sur cette forme.
     3. Confirmer que le KYC du talent pilote est encore
        valide chez Stripe (validation hors application).
     4. Corriger le préfixe documenté TalentPaymentProfile.
        systemId.description ou clarifier que TPP partage
        TRP-*.
     5. Pour les autres engagements en base avec talentUserId
        placeholder ('test', '012', etc.), confirmer qu'ils
        sont hors scope de Pierre de Rosette (sinon, les
        marquer comme tests à ignorer).

   Estimation indicative hors règle 3 :
     — Schéma User + TalentPaymentProfile + MembershipPlan
       + UserMembership : 80 % conforme.
     — Données 1 talent KYC VERIFIED + 1 Stripe payout
       réussi : 100 % (pour 1 acteur).
     — Entités Checkpoint / EventLocation /
       TalentRolePreference / CheckpointCulturalProfile :
       0 %.
     — Validation des actorIds à l'entrée : 0 %.
     — UI onboarding/KYC/profil : 0 %.
     — Pipeline onboarding Stripe Connect automatisé : 0 %.
   Effectif fonctionnel pour Pierre de Rosette §14.9 :
   ~ 50 % en mode founder-known.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

   • Domaine D (Présence et preuve) — la création de l'entité
     Checkpoint avec geoCoordinates dans Domaine J débloque
     directement Domaine D §3 BLOQUANT (« Event entité Base44
     N'A AUCUNE coordonnée géographique »). C'est le couplage
     le plus serré du présent audit.
     — Source : OS V15 §1.1 + fiche Domaine D §7

   • Domaine A (machine d'état) — la transition `proposed →
     accepted` (PlacementGuard absent du flux Base44, cf.
     fiche A §3) doit authentifier que `talentUserId` accepte
     bien l'engagement. Sans validation des acteurs (Domaine J
     §3 BLOQUANT), même un PlacementGuard correct travaillerait
     sur des références fantômes.
     — Source : OS V15 §2.7.1 PlacementGuard

   • Domaine C (Stripe) — D-097 règle 5 « KYC Stripe Connect
     obligatoire avant payout (KYCStatus = VERIFIED) ». La
     V4 de executePayoutTransfer dépend de
     TalentPaymentProfile.kycStatus. Pour Pierre de Rosette,
     cette dépendance est satisfaite (1 profil VERIFIED).
     Pour Event 2+, dépendance critique.
     — Source : D-097 + executePayoutTransfer V4

   • Domaine B (finance) — MembershipPlan.commissionRatePpm
     alimente le taux de commission utilisé dans le waterfall.
     Le seed Freemium=120 000 ppm est l'oxygène financier de
     l'engagement. La déconnexion entre l'UI (qui hardcode
     120000) et la base (qui le porte) est une violation
     fail-closed (cf. fiche I §3 BLOQUANT).
     — Source : D-027 + Domaine I fiche

   • Domaine G (Admin) — l'enum User.role limitant à 5
     valeurs au lieu des 10 D-105 est une lacune partagée
     entre J et G. Résoudre l'un résout en partie l'autre.
     — Source : D-105 + fiche Domaine G §3 BLOQUANT

   • Domaine I (UX) — la promesse §1.4 au Checkpoint « la
     marque, la plateforme, les règles, les outils et la
     structure » exige une surface UI Checkpoint qui dépend
     de l'entité Checkpoint (Domaine J). Sans entité, pas de
     surface possible (cf. fiche I §3 ANGLE MORT).
     — Source : OS V15 §1.4 + fiche Domaine I §3 ANGLE MORT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — J. Acteurs et onboarding
Fiche conservée en mémoire de session pour Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━