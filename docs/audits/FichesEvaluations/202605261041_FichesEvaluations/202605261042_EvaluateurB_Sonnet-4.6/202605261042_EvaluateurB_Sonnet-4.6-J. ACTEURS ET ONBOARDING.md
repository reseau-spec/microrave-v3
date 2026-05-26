━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — J. ACTEURS ET ONBOARDING
Date d'évaluation : 26 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 §1.1, §2.5, §2.8)
  • codeBase44_v3/base44/entities/User.jsonc
  • codeBase44_v3/base44/entities/UserMembership.jsonc
  • codeBase44_v3/base44/entities/MembershipPlan.jsonc
  • codeBase44_v3/base44/entities/TalentPaymentProfile.jsonc
  • codeBase44_v3/base44/entities/Event.jsonc
  • codeBase44_v3/base44/functions/createEngagement/entry.ts (tauxPpm resolution)
  • src/repositories/MembershipRepository.js
  • codeBase44_v3/dataBase/MembershipPlan_export.csv (1 plan)
  • codeBase44_v3/dataBase/UserMembership_export.csv (2 records)
  • codeBase44_v3/dataBase/TalentPaymentProfile_export.csv (1 VERIFIED)
  • codeBase44_v3/dataBase/Event_export.csv (24 events, venue = texte libre)
  • codeBase44_v1/dataBase/Checkpoint.csv (217 records)
  • codeBase44_v1/dataBase/TalentProfile.csv (45 records)
  • scripts/seed-pilot-data.js
Niveau de confiance : HAUTE sur ce qui existe ;
                     HAUTE sur les lacunes identifiées.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
   (Tirés de l'OS V15)

Ce domaine est prêt pour la première transaction quand :

• Les trois acteurs du triptyque fondamental sont identifiés et présents :
  talent, organisateur/payeur, lieu — OS V15 §1.1 :
  "talent ↔ organisateur/payeur ↔ lieu (EventLocation ou Checkpoint).
  Micro Rave orchestre les trois côtés — pas deux."

• Le talent a complété son onboarding Stripe Connect Express et son
  kycStatus est VERIFIED — OS V15 §2.7.1 table : "payable→settled :
  KYCStatus = VERIFIED" + D-097 règle 5.

• L'organisateur peut créer un Engagement en associant un talentUserId
  et un eventId valides — source : createEngagement/entry.ts.

• Le taux de commission (tauxPpm) est résolu depuis le MembershipPlan
  actif du talent — D-027 : plan canonique par tier (A–E). Fallback
  Freemium (120 000 ppm) si aucun plan actif trouvé.

Ce domaine bloque tout le reste si :

• Le talent cible de Event 1 n'a pas de TalentPaymentProfile avec
  kycStatus=VERIFIED — le payout est bloqué par le verrou 4 D-101.
  OS V15 §2.7.1 : "jamais de Transfer sans KYC vérifié."

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

  USER ENTITY :
  Entité minimale avec 5 rôles : talent, organisateur, payeur, admin,
  FOUNDER. systemId USR-*, displayName, role, createdAt.
  L'authentification est gérée par Base44 (auth.me()).
  L'accès aux engagements est contrôlé par isOrganizer / isTalent checks
  dans toutes les fonctions déployées.

  MEMBERSHIP RÉSOLUTION EN PRODUCTION :
  createEngagement/entry.ts résout le tauxPpm depuis :
  UserMembership.filter({ talentUserId }) → MembershipPlan.commission_rate_ppm.
  Fallback : 120 000 ppm (12% Freemium) si aucun plan trouvé.
  Cette résolution est opérationnelle et a été utilisée pour le pilote
  (USR-MPIGOA0O-9CZ5JA, plan Freemium, 120 000 ppm).
  Source : createEngagement/entry.ts l.365-376.

  KYCONBOARDING OPÉRATIONNEL :
  TalentPaymentProfile USR-MPIGOA0O-9CZ5JA : kycStatus=VERIFIED,
  chargesEnabled=true, detailsSubmitted=true (acct_1TaGqTKCWuw3ufQV).
  Le payout de 264$ s'est exécuté avec V4_KYC_VERIFIED (Domain C).

  MEMBERSHIPS EN PRODUCTION :
  1 MembershipPlan : Freemium tier=A rate=120 000 ppm (12%), is_active=true.
  1 UserMembership active liée au talent pilote.
  Seul Freemium est seeded — conforme à D-027 (plan de base MVP).

  EVENT ENTITY :
  24 Events en production. Champ venue = texte libre (adresse ou identifiant).
  Pas de FK Checkpoint. L'Event porte organizerUserId, name, venue, status.

Ce qui vient de V1 et est encore actif :
  V1 a 217 Checkpoints riches (CheckpointDomainLedger, CheckpointLiveStats,
  CheckpointStyleStats) et 45 TalentProfiles (bio, styles, pricing, SOTS
  score, trustScore). Ces données opèrent sur microrave.ca. Acquis
  conceptuel majeur pour V3 — mais schéma incompatible.

Ce qui vient de V2 et a survécu :
  Aucun.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT — conditionnel sur le talent de Event 1 :

• [J-BLQ-01] Si Event 1 implique un talent sans TalentPaymentProfile
  VERIFIED, le payout est bloqué (verrou 4 D-101). Aucun UI d'onboarding
  Stripe Connect n'est présent dans les 5 pages V3.
  L'onboarding du talent pilote a été réalisé manuellement
  (scripts + formulaire Stripe Express). Pour un nouveau talent,
  la procédure doit être reproduite sans surface dédiée.
  NON-BLOQUANT si Event 1 utilise USR-MPIGOA0O-9CZ5JA (déjà VERIFIED).
  BLOQUANT pour tout nouveau talent jusqu'à ce qu'une page onboarding
  existe ou que la procédure manuelle soit documentée.
  Source : TalentPaymentProfile_export.csv + absence de page KYC.

DÉGRADANT (réduit la qualité, n'empêche pas) :

• [D-J-01] PLANS MEMBERSHIP B/C/D/E NON SEEDÉS.
  D-027 définit 5 plans : Freemium A (12%), Base B (9%), Pro C (6%),
  Studio D (3.5%), Fondateur E (5%). Seul Freemium A est en production.
  Les 4 autres plans n'existent pas dans MembershipPlan.
  Conséquence : un talent Pro qui s'inscrit sera facturé à 12% (fallback)
  car aucun plan Pro n'existe pour lui associer une UserMembership.
  Le fallback dans createEngagement est explicite et sécurisé (pas de
  crash), mais crédite MR à taux incorrect pour les tiers non-Freemium.
  Source : MembershipPlan_export.csv (1 ligne) + D-027.

• [D-J-02] NO CHECKPOINT ENTITY EN V3.
  OS V15 §1.1 cite explicitement "lieu (EventLocation ou Checkpoint)"
  comme troisième acteur du triptyque. V3 ne possède pas d'entité
  Checkpoint ni de FK vers un Checkpoint dans l'Event entity.
  Le lieu est un champ texte libre (venue) sans identité institutionnelle.
  Pour Event 1 avec "Le Trèfle" comme lieu : fonctionnel (adresse texte).
  Mais la promesse "Un lieu devient ce qu'il accueille" (OS V15 §1.4) ne
  se matérialise pas — aucune mémoire territoriale attachée.
  Source : absence de Checkpoint.jsonc + Event.jsonc champ venue=string.

• [D-J-03] NO TALENTPROFILE ENTITY EN V3.
  V1 avait TalentProfile (bio, styles, badges, SOTS score, pricing).
  V3 n'a que User.jsonc (minimal) et TalentPaymentProfile.jsonc (Stripe).
  Aucun profil artistique : pas de bio, pas de styles, pas de prix
  indicatifs, pas d'historique SOTS visible sur le profil.
  La "mémoire permanente" post-SOTS est dans ReputationLedger (append-only)
  mais n'est pas consultable depuis un profil talent.
  Source : ls entities/ (28 entités, aucune nommée TalentProfile).

• [D-J-04] NO TALENTROLEPREF ERENCE ENTITY.
  IDFactory a le préfixe TRP-* (TalentRolePreference) mais aucune entité
  n'existe dans Base44. L'OS §2.5 "inchangé — voir V11" suppose que
  QuickPlay (voie tarifaire rapide) existe mais n'est pas implémenté en V3.
  Source : IDFactory.PREFIXES.TalentRolePreference = 'TRP' + ls entities/.

• [D-J-05] ORPHAN USERMEMBERSHIP RECORD.
  La deuxième UserMembership en production a userId, planId et
  commissionRatePpm vides — un artefact du seed-pilot-data.js.
  Fonctionnellement inoffensif mais pollue la table.
  Source : UserMembership_export.csv ligne 3 (champs vides).

REPORTABLE (peut attendre l'événement 2+) :

• Page KYC onboarding talent : formulaire + lien AccountLink Stripe Express.
• Les 4 plans D-027 (Base, Pro, Studio, Fondateur) à seeder.
• Checkpoint entity V3 : identité institutionnelle des lieux.
• TalentProfile V3 : bio, styles, historique SOTS visible.
• TalentRolePreference V3 : QuickPlay — tarifaire rapide.
• Onboarding vendeur : aucun flux implémenté.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première
transaction que l'OS ne documente pas explicitement ?

→ OUI — INFÉRENCE NON DOCUMENTÉE : L'OS §1.1 pose le triptyque
  talent/organisateur/lieu comme fondation de l'institution. Mais pour
  la première transaction, l'identité du "lieu" n'est vérifiée nulle part
  — c'est un champ texte libre dans l'Event. Cela signifie que
  "Le Trèfle" dans l'engagement est un string, pas un objet institutionnel
  portant une mémoire. La promesse "Un lieu devient ce qu'il accueille"
  est formulée mais non mécanisée en V3. L'OS ne documente pas ce
  delta comme une dette explicite. À valider par le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

V1 avait le plus riche des patrimoines acteur : 217 Checkpoints avec
statistiques, 45 TalentProfiles avec scoring, une hiérarchie de rôles
(RoleHierarchy.csv) complète. Cette richesse est inaccessible en V3 par
incompatibilité de schéma. C'est la dette la plus visible de V1 vers V3.

Le pari de V3 est d'avoir sacrifié la richesse actor de V1 pour gagner
la rigueur financière et contractuelle — jugement correct pour un MVP.
La dette acteur sera à rembourser pour attirer des talents qui n'ont
pas de raison technique d'utiliser V3 plutôt que V1 (encore opérationnel).

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour Event 1 avec le talent pilote déjà VERIFIED : rien à faire —
l'acteur est onboardé, le plan est seedé, le taux est résolu.
Pour toute extension : seeder les 4 plans D-027 restants et créer une
page d'onboarding talent (Stripe AccountLink + lien depuis EngagementView).

──────────────────────────────────────────────────
6. STATUT FINAL

  ☑ PRÊT SOUS CONDITIONS

  Conditions : (1) Event 1 utilise le talent pilote USR-MPIGOA0O-9CZ5JA
  (kycStatus=VERIFIED, plan Freemium 12%) ; (2) Le lieu "Le Trèfle"
  est acceptable comme texte libre dans Event.venue.

  Ces conditions sont réunies pour la Pierre de Rosette.
  Pour tout acteur nouveau (talent ou lieu), une procédure manuelle
  de KYC et de seed MembershipPlan est requise.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

• C. Stripe et paiements dépend de J pour le KYC du talent
  (TalentPaymentProfile VERIFIED) — verrou 4 D-101. Pour le talent
  pilote : satisfait. Pour tout nouveau talent : conditionnel.

• B. Finance dépend de J pour la résolution correcte du tauxPpm depuis
  UserMembership/MembershipPlan. Le fallback Freemium est sécurisé
  mais les tiers B/C/D/E ne sont pas fonctionnels.

  INFÉRENCE : le talent est le seul acteur dont l'onboarding est
  documenté (KYC Stripe). L'organisateur et le lieu sont créés via
  Base44 auth sans flux d'onboarding formel. Cela est acceptable pour
  un pilote supervisé. Pour une plateforme ouverte, un flux d'onboarding
  distinct par rôle sera nécessaire.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — J. ACTEURS ET ONBOARDING
Conserver pour le Prompt de Synthèse.