━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — D. Présence et preuve
(check-in, SessionPresence, PresenceProofResolver)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-075, D-093, D-093-A, D-094, A-056, A-057,
     TEST_REGISTRY Catégorie 1 PRESENCE-01)
  • PresenceProofGuard.js · PresenceWindowGuard.js
  • EventCompletionGuard.js · IDFactory.js
  • config/policy-config-schema.js
  • tests/p0/ : PRESENCEPROOF-01, GUARDS-CHAIN-01
    (exécutés en direct)
Niveau de confiance : HAUTE sur la logique des guards (exécutés)
                      PARTIELLE sur la SessionPresence end-to-end
                        (aucune couche de persistence ou service visible)
                      INFÉRENCE sur le check-in mobile et le GPS réel
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- SessionPresence créée avec checkedInAt, gpsDistanceMeters,
  durationMinutes avant performed→event_completed — D-075
  conditions 3/4/5, EXPORT_BRUT section D-075
- PresenceWindowGuard PASSED à event_sealed→performed :
  fenêtre check-in ouverte et sessionPresenceId (SPS-*)
  présent — OS V15 section 2.7.1 tableau
- PresenceProofGuard vérifie les 11 conditions D-075 à
  contestation_window→payable — D-075, EXPORT_BRUT section D-075
- Les configs de seuil en database : maxDistancePolicy
  (A-056), minDurationFloorMinutes (A-057a),
  minDurationRatioPpm (A-057b), checkInWindowMinutes —
  source : config/policy-config-schema.js + EXPORT_BRUT A-056/A-057
- PRESENCE-01 (TEST_REGISTRY) PASSED : requiredBeforeEvent = 1
  — EXPORT_BRUT TEST_REGISTRY Catégorie 1
- SOTSSubmission du talent soumise (condition 7 D-075) —
  EXPORT_BRUT section D-075
- isSelfOrganized calculé et persisté depuis PlacementGuard —
  OS V15 section 2.7.1 (condition 6 D-075)
- SessionPresence.resolved = true (PresenceProofResolver) —
  EXPORT_BRUT D-093, D-093-A

Ce domaine bloque tout le reste si :

- SessionPresence absente ou checkedInAt null — C-03_NO_CHECKIN
  bloque PresenceProofGuard → payable inaccessible — D-075
  condition 3
- GPS distance > maxDistancePolicy — C-04_GPS_TOO_FAR bloque
  le payout automatique — D-075 condition 4, A-056
- Présence insuffisante (durée < plancher) — C-05 bloque —
  D-075 condition 5, A-057
- ARRÊT IMMÉDIAT si SessionPresence sans aucun signal valide —
  EXPORT_BRUT FIRST_EVENT_REGISTER section arrêt immédiat

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

PresenceProofGuard.js — Complet et testé.
  • 11 conditions D-075 implémentées séquentiellement, avec
    messages d'erreur précis et codes (C-01 à C-11) —
    source : PresenceProofGuard.js.
  • Lit maxDistancePolicy, minDurationFloorMinutes,
    minDurationRatioPpm depuis PolicyConfigRepository —
    jamais hardcodé.
  • Règle deux couches A-057 :
    minRequiredMinutes = max(floor, contratMinutes × ratio/1M)
    — source : PresenceProofGuard.js lignes 211–218.
  • PRESENCEPROOF-01 : 25/25 PASSED — source : exécution
    directe. Couvre tous les cas nominaux et tous les bloquages
    de chaque condition.
  • Cas Pierre de Rosette validé en isolation (node -e) :
    GPS 150m ≤ 500m ✓, durée 115min ≥ 114min requis ✓,
    passed: true — source : exécution directe.

PresenceWindowGuard.js — Opérationnel et testé.
  • Vérifie fenêtre check-in ouverte depuis checkInWindowMinutes
    (DB), eventScheduledStartAt présent, sessionPresenceId au
    format SPR- — source : PresenceWindowGuard.js.
  • nowOverride pour les tests — source : PresenceWindowGuard.js.
  • GUARDS-CHAIN-01 couvre T-01 à T-05 (ce guard) mais crash
    sur casse Linux (hérité de Domaine A) — nominal PASSED
    en isolation : passed: true — source : exécution node -e.

EventCompletionGuard.js — Opérationnel.
  • Vérifie que tous les talents du lineup sont en
    performed / performed_amended / no_show avant de clore
    l'event — OS V15 section 2.7.1.
  • RESOLVED_STATES exhaustif exporté — source :
    EventCompletionGuard.js.
  • Nominal PASSED en isolation — source : exécution node -e.

Configs de présence seeded dans policy-config-schema.js :
  • maxDistancePolicy (INTEGER, CRITIQUE) — valeur fondateur 500m,
    ratifiée 20 mai 2026 — source : policy-config-schema.js.
  • minDurationFloorMinutes (INTEGER, CRITIQUE) — ratifié —
    source : policy-config-schema.js.
  • minDurationRatioPpm (PPM, CRITIQUE) — 950000 (95%) ratifié —
    source : policy-config-schema.js.
  • checkInWindowMinutes (INTEGER, STANDARD) — source :
    policy-config-schema.js.

Ce qui vient de V1 et est encore actif :
  V1 n'a aucun mécanisme de preuve de présence — pas de GPS,
  pas de check-in, pas de SessionPresence. Ce domaine est
  entièrement nouveau en V3. ACQUIS : le réseau humain (DJ Alex,
  Le Trèfle) connaît déjà les règles humaines — pas de
  résistance attendue. DETTE : pas de dette V1 sur ce domaine.

Ce qui vient de V2 :
  Néant. V2 abandonnée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-D1 — Discordance de préfixe SPS vs SPR.
  IDFactory génère les SessionPresence IDs avec le préfixe
  'SPS-' (PREFIXES.SessionPresence = 'SPS') — source :
  IDFactory.js ligne 36. PresenceWindowGuard rejette tout
  sessionPresenceId qui ne commence pas par 'SPR-' —
  source : PresenceWindowGuard.js ligne 160. Résultat :
  tout ID généré par IDFactory.generate('SessionPresence')
  échoue la validation dans PresenceWindowGuard. Testé en
  direct : IDFactory.generate('SessionPresence') produit
  'SPS-MPEXH2M3-EA5BWB' → startsWith('SPR-') = false —
  source : exécution node -e.
  CONSÉQUENCE : event_sealed→performed est bloqué sur tout
  check-in créé via IDFactory. Aucun payout automatique
  possible. La transition ne peut pas être franchie avec un
  ID correctement généré.
  CORRECTION : aligner IDFactory ('SPS' → 'SPR') ou
  PresenceWindowGuard ('SPR-' → 'SPS-').

- BLOQUANT-D2 — SessionPresence : aucune couche de
  persistence ni service de création visible.
  La table SessionPresence est définie dans l'OBJECT_REGISTRY
  (EXPORT_BRUT ligne 2583 : id, engagementId, checkedInAt,
  gpsCoordinates, distanceMeters, signalTypes[], gpsStatus,
  duration, validatedBy) mais aucun fichier dans src/ ne
  crée, lit ou met à jour un enregistrement SessionPresence.
  PresenceWindowGuard reçoit sessionPresenceId via context
  (fourni par l'appelant) — mais aucun service ne peuple ce
  context depuis la database. Le talent n'a nulle part dans
  le code pour déclencher son check-in — source : grep -rn
  'SessionPresence\|checkedInAt' sur src/ retourne
  uniquement les guards.
  CONSÉQUENCE : sans service de création de SessionPresence,
  la condition C-03 (checkedInAt présent) ne peut jamais
  être satisfaite en production réelle.

- BLOQUANT-D3 — PresenceProofResolver non implémenté comme
  service (logique de faisceau d'indices).
  D-093 prescrit un faisceau d'indices pondérés : GPS,
  QR code, validation délégué, timestamp, etc. — EXPORT_BRUT
  D-093/D-093-A. PRESENCE-01 (TEST_REGISTRY, requiredBeforeEvent=1)
  exige ce resolver. Le code actuel ne contient pas de module
  PresenceProofResolver — seul le résultat final (contexte
  pré-assemblé par l'appelant) est vérifié dans
  PresenceProofGuard. Pour Event 1, la preuve GPS+durée seule
  satisfait D-093 (faisceau convergent) si c'est le seul signal
  disponible — mais le resolver qui agrège les signaux en amont
  n'existe pas. INFÉRENCE : pour SC-01 avec GPS opérationnel,
  le guard seul peut suffire si l'appelant assemble le contexte
  manuellement. Mais PRESENCE-01 P0 test n'est pas dans le
  répertoire tests/p0/ — il doit être créé.

- BLOQUANT-D4 (hérité de Domaine A) — Casse Linux dans
  transitionEngagement.js bloque GUARDS-CHAIN-01, qui valide
  PresenceWindowGuard, EventCompletionGuard, SOTSWindowGuard
  bout-en-bout — source : Fiche A.

- BLOQUANT-D5 — Configs présence non seeded en database.
  maxDistancePolicy, minDurationFloorMinutes, minDurationRatioPpm,
  checkInWindowMinutes définies dans le schéma mais absentes
  de la database Base44 (BLOQUANT-B2 partagé) — source :
  POLICYCONFIG-FAILCLOSED-01 output. PresenceProofGuard et
  PresenceWindowGuard fail-closed si ces configs manquent.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- PresenceWindowGuard valide l'existence du sessionPresenceId
  (format SPR-) mais ne vérifie pas que la SessionPresence
  réelle en database correspond à cet Engagement. Un SPR-*
  d'un autre talent sur un autre event serait accepté.
  Non-bloquant pour SC-01 mono-talent, mais lacune
  architecturale — source : PresenceWindowGuard.js logique.

- C-08 (SOTSSubmission requise) est vérifié dans
  PresenceProofGuard, mais la SOTSWindowGuard (qui déclenche
  sots_window_closed) dépend du même GUARDS-CHAIN-01 crashé.
  La chaîne event_completed→sots_window_closed→contestation_window
  n'est pas validée bout-en-bout.

- D-093 matrice de signaux : le signal QR code, la validation
  délégué, le log de connexion plateforme ne sont pas
  implémentés. Pour Event 1, GPS seul suffit si convergent —
  mais l'OS précise « signaux contradictoires → admin review ».
  Sans resolver, les signaux contradictoires ne sont pas
  détectés automatiquement.

REPORTABLE (peut attendre l'événement 2+) :

- D-094 (7 patterns fraude SOTS) — non implémenté.
  SOTS-CHECKIN-01 et SOTS-SELF-01 requis avant event 2 —
  EXPORT_BRUT TEST_REGISTRY.
- PresencePrivacyGate (PRIV-01, requiredBeforeEvent=0A) —
  agrégat seulement pour données GPS. Non visible dans le
  code — reportable si fondateur décide de le traiter
  séparément.
- QR code scan comme signal de présence —
  D-093-A "si déployé" — conditionnel, post-Event 1.
- Signaux contradictoires → admin review automatique —
  post-Event 1.

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE 1 : L'OS décrit SessionPresence
  comme un objet créé par le talent (« le talent déclenche
  le tracking GPS »), mais aucun document ne précise si c'est
  l'app mobile V3, Base44, ou un appel API externe qui crée
  cet objet. Si c'est l'app mobile, elle n'est pas dans le
  zip livré. Si c'est Base44, le schéma de l'entité doit être
  créé dans Base44. À valider avec le fondateur : qui crée
  la SessionPresence, et comment ?

→ INFÉRENCE NON DOCUMENTÉE 2 : checkoutAt est requis pour
  calculer durationMinutes (C-05), mais l'OS ne documente
  pas qui déclenche le checkout ni quand. Est-ce automatique
  (ex. : 1h après l'event), manuel (talent clique), ou
  déclenché par event_completed ? Si checkout n'est jamais
  déclenché, durationMinutes restera null et C-05 bloquera.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune dette — ce domaine est entièrement nouveau
  en V3. V1 faisait confiance aux humains; V3 institutionnalise
  la preuve. ACQUIS : la culture du check-in peut être
  introduite naturellement avec le réseau existant (DJ Alex
  connaît le fondateur).

De Base44 : Base44 est une plateforme web/no-code. La capture
  GPS requiert une app mobile native ou un navigateur mobile
  avec accès à l'API Geolocation. INFÉRENCE : si le check-in
  se fait via Base44 web mobile, la précision GPS peut être
  dégradée (±50-200m) et le signal ne sera pas disponible
  hors-ligne. Cette contrainte n'est pas documentée dans l'OS
  mais est une réalité opérationnelle à anticiper.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Corriger la discordance SPS/SPR dans IDFactory ou PresenceWindowGuard,
implémenter le service de création et lecture de SessionPresence
(ou documenter qui l'appelle), seeder les configs de présence
en database, implémenter le chaînon checkoutAt → durationMinutes,
et créer le test P0 PRESENCE-01.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ EN COURS → ~55% estimé

Justification :
  Guards de validation (PresenceProofGuard, PresenceWindowGuard,
    EventCompletionGuard) : 90% — logique complète, testée,
    conforme D-075/D-093. Non débloqués bout-en-bout (casse Linux).
  Discordance SPS/SPR : 0% — bug actif non résolu.
  SessionPresence persistence/service : 0% — absent du code.
  Checkout/durationMinutes : INCONNU — non documenté.
  Configs en database : 0% — non seeded.
  PRESENCE-01 test P0 : 0% — non créé.
  PresenceProofResolver faisceau : 30% — logique partielle
    dans PresenceProofGuard, resolver complet absent.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- E. Archivage global (settled→archived) requiert que
  GoNoGoDecisionRecord = GO, ce qui exige la présence prouvée
  (11 conditions D-075) — source : OS V15 section 14.9 C06.
  Sans présence prouvée → payable inaccessible → settled
  impossible → archived impossible.

- F. SOTS et réputation dépend de event_completed (qui dépend
  de performed, qui dépend de PresenceWindowGuard) — source :
  OS V15 section 2.7.1 tableau. La chaîne
  performed→event_completed→sots_window_closed ne peut pas
  être franchie si ce domaine est bloqué.

- INFÉRENCE : la condition « présence prouvée sans
  intervention manuelle » est une condition nominale de la
  première transaction — source : OS V15 section 14 contexte
  général. Si le fondateur doit déclencher un SoloFounderOverride
  (performed→payable) au lieu du chemin nominal, ce domaine
  n'est pas PRÊT et l'event est classé CONTROLLED SUCCESS,
  pas FULL SUCCESS — source : EXPORT_BRUT D-144.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — D. Présence et preuve
Conserver cette fiche pour le Prompt de Synthèse.