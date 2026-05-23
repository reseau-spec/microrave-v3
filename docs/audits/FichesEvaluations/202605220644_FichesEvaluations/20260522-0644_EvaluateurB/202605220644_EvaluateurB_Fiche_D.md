FICHE D'ÉVALUATION — D. PRÉSENCE ET PREUVE
Date d'évaluation : 22 mai 2026
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : OS V15 §2.7.1 (PresenceWindowGuard, PresenceProofGuard), EXPORT_BRUT (D-075 11 conditions de payout, D-093 PresenceProofResolver faisceau d'indices, D-093-A matrice signaux, D-094 fraude SOTS, D-073 délégué sur place, D-118 critère 2 trust), Plan d'Implantation §1.1 (SessionPresenceService), code src/core/guards/PresenceWindowGuard.js (185 l.), src/core/guards/PresenceProofGuard.js (350 l.), src/services/SessionPresenceService.js (150 l.), src/repositories/SessionPresenceRepository.js (122 l.), config/policy-config-schema.js (configs A-056 / A-057a / A-057b / checkInWindowMinutes), tests P0 SESSION-PRESENCE-01 (7/7), PRESENCEPROOF-01 (25/25), CHEMIN-NOMINAL-01 (14/14 incluant ÉTAPE 9-11).
Niveau de confiance : HAUTE sur la logique des deux guards et l'arithmétique des seuils ; PARTIELLE sur le pipeline d'intégration service ↔ guards (incohérences de nommage et de granularité détectées) ; INFÉRENCE sur le calcul de distance GPS et les UI déclencheurs.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

SessionPresence.checkedInAt non null au moment du payout — D-075 Condition 3 : "SessionPresence.checkedInAt != null".
Distance GPS ≤ maxDistancePolicy lu en database — D-075 Condition 4 : "géolocalisation cohérente avec maxDistancePolicy (database)". Valeur seedée : 500 m (config A-056 CRITIQUE).
Durée de présence ≥ max(minDurationFloorMinutes, durée_contrat × minDurationRatioPpm / 1_000_000) — D-075 Condition 5 : "présence temporelle cohérente avec minDurationPolicy / plage horaire (database)". Valeurs seedées : 30 min plancher absolu (A-057a) + 95% ratio (A-057b).
Validation organisateur OU contestation_window expirée — D-075 Condition 6 : "présence validée par organisateur/délégué OU délai de contestation expiré sans contestation". Combiné à isSelfOrganized=true exemption pour talent-organisateur.
Fenêtre de check-in ouverte : now ≥ eventScheduledStartAt − checkInWindowMinutes — OS V15 §2.7.1 ligne event_sealed → performed : "Date event passée · check-in window ouverte · SessionPresence initiée" + config seedée 60 min (checkInWindowMinutes).
SessionPresenceId présent et au format SPR-* avant event_sealed → performed — PresenceWindowGuard + IDFactory.PREFIXES.SessionPresence = 'SPR'.
Le faisceau d'indices D-093 est résolu pour les cas non-GPS — D-093-A matrice : "GPS cohérent (Fort)", "TicketAdmissionRight validé (Fort, billetterie)", "AudienceCheckIn / TalentCheckIn (Fort)", "Validation staff / délégué (Moyen)", "Timestamp cohérent avec la plage (Moyen)", "Checkpoint actif (Moyen)", "Log de connexion plateforme (Fort, virtuel)". Règle : "Faisceau convergent → présence confirmée → payout automatique éligible".
L'anti-spoofing est armé — D-093 : "Anti-spoofing dans SpoofingDetectionPolicyConfig. Seuils dans PresencePolicyConfig."
L'audit du faisceau remonte au DataAccessLedger sur tout override admin — D-093 : "Tout override admin → AdminAction loggée obligatoirement."
SessionPresence persistée avec engagementId, talentUserId, timestamps, GPS coordonnées, signalTypes — D-128 (interface repository portable) + D-093-A.

Ce domaine bloque tout le reste si :

SessionPresence.checkedInAt est null au moment du payout — D-075 Condition 3 bloque contestation_window → payable et performed → payable.
La distance GPS dépasse maxDistancePolicy ou est absente — C-04 fail-closed dans PresenceProofGuard.
La durée de présence est sous le plancher — C-05 fail-closed.
Le scénario tombe dans "Aucun signal → absence présumée → admin review" (D-093) — bloquant pour le payout automatique D-117 "sans intervention manuelle".

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

PresenceWindowGuard.js (185 l.) implémente la transition event_sealed → performed. Trois conditions :

eventScheduledStartAt valide ISO (l. 106-122)
Fenêtre ouverte : nowMs ≥ eventStartMs − checkInWindowMinutes × 60_000 (l. 127-144)
sessionPresenceId présent, format SPR-* (l. 150-167)

Fail-closed sur policyConfig absent (l. 75-81). Lecture fail-closed de checkInWindowMinutes (l. 86-94).
PresenceProofGuard.js (350 l.) implémente les 11 conditions D-075 dans l'ordre canonique, couvre performed → payable (SoloFounderOverride uniquement) et contestation_window → payable (chemin nominal). Lecture fail-closed des trois configs critiques : maxDistancePolicy, minDurationFloorMinutes, minDurationRatioPpm (l. 74-86) avec validation des bornes.
C-05 implémente la règle à deux couches D-075 + A-057 (l. 217-237) : si durée contractuelle connue, applique max(plancher, durée × ratio_ppm / 1_000_000) via MoneyMath.prorataCents() ; sinon plancher seul. Message d'erreur explicite avec la règle complète.
Exception SoloFounderOverride correctement gardée (l. 122-131) : performed → payable exige transitionReason === 'SOLO_FOUNDER_OVERRIDE', sinon C-01_OVERRIDE_REQUIRED.
Exception isSelfOrganized=true correctement traitée (l. 242-255) : le talent qui s'organise lui-même n'a pas besoin d'organizerValidated.
C-06 accepte CONTESTATION_WINDOW_EXPIRED comme validation implicite (l. 245) — cohérent avec D-019-B (expiration automatique via SchedulerDueTask).
SessionPresenceService.js (150 l.) expose trois fonctions claires : create() (check-in), recordCheckout() (fin du set), getByEngagementId() (lecture). Validation fail-closed sur engagementId, talentUserId, repositories.sessionPresence. Type strict finalDurationMinutes (Number.isInteger, ≥ 0) — D-064 respecté.
SessionPresenceRepository.js (122 l.) : create() valide le format SPR-* (l. 76-81) et insère checkOutAt: null, finalDurationMinutes: null à la création (l. 84-85). updateCheckout() valide à nouveau finalDurationMinutes en entier ≥ 0 (l. 105-110). Pattern append + update strict (pas de delete).
Tests P0 réussis le 22 mai 2026 :

SESSION-PRESENCE-01 : 7/7 PASSED — service opérationnel, IDs SPR-*, validations explicites.
PRESENCEPROOF-01 : 25/25 PASSED — couvre les 11 conditions D-075 avec configs mockées, le passage SoloFounderOverride, et le passage CONTESTATION_WINDOW_EXPIRED.
CHEMIN-NOMINAL-01 ÉTAPE 9-10 : passage event_sealed → performed → event_completed → sots_window_closed → contestation_window → payable validé.


Configs présence CRITIQUES seedées (config/policy-config-schema.js) :

maxDistancePolicy = 500 m (A-056, ratifié 2026-05-20)
minDurationFloorMinutes = 30 (A-057a)
minDurationRatioPpm = 950_000 = 95% (A-057b)
checkInWindowMinutes = 60 min

Toutes CRITIQUE → blocage absolu si absentes (test POLICYCONFIG-FAILCLOSED-01 les liste explicitement).
signalTypes persisté dans SessionPresence (['GPS', 'WIFI', 'MANUAL'] — service l. 81) : le squelette est prêt pour D-093-A même si la résolution n'est pas implémentée.
Préfixe SPR- enregistré dans IDFactory (SessionPresence: 'SPR').

Ce qui vient de V1 et est encore actif :

Aucun composant présence hérité de V1. La doctrine "phone-free pendant l'event" (D-127 PhoneFreeRitualGuard conditionnel Micro-Onde) est V3 native. La rampe UX V1 microrave.ca devra héberger le bouton "Je suis arrivé" / "C'est terminé" (Plan §3.1), mais comme rampe, pas comme acquis fonctionnel.

Ce qui vient de V2 et a survécu :

Rien. Aucune trace de SessionPresence, GPS, check-in ou PresenceProofResolver dans les fragments V2 retrouvés (seulement la convention isCaptain du lobby).

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

Incohérence de nommage checkInAt vs checkedInAt. SessionPresenceService.create() enregistre checkInAt (sans 'e', timestamp ms entier, code l. 71+79) ; le record en base contient donc checkInAt. PresenceProofGuard C-03 (l. 163-169) lit sessionPresence.checkedInAt (avec 'e'). En intégration réelle, le guard verra toujours checkedInAt === undefined → C-03_NO_CHECKIN systématique. Les tests passent indépendamment parce que PRESENCEPROOF-01 mocke directement checkedInAt: '2026-05-20T21:00:00Z' (l. 55, 147) et SESSION-PRESENCE-01 teste captured.checkInAt (l. 104). Aucun test ne valide la chaîne complète service→repository→guard. Source de l'identification : grep -n "checkInAt\|checkedInAt" src/. Conséquence directe : DJ Alex fait son check-in, le guard refuse le payout en disant "présence non initiée".
gpsDistanceMeters jamais calculé. PresenceProofGuard C-04 (l. 174-195) attend sessionPresence.gpsDistanceMeters en input. SessionPresenceService enregistre gpsCoordinates: { lat, lng, accuracyMeters } (l. 80). Aucun service ne convertit les coordonnées en distance vers le lieu. Recherche grep -rnE "(haversine|distanceTo|gpsDistanceMeters\s*=)" dans src/ → 0 occurrence. L'appelant du guard doit calculer la distance lui-même avant d'appeler transitionEngagement(). Si l'appelant (UI ou fonction Base44) ne le fait pas, C-04_NO_GPS_DATA. Source : code + recherche file system. INFÉRENCE complémentaire : le calcul vit peut-être côté Base44 workflow — à valider.
Aucun mécanisme ne récupère les coordonnées GPS du lieu dans le code V3. SessionPresence stocke les coordonnées du talent. Pour calculer la distance, il faut les coordonnées du Checkpoint ou de l'EventLocation. Recherche grep -rnE "checkpoint\.gps|location\.coordinates|eventLocation\.lat" dans src/ → 0 occurrence. Le CheckpointRepository n'existe pas (référencé dans D-128 mais absent). Source de l'identification : ls src/repositories/. Conséquence : même si l'appelant essaie de calculer la distance, il n'a pas d'où lire les coordonnées du lieu côté V3.

DÉGRADANT (réduit la qualité, n'empêche pas) :

Le PresenceProofResolver D-093 n'est pas implémenté. D-093 dit "La présence est résolue par un faisceau d'indices pondérés. GPS n'est pas obligatoire — signal fort parmi d'autres." Le code C-04 (PresenceProofGuard) rend GPS obligatoire (fail-closed sans gpsDistanceMeters). Le signalTypes (GPS/WIFI/MANUAL) est persisté mais aucun service ne pondère selon D-093-A (matrice à 8 signaux). Pour la première transaction physique avec DJ Alex à Bar Le Trèfle (GPS disponible) : non-bloquant. Pour un event virtuel (D-093-A "Log de connexion plateforme — Fort, virtuel") ou résidentiel sans Checkpoint (D-093-A "signal Checkpoint actif absent par design") : non couvert. La doctrine est simplifiée au profit du strict GPS+durée.
SpoofingDetectionPolicyConfig non implémentée. D-093 mentionne "Anti-spoofing dans SpoofingDetectionPolicyConfig". Aucune config seedée correspondante, aucun service ne vérifie de signatures anti-spoof. Pour la première transaction avec talent connu (DJ Alex), risque négligeable. Event public ouvert : à durcir.
accuracyMeters du GPS ignoré par le guard. Le service persiste gpsCoordinates.accuracyMeters (potentiel input pour spoofing/anti-spoof) mais PresenceProofGuard ne le consulte pas — un GPS à accuracyMeters: 5000 (très imprécis) passerait C-04 si la coordonnée centrale tombe à < 500m.
Pas de validation du delegué sur place D-073. "Délégué : valide/conteste présence terrain, ouvre IncidentRecord, escalade" (D-047) + D-073 ("combinaison rôles automatiques + désignation explicite"). Aucun code délégué actif. Pour DJ Alex au Trèfle avec organisateur présent : le contestation_window expirant remplace la validation explicite (C-06 OK). Mais pour event multi-talent ou organisateur distant : non couvert.

REPORTABLE (peut attendre l'événement 2+) :

SafetyReport jamais créé. C-07 le consulte (activeSafetyReport), aucun service ne le persiste. repositories.safetyReports n'existe pas. Pour Event 0 pilote : tolérable. Event public : nécessaire pour audience.
TicketAdmissionRight + AudienceCheckIn : D-094 garde-fou SOTS structurel (audience qui note doit avoir un AudienceCheckIn). Aucun service. Hors scope MVP nominal (Pierre de Rosette = pas de billetterie).
QR code, Wifi, log virtuel comme signaux additionnels : non implémentés. signalTypes accepte les valeurs mais aucun pipeline.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — quatre INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

Qui calcule gpsDistanceMeters et où ? L'OS définit la condition (D-075 Condition 4) et le seuil (maxDistancePolicy) mais pas le calcul. INFÉRENCE : (a) côté UI/mobile via Geolocation API + Haversine ; (b) côté Base44 workflow recevant lat/lng + place_id du lieu ; (c) côté V3 dans un futur PresenceDistanceService non créé. À valider — la portabilité D-128 souhaite que le calcul soit dans une couche portable V3, pas dans Base44 ou dans le client.
Où sont stockées les coordonnées GPS du Checkpoint et de l'EventLocation ? L'OS D-091 parle de "triptyque talent ↔ organisateur/payeur ↔ checkpoint" et D-017 mentionne "granularité de présentation publique limitée à un niveau de zoom ≥ 10 — rue ou quartier, jamais résidence" — donc les coordonnées existent mais avec masquage UX. INFÉRENCE : ces coordonnées sont dans une table Checkpoint ou EventLocation côté Base44, sans repository V3 exposé. Le calcul de distance dépend donc d'un schéma Base44 non audité ici.
signalTypes: ['MANUAL'] par défaut suffit-il pour C-04 ? Le service met signalTypes: signalTypes || ['MANUAL'] (l. 81). Si le talent fait son check-in dans une zone sans GPS (sous-sol du Trèfle ?) → gpsCoordinates = null, signalTypes = ['MANUAL']. Que se passe-t-il pour C-04 ? Le guard C-04 fail-closed sur gpsDistanceMeters === undefined. Donc check-in MANUAL = pas de payout automatique. À valider : cette stricte exigence GPS est-elle conforme à l'intention du fondateur ? D-093 dit explicitement "GPS n'est pas obligatoire" — tension non résolue.
Le recordCheckout() est-il déclenché manuellement ou automatiquement ? Le service expose la fonction mais aucun consommateur n'est défini. INFÉRENCE : (a) bouton talent "C'est terminé" en UI ; (b) bouton organisateur après la fin du set ; (c) cron job automatique après eventScheduledEndAt + tolérance. Le choix conditionne la précision de finalDurationMinutes et donc C-05. À valider.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune dette présence. La promesse Le Micro-Onde ("Pendant, il reste au vestiaire" — OS V15 §1.3) est V3 native. V1 fournit le domaine UX (app.microrave.ca) qui hébergera potentiellement les boutons check-in / check-out.
De V2 : rien. La présence est l'une des fondations V3.
De l'OS V3 lui-même : doctrine D-093 + D-093-A élaborée (faisceau d'indices à 8 signaux) non-câblée en code. Le MVP simplifie à GPS strict + durée — choix défendable mais non documenté comme amendement formel. Tension entre la lettre de l'OS et l'implémentation. Cette tension accélère la première transaction physique (cas simple bien couvert) mais représente une dette doctrinale pour les cas non-GPS (events virtuels D-093-A, résidentiels sans Checkpoint D-017).

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Aligner le nommage checkInAt ↔ checkedInAt (renommer dans le service ou dans le guard), implémenter un service de calcul gpsDistanceMeters à partir des coordonnées GPS du talent et du lieu (avec lecture des coordonnées Checkpoint/EventLocation), valider opérationnellement le pipeline UI → service → repository → guard sur un check-in réel, et obtenir validation fondateur sur les quatre INFÉRENCES non documentées (calculateur de distance, source des coords du lieu, comportement GPS-indisponible, déclencheur de checkout).
──────────────────────────────────────────────────
6. STATUT FINAL
☒ EN COURS → environ 60 %
Décomposition de l'estimation :

✅ PresenceWindowGuard complet (3 conditions, fail-closed configs) : 100 %
✅ PresenceProofGuard complet (11 conditions D-075, exceptions Solo/Self/Expiration) : 100 %
✅ Configs présence CRITIQUES seedables (maxDistance, minDurationFloor, minDurationRatio, checkInWindow) : 100 %
✅ SessionPresenceService (create, recordCheckout, getByEngagementId) : 100 % sur la logique
✅ SessionPresenceRepository (interface portable D-128) : 100 %
❌ Cohérence nommage service ↔ guard (checkInAt vs checkedInAt) : 0 % (BUG SILENCIEUX en intégration)
❌ Calcul gpsDistanceMeters (Haversine ou équivalent) : 0 %
❌ Source des coordonnées GPS du lieu (Checkpoint/EventLocation repository) : 0 %
❌ PresenceProofResolver D-093 (faisceau pondéré 8 signaux) : 0 %
⚠ Anti-spoofing SpoofingDetectionPolicyConfig : non implémenté (DÉGRADANT)
⚠ UI déclencheur check-in / check-out : hors archive (INCONNU)

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine A (Ontologie) : la transition event_sealed → performed exige une SessionPresence initiée (PresenceWindowGuard). Sans présence : la machine d'état bloque. Source : OS V15 §2.7.1 ligne event_sealed→performed "SessionPresence initiée".
Domaine B (Finance et ledger) : la transition contestation_window → payable (chemin nominal vers le payout) exige les 11 conditions D-075 dont les trois conditions présence (C-03, C-04, C-05). Sans présence prouvée : aucun payout, aucune écriture ledger payout_executed. Source : LedgerInvariantGuard.COVERED_TRANSITIONS (Fiche B §2) + PresenceProofGuard.COVERED_TRANSITIONS.
Domaine E (SOTS) : C-08 exige SOTSSubmission présente — SOTS dépend de la présence prouvée pour être valide (un talent absent ne peut pas être noté légitimement). D-094 garde-fou structurel : "TicketAdmissionRight + AudienceCheckIn = condition nécessaire pour soumettre une note audience". Côté audience, le SOTS dépend de l'AudienceCheckIn (non implémenté MVP) — pour DJ Alex au Trèfle, c'est l'organisateur qui note, pas l'audience.
Domaine F (Scheduler) : contestation_window → payable est déclenchée automatiquement par expiration de SchedulerDueTask type CONTESTATION_WINDOW_EXPIRED. Sans scheduler armé, la transition automatique n'a pas lieu, et transitionReason !== 'CONTESTATION_WINDOW_EXPIRED' → C-06_NO_ORGANIZER_VALIDATION (sauf override admin).
Domaine I (UX et vérité perçue) : le bouton "Je suis arrivé" et "C'est terminé" sont des artefacts UX dépendant de l'intégration UI/V1 microrave.ca. Promesse au talent (D-005) : "Ce que tu acceptes est transparent. Tu vois exactement ce que tu recevras avant d'accepter — et Micro Rave garantit ce règlement si tu livres ta présence." — la livraison de présence est précisément ce que ce domaine prouve.
Domaine J (Acteurs et onboarding) : la SessionPresence est attachée à un talentUserId (USR-*) qui doit exister. Pas de pré-condition forte au-delà.
→ INFÉRENCE non documentée explicitement dans l'OS : le domaine D est précondition forte du domaine B (sans présence prouvée, aucun cent ne bouge), précondition douce du domaine E (SOTS contestable si présence non prouvée), et bidirectionnelle avec F (scheduler arme l'expiration → guard valide la sortie). À valider que cette criticité est partagée par le fondateur — D précurseur de B au même titre que C, mais sur l'axe physique plutôt que monétaire.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — D. PRÉSENCE ET PREUVE
Fiche conservée pour le Prompt de Synthèse.