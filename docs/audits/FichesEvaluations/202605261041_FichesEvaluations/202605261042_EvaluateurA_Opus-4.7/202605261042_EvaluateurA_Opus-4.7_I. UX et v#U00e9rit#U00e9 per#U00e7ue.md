━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — I. UX et vérité perçue
Date d'évaluation : 26 mai 2026
Documents sources :
  • docs/os/MICRORAVE_V3_OPERATING_SYSTEM_V15.md (§1.1
    triptyque, §1.2 ce que MR refuse, §1.3 Micro-Onde et
    « Avant/Pendant/Après », §1.4 « 4 promesses »)
  • docs/os/EXPORT_BRUT…REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-063 fail-closed PolicyConfig, D-084 « UX talent —
    format universel par état », D-115 conditionnel
    PhoneFreeRitualGuard)
  • codeBase44_v3/src/pages/{EngagementForm,EngagementView,
    TalentPresence,CompletionFlow,PolicyDashboard}.jsx
  • codeBase44_v3/src/components/engagement/ActionsSidebar.jsx
  • codeBase44_v3/src/App.jsx (routing)
  • codeBase44_v3/dataBase/PolicyConfig_export.csv (valeurs
    seedées que l'UI devrait lire mais hardcode)
  • 20260526-1030_RAPPORT-AUDIT-FORENSIQUE.md — FICHIER VIDE
    (0 octet, INCONNU)
Niveau de confiance : HAUTE pour le code UI (5 pages lues
    intégralement) ; PARTIELLE sur l'expérience utilisateur
    réelle (impossible de tester l'UI en flux complet sans
    accès interactif — INCONNU sur perception)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

   Ce domaine est prêt pour la première transaction quand :

   • Promesse au talent OS §1.4 honorée : « Ce que tu acceptes
     est transparent. Tu vois exactement ce que tu recevras
     avant d'accepter — et Micro Rave garantit ce règlement si
     tu livres ta présence. »
     Implique : un écran d'acceptation talent qui montre
     cachet brut, commission MR, taux, net talent, dépôt,
     balance, avant que le talent confirme.

   • Promesse à l'organisateur OS §1.4 : « le bon talent, au
     bon prix, au bon moment, avec le bon client — dans un
     cadre professionnel où la preuve remplace
     l'improvisation. » Implique : interface qui montre
     l'état de la preuve (présence, SOTS, ledger) à chaque
     étape.

   • Promesse au checkpoint OS §1.4 : « la marque, la
     plateforme, les règles, les outils et la structure pour te
     développer dans un territoire dédié. » Implique : une
     surface UI dédiée au lieu (calendrier, historique culturel,
     profil EMA, capacité). Triptyque OS §1.1 « talent ↔
     organisateur ↔ lieu » = trois surfaces, pas deux.

   • D-084 format universel par état — chaque écran talent
     doit afficher :
       1. Statut
       2. Argent (waterfall lisible)
       3. Prochaine action
       4. Délai (compte à rebours quand applicable)
       5. Preuve ou blocage
     « Règle invariante : Chaque état visible par le talent
     affiche ces cinq éléments. »
     — Source : D-084, EXPORT_BRUT §BLOC 10

   • Doctrine du « vestiaire Le Micro-Onde » OS §1.3 :
     « Avant, le téléphone ouvre la porte. Pendant, il reste
     au vestiaire. Après, il raconte ce qui a été vécu. »
     L'UX se retire pendant la prestation. PhoneFreeRitualGuard
     est P0 CONDITIONNEL « si Micro-Onde ».
     — Source : OS V15 §1.3 + EXPORT_BRUT l.2124

   • Fail-closed sur PolicyConfig (D-063) : aucune valeur
     financière hardcodée dans le code, y compris l'UI. Le
     waterfall preview doit lire `commission_default_ppm` et
     `deposit_ratio_ppm` depuis PolicyConfig.
     — Source : entities/PolicyConfig.jsonc l.4 « Toute valeur
       absente = erreur bloquante (fail-closed) »

   Ce domaine bloque tout le reste si :

   • Le talent ne voit pas ce qu'il accepte → §1.4 promesse #1
     trahie → la marketplace devient « marché opaque » (§1.2
     ce que MR refuse).
     — Source : OS V15 §1.2 + §1.4

   • L'UI cache un blocage ou un délai → §1.2 « Une boîte
     noire financière » → confiance institutionnelle brisée.
     — Source : OS V15 §1.2

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

   Ce qui existe et fonctionne selon les documents :

   • 5 pages JSX réelles couvrant le squelette du flux MVP :
       /                  → EngagementForm (organisateur)
       /engagement/new    → EngagementForm
       /engagement/:id    → EngagementView (vue détail)
       /checkin/:id       → TalentPresence (talent unique
                            écran)
       /completion/:id    → CompletionFlow (organisateur)
       /policy            → PolicyDashboard (admin)
     — Source : src/App.jsx l.36-46

   • EngagementView affiche le « Waterfall financier »
     (Cachet signé · Commission MR · Net talent · Dépôt 20% ·
     Balance restante) avec couleurs cohérentes (D-084 #2
     Argent).
     — Source : EngagementView.jsx l.252-269

   • STATE_CONFIG mappe 17 états avec libellés français, icônes
     Lucide et couleurs sémantiques (success/warning/error/
     neon/muted). Stepper visuel à 8 étapes (Placé → Accepté
     → Dépôt → Scellé → Prestation → SOTS → Payable → Réglé).
     — Source : EngagementView.jsx l.35-55

   • EngagementForm preview le waterfall en temps réel pendant
     que l'organisateur saisit le cachet : commission,
     net talent, dépôt — recalculés à chaque frappe.
     — Source : EngagementForm.jsx l.207-215, l.460-475

   • Le confirmation post-création montre « Prochaine étape :
     le talent doit accepter, puis l'organisateur paie le dépôt
     de X $ » — narration cohérente avec la doctrine §1.4
     (côté texte).
     — Source : EngagementForm.jsx l.300

   • TalentPresence applique côté client `pos.coords.accuracy
     <= 50` avant d'autoriser le check-in — UX d'intégrité
     géographique.
     — Source : TalentPresence.jsx l.97-111 (cf. Domaine D §2)

   • Theming Micro Rave V3 cohérent : `font-family: 'DM Mono',
     'Fira Code', monospace` pour le corps, `'DM Serif Display',
     Georgia, serif` pour les titres, palette violette
     (#7c3aed / #a78bfa) sur fond très sombre (#0a0a0f) —
     identité visuelle distinctive.
     — Source : EngagementForm.jsx l.27-46 + EngagementView.jsx

   • PolicyDashboard expose les 36 PolicyConfig avec catégories
     CRITIQUE/ELEVE/STANDARD/OPERATIONNEL et avertissement
     D-108 (l.99 de PolicyFormDialog) sur la traçabilité
     requise. Surface admin présente.
     — Source : components/policy/PolicyFormDialog.jsx l.99

   Ce qui vient de V1 et est encore actif :

   • V1 (microrave.ca) avait sa propre UX. Aucune mention dans
     les fichiers soumis suggérant qu'un composant V1 a été
     réutilisé en V3.
     → INFÉRENCE : aucun héritage V1 visible côté UI. À valider
       par le fondateur.

   Ce qui vient de V2 et a survécu :

   • La doctrine D-084 (cinq éléments par état) est V11/V12 —
     stable. Le « format universel par état » est doctrinal,
     pas encore livré.
   • L'identité visuelle Micro Rave (palette, typographie) semble
     mûre — possible héritage V2 affiné.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

   BLOQUANT (empêche la première transaction) :

   • Aucun écran d'acceptation talent. La promesse OS §1.4
     « Ce que tu acceptes est transparent. Tu vois exactement
     ce que tu recevras avant d'accepter » est structurellement
     impossible à honorer : createEngagement crée directement
     en `placed` (cf. Domaine A) ; il n'y a ni état `proposed`
     ni `negotiating` ni écran `/engagement/:id/accept` ni
     SignatureSnapshot UI. Le talent voit l'engagement APRÈS
     l'avoir été créé pour lui — sans bouton « J'accepte ».
     — Source : EngagementForm.jsx (1 seul appel API,
       createEngagement) + App.jsx (pas de route /accept) +
       Domaine A fiche

   • Composants D-084 #4 (Délai) et #5 (Preuve ou blocage)
     absents dans toutes les pages. Recherche grep sur
     « countdown », « jours », « hours », « 24h », « deadline »,
     « blocReason », « guardFailed » dans tous les .jsx →
     résultat vide. Aucune fenêtre SOTS 24h n'affiche son
     compte à rebours. Aucune raison de blocage de guard
     n'est rendue lisible au talent.
     — Source : grep exhaustif sur src/

   • Aucune page « Mes engagements » côté talent. App.jsx
     route `/` vers EngagementForm (organisateur). Un talent
     qui se connecte arrive sur le formulaire de création.
     Pour voir l'état d'un engagement, le talent doit posséder
     l'URL exacte `/engagement/:id`. Pas de liste, pas de
     dashboard.
     — Source : src/App.jsx l.41 ; aucune route équivalente

   • CTAs manuels pour transitions système. EngagementView
     expose à l'organisateur :
       — « Déclencher le règlement » (payable → settled,
         l.332-342)
       — « Archiver l'engagement » (settled → archived,
         l.344-354)
     Or l'OS V15 §2.7.1 ligne payable→settled exige
     LedgerInvariantGuard + KYC + Stripe confirmé — actions
     système qui ne dépendent pas d'un clic d'organisateur. Le
     §2.7.1 ligne settled→archived exige GoNoGoDecisionRecord
     = GO + tous LedgerRecords finaux + SOTS window closed —
     conditions cron, pas bouton humain. L'UI transforme la
     doctrine « système nerveux autonome » (D-099) en
     workflow manuel organisateur.
     — Source : EngagementView.jsx l.332-354 vs OS V15 §2.7.1

   • Constants financières hardcodées dans l'UI — violation
     D-063 fail-closed PolicyConfig :
       — EngagementForm/calcWaterfall : `tauxPpm = 120000`
         (commission MR 12%) défaut hardcodé l.208
       — EngagementForm/calcWaterfall : `depositCents =
         Math.floor(cachetCents * 200000 / 1_000_000)` ratio
         20% hardcodé l.213 (même quand
         `deposit_ratio_ppm = 200000` existe en PolicyConfig)
       — EngagementView/commCents fallback :
         `Math.floor(cachetCents * 120000 / 1_000_000)`
         hardcodé l.186 (si engagement.commissionMrCents
         absent)
       — Label « Dépôt (20%) » hardcodé l.258 — si le ratio
         change en PolicyConfig, le label reste « 20% »
     Si le fondateur changeait `deposit_ratio_ppm` en base à
     25%, l'UI mentirait silencieusement. La doctrine
     « toute valeur absente = erreur bloquante (fail-closed) »
     (PolicyConfig.jsonc l.4) est trahie par l'UI elle-même.
     — Source : EngagementForm.jsx l.207-215, l.186 ;
       PolicyConfig.jsonc l.4

   DÉGRADANT (réduit la qualité, n'empêche pas) :

   • Aucun messaging « fonds protégés » / « garantie de
     règlement » / « escrow ». L'état `deposit_secured` se
     contente d'un label « Dépôt sécurisé » avec icône Lock,
     sans expliquer au talent (ou au lieu) « tes fonds sont
     en sécurité chez Micro Rave jusqu'à la prestation ». La
     promesse §1.4 « Micro Rave garantit ce règlement si tu
     livres ta présence » n'est pas rendue lisible.
     — Source : grep « protégé / escrow / garantie » → 2
       résultats, tous des labels d'état muets

   • 7 états OS V15 ABSENTS de STATE_CONFIG :
       — deposit_failed
       — cancelled_pre_deposit
       — disputed
       — partially_settled
       — negotiating
       — transfer_requested / transfer_accepted / transfer_refused
       — no_show_pre_event
     Si l'engagement atterrit là, l'UI ne sait pas quoi
     afficher (icône, couleur, libellé). Le mapping est
     partiel.
     — Source : EngagementView.jsx l.35-55 vs OS V15 §2.7.1

   • EngagementForm/isValid valide `form.roleMetier`
     (l.244) mais aucune entrée correspondante dans le state
     initial (l.231-238) ni dans le formulaire UI. Le bouton
     submit ne s'activera jamais. Bug fonctionnel
     potentiel ou code incomplet.
     — Source : EngagementForm.jsx l.231-244

   • CTA archiver dit : « Archivez pour reconnaître le
     revenu MR » (l.348). « Reconnaître le revenu » est
     vocabulaire comptable (LOI LEDGER-01, D-038) qui n'a pas
     sa place dans une UX organisateur. Fuite de doctrine
     vers la surface.
     — Source : EngagementView.jsx l.348

   • Le routing /policy est ouvert à tout utilisateur
     authentifié — App.jsx ne gate pas par rôle (pas de
     `<ProtectedRoute requiredRole="admin">`). Un talent
     pourrait visiter /policy.
     — Source : src/App.jsx l.40

   • CompletionFlow.jsx l.140 invoque scheduleContestation
     Expiration mais — comme noté Domaine F — sans dispatcher
     en aval, la tâche créée reste inerte. L'UI promet une
     échéance que le système ne tient pas.

   • L'UI ne propose pas d'auto-refresh ni de polling après
     une action de paiement Stripe — l'utilisateur doit
     cliquer « Actualiser » manuellement (l.214). Acceptable
     pour pilote, fragile à l'échelle.

   REPORTABLE (peut attendre l'événement 2+) :

   • PhoneFreeRitualGuard (vestiaire Micro-Onde, P0
     CONDITIONNEL si Micro-Onde) — non implémenté côté UI.
     Reportable car Pierre de Rosette canonique ne déclenche
     pas explicitement le mode Micro-Onde (test pilote sans
     audience formelle).
     — Source : EXPORT_BRUT l.2124

   • Multi-talent lineup UI — reportable pour Pierre de
     Rosette mono-talent.

   • Internationalisation : tous les labels en français en
     dur. Pas de fichier i18n. Acceptable pour le marché
     québécois MVP, reportable post-Event 1.

   • Responsive mobile vs desktop — non testable depuis le code
     statique. La typographie monospace + fond sombre laisse
     supposer un design mobile-first, mais à valider.

   • Tests E2E UI absents (pas de Playwright/Cypress config).

   ANGLE MORT POTENTIEL :

   L'OS §1.1 institue le triptyque « talent ↔ organisateur/
   payeur ↔ lieu (EventLocation ou Checkpoint) ». La V3 a une
   surface talent (TalentPresence), une surface organisateur
   (EngagementForm/View/Completion), et ZÉRO surface
   Checkpoint/EventLocation. La promesse §1.4 « Au checkpoint :
   Micro Rave te donne la marque, la plateforme, les règles,
   les outils et la structure » n'a aucun écran. Le triptyque
   est en réalité un binôme côté UX.
   → INFÉRENCE NON DOCUMENTÉE (partiellement) : pour Pierre de
     Rosette canonique « Le Trèfle », l'OS V15 §14.9 ne
     précise pas si le Checkpoint a une UI distincte ou si
     l'organisateur EST le Checkpoint (cas Micro Rave qui se
     teste elle-même). Dans le pilote, le fondateur joue
     vraisemblablement les rôles organisateur + checkpoint,
     ce qui masque l'absence. À trancher par le fondateur :
     le Checkpoint a-t-il besoin d'une UI propre dès Pierre
     de Rosette, ou peut-il rester latent jusqu'à Event 2 ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

   L'identité visuelle (palette MR, typographie, sobriété)
   est distinctive et cohérente — acquis qualitatif de V2 /
   itérations précédentes.

   La dette principale est conceptuelle : la doctrine §1.4 a
   quatre promesses mais l'UI ne sert que deux promesses
   (talent partiellement, organisateur en mode workflow
   manuel). Le vendeur est hors MVP (acquis : reportable).
   Le checkpoint n'a pas de surface — dette à porter pour
   honorer le triptyque §1.1.

   Le code UI n'arme pas la doctrine fail-closed PolicyConfig.
   Chaque constante hardcodée est une promesse muette à
   reseed-tout-en-cascade à chaque modification de config —
   dette d'ingénierie incompatible avec la souveraineté
   PolicyConfig.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

   Pour que le domaine soit prêt : (i) créer l'écran
   d'acceptation talent — vue dédiée affichant
   ContractSnapshot phase 1 (cachet brut, taux, net talent,
   dépôt, balance, historique de négociation) avec bouton
   « J'accepte » qui invoque la transition `proposed →
   accepted` (dépendance Domaine A), (ii) compléter D-084 #4
   et #5 sur chaque écran de l'engagement (countdown des
   fenêtres SOTS et contestation, affichage des raisons de
   blocage de guards), (iii) supprimer les CTAs manuels
   « Déclencher le règlement » et « Archiver l'engagement »
   au profit d'un affichage passif de l'état système
   (« Règlement en cours · Stripe Transfer en route » /
   « Archivage automatique post-J+14 »), (iv) remplacer toutes
   les constantes hardcodées de l'UI (120000, 200000) par
   des lectures de PolicyConfig via getPolicyConfig — fail-
   closed honoré, (v) ajouter une route racine talent
   `/mes-engagements` et une route checkpoint si la décision
   §1.1 l'exige.

──────────────────────────────────────────────────
6. STATUT FINAL

   ☑ EN COURS → ~ 40 %.

   Détail :
     — Identité visuelle + theming : 90 %.
     — Waterfall organisateur lisible : 80 % (présent, mais
       constantes hardcodées).
     — Mapping STATE_CONFIG : 65 % (17/24 états couverts).
     — Stepper visuel 8 étapes : 100 %.
     — D-084 #1 Statut : 100 %.
     — D-084 #2 Argent : 70 % (waterfall présent, mais ne lit
       pas PolicyConfig).
     — D-084 #3 Prochaine action : 80 % (CTAs présents, mais
       certains substituent un workflow manuel à une
       automatisation système).
     — D-084 #4 Délai : 0 %.
     — D-084 #5 Preuve ou blocage : 0 %.
     — Écran d'acceptation talent : 0 %.
     — Surface Checkpoint : 0 %.
     — Page « Mes engagements » talent : 0 %.
     — Fail-closed PolicyConfig honoré côté UI : 20 %.
   Effectif fonctionnel pour première transaction réelle :
   ~ 30 % — un organisateur très accompagné peut piloter le
   flux à la main ; un talent autonome ne le peut pas.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

   • Domaine A (ontologie) — l'écran d'acceptation talent
     dépend de la création préalable d'un ContractSnapshot
     phase 1 lisible. Tant que CS1 n'existe pas (Domaine A),
     l'UI ne peut pas afficher « ce que tu acceptes ». Cycle :
     A bloque I et I formate ce que A produit.
     — Source : OS V15 §1.4 + §2.7 Moment 1

   • Domaine F (Scheduler) — les composants D-084 #4 (Délai)
     dépendent de SchedulerDueTask.dueAt visibles côté UI.
     Sans tâches en base (Domaine F inerte), aucune échéance
     n'est rendue lisible.
     — Source : D-084 + D-099

   • Domaine G (Admin) — composant D-084 #5 (Preuve ou
     blocage) dépend des AdminIncidentRecord et
     DataAccessLedgerEntry pour expliquer pourquoi un payout
     est bloqué. Sans Domaine G écrivant ces records, l'UI
     n'a rien à présenter.
     — Source : D-084 + D-105

   • Domaine D (Présence) — l'UI TalentPresence dépend des
     coordonnées du lieu en base (absentes — Domaine D §3
     BLOQUANT) pour afficher au talent « tu es à X mètres du
     lieu, accepté ». Tant que le lieu n'a pas de coordonnées,
     l'UI affiche seulement « accuracy ≤ 50m » côté GPS du
     téléphone — moitié de la vérification.
     — Source : Domaine D fiche

   • Domaine J (Acteurs et onboarding) — la promesse
     §1.4 au Checkpoint exige des entités Checkpoint /
     EventLocation côté Acteurs, sans lesquelles l'UI
     Checkpoint n'a pas de modèle de données à représenter.
     — Source : OS V15 §1.1 + §1.4

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — I. UX et vérité perçue
Fiche conservée en mémoire de session pour Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━