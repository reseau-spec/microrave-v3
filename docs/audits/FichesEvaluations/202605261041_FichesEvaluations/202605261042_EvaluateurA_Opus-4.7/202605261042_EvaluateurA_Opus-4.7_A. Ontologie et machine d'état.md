━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — A. Ontologie et machine d'état
Date d'évaluation : 26 mai 2026 10:50 EST
Fait avec Opus 4.7 Adaptatif
Documents sources :
  • docs/os/MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15, 785 lignes)
  • codeBase44_v3/base44/entities/{Engagement,MissionSlot,
    ContractSnapshot,Lineup}.jsonc
  • codeBase44_v3/base44/functions/{createEngagement,
    transitionEngagement}/entry.ts
  • microrave-v3/src/core/transitionEngagement.js
  • microrave-v3/src/core/guards/SealingGuard.js
  • microrave-v3/src/repositories/ContractSnapshotRepository.js
  • microrave-v3/README.md
  • codeBase44_v3/dataBase/Engagement_export.csv (24 lignes)
  • codeBase44_v3/dataBase/MissionSlot_export.csv (0 lignes)
  • 20260526-1030_RAPPORT-AUDIT-FORENSIQUE.md — FICHIER VIDE
    (0 octet, déposé mais non rempli — INCONNU)
Niveau de confiance : HAUTE (lecture directe du code et de l'OS)
                      INFÉRENCE signalée explicitement où nécessaire
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

   Ce domaine est prêt pour la première transaction quand :

   • Le chemin nominal V4 complet est implémenté et fail-closed :
     proposed → negotiating → accepted → placed → deposit_pending
     → deposit_secured → event_sealed → performed → event_completed
     → sots_window_closed → contestation_window → payable → settled
     → archived.
     — Source : OS V15 §2.6 [D-019-A] · §2.7.1 « Toute transition
       non listée ici est interdite par défaut — fail-closed. »

   • La fonction transitionEngagement() est l'UNIQUE porte de
     mutation du champ status, et applique les 5 guards dans
     l'ordre : MissionConversionGuard → WORMGuard → guard
     spécifique → FinancialInvariantGuard → AuditLogger.
     — Source : OS V15 §2.7.1 (table souveraine des guards)

   • Les 6 moments WORM sont gravés avec leur niveau de sévérité :
     accepted (W1), deposit_secured (W1), event_sealed (W2),
     event_completed (W1), sots_window_closed (W1), archived (W3).
     — Source : OS V15 §2.7 (tableau des moments WORM)

   • ContractSnapshot phase 1 (CS1-*) créé à `accepted` avec
     contenu complet : cachet brut, tier, taux, SOTS snapshot,
     historique de négociation (voie CreateEvent) ; ou
     TalentRolePreferenceId, roleMetier, tarifValeurCents,
     durée, styleSignature (voie QuickPlay).
     — Source : OS V15 §2.7 ligne « Moment 1 »

   • ContractSnapshot phase 2 (CS2-*) créé à `event_sealed`
     avec WORM financier complet : montants, taux, taxes, Stripe,
     **et cachet_brut_final_i de chaque talent (après coefficient).**
     — Source : OS V15 §2.7 ligne « Moment 3 » + [D-147]

   • MissionSlot existe et porte l'état { proposed, accepted, ... }
     comme préalable à toute transition pré-acceptation.
     — Source : OS V15 §2.7.1, guard MissionConversionGuard

   • EngagementAmendment (objet AMD-*) déclenchable depuis
     `performed`, distinct de la machine d'état principale,
     avec double consentement et taux horaire implicite invariant.
     — Source : OS V15 §2.7.2 [D-147]

   Ce domaine bloque tout le reste si :

   • Le ContractSnapshot phase 2 n'est pas gravé à event_sealed :
     « C'est cette valeur qui sert de base à tout calcul
     ultérieur — paiement, no-show, amendment. »
     — Source : OS V15 §2.7 ligne « Moment 3 » [D-147]
     Sans CS2 immuable, le no-show (LOI NO-SHOW-01/CT-014) n'a
     pas de base de remboursement, l'amendment (D-147) n'a pas
     de taux horaire implicite, et le payout n'a pas de source
     de vérité.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

   Ce qui existe et fonctionne selon les documents :

   • Deux implémentations parallèles de transitionEngagement
     coexistent :
       (a) microrave-v3/src/core/transitionEngagement.js — 40+
           transitions, les 5 guards dans l'ordre canonique,
           WORM_STATES = {accepted, deposit_secured, event_sealed,
           event_completed, sots_window_closed, archived} avec
           niveaux W1/W2/W3, DataAccessLedger écrit (§Guard 5),
           PayoutExecutor branché sur payable→settled.
       (b) codeBase44_v3/base44/functions/transitionEngagement/
           entry.ts — 15 transitions seulement, deux guards
           inline (WORM_STATES réduit à {archived, deposit_failed,
           no_show_pre_event} et un ensemble restreint de guards
           métier), pas de MissionConversionGuard, pas d'écriture
           DataAccessLedger.

   • Le SealingGuard portable construit un ContractSnapshot
     phase 2 RICHE en mémoire (waterfall, coefficientPpm,
     totalNets, totalCommissions, roundingCents, sealedByActor,
     sealedAt) et le retourne à l'appelant.
     — Source : src/core/guards/SealingGuard.js l.255-279

   • L'entité Engagement Base44 porte les champs financiers
     pré-scellement (cachetSigneCents, tauxPpm, commissionMrCents,
     talentNetCents, depositCents, balanceCents, prixVenduClientCents,
     tps/tvqCents, sealedAt, settledAt, archivedAt) et les
     timestamps de transition.
     — Source : codeBase44_v3/base44/entities/Engagement.jsonc

   • 24 Engagements en base de production :
       — 17 `deposit_pending`
       —  2 `deposit_secured`
       —  2 `placed`
       —  1 `event_sealed`     (ENG-WE66GU-AASWFD)
       —  1 `archived`         (ENG-H5V66Q-WBJ7N2)
       —  1 `proposed`
     — Source : dataBase/Engagement_export.csv

   Ce qui vient de V1 et est encore actif :

   • Non documenté dans les fichiers soumis. L'OS V15 §1 décrit
     V1 comme « microrave.ca » sans détail technique migré.
     → INFÉRENCE : aucun héritage V1 visible dans le code V3.
       À valider par le fondateur.

   Ce qui vient de V2 et a survécu :

   • Le README microrave-v3 (« Architecture souveraine — V7 FINAL »)
     référence une OS antérieure : « OS souverain : MICRORAVE_V3_
     OPERATING_SYSTEM_V7_FINAL », tandis que l'OS courante est V15
     (« V14 : D-147... »).
     — Source : microrave-v3/README.md vs OS V15 ligne 7
     → INFÉRENCE : dette documentaire — le README pointe vers une
       version d'OS abrogée. Indique une migration V2→V3
       incomplète au niveau de la documentation racine.
     → À valider par le fondateur.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

   BLOQUANT (empêche la première transaction) :

   • ContractSnapshot phase 2 N'EST CRÉÉ NULLE PART en production.
     Recherche grep --include='*.ts,*.tsx,*.js,*.jsx' sur
     « ContractSnapshot » dans codeBase44_v3 → 0 occurrence dans
     les fonctions et composants. L'entité existe (schéma), aucun
     code Base44 ne l'instancie.
     — Source : codeBase44_v3 (grep -rn "ContractSnapshot")
     — Violation OS V15 §2.7 ligne « Moment 3 » : « cachet_brut_
       final_i de chaque talent est gravé ici. C'est cette valeur
       qui sert de base à tout calcul ultérieur. »

   • L'entité ContractSnapshot Base44 est ANÉMIQUE : 4 champs
     déclarés (systemId, engagementId, phase, createdAt). Aucun
     champ de contenu (cachet, taux, waterfall, coefficient).
     Même si le SealingGuard portable produit un snapshot riche,
     son écriture vers Base44 perdrait tout contenu non déclaré
     dans le schéma (INFÉRENCE — comportement Base44 sur champs
     hors schéma à confirmer empiriquement).
     — Source : codeBase44_v3/base44/entities/ContractSnapshot.jsonc
     — Aucun ContractSnapshot_export.csv ne figure dans dataBase/,
       confirmation indirecte qu'aucune entrée n'a jamais été créée.

   • La porte unique de l'OS n'est pas unique. Deux
     transitionEngagement coexistent (point 2 ci-dessus). Celle
     que Base44 exécute en production (entry.ts) :
       — n'a pas la transition `accepted → placed`
       — n'a pas `deposit_pending → deposit_failed`
       — n'a pas `* → disputed` (Frein d'Urgence)
       — n'a pas `contestation_window → disputed` (Régime 2)
       — n'a pas `disputed → payable/partially_settled/refunded`
       — n'a pas le cycle transfert (D-013)
       — n'a pas `no_show_pre_event → archived`
       — n'a pas `cancelled_*/refunded/withdrawn → archived`
     — Source : codeBase44_v3/.../transitionEngagement/entry.ts
       ALLOWED_TRANSITIONS (15 entrées) vs OS V15 §2.7.1
       (40+ entrées listées comme exhaustives, fail-closed).

   • createEngagement Base44 instancie directement l'Engagement
     en status `'placed'` (ligne 139 d'entry.ts), sautant les
     états proposed → negotiating → accepted. Aucun ContractSnapshot
     phase 1 n'est créé. Le « Moment WORM 1 » n'a jamais lieu.
     — Source : codeBase44_v3/.../createEngagement/entry.ts l.125-142
     — Violation OS V15 §2.7 ligne « Moment 1 »

   • L'entité MissionSlot est ANÉMIQUE (5 champs) et 0 ligne en
     base (MissionSlot_export.csv = 0 octet). Aucun code Base44
     ne la référence (grep "MissionSlot" sur codeBase44_v3 →
     1 occurrence : le fichier de schéma lui-même). Le
     MissionConversionGuard de l'OS §2.7.1 ne peut pas être
     évalué : son substrat est vide.
     — Source : codeBase44_v3/base44/entities/MissionSlot.jsonc
       + dataBase/MissionSlot_export.csv

   • Le champ `status` de l'entité Engagement est `"type": "string"`
     SANS énumération. Base44 acceptera silencieusement n'importe
     quelle valeur, y compris des états non répertoriés par l'OS.
     Le fail-closed exigé par l'OS §2.7.1 ne peut pas être garanti
     au niveau de la donnée — seulement au niveau applicatif (et
     transitionEngagement entry.ts ne couvre que 15 paires).
     — Source : codeBase44_v3/base44/entities/Engagement.jsonc l.30-33

   • L'unique Engagement `archived` en production (ENG-H5V66Q-
     WBJ7N2) a `talentUserId='012'` (non conforme IDFactory USR-*),
     `settledAt` VIDE, et fut créé/archivé le même jour
     (2026-05-26). Il n'a donc pas suivi le chemin nominal
     `payable → settled → archived`. C'est une entrée de test, pas
     une première transaction réelle.
     — Source : dataBase/Engagement_export.csv

   • Aucune entité BugReplayRecord, GoNoGoDecisionRecord,
     DecisionRecord, DisputeRecord, EngagementAmendment dans
     codeBase44_v3/base44/entities/. Or l'OS V15 §2.7.1 nomme
     ces objets comme préalables à plusieurs guards
     (DisputeResolutionGuard exige DecisionRecord ; ArchiveWORMGuard
     `settled → archived` exige GoNoGoDecisionRecord = GO).
     — Source : codeBase44_v3/base44/entities/ (liste exhaustive)

   DÉGRADANT (réduit la qualité, n'empêche pas) :

   • Le README microrave-v3 référence MICRORAVE_V3_OPERATING_
     SYSTEM_V7_FINAL alors que l'OS courante est V15. Dette
     documentaire qui contredit la doctrine d'append-only et
     fragilise tout nouvel auditeur ou contributeur.

   • L'AuditLogger du transitionEngagement portable écrit au
     DataAccessLedger « non-bloquant si repositories.admin absent
     (SoloFounderOverride Event 0 pilote) » (l.376-379 de
     src/core/transitionEngagement.js). En l'état le contrat
     d'audit transversal de l'OS §2.7.1 « toujours, sans
     exception » est affaibli — gradé en best-effort. À durcir
     avant Event 1.

   REPORTABLE (peut attendre l'événement 2+) :

   • EngagementAmendment (D-147) — l'objet est défini dans l'OS
     V15 §2.7.2 et le test AMENDMENT-01 existe dans tests/p0/,
     mais aucune entité AMD-* en base. Reportable car la
     première transaction canonique (Pierre de Rosette, OS §14.9)
     ne suppose pas d'extension de plage horaire.

   ANGLE MORT POTENTIEL :

   Le « MissionConversionGuard » est nommé deux fois dans l'OS
   §2.7.1 : une fois comme garde n°1 transversal (« valide la
   légitimité de la transition demandée »), une fois comme garde
   spécifique aux transitions proposed→*. Le rôle exact du même
   nom dans les deux positions n'est pas explicité.
   → INFÉRENCE NON DOCUMENTÉE : le code microrave-v3 résout
     l'ambiguïté en exécutant le guard deux fois (l.221 puis
     court-circuit l.480 « already_validated_in_guard_1 »). À
     valider : est-ce la doctrine voulue, ou un doublon à clarifier
     dans l'OS V16 ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

   La V3 traîne une dette V2 documentaire majeure : le code
   portable src/core/ (TypeScript-ish Node.js, guards complets,
   repositories adapter-pattern) coexiste avec le code Base44
   `codeBase44_v3/base44/functions/*.ts` (Deno.serve, logique
   inline, transitions reduites). Le README pose la règle
   absolue : « Le code Base44 ne contient jamais la vérité métier.
   Il appelle des fonctions métier portables définies dans
   src/core/. » — Source : microrave-v3/README.md
   Cette règle est VIOLÉE par la transitionEngagement Base44 et
   par createEngagement Base44, qui implémentent leur propre
   logique métier au lieu d'appeler src/core/.

   La V3 n'a hérité ni état stable de V1 ni continuité financière
   de V2 — l'unique « archived » en base est synthétique. La
   destination n'a jamais été atteinte par aucune des trois
   versions ; aucun acquis ne raccourcit la route.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

   Pour que le domaine soit prêt : (i) brancher la
   transitionEngagement portable comme unique porte du backend
   Base44 (suppression ou délégation pure de l'entry.ts Base44),
   (ii) enrichir le schéma ContractSnapshot Base44 avec tous les
   champs du snapshot produit par SealingGuard (waterfall,
   coefficientPpm, totalNets, totalCommissions, roundingCents,
   sealedAt, sealedByActor, plus contenu CS1 phase 1), (iii)
   instancier MissionSlot et ContractSnapshot phase 1 dans le
   parcours createEngagement avant `placed`, (iv) ajouter
   l'énumération du champ status au schéma Engagement, (v) créer
   les entités manquantes (BugReplayRecord, GoNoGoDecisionRecord,
   DecisionRecord) pour ne pas laisser ArchiveWORMGuard sans
   préalables vérifiables.

──────────────────────────────────────────────────
6. STATUT FINAL

   ☑ BLOQUÉ PAR → soi-même.

   Le domaine A est, à la fois, le bloqueur racine et la cible.
   Aucun ContractSnapshot phase 2 ne sera jamais créé sur le chemin
   actuel — donc aucune base WORM pour le payout, aucun substrat
   au no-show, aucun socle pour l'amendment. La règle 3 du prompt
   s'applique : ce bloqueur écrase tout pourcentage d'avancement.

   Estimation indicative (à titre informatif, hors règle 3) :
   ontologie portable ~80 % conforme (src/core/), substrat Base44
   ~25 % conforme (entités anémiques, fonctions divergentes).
   Effectif fonctionnel : 0 % tant que CS2 n'est pas gravé en base.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

   • Domaine B (Finance et ledger) ne peut pas être validé tant
     que CS2 n'existe pas : « C'est cette valeur qui sert de base
     à tout calcul ultérieur — paiement, no-show, amendment. »
     — Source : OS V15 §2.7 [D-147]

   • Domaine C (Stripe et paiements) dépend de la transition
     `deposit_pending → deposit_secured` (Moment WORM 2, surveillance
     solde, SchedulerDueTask balance_deadline_check) et de
     `deposit_secured → event_sealed` (création CS2). Les deux
     passent par transitionEngagement.
     — Source : OS V15 §2.7.1 (lignes EventPaymentGuard,
       SealingGuard)

   • Domaine D (Présence et preuve) dépend de
     `event_sealed → performed` (PresenceWindowGuard) — donc
     dépend de l'existence de l'état `event_sealed`.
     — Source : OS V15 §2.7.1

   • Domaine E (SOTS et réputation) dépend de
     `event_completed → sots_window_closed → contestation_window`
     pour ouvrir et fermer correctement les fenêtres.
     — Source : OS V15 §2.7.1

   • Domaine G (Admin) dépend du DataAccessLedger qui doit être
     écrit par AuditLogger (guard n°5) à CHAQUE transition,
     actuellement best-effort.
     — Source : OS V15 §2.7.1

   • Domaine I (UX et vérité perçue) — la « ventilation avant
     acceptation » suppose un ContractSnapshot phase 1 lisible.
     — Source : OS V15 §2.7 ligne « Moment 1 »
     → INFÉRENCE non explicite dans l'OS sur le couplage UX.
       À valider.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — A. Ontologie et machine d'état
Fiche conservée en mémoire de session pour Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━