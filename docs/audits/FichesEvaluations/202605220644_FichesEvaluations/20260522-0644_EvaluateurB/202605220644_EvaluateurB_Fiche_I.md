FICHE D'ÉVALUATION — I. UX ET VÉRITÉ PERÇUE
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : EXPORT_BRUT (D-024 Ventilation UX talent progressive et obligatoire ; D-025 Facture payeur 5 lignes canoniques ; D-084 UX talent format universel par état 5 éléments ; D-085 UX payeur fonds protégés langage vulgarisé ; D-086 Explication frais MR service de confiance ; D-087 Notification négative format canonique non accusatoire ; D-088 Langue français d'abord architecture bilingue ; D-089 Dashboard organisateur ; D-090 Dashboard vendeur ; D-091 Triptyque talent ↔ organisateur ↔ checkpoint ; D-118 12 critères Minimum Viable Trust dont 5 UX ; D-117 Pierre de Rosette), Plan d'Implantation §3.1 (Pages UX V1 → V3), code src/repositories/ContractSnapshotRepository.js (118 l.), src/core/guards/MissionConversionGuard.js (l. 195-225 construction snapshot V1), src/core/guards/SealingGuard.js (l. 252-285 construction snapshot V2), scripts/run-j9-pilot.js (l. 302-330 ContractSnapshot construit en mémoire pour le payout), absence de toute couche frontend dans l'archive.
Niveau de confiance : HAUTE sur la doctrine UX (D-024 à D-088 lue mot-à-mot dans l'OS) et l'absence d'UI V3 dans l'archive ; PARTIELLE sur le contenu réel des pages V1 microrave.ca à adapter (hors archive) ; INFÉRENCE sur le canal de livraison des projections d'état pour D-084 et la facture D-025.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

Ventilation D-024 obligatoire avant acceptation — "Au moment de l'acceptation finale : la ventilation complète s'affiche obligatoirement et intégralement avant que le bouton 'Accepter' soit activable. Le talent ne peut pas accepter sans avoir vu : cachet brut, tier, taux de base, score SOTS, multiplicateur SOTS, taux effectif, commission MR, cachet net." L'UX doit verrouiller l'acceptation sur cette divulgation.
Pendant la négociation : ventilation progressive — D-024 : "Pendant la négociation : l'écran principal affiche cachet brut offert + net estimé en UX distinctif. Le talent peut déplier pour voir le détail." Deux modes de visualisation : résumé + détail dépliable.
Facture payeur en 5 lignes canoniques D-025 : Prestation / Service Micro Rave / TPS / TVQ / Frais de paiement / Total. Format strict, libellés normés. Exemple chiffré canonique : 1 000$ brut → 1 059,47$ total.
Format universel par état D-084 — "Chaque état visible par le talent affiche : 1. Statut 2. Argent 3. Prochaine action 4. Délai 5. Preuve ou blocage." Cinq champs obligatoires par état Engagement, pour les 24+ états WORM/intermédiaires.
D-085 langage vulgarisé — "Le mot 'escrow' est interdit dans l'interface. Remplacé par 'fonds protégés'." Règle de vocabulaire absolue.
D-086 explication frais MR — formulation talent : "Le taux Micro Rave couvre la mise en relation, la contractualisation, la sécurisation du paiement, la preuve de présence et la garantie de règlement. Ton net est garanti si tu es présent." Formulation payeur + formulation onboarding distinctes.
D-087 notification négative format canonique non accusatoire : 1. Raison lisible 2. Preuve utilisée 3. Règle appliquée 4. Recours 5. Délai 6. Arbitre. Ton non accusatoire.
D-088 i18n architecture — "Aucune chaîne de caractères visible par l'utilisateur n'est hardcodée dans le code. Toujours externalisée dans le système i18n." MVP français uniquement, V3.0.1 anglais.
D-091 triptyque clairement représenté : talent ↔ organisateur/payeur ↔ checkpoint sont trois entités distinctes avec leurs rôles UX. "Le talent joue. L'organisateur crée le besoin. Le checkpoint donne la scène."
D-118 critères de confiance applicables au domaine I (5 sur 12) : (1) Ventilation complète, (2) État payout avec raison de blocage, (3) Compréhension "fonds protégés", (4) Frais MR comme service de confiance, (5) Décision négative = explication + recours.
D-117 Pierre de Rosette dimension UX : "un event réel complété avec payout sans intervention manuelle, ledger zéro cent, visible/référençable". Le "visible/référençable" met l'UX au cœur de la preuve.
Backend expose les données nécessaires à l'UX : ContractSnapshot V1 et V2 persistés en base, format de projection par état Engagement disponible côté repository, chaînes en français disponibles via i18n.

Ce domaine bloque tout le reste si :

Le bouton "Accepter" est activable sans ventilation D-024 affichée → viole le contrat de confiance avec le talent.
L'UX affiche "escrow" → viole D-085 directement.
L'UX affiche un code technique brut (POLICY_CONFIG_MISSING, C-04_GPS_TOO_FAR) à l'utilisateur final → viole D-087 (ton non accusatoire) et l'esprit D-088.
Le payeur ne comprend pas ce que sont les "fonds protégés" — D-118 critère 3.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

Champs de ventilation disponibles côté backend :

MissionConversionGuard (l. 195-225) construit le ContractSnapshot V1 avec tous les champs D-024 : cachetBrutCents, tier, tauxPpm (taux de base), sotsSnapshotPpm (multiplicateur SOTS — fixé à 1 000 000 sous seuil 10 conformément à D-083), commissionMrCents, talentNetCents, negotiationHistory. La donnée est calculée correctement.
SealingGuard (l. 252-285) construit le ContractSnapshot V2 avec le waterfall complet par talent : cachetBrutFinalCents, commissionMrCents, talentNetCents, tauxPpm après modulation. La donnée est aussi calculée.


ContractSnapshotRepository.js (118 l.) expose create(snapshot), findByEngagementIdAndPhase(engagementId, phase), findByEngagementId(engagementId). Validation stricte des préfixes CS1- / CS2-. Aucune méthode update/delete → conforme WORM Moment 1/3.
IDFactory.PREFIXES.ContractSnapshotV1 = 'CS1' et ContractSnapshotV2 = 'CS2' dédoublement explicite pour matcher les deux moments WORM.
repositories.contractSnapshots exposé dans src/repositories/index.js (l. 118) — câblage côté point d'entrée OK.
Messages d'erreur des guards en français : PresenceProofGuard C-04 affiche "Distance GPS X m > maxDistancePolicy Y m", "Le talent était à X m du lieu". Bien que techniques (préfixés par codes C-04_GPS_TOO_FAR), les libellés sont en français — l'UI doit les traiter comme une base à traduire/humaniser pour D-087, pas comme un affichage final.
Doctrine UX entièrement écrite et ratifiée dans l'OS (D-024 à D-091, soit 11 décisions formelles couvrant le périmètre). Pas d'ambiguïté doctrinale.
Le Plan d'Implantation §3.1 reconnaît explicitement : "Adapter les pages existantes de V1 microrave.ca vers V3. Ne pas repartir de zéro." — décision stratégique de réutilisation, pas de refonte.

Ce qui vient de V1 et est encore actif :

microrave.ca opérationnel : le domaine et l'hébergement existent, des pages utilisateur (probablement landing, profil talent, dashboard) sont déployées. C'est la rampe UX V3. Acquis majeur : pas de DNS à monter, pas de design system à inventer.
Probable acquis V1 sur les écrans d'inscription (à valider — hors archive) : si DJ Alex est déjà inscrit V1, les écrans de signup/login marchent.
Dette V1 à mitiger : V1 ne connaît probablement ni le vocabulaire D-085 ("fonds protégés"), ni le format D-084 (5 éléments par état), ni la ventilation D-024 (8 champs imposés). Les pages V1 doivent être adaptées — pas seulement déployées.

Ce qui vient de V2 et a survécu :

Rien. V2 abandonnée précisément faute de chaîne UX → backend cohérente.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

Aucun ContractSnapshot V1 n'est persisté automatiquement par le code V3. MissionConversionGuard (l. 199-225) construit le snapshot V1 et le retourne dans result.contractSnapshot. transitionEngagement.js (l. 427-428) propage contractSnapshot dans le résultat mais ne persiste pas. Le commentaire (l. 200) dit explicitement : "WORM Niveau 1 — retourné, pas persisté ici." Source : grep -rnE "contractSnapshots\.create|repositories\.contractSnapshots\.create" src/services/ src/core/ → 0 résultat. Conséquence pour D-024 : si l'UI veut afficher la ventilation au moment de l'acceptation depuis un snapshot persisté, elle n'a pas ce snapshot — elle doit (a) recalculer en temps réel en appelant MissionConversionGuard (mauvaise séparation des responsabilités), (b) persister elle-même côté Base44 le snapshot retourné par la transition (charge à l'UI). Pour le scénario nominal Pierre de Rosette, c'est un trou architectural — la promesse "WORM" est dans le code mais pas en base. À combler avant Event 0.

DÉGRADANT (réduit la qualité, n'empêche pas) :

Aucune couche UI dans l'archive V3. find . -type f \( -name "*.jsx" -o -name "*.tsx" -o -name "*.vue" -o -name "*.html" \) ! -path "./node_modules/*" → 0 résultat. C'est par conception (Plan §3.1 : adapter V1, pas refaire), mais cela signifie que la fiche I évalue principalement la disposition à recevoir l'UX, pas l'état réel de l'UX. L'UX vit hors-archive dans V1 microrave.ca + potentiellement dans la couche UI Base44. Ni l'une ni l'autre n'est auditable depuis ce périmètre.
Aucun système i18n implémenté (D-088). grep -rnE "(i18n|t\(|translate|locale|fr_CA)" src/ → seules occurrences sur country = 'CA' (Stripe) et termes médicaux non liés. Conformément à l'absence d'UI, c'est cohérent : i18n est une couche UI. Mais les messages d'erreur des guards sont en français hardcodé — PresenceProofGuard, SOTSSubmissionService, etc. Si ces messages sont relayés à l'UI, l'UI doit les traduire/humaniser ; si l'UI les affiche bruts, elle viole D-088. À clarifier.
TPS/TVQ jamais calculés côté backend (cf. Fiche B DÉGRADANT). Configs tps_ppm=99750 (5%) et tvq_ppm=99750 (~9,975%) seedées mais aucun service ne les lit. L'UI ne peut pas afficher la facture D-025 ligne 3 (TPS) et ligne 4 (TVQ) correctement sans recalculer elle-même. Pour Pierre de Rosette (5-10$ Stripe test, TPS+TVQ ≈ 1,50$) : impact pratique faible mais doctrinalement fautif. Source : grep -rnE "tps_amount|tvq_amount|tps_ppm" src/services/ → 0 résultat utile.
Aucun service EngagementProjection exposant le format D-084 5 éléments. L'UI doit construire la projection (statut/argent/prochaine action/délai/preuve ou blocage) à partir des données brutes (Engagement.status, payout state, scheduler tasks, dispute records). C'est du travail de mapping non documenté côté V3. Risque : chaque consommateur UI implémente sa propre interprétation, divergence possible des messages affichés à DJ Alex.
negotiationHistory non câblé dans MissionConversionGuard. Le champ existe (l. 218) mais reste vide si context.negotiationHistory n'est pas fourni. D-024 mentionne "historique de négociation" implicitement dans le snapshot V1 — l'UI doit fournir cet historique au moment de l'acceptation. Pour Pierre de Rosette nominale (négociation hors plateforme, juste contrat signé) : non-bloquant. Pour QuickPlay multi-tour : nécessaire.
run-j9-pilot.js construit le ContractSnapshot V2 en mémoire (l. 302-313) plutôt que de le lire depuis la database. Cela confirme que le script pilote lui-même n'a pas accès à un snapshot V2 persisté — il fabrique les données à la volée. WORM dans le code, pas WORM en base.

REPORTABLE (peut attendre l'événement 2+) :

Dashboard organisateur D-089 (vue lineup temps réel avec délégué et timeline incident) — détaillé dans RAW_APPENDIX BLOC 10. Hors scope Event 0 Pierre de Rosette (un seul talent, organisateur connu).
Dashboard vendeur D-090 (portefeuille complet, RSI) — D-119 hors MVP V3.0.
Activation bilingue anglais V3.0.1 — D-088. Hors scope V3.0 initial.
Notifications push/SMS — non couvertes dans l'OS, hors scope.
Pages QuickPlay D-118 critère 11 "compréhensible en 30 secondes" — D-118 sépare Seuil 1 (Event 0) de Seuil 2 (ouverture élargie). QuickPlay = Seuil 2.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — quatre INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

Où vit physiquement l'UI qui va consommer V3 ? Trois options envisageables : (a) UI Base44 native (pages générées par Base44, appellant directement les fonctions Base44 stripeWebhook + autres), (b) microrave.ca V1 adapté (pages HTML/JS hébergées séparément, appellant V3 via une API REST à exposer), (c) une nouvelle SPA frontend (React/Vue/Svelte) hébergée sur Vercel/Netlify, appellant V3. Le choix conditionne 80% du travail UX restant. Plan §3.1 dit "Adapter les pages existantes de V1" — donc (b) est suggéré, mais avec quelle API V3 ? Aujourd'hui V3 n'expose aucune API REST (seulement des modules JS internes). À valider — sans réponse, impossible d'estimer le delta UX.
Qui persiste le ContractSnapshot V1 retourné par transitionEngagement(placed→accepted) ? Trois options : (a) le caller V3 lui-même (script ou test), (b) une fonction Base44 wrapper qui appelle V3 puis persiste, (c) l'UI qui lit result.contractSnapshot et appelle repositories.contractSnapshots.create() séparément. Le commentaire MissionConversionGuard l. 200 "retourné, pas persisté ici" assume un caller responsable. Pour Pierre de Rosette : qui sera ce caller ? À valider.
Comment l'UI traduit-elle les codes d'erreur techniques en messages D-087 non accusatoires ? Exemple : C-04_GPS_TOO_FAR: Distance GPS 750m > maxDistancePolicy 500m. Le talent était à 750m du lieu, seuil configuré : 500m. — ce message est techniquement clair, mais D-087 exige "ton non accusatoire. Le système explique ce qu'il a observé, pas ce que l'utilisateur a fait de mal." La formulation actuelle dit "Le talent était à X m du lieu" — implicitement accusateur. L'UI doit reformuler. Pas de table de mapping codes-techniques → messages-utilisateur dans V3. À valider — l'UI doit-elle proposer cette table, ou V3 doit-il l'inclure ?
Comment formuler la promesse D-086 "Ton net est garanti si tu es présent" en présence de la chaîne BLOQUANT D ↔ B ↔ C ↔ F ? Aujourd'hui (cf. fiches D, E, F), même si DJ Alex est physiquement présent et fait son check-in, la chaîne automatique vers payout est cassée (Stripe webhook → seal_event manquant, scheduler injection incomplète, SOTS consolidate non câblé). La promesse UX "Ton net est garanti" ne peut tenir tant que ces BLOQUANTS ne sont pas résolus. Soit on tient la promesse en résolvant la chaîne, soit on adoucit la promesse. À valider — c'est un arbitrage entre la solidité technique et le langage de confiance.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : pages microrave.ca existantes constituent une rampe UX précieuse — design system, branding, identité visuelle, vocabulaire francophone québécois reconnu. Acquis : crédibilité culturelle, pas besoin d'inventer une identité. Dette : V1 ne respecte probablement pas le vocabulaire D-085 ("fonds protégés" vs "escrow"), le format D-084 (5 éléments par état), la ventilation D-024 obligatoire avant acceptation. L'adaptation V1 → V3 n'est pas un coup de pinceau — c'est un refactoring du contenu pour aligner avec la doctrine ratifiée. À budgéter sérieusement.
De V2 : rien d'opérationnel survivant, mais un apprentissage négatif important : V2 promettait beaucoup, n'a rien livré, et a installé chez les talents potentiels une posture "on attend de voir". L'UX V3 doit montrer la solidité opérationnelle dès Event 0, pas la promettre. La phrase D-086 "Ton net est garanti si tu es présent" ne peut être prononcée sans preuve.
De l'OS V3 lui-même : doctrine UX très détaillée (11 décisions formelles + exemples chiffrés canoniques + règles de vocabulaire absolues). C'est une dette qui accélère : peu de zones grises, beaucoup de prescriptions explicites. Mais aussi une dette qui pèse : adapter V1 à toutes ces prescriptions demande un audit page par page.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Brancher la persistance automatique du ContractSnapshot V1 à l'acceptation (soit via transitionEngagement.js lui-même, soit en confiant explicitement la responsabilité à un caller documenté), adapter les pages V1 microrave.ca pour respecter D-024 (ventilation obligatoire avant acceptation), D-025 (facture 5 lignes), D-084 (5 éléments par état), D-085 (vocabulaire "fonds protégés"), D-086 (formulations frais MR), D-087 (notification non accusatoire), implémenter au moins le calcul backend TPS/TVQ pour que la facture D-025 soit correcte, et obtenir validation fondateur sur les quatre INFÉRENCES (hébergement UI, persistance snapshot V1, table mapping codes-techniques → messages-UX, ajustement promesse "garantie" face aux BLOQUANTS D/B/C/F).
──────────────────────────────────────────────────
6. STATUT FINAL
☒ IMPOSSIBLE À ÉVALUER COMPLÈTEMENT + EN COURS côté backend → environ 30 %
Décomposition (côté préparation backend pour UX uniquement) :

✅ Données de ventilation D-024 calculées correctement dans MissionConversionGuard : 100 %
✅ Données de waterfall D-025 calculées correctement dans SealingGuard : 100 %
✅ Repository contractSnapshots exposé et fonctionnel : 100 %
✅ Préfixes CS1-/CS2- enregistrés dans IDFactory : 100 %
✅ Doctrine UX entièrement écrite dans l'OS : 100 %
❌ Persistance automatique ContractSnapshot V1 à placed→accepted : 0 %
❌ Calcul TPS/TVQ pour facture D-025 lignes 3-4 : 0 %
❌ Service EngagementProjection (format D-084 5 éléments) : 0 %
❌ Système i18n D-088 : 0 % (hors archive, attendu côté UI)
❌ Mapping codes-techniques → messages-UX D-087 : 0 %
⚠ UI réelle (microrave.ca adapté à V3) : non-évaluable depuis l'archive V3 — hors périmètre

Ce qui est évaluable depuis l'archive V3 est à environ 50%. Ce qui demande l'UI (microrave.ca) est non-évaluable. Le statut composite est donc IMPOSSIBLE À ÉVALUER COMPLÈTEMENT.
──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine A (Ontologie) : les états WORM (24+ états Engagement) doivent être projetés en UX D-084 5-éléments. Domaine I est consommateur du domaine A — l'inverse n'est pas vrai. Bidirectionnel faible.
Domaine B (Finance et ledger) : la ventilation D-024 et la facture D-025 reposent sur les calculs financiers du domaine B. Sans cachetNetCents, commissionMrCents, prixVenduClientCents corrects, l'UX affiche des données fausses. Pour Pierre de Rosette : Fiche B montre que les calculs nominaux marchent — pas de blocage. Pour TPS/TVQ : Fiche B confirme l'absence de calcul → UX dépendante.
Domaine C (Stripe et paiements) : D-118 critère 3 "Payeur comprend 'fonds protégés'" + D-085 — l'UX doit pouvoir afficher l'état du paiement (initié, dépôt sécurisé, solde sécurisé, payout exécuté). Domaine C alimente ces états via webhook. Cf. Fiche C BLOQUANT : le webhook proxy est prêt mais la fonction Base44 stripeWebhook est absente → les états Stripe ne descendent pas vers l'UX automatiquement.
Domaine D (Présence) : D-084 critère "preuve ou blocage" — l'UX doit afficher la SessionPresence (check-in fait ? GPS OK ? durée OK ?). Cf. Fiche D BLOQUANT : nommage checkInAt/checkedInAt incohérent + GPS non calculé → l'UX afficherait des blocages incorrects.
Domaine E (SOTS) : D-024 exige "score SOTS, multiplicateur SOTS" affichés au moment de l'acceptation. Cf. Fiche E : pour DJ Alex sans historique, multiplicateur fallback 1.0 (D-080) → UX affiche "1.00x neutre" — défensable. Mais le score par défaut 3/5 (D-026) n'est pas initialisé → UX affiche "Aucun score" — moins cohérent doctrinalement.
Domaine F (Scheduler) : D-084 critère "délai" — l'UX doit afficher "Ton payout sera tiré le [DATE_FROM_SCHEDULER]". Cf. Fiche F BLOQUANT : aucun déclencheur cron externe configuré → l'UX peut afficher un délai qui ne se réalise jamais.
Domaine G (Admin) : D-087 notification négative + D-111 "Exporter est un pouvoir distinct" — l'UX d'export utilisateur (talent demande son historique) dépend de G. Hors scope Event 0 mais critique post-MVP.
Domaine H (Portabilité) : D-085 "langage vulgarisé" + D-088 i18n → i18n est listé dans la liste D-127 des couches portables jamais propriété de Base44. L'i18n V3 doit donc vivre indépendamment de Base44 — directement lié à H.
Domaine J (Acteurs et onboarding) : la ventilation D-024 dépend de la connaissance du talent (tier, score SOTS) — alimenté par J. Le format D-084 (statut/argent/prochaine action) dépend du rôle utilisateur connecté — alimenté par J.
→ Domaine I est en aval de tous les autres. Aucun domaine ne dépend de I pour fonctionner — mais tous les domaines voient leur valeur amoindrie si I est défaillant. La vérité institutionnelle existe en backend (Fiche A à G), la vérité perçue par l'utilisateur final dépend entièrement de I. Source : D-091 "Le talent joue. L'organisateur crée le besoin. Le checkpoint donne la scène." + D-117 "visible/référençable". Sans I, le système est juste, mais incompris — ce qui détruit la confiance que la justesse essayait de construire.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — I. UX ET VÉRITÉ PERÇUE
Fiche conservée pour le Prompt de Synthèse.