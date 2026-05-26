━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — I. UX ET VÉRITÉ PERÇUE
Date d'évaluation : 26 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 §1.4)
  • codeBase44_v3/src/pages/EngagementView.jsx
  • codeBase44_v3/src/pages/EngagementForm.jsx
  • codeBase44_v3/src/pages/CompletionFlow.jsx v3 [MIS À JOUR AUJOURD'HUI]
  • codeBase44_v3/src/pages/TalentPresence.jsx v3 [MIS À JOUR AUJOURD'HUI]
  • codeBase44_v3/src/pages/PolicyDashboard.jsx
  • codeBase44_v3/base44/functions/getEngagement/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/initiateDepositPayment/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/initiateBalancePayment/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/dataBase/Engagement_export.csv (waterfall fields présents)
Niveau de confiance : HAUTE sur les surfaces existantes ;
                     HAUTE sur les lacunes de surface identifiées.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
   (Tirés de l'OS V15)

Ce domaine est prêt pour la première transaction quand :

• Le talent voit exactement son net avant d'accepter — OS V15 §1.4 :
  "Ce que tu acceptes est transparent. Tu vois exactement ce que tu
  recevras avant d'accepter." Implique : commission déduite, net affiché,
  taux correspondant au tier réel du talent.

• L'état payout est lisible pour l'organisateur et le talent en temps réel
  — OS V15 §1.4 : "Micro Rave garantit ce règlement si tu livres ta
  présence." Le statut du payout (payable/settled/archived) doit être
  visible et compréhensible.

• Les fonds du talent sont protégés — la ventilation du waterfall (cachet,
  commission, net, dépôt) est persistée dans l'Engagement au moment de
  la création (non recalculée à la volée) — source : createEngagement
  calcul et stockage de commissionMrCents, talentNetCents, depositCents.

• L'organisateur peut déclencher les actions critiques du cycle depuis
  l'interface : payer le dépôt, payer la balance, sceller l'événement,
  déclencher le règlement, archiver.

Ce domaine bloque tout le reste si :

• Le talent accepte un contrat sans jamais avoir vu son net réel.
  OS V15 §1.4 : la transparence avant acceptation est une promesse
  fondatrice. Sa violation décrédibilise l'institution.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

  ENGAGEMENTFORM.JSX — VENTILATION AVANT ACCEPTATION :
  Le waterfall est affiché en temps réel dès que cachetSigne > 0 :
  cachet signé, commission MR, net talent, dépôt requis (20%).
  La formule est : `calcWaterfall(cachetStr, tauxPpm = 120000)`.
  Un label explicite indique le taux : "Aperçu waterfall (taux Freemium 12%)".
  La ventilation est visible AVANT la soumission du formulaire.
  Source : EngagementForm.jsx l.208-215.

  ENGAGEMENTVIEW.JSX — ÉTAT PAYOUT LISIBLE :
  Page complète de suivi du cycle complet avec :
  — Progress bar 8 étapes (Placé→Archivé) colorée selon l'état courant.
  — Badge d'état (couleur + icône + label français) pour chaque status.
  — Sidebar avec timeline chronologique (états passés/courant/futurs).
  — Waterfall financier live depuis les champs de l'Engagement :
    cachetSigneCents, commissionMrCents (lus depuis DB, pas recalculés),
    talentNetCents, depositCents, balanceCents.
  — Actions contextuelles selon le rôle (isOrganizer / isTalent) et
    le statut : payer dépôt, sceller, copier lien check-in, continuer
    processus, déclencher règlement, archiver.
  — Bouton "Faire mon check-in" (talent) en event_sealed.
  Source : EngagementView.jsx.

  COMPLETIONFLOW.JSX — CYCLE POST-ÉVÉNEMENT :
  Interface guidée pour l'organisateur depuis performed jusqu'à payable :
  — Étape 1 (performed→event_completed) : confirmer la prestation.
  — Étape 2 (event_completed) : soumettre la note SOTS (curseur ★★★★★).
  — Étape 3 : fenêtre de contestation ouverte + scheduling (24h).
  — NOUVEAU v3 (aujourd'hui) : bouton "Passer à payable maintenant"
    (contestation_window→payable) avec confirmation JavaScript.
  Source : CompletionFlow.jsx.

  STRIPE CHECKOUT — MONTANT VISIBLE :
  La description de la Checkout Session inclut "Acompte engagement
  Micro Rave (20% du cachet de X $)" — le montant précis est visible
  sur la page de paiement Stripe avant confirmation.
  Source : initiateDepositPayment/entry.ts l.118.

  GETENGAGEMENT — CHAMPS FINANCIERS COMPLETS :
  La fonction retourne : cachetSigneCents, tauxPpm, commissionMrCents,
  talentNetCents, depositCents, balanceCents, tpsCents, tvqCents.
  Ces valeurs sont persistées dans l'Engagement à la création —
  pas recalculées côté front. Source : getEngagement/entry.ts l.68-75.

Ce qui vient de V1 et est encore actif :
  V1 affichait un waterfall minimal (cachet/fees). V3 l'enrichit avec
  la ventilation TPS/TVQ, la commission MR, le net garanti et la timeline
  des états. Acquis conceptuel, pas de dette.

Ce qui vient de V2 et a survécu :
  Aucun.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT — aucun absolu.

  Pour le premier événement simple (Freemium talent, 12%), toutes les
  surfaces UX nécessaires existent. La transaction est navigable bout-en-bout
  via l'interface actuelle.

DÉGRADANT (réduit la qualité, n'empêche pas) :

• [D-I-01] BALANCE PAYMENT : PAS DE BOUTON UI.
  La fonction initiateBalancePayment/entry.ts est déployée et fonctionnelle
  (Stripe Checkout pour la balance). Mais aucun bouton dans EngagementView
  ni dans aucune autre page ne l'expose. L'organisateur ne peut pas initier
  le paiement de la balance depuis l'interface.
  État actuel de la UX : EngagementView montre "Mode pilote : le paiement
  du solde sera confirmé après" comme note informative sur le bouton Sceller.
  Pour Event 1 commercial, la balance doit être collectée via API directe
  ou la fonction `guardBalancePayment` (SoloFounderOverride → passed:true)
  permet de sceller sans balance payée.
  Source : EngagementView.jsx l.302 + absence de handlePayBalance().

• [D-I-02] WATERFALL PREVIEW AVEC TAUX HARDCODÉ 12%.
  `calcWaterfall(cachetStr, tauxPpm = 120000)` dans EngagementForm affiche
  toujours 12% dans la preview, même si le talent est sur un tier non-Freemium.
  Pour un talent Pro (6%), la preview montre une commission de 24$ sur 200$
  alors que l'Engagement stockera 12$. La discordance est favorable au
  talent (il reçoit plus que prévu) mais contredit la doctrine de
  transparence exacte — OS V15 §1.4 : "exactement ce que tu recevras."
  Note : le label précise "(taux Freemium 12%)" — l'honnêteté du label
  atténue le risque de mauvaise surprise, mais ne constitue pas la
  transparence exacte requise par le tier réel.
  Source : EngagementForm.jsx l.208 + l.454.

• [D-I-03] "PASSER À PAYABLE" SANS TRACE INSTITUTIONNELLE.
  Le bouton CompletionFlow "Passer à payable maintenant" déclenche
  contestation_window→payable avec `context: { forcedByOrganizer: true }`.
  L'unique protection est window.confirm() (non-persistée, non-auditée).
  Aucun AdminAction (D-106), aucun AdminIncidentRecord P1 n'est créé.
  Pour un pilote supervisé, acceptable. Mais l'override n'est pas tracé
  institutionnellement. Source : CompletionFlow.jsx handleAdvanceToPayable().

• [D-I-04] POLICYDASHBOARD BYPASSE D-108.
  `base44.entities.PolicyConfig.update()` est appelé directement sans
  PolicyConfigChangeRecord ni double validation (D-108). L'interface admin
  permet de modifier des configs CRITIQUE sans le processus obligatoire.
  Source : PolicyDashboard.jsx l.45-46.

• [D-I-05] PAS DE SURFACE TALENT DÉDIÉE POUR LE PAYOUT.
  EngagementView affiche le waterfall (talentNetCents visible) mais pas
  d'écran dédié au talent type "Tu seras payé 264$ CAD via Stripe Connect
  le JJ/MM à HH:00". L'état 'payable' est visible dans la timeline mais
  la signification pour le talent n'est pas traduite en langage de promesse.
  La promesse OS V15 §1.4 est satisfaite à minima — l'amélioration est
  qualitative, pas doctrinale.

REPORTABLE (peut attendre l'événement 2+) :

• Interface vendeur/Checkpoint : aucune page dédiée au vendeur ni au
  Checkpoint pour la gestion de leur portefeuille d'engagements.
• Historique des amendements visible dans l'UI.
• Notifications push/email à chaque transition d'état (webhook_url seedé
  dans PolicyConfig mais non câblé à une logique de notification).
• Vue talent pré-event : "J-7 : ton dépôt a été reçu" en langage naturel.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première
transaction que l'OS ne documente pas explicitement ?

→ OUI — INFÉRENCE NON DOCUMENTÉE : L'OS §1.4 garantit que "Micro Rave
  garantit ce règlement si tu livres ta présence." La page EngagementView
  affiche l'état payable/settled, mais le talent n'a pas de confirmation
  explicite du montant net final (post-ContractSnapshot W2) dans l'UI.
  Pour la première transaction où CS2 n'est pas persisté (Domain A B-A-03),
  les montants affichés viennent de l'Engagement initial (created) — qui
  peut diverger du CS2 en cas d'amendment. Pour Event 1 sans amendment :
  non-bloquant. Pour Event 1+ avec amendment : les montants UI ne reflèteront
  pas le montant modifié. À valider formellement.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

V1 affichait une interface de gestion d'événements distincte de la couche
paiement. V3 intègre le financial waterfall directement dans l'EngagementView
— c'est une amélioration architecturale significative. La dette principale
est que V3 n'a pas encore intégré le balance payment dans l'UI (D-I-01),
ce qui était également absent de V1 (les paiements V1 étaient manuels).

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour Event 1 commercial : ajouter un bouton "Payer la balance" dans
EngagementView (état deposit_secured) qui appelle initiateBalancePayment
et retourne une Checkout URL — identique au bouton "Payer le dépôt"
déjà implémenté. Une heure de travail de surface.

──────────────────────────────────────────────────
6. STATUT FINAL

  ☑ EN COURS → 75% estimé

  Ce qui est prêt : ventilation waterfall avant acceptation (EngagementForm),
  état payout lisible (EngagementView), Stripe amount visible (Checkout),
  CompletionFlow guided avec SOTS + contestation, TalentPresence v3.

  Ce qui reste : bouton balance payment (D-I-01), waterfall preview avec
  taux réel du tier (D-I-02), trace institutionnelle pour "Passer à payable"
  (D-I-03).

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

• Aucun autre domaine ne dépend de I pour sa logique métier.
  I est la surface visible — les domaines A à H produisent les
  données que I affiche.

  INFÉRENCE : si les promesses OS V15 §1.4 ne sont pas lisibles dans
  l'interface (talent ne voit pas son net exact avec le bon taux, balance
  non payable via UI), la confiance institutionnelle dans le règlement
  est fragilisée même si le backend fonctionne correctement. L'UX est
  la dernière ligne de confiance perçue — son incomplétude peut provoquer
  une dépendance sur le fondateur pour expliquer le cycle à chaque acteur.
  Ce risque opérationnel est réel pour Event 1 avec de nouveaux acteurs.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — I. UX ET VÉRITÉ PERÇUE
Conserver pour le Prompt de Synthèse.