━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — E. SOTS et réputation
Date d'évaluation : 26 mai 2026
Documents sources :
  • docs/os/MICRORAVE_V3_OPERATING_SYSTEM_V15.md (§1.4 promesses,
    §2.7 Moment 4 event_completed / Moment 5 sots_window_closed,
    §2.7.1 ligne SOTSWindowGuard, §14.9 Pierre de Rosette
    Carte C05)
  • docs/os/EXPORT_BRUT…REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-077 « ReputationLedger append-only + EMA », D-078 matrice
    de notation, D-079 dimensions configurables, D-080
    SOTSCommissionModulation, D-081 EMA, D-082 contestation
    reversal, D-083 SOTSConfidencePolicy, D-094 patterns fraude,
    D-115 TicketAdmissionRight)
  • codeBase44_v3/base44/functions/submitSOTSRating/entry.ts
  • codeBase44_v3/base44/entities/{SOTSSubmission,
    SOTSDimensionConfig, SOTSScoreSnapshot, ReputationLedger}.jsonc
  • codeBase44_v3/dataBase/{SOTSDimensionConfig, SOTSSubmission,
    ReputationLedger, PolicyConfig}_export.csv
  • microrave-v3/src/services/SOTSSubmissionService.js (portable,
    non branché)
  • microrave-v3/src/repositories/SOTSRepository.js
  • microrave-v3/tests/p0/SOTS-SELF-01.js
  • 20260526-1030_RAPPORT-AUDIT-FORENSIQUE.md — FICHIER VIDE
    (0 octet, INCONNU)
Niveau de confiance : HAUTE (1 soumission persistée en base,
    dimensions seedées et auditables, code submitSOTSRating
    lisible bout-à-bout)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

   Ce domaine est prêt pour la première transaction quand :

   • Le ReputationLedger est append-only et chaque soumission y
     produit une entrée immuable. « Couche 1 — ReputationLedger :
     append-only. Chaque soumission SOTS = ReputationLedgerEntry
     immuable. Invalidation = entrée reversal liée à
     DecisionRecord + EvidenceBundle. Jamais supprimée. »
     — Source : D-077, EXPORT_BRUT §BLOC 9
     « Le ReputationLedger garde pourquoi ; le snapshot dit
     combien. »

   • L'auto-note est bloquée absolument (D-094 pattern 6
     SOTS_SELF_BENEFICIAL : « auto-note directe ou indirecte →
     blocage absolu »).
     — Source : D-094, EXPORT_BRUT §BLOC 11
     — Test : SOTS-SELF-01 « Auto-note directe ou indirecte
       bloquée »

   • La matrice de notation D-078 est respectée : « Un acteur
     peut noter seulement ce qu'il a réellement vécu ou observé. »
     Pour Pierre de Rosette canonique, l'organisateur note le
     talent — seule voie active du MVP.
     — Source : D-078, EXPORT_BRUT §BLOC 9 ; OS V15 §14.9 Carte
       C05 « Le Trèfle note Alex 24h après. Append-only. »

   • Les dimensions SOTS sont en base, jamais hardcodées : score
     unique sur 5 calculé depuis dimensions internes
     (SOTSDimensionConfig). Somme des poids actifs = 1 000 000
     ppm.
     — Source : D-079, EXPORT_BRUT §BLOC 9

   • La fenêtre SOTS de 24 h s'ouvre à event_completed (Moment
     WORM 4) et se ferme par un SOTSScoreSnapshot consolidé
     (Moment WORM 5).
       — « Moment 4 | event_completed | Ouverture fenêtre SOTS 24h »
       — « Moment 5 | sots_window_closed | WORM réputationnel —
         scores consolidés »
       — « event_completed → sots_window_closed | SOTSWindowGuard |
         Fenêtre 24h écoulée · SOTSSubmissions consolidées »
     — Source : OS V15 §2.7 + §2.7.1

   • Le SOTSScoreSnapshot est calculé par EMA avec facteur de
     lissage configurable (SOTSCalculationPolicyConfig.
     emaAlpha_ppm). « Score SOTS courant calculé par EMA avec
     facteur de lissage configurable. »
     — Source : D-081, EXPORT_BRUT §BLOC 9

   • Les seuils de confiance modulent la commission selon
     SOTSConfidencePolicyConfig (1 / 3 / 5 / 10 soumissions).
     « Sous 10 soumissions : multiplicateur forcé à 1 000 000
     ppm. »
     — Source : D-083, EXPORT_BRUT §BLOC 9

   • La condition C-08 D-075 est satisfaite avant tout payout :
     « SOTSSubmission du talent soumis ← requis, pas optionnel. »
     — Source : D-075, EXPORT_BRUT §BLOC 8

   Ce domaine bloque tout le reste si :

   • Aucune SOTSSubmission n'est créée → C-08 D-075 échoue →
     `contestation_window → payable` bloqué → payout impossible.
     — Source : D-075 + OS V15 §2.7.1

   • Le SOTSScoreSnapshot n'est jamais produit → Moment WORM 5
     n'a pas lieu → la transition `event_completed →
     sots_window_closed` ne devrait pas pouvoir passer sans
     consolidation (SOTSWindowGuard).
     — Source : OS V15 §2.7.1 ligne SOTSWindowGuard

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

   Ce qui existe et fonctionne selon les documents :

   • SOTSDimensionConfig seedée en base avec 7 dimensions
     ACTIVES couvrant exactement 1 000 000 ppm (142 858 + 6 ×
     142 857) : performance_artistique, fiabilite_operationnelle,
     professionnalisme_relationnel, experience_generee,
     adequation_mandat, non_toxicite, reference. Toutes avec
     `isActive = true` et `affectsCommission = true`. D-079
     respecté en substrat.
     — Source : dataBase/SOTSDimensionConfig_export.csv

   • submitSOTSRating fail-hard si SOTSDimensionConfig vide :
     « DIMENSIONS_NOT_SEEDED ». Aucun fallback hardcodé.
     — Source : submitSOTSRating/entry.ts l.64-69, conforme à
       D-079 « Aucune dimension hardcodée »

   • Auto-note bloquée (D-094 pattern 6) :
     `if (me.id === eng.talentUserId) → 422 SOTS_SELF_BENEFICIAL`.
     — Source : submitSOTSRating/entry.ts l.131-136

   • Restriction noteur D-078 MVP : seul l'organisateur peut
     soumettre. `if (me.id !== eng.organizerUserId) → 403`.
     — Source : submitSOTSRating/entry.ts l.139-144

   • États autorisés pour SOTS conformes à la fenêtre SOTS :
     `['event_completed', 'sots_window_closed',
     'contestation_window']`.
     — Source : submitSOTSRating/entry.ts l.45

   • Idempotence : si une SOTSSubmission existe déjà pour
     (engagementId, submittedBy), retour `idempotent: true`.
     — Source : submitSOTSRating/entry.ts l.153-166

   • ReputationLedger entry créée à chaque submission
     (`entryType: 'SOTS_SCORE'`, `scoreValue: scoreUnits`).
     Conforme à D-077 « append-only ».
     — Source : submitSOTSRating/entry.ts l.207-215

   • PolicyConfig : `sots_window_duration_hours = 24`
     (recommandation MVP de D-082).
     — Source : dataBase/PolicyConfig_export.csv

   • Données opérationnelles V3 :
       — 1 SOTSSubmission (engagementId=ENG-H5V66Q-WBJ7N2,
         submittedBy = ID Base44 interne du fondateur,
         talentUserId='012', role='organisateur',
         scores={reference:4000, non_toxicite:4000, ...} pour
         tous les 7 keys, consolidated=false)
       — 1 ReputationLedger entry (REP-8QM5DS-6JUBH9,
         userId='012', score=4000)
     L'auto-note bloquée a été techniquement traversée (puisque
     submittedBy = ID Base44 du fondateur ≠ talentUserId='012'),
     mais sur un engagement de test à talentUserId placeholder.
     — Source : dataBase/SOTSSubmission_export.csv +
       ReputationLedger_export.csv

   Ce qui vient de V1 et est encore actif :

   • Non documenté dans les fichiers soumis pour le SOTS
     spécifiquement. L'OS V15 §1 décrit V1 sans détail
     transposable.
     → INFÉRENCE : aucun héritage V1 visible sur la doctrine
       SOTS de V3. À valider par le fondateur.

   Ce qui vient de V2 et a survécu :

   • La doctrine SOTS multi-dimensionnelle (D-077 à D-083, D-094)
     est V11/V12 — héritage doctrinal stable. La seed des 7
     dimensions en base (avec poids cohérents à 1 000 000 ppm
     exact) est un acquis non-trivial.

   • La sous-implémentation hardcodée (v3 avait les 7 dimensions
     en dur, v4 a corrigé fail-hard sur SOTSDimensionConfig)
     est une cicatrice de migration que le commentaire de
     submitSOTSRating l.6-23 documente. ACQUIS : la correction
     est faite. DETTE : la mémoire de la régression doit rester
     visible.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

   BLOQUANT (empêche la première transaction) :

   • Aucune fonction de consolidation SOTS dans
     codeBase44_v3/base44/functions/ : pas de
     `consolidateSOTS`, pas de création SOTSScoreSnapshot. La
     transition `event_completed → sots_window_closed` (Moment
     WORM 5 — « WORM réputationnel — scores consolidés ») ne
     produit aucun SOTSScoreSnapshot.
     — Source : codeBase44_v3/base44/functions/ (liste
       exhaustive) ; OS V15 §2.7 Moment 5
     — Le service portable SOTSSubmissionService.js (microrave-v3/
       src/services/) implémente createSOTSScoreSnapshot mais
       n'est pas branché au backend Base44.

   • Le transitionEngagement Base44 n'a PAS de SOTSWindowGuard.
     La transition `event_completed → sots_window_closed`
     traverse sans `guardResult` spécifique (la fonction default
     est `{passed:true}`). « Fenêtre 24h écoulée · SOTSSubmissions
     consolidées » n'est jamais vérifié.
     — Source : codeBase44_v3/.../transitionEngagement/entry.ts
       l.216-223 (mapping des guards) ; OS V15 §2.7.1 ligne
       SOTSWindowGuard

   • Aucun SOTSScoreSnapshot n'existe en base de production V3.
     Aucun fichier `SOTSScoreSnapshot_export.csv` dans
     dataBase/. Pour Pierre de Rosette canonique, sans snapshot
     consolidé, la Carte C05 (« Mémoire permanente créée ») n'a
     pas de support de persistance.
     — Source : dataBase/ (ls)

   • Notation par dimension non implémentée : submitSOTSRating
     applique un score unique à toutes les 7 dimensions
     uniformément (l.177-180 « Mode pilote : même score_units
     pour toutes les dimensions »). Le commentaire « TODO Event 1 :
     exposer chaque dimension dans le formulaire UI » reconnaît
     la régression. D-079 exige « calculé depuis dimensions
     internes » — pas un score unique réplique.
     — Source : submitSOTSRating/entry.ts l.172-180

   DÉGRADANT (réduit la qualité, n'empêche pas) :

   • Configs SOTS critiques manquantes en PolicyConfig (sur 36
     entrées seedées) :
       — SOTSCommissionModulationConfig (D-080) — multiplicateur
         de commission par seuil
       — SOTSCalculationPolicyConfig (D-081) — emaAlpha_ppm,
         minSubmissionsForEma, calculationMethod
       — SOTSConfidencePolicyConfig (D-083) — niveaux 1/3/5/10
         soumissions
       — SOTSContestPolicyConfig (D-082) — fenêtre contestation
         48h
       — SOTSFraudDetectionPolicyConfig (D-094) — 7 patterns
     Pour Pierre de Rosette (1 soumission), le fallback D-083
     (« sous 10 soumissions : multiplicateur forcé à 1 000 000
     ppm ») couvre l'absence de modulation. Mais sans les
     configs, le moteur de modulation n'a aucun substrat pour
     démarrer.
     — Source : dataBase/PolicyConfig_export.csv (36 clés
       inspectées, aucune commençant par sots_*/SOTSPolicy)

   • L'entité SOTSScoreSnapshot Base44 est anémique : 5 champs
     (systemId, engagementId, aggregatedScore, submissionCount,
     createdAt). Manquent les champs OBJECT_REGISTRY EXPORT_BRUT :
     userId, score_units, calculatedAt, confidenceLevel, ainsi
     que la décomposition par dimension. Si jamais le snapshot
     était produit, il ne porterait pas la richesse requise par
     D-077 « Couche 2 : snapshoté pour affichage, ContractSnapshot
     et calculs de commission ».
     — Source : entities/SOTSScoreSnapshot.jsonc

   • L'entité ReputationLedger est minimale : 6 champs. Manquent
     `submissionId` (lien vers le SOT-* d'origine),
     `reversalOfId` (pour D-082 contestation reversal),
     `decisionRecordId`, `evidenceBundleId` — donc une entrée
     reversal D-082 n'a pas où pointer.
     — Source : entities/ReputationLedger.jsonc

   • La fonction n'écrit jamais `consolidated: true` ni
     `consolidatedAt`. La SOTSSubmission existante en base est
     `consolidated: false` — figée à l'état non consolidé.
     — Source : data + submitSOTSRating absence de mécanisme de
       consolidation

   • Si Submission échoue après création (ex. erreur réseau sur
     ReputationLedger.create), la fonction renvoie `ok: true`
     avec warning + demande d'« intervention manuelle requise »
     (l.218-228). Cela rompt l'atomicité — une SOTSSubmission
     peut exister sans ReputationLedger entry correspondante.
     — Source : submitSOTSRating/entry.ts l.207-229

   REPORTABLE (peut attendre l'événement 2+) :

   • D-094 patterns autres que #6 non implémentés :
     SUSPICIOUS_SOTS_CLUSTER, SOTS_PATTERN_ANOMALY,
     CROSS_TALENT_SOTS_SUSPICIOUS, SOTS_CONFLICT_OF_INTEREST.
     Reportable car Pierre de Rosette est mono-talent et le
     noteur est un Checkpoint connu.

   • Audience SOTS (D-115 — TicketAdmissionRight +
     AudienceCheckIn) : entités absentes de Base44 (aucune
     `TicketAdmissionRight.jsonc` ni `AudienceCheckIn.jsonc`).
     D-115 indique « MVP : TicketAdmissionRight obligatoire
     même à 0$ ». Reportable car pour Pierre de Rosette
     l'audience ne note pas — seul l'organisateur note.
     — Source : codeBase44_v3/base44/entities/ (29 entités)

   • Contestation SOTS D-082 (fenêtre 48h, reversal entry) —
     non implémentée en code. Reportable post-Event 1.

   • Tests P0 SOTS-FRAUD-01 et REPUTATION-APPEND-01 (D-077,
     D-094) — pas trouvés dans tests/p0/, seul SOTS-SELF-01.js
     existe.
     — Source : ls tests/p0/

   ANGLE MORT POTENTIEL :

   D-078 stipule « MVP : organisateur seul peut noter dans ce
   contexte » mais le code accepte les états sots_window_closed
   et contestation_window — donc on PEUT noter même après la
   fermeture de la fenêtre SOTS (l.45). Or les SOTSSubmissions
   tardives ne sont plus consolidables (Moment WORM 5 déjà passé
   en théorie). L'OS V15 §2.7 dit « Moment 5 sots_window_closed :
   WORM réputationnel — scores consolidés ». Si W5 est WORM,
   accepter une submission post-W5 est une violation potentielle.
   → INFÉRENCE NON DOCUMENTÉE : faut-il restreindre
     `VALID_STATES_FOR_SOTS` à `event_completed` uniquement ?
     L'OS V15 §2.7.1 ligne `event_completed → sots_window_closed`
     dit « SOTSSubmissions consolidées » — implique fermeture
     du flux d'entrée à ce point. À trancher par le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

   La V3 hérite d'une cicatrice corrigée : submitSOTSRating v3
   hardcodait les 7 dimensions ; v4 a migré vers fail-hard sur
   SOTSDimensionConfig (commentaire l.6-23). Le commentaire
   honore la doctrine D-079 « Aucune dimension hardcodée » et
   reconnaît l'écart précédent. C'est un acquis méthodologique :
   la doctrine a triomphé d'une simplification opportuniste.

   La dette résiduelle est ailleurs : Couche 2 (EMA +
   SOTSScoreSnapshot) n'a jamais existé en production. C'est
   une dette de construction, pas d'héritage.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

   Pour que le domaine soit prêt : (i) implémenter un Base44
   function `consolidateSOTS` (ou brancher
   SOTSSubmissionService portable) qui produit le
   SOTSScoreSnapshot consolidé à la fermeture de la fenêtre,
   (ii) ajouter un SOTSWindowGuard dans transitionEngagement
   Base44 pour `event_completed → sots_window_closed` qui exige
   le snapshot + l'écoulement de 24 h, (iii) seeder
   SOTSConfidencePolicyConfig (au minimum) pour que le fallback
   D-083 ait un substrat, (iv) exposer dans le formulaire UI les
   7 dimensions individuellement (D-079), (v) enrichir
   l'entité SOTSScoreSnapshot avec userId, score_units,
   confidenceLevel et décomposition par dimension.

──────────────────────────────────────────────────
6. STATUT FINAL

   ☑ EN COURS → ~ 60 % du flux nominal couvert pour Pierre
     de Rosette mono-talent.

   Détail :
     — Auto-note bloquée (D-094 pattern 6) : 100 %.
     — Restriction noteur organisateur seul (D-078 MVP) : 100 %.
     — Dimensions configurables en base (D-079) : 100 %.
     — Append-only ReputationLedger (D-077 couche 1) : 100 %.
     — Idempotence submission par évaluateur : 100 %.
     — Notation par dimension UI/backend (D-079) : 0 % (mode
       pilote uniforme).
     — Consolidation EMA + SOTSScoreSnapshot (D-077 couche 2 +
       D-081) : 0 %.
     — SOTSWindowGuard sur `event_completed → sots_window_closed`
       (Moment WORM 5) : 0 %.
     — Configs PolicyConfig SOTS (D-080/081/082/083/094) : 5 %
       (seul sots_window_duration_hours seedé).
     — Contestation D-082 + 7 patterns fraude D-094 : 0 %.
     — Atomicité SOTSSubmission ↔ ReputationLedger : ~ 80 %
       (warning manuel possible si seconde écriture échoue).

   Pour Pierre de Rosette canonique mono-talent à 1 soumission,
   un payout pourrait techniquement atteindre C-08 D-075 avec la
   SOTSSubmission isolée (sans consolidation). Mais le Moment
   WORM 5 ne se produit pas réellement — c'est une fiction de
   moment. Pour Event 1 commercial le bloqueur Moment 5 reste
   ouvert.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

   • Domaine A (machine d'état) — sots_window_closed (Moment
     WORM 5) ne devrait pas être atteignable sans
     SOTSScoreSnapshot consolidé. Tant que Domaine E n'émet pas
     le snapshot, le passage en Moment 5 est un mensonge
     institutionnel.
     — Source : OS V15 §2.7 + §2.7.1 SOTSWindowGuard

   • Domaine B (finance et ledger) — D-080 modulation de
     commission par SOTS s'applique à event_sealed et au-delà.
     Pour 1 soumission, le multiplicateur retombe à 1 000 000
     ppm (fallback D-083), donc structurellement inerte au MVP
     mono-talent — mais redevient actif dès qu'un talent
     accumule 10 soumissions.
     — Source : D-080, D-083

   • Domaine D (présence et preuve) — C-08 D-075 (« SOTSSubmission
     soumis ← requis, pas optionnel ») fait partie des 11
     conditions de payout. Le PresenceProofGuard portable charge
     cette condition ; sans SOTSSubmission, le payout est
     bloqué.
     — Source : D-075 condition 7 ; PresenceProofGuard.js l.270-281

   • Domaine I (UX et vérité perçue) — D-084 « UX talent —
     format universel par état » exige que chaque état affiche
     « Statut · Argent · Prochaine action · Délai · Preuve ou
     blocage ». À sots_window_closed, l'UI doit afficher un
     score consolidé. Sans SOTSScoreSnapshot, l'UI affiche un
     état dégradé.
     — Source : D-084, EXPORT_BRUT §BLOC 10

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — E. SOTS et réputation
Fiche conservée en mémoire de session pour Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━