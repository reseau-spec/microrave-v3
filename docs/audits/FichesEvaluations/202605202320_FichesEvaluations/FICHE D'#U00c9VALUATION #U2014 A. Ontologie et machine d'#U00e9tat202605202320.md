━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — A. Ontologie et machine d'état
(Engagement, MissionSlot, ContractSnapshot, états WORM)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • transitionEngagement.js (lu ligne par ligne)
  • Tous les guards src/core/guards/*.js (13 fichiers)
  • IDFactory.js · MoneyMath.js
  • Tous les tests p0/*.js (16 fichiers — exécutés en direct)
  • FicheEvaluation20260517.md (référence delta)
Niveau de confiance : HAUTE sur la spécification et le code
                      INFÉRENCE sur la persistence Base44 (non vérifiable)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- transitionEngagement() est l'unique point d'entrée pour tout
  changement d'état — LOI TRANSITION-01, OS V15 section 16.2
- Les 5 guards s'exécutent dans l'ordre invariant
  (MCG → WORM → Guard spécifique → FinancialInvariantGuard →
  AuditLogger) — OS V15 section 2.7.1
- Les 6 moments WORM sont actifs avec leurs niveaux de sévérité
  (W1/W2/W3) — OS V15 section 2.7 tableau D-014
- SealingGuard valide réellement deposit_secured → event_sealed
  (balance reçue, CS phase 2, LOI LINEUP-01/02, LOI LEDGER-02,
  cachet_brut_final_i gravé) — OS V15 section 2.7.1 + D-147
- ContractSnapshot phase 1 créé et persisté à accepted (Moment 1)
  — OS V15 section 2.7 moment 1
- ContractSnapshot phase 2 créé et persisté à event_sealed (Moment 3)
  — OS V15 section 2.7 moment 3
- AuditLogger écrit réellement au DataAccessLedger (Guard 5)
  — OS V15 section 2.7.1
- EngagementAmendmentGuard opérationnel (D-147) — OS V15 section 2.7.2
- Chemin nominal Pierre de Rosette C02 traversable de bout en bout
  : accepted → deposit_secured → event_sealed → performed →
  event_completed → sots_window_closed → contestation_window →
  payable → settled → archived — OS V15 section 14.9

Ce domaine bloque tout le reste si :

- transitionEngagement() peut être contournée — LOI TRANSITION-01,
  OS V15 section 16.2
- event_sealed (W2) peut être modifié sans AdminIncidentRecord P0
  + SYSTEM_HOLD — OS V15 section 2.7 BLOC 2 V8
- Les tests P0 qui dépendent de transitionEngagement() ne peuvent
  pas s'exécuter — un module non trouvé à l'import = 0 test validé

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

transitionEngagement.js — Conforme à OS V15.
  • Table souveraine : 43 transitions complètes, couvrant tous les
    chemins nominaux et alternatifs de la machine d'état V4
    [D-019-A+B] — incluant balance_pending supprimé [D-014-A],
    payable non-WORM [D-014-B], contestation_window inséré [D-019-B],
    sots_window_closed→payable supprimé [D-019-B].
  • WORM_STATES : 6 moments officiels — accepted(W1),
    deposit_secured(W1), event_sealed(W2), event_completed(W1),
    sots_window_closed(W1), archived(W3). payable retiré [D-014-B].
    Conforme au tableau D-014 de l'OS V15.
  • GUARD 4.5 (PayoutExecutor) câblé à payable→settled.
  • IDFactory.validate() sur engagementId et actor.

SealingGuard — Implémenté (non-placeholder).
  • Vérifie balance reçue, LOI LINEUP-01/02, LOI LEDGER-02,
    calcule coefficient, grave cachet_brut_final_i par talent,
    construit ContractSnapshot phase 2 — source : SealingGuard.js
    (lire entier, 150+ lignes de logique réelle).
  • Conforme à D-147 : cachet_brut_final_i issu du CS phase 2.

EngagementAmendmentGuard — Implémenté et testé.
  • 14/14 PASSED sur AMENDMENT-01 — source : exécution directe.
  • D-147 entièrement opérationnel : extension durée, taux WORM,
    double consentement, calculs delta, LOI LEDGER-02 post-amendment.

Autres guards opérationnels (avec tests PASSED) :
  • MissionConversionGuard : 14/14 PASSED (MISSIONCONVERSION-01)
  • IDFactory : 7/7 PASSED (IDFACTORY-01)
  • ContestationWindowGuard : PASSED (CONTESTATION-WINDOW-01)
  • EventPaymentGuard + DepositFail : PASSED (DEPOSIT-FAIL-01)
  • PresenceProofGuard : PASSED (PRESENCEPROOF-01)
  • NoShowGuard + SC-NO-SHOW-PRE : PASSED (NO-SHOW-PRE-01)
  • StripeAdapter/PayoutExecutor : 19/19 PASSED (STRIPE-J8-01)

Ce qui vient de V1 et est encore actif :
  V1 sur microrave.ca — réseau humain actif (DJ Alex Dubois,
  Le Trèfle/CP-PLATEAU-0001). ACQUIS : co-testeurs réels pour
  la Pierre de Rosette. DETTE : patterns de mutation directe
  du champ status potentiellement acquis — indétectables sans
  DataAccessLedger opérationnel.

Ce qui vient de V2 :
  Néant. V2 abandonnée pour anti-pattern architectural.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-A1 — Casse de fichier sur 3 requires dans
  transitionEngagement.js.
  Ligne 61 : require('./guards/Presenceproofguard')
  Ligne 62 : require('./guards/Ledgerinvariantguard')
  Ligne 63 : require('./guards/Noshowguard')
  Les fichiers réels sont PresenceProofGuard.js,
  LedgerInvariantGuard.js, NoShowGuard.js (casse correcte).
  Sur Linux (filesystem case-sensitive), ce require échoue avec
  MODULE_NOT_FOUND à l'import du module — source : exécution directe
  des tests CHEMIN-NOMINAL-01, TRANSITION-01, SEALING-01,
  PLACEMENT-01, GUARDS-CHAIN-01, PAYOUT-SETTLED-01 (tous crash).
  CONSÉQUENCE : 6 tests P0 sur 16 ne peuvent pas s'exécuter.
  Le chemin nominal bout en bout (Pierre de Rosette C02) est
  non validé. La machine d'état est paralysée en production Linux.

- BLOQUANT-A2 — DataAccessLedger absent.
  Guard 5 : console.log('[AuditLogger]', ...) — aucune écriture
  en database — source : transitionEngagement.js Guard 5.
  LOI TRANSITION-01 : "Toute mutation du champ status déclenche
  un DataAccessLedger entry" — source : OS V15 section 16.2.
  Sans lui, les contournements de transitionEngagement() depuis
  l'UI Base44 sont indétectables. LOI GREFFIER-01 non vérifiable.

- BLOQUANT-A3 — POLICYCONFIG-FAILCLOSED-01 : FAILED.
  Source : exécution directe. PolicyConfigRepository.getConfig()
  ne respecte pas le comportement fail-closed requis dans un ou
  plusieurs cas testés. L'OS section 13.x stipule que tout accès
  à une config absente doit fail-closed (jamais silencieux) —
  source : POLICYCONFIG-FAILCLOSED-01 test output.
  CONSÉQUENCE : des guards qui lisent des configs peuvent passer
  silencieusement avec des valeurs incorrectes (ou absentes).

DÉGRADANT (réduit la qualité, n'empêche pas) :

- 7 guards restants en placeholder { passed: true } :
  CancellationGuard, RefundGuard, DisputeGuard,
  DisputeResolutionGuard, TransferGuard, WithdrawalGuard,
  + Guard 1 (pass-through pour 40/43 transitions — aucune
  vérification RBAC sur l'acteur vs l'Engagement).
  Ces chemins (annulations avec dépôt, remboursements, disputes,
  transferts) sont financièrement ouverts sans vérification.
  Non-bloquant pour SC-01 (chemin nominal sans dispute ni
  annulation post-dépôt) — source : transitionEngagement.js
  runSpecificGuard() cases.

- AuditLogger écrit en console uniquement.
  Les entrées d'audit existent mais ne sont pas persistées —
  visible mais éphémère. Compromet la traçabilité de l'événement 1.

- MissionConversionGuard ne vérifie pas l'existence du MissionSlot.
  L'OS section 2.7.1 exige "MissionSlot existe · acteur autorisé"
  à proposed → accepted. Aucune ligne ne vérifie le MissionSlot
  — source : lecture MissionConversionGuard.js, zéro occurrence
  de MissionSlot dans la logique de validation.

REPORTABLE (peut attendre l'événement 2+) :

- Voie QuickPlay non implémentée (TalentRolePreference, bypass
  négociation) — source : OS V15 section 2.4/2.5.
- EngagementCollectif (EGC-) — source : OS V15 section 2.3.
- RBAC complet par transition (qui peut déclencher quelle
  transition sur quel Engagement) — actuellement non bloquant
  pour un test fondateur unique à petit réseau.

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : La persistence du ContractSnapshot
  phase 2 (retourné par SealingGuard dans guardResult.contractSnapshot)
  dépend entièrement de l'appelant de transitionEngagement().
  Le code ne force pas la persistence — si l'intégration Base44
  ignore ce champ, le WORM W2 est calculé et jeté sans trace.
  L'OS ne documente pas explicitement le mécanisme de persistence
  garantie de cs2. À valider par le fondateur : qui appelle
  transitionEngagement() et garantit la persistence du résultat ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 (dette comportementale) :
  V1 opère présumément avec mutation directe du status via l'UI
  Base44. La transition vers V3 requiert discipline active du
  fondateur — aucun filet automatique tant que le DataAccessLedger
  n'est pas opérationnel.

De Base44 (contrainte structurelle) :
  Base44 permet la modification directe de tout champ depuis
  l'interface, y compris status. L'OS l'a anticipé (section 11.1 :
  "Base44 est la rampe, pas la destination.") mais la protection
  reste uniquement architecturale + comportementale.

De la fiche du 17 mai 2026 (delta positif) :
  Les 3 BLOQUANTS identifiés le 17 mai (SealingGuard placeholder,
  DataAccessLedger absent, MissionSlot non vérifié) ont été
  partiellement traités : SealingGuard est maintenant implémenté,
  EngagementAmendmentGuard est opérationnel. DataAccessLedger
  reste absent. Un nouveau BLOQUANT est apparu : casse de fichier
  Linux (BLOQUANT-A1 — non présent en V10.1 car Windows masque
  la casse).

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Corriger les 3 requires en casse incorrecte dans transitionEngagement.js
(Presenceproofguard → PresenceProofGuard, Ledgerinvariantguard →
LedgerInvariantGuard, Noshowguard → NoShowGuard), implémenter
DataAccessLedger pour que Guard 5 écrive réellement, et corriger
POLICYCONFIG-FAILCLOSED-01 pour atteindre PASSED.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ EN COURS → ~72% estimé

Justification :
  Spécification : 100% (OS V15 complet, D-014/D-019/D-147 intégrés)
  Machine d'état : 95% (table souveraine complète, WORM_STATES exact)
  Guards critiques : 60% (SealingGuard ✓, EngagementAmendmentGuard ✓,
    EventPaymentGuard ✓, PresenceProofGuard ✓, ContestationWindowGuard ✓,
    NoShowGuard ✓ — mais DataAccessLedger absent, casse Linux bloquante)
  Tests P0 exécutables : 62.5% (10/16 passent — 6 crashent sur casse)
  Tests P0 PASSED parmi exécutables : 9/10 (POLICYCONFIG-FAILCLOSED-01 FAILED)

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- B. Modèle financier / Waterfall ne peut pas être validé bout en
  bout tant que transitionEngagement() crashe à l'import —
  SealingGuard (LOI LEDGER-02) est implémenté mais non testable
  via SEALING-01 — source : OS V15 section 3.3 + 2.7.1.

- C. Stripe Connect / PayoutExecutor — STRIPE-J8-01 passe (19/19),
  mais PAYOUT-SETTLED-01 crash sur casse. La transition
  payable→settled (GUARD 4.5) non validée bout en bout —
  source : OS V15 section 14.9 C06.

- D. SOTS et réputation — SOTSWindowGuard implémenté mais
  GUARDS-CHAIN-01 crash. Validation bout en bout bloquée.

- E. Archivage global et GoNoGo — ArchiveWORMGuard implémenté
  mais non testable via le chemin nominal (crash) — source :
  OS V15 section 14.9 C02 "ARCHIVED".

- INFÉRENCE : Tout domaine qui appelle transitionEngagement()
  en production sera bloqué par la même erreur MODULE_NOT_FOUND
  sur Linux. À valider : l'environnement de déploiement cible
  est-il Linux ou Windows ?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — A. Ontologie et machine d'état
Conserver pour le Prompt de Synthèse.