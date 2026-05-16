# MICRO RAVE V3 — FOUNDER-VALIDATED OPERATING SYSTEM

### Document de référence souverain — validé par Frédérik Gélin, Fondateur

---

**Ce document contient uniquement ce qui a été explicitement validé par le fondateur.** Toute décision non présente ici est une hypothèse, pas une loi. Version : MVP V3 — Mai 2026 — V10 : Cohérence isSelfOrganized (note 2.7.1 ↔ section 6.3) · carte machine d'état guards souverains

---

## TABLE DES MATIÈRES

1. Identité et vision  
2. Ontologie du produit  
3. Modèle financier  
4. Ledger et comptabilité  
5. SOTS et réputation  
6. DecisionKernel et arbitrage  
7. Sécurité et vie privée  
8. Scheduler et opérations  
9. Admin Authority Matrix  
10. UX et vérité perçue  
11. Technologie et infrastructure  
12. Liquidité commerciale  
13. MVP Scope Lock  
14. Premier événement réel  
15. Tests et qualité  
16. Annexes — Lois canoniques et phrases fondatrices

---

# PARTIE I — IDENTITÉ ET VISION

## 1.1 Ce que Micro Rave est

Micro Rave est une **institution de règlement** et un **courtier / agent marketplace**.

Elle ne vend pas la prestation artistique. Elle facilite, contractualise, sécurise, prouve, règle, facture ses propres services et orchestre les flux entre talent, organisateur/payeur et checkpoint.

**Phrase souveraine — Loi Zéro :**

*Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale.*

Cette phrase est le critère d'inclusion et d'exclusion de toute feature. Si une feature ne contribue pas à cette chaîne, elle est hors scope.

**Triptyque fondamental :**

talent  ↔  organisateur/payeur  ↔  lieu (EventLocation ou Checkpoint)

Le lieu est l'endroit où la valeur devient réelle. Sans terrain de jeu, le talent et l'organisateur n'ont nulle part où se rencontrer. Micro Rave orchestre les trois côtés — pas deux.

Un lieu peut être un Checkpoint reconnu dans l'écosystème (bar, salle culturelle, studio) ou une simple EventLocation ponctuelle (rang privé, gymnase scolaire, résidence). Dans les deux cas, le lieu porte une mémoire culturelle attachée à ses coordonnées géographiques exactes.

## 1.2 Ce que Micro Rave refuse de devenir

- Un système où les relations personnelles dictent les relations professionnelles  
- Un marché opaque où les mandats circulent par proximité sociale  
- Un simple annuaire de prestataires  
- Une marketplace molle sans garantie de suite  
- Une boîte noire financière  
- Une plateforme sans preuve, sans arbitrage et sans mémoire  
- Un système qui exploite la scène culturelle au lieu de l'institutionnaliser

## 1.3 Le nom — Le Micro-Onde

Comme un micro-ondes excite les particules par ondes, Micro Rave excite un réseau d'humains par signaux. La marketplace crée les bonnes collisions. Le numérique chauffe le réseau jusqu'à faire émerger l'événement.

**Les trois phases invariantes :**

| Phase | Rôle du numérique | UX désirée |
| :---- | :---- | :---- |
| Avant | Connecter les bonnes personnes | "Je comprends où je vais, avec qui, pourquoi." |
| Pendant | Se retirer — vestiaire Le Micro-Onde | "Je suis ici. Je n'ai plus besoin d'être ailleurs." |
| Après | Mémoriser, noter, payer, archiver | "Je peux garder une trace sans avoir sacrifié le moment." |

*Avant, le téléphone ouvre la porte. Pendant, il reste au vestiaire. Après, il raconte ce qui a été vécu.*

## 1.4 Les promesses fondamentales

**Au talent :** Ce que tu acceptes est transparent. Tu vois exactement ce que tu recevras avant d'accepter — et Micro Rave garantit ce règlement si tu livres ta présence.

**À l'organisateur :** Le bon talent, au bon prix, au bon moment, avec le bon client — dans un cadre professionnel où la preuve remplace l'improvisation et où la relation personnelle ne dicte plus seule la relation professionnelle.

**Au vendeur :** Micro Rave te permet de transformer ton réseau en portefeuille. Tu touches une première commission quand tu actives un client, puis un résiduel encadré lorsque ce client rachète.

**Au checkpoint :** Micro Rave te donne la marque, la plateforme, les règles, les outils et la structure pour te développer dans un territoire dédié. Un lieu devient ce qu'il accueille.

## 1.5 Pivot de Marché

L'architecture entière est conçue pour un Pivot de Marché. Remplacer "musique, humour, vidéo" par "plomberie, électricien, déneigeur" \= modifier quelques lignes de database, zéro refonte de code.

L'invariant universel : trouver le bon talent pour le bon gig, au bon prix, au bon moment. Le domaine culturel est le premier terrain — pas le seul possible.

---

# PARTIE II — ONTOLOGIE DU PRODUIT

## 2.1 Hiérarchie des entités

Event  
└── possède un Lineup  
└── contient des MissionSlots  
└── reçoivent des MissionApplications  
└── génèrent des MissionProposals  
└── si acceptées  
→ créent Engagement (CreateEvent)  
ou → créent EngagementCollectif (QuickPlay)  
└── EngagementCollectif  
→ Engagements individuels  
└── Engagements placés dans le Lineup  
└── ContractSnapshot phase 1 WORM (accepted)  
└── ContractSnapshot phase 2 WORM (event\_sealed)

**Branche QuickPlay — objet précédant la formation du lobby :**

TalentRolePreference (par talent, par roleMetier)

└── alimente la formation du Lobby

└── chaque membre confirme son cachet individuel

→ le système calcule le prix total du lobby

└── MissionApplication collective

    └── EngagementCollectif → Engagements individuels

`TalentRolePreference` est l'objet souverain qui porte le tarif, le style et la signature d'un talent pour un rôle donné. Il précède tout Engagement QuickPlay.

**Règle canonique :**

*Un Event possède un Lineup; le Lineup reçoit des Engagements.*

## 2.2 L'Engagement — atome central

L'Engagement est l'objet atomique de Micro Rave :

*Un talent précis · pour un rôle précis · dans une plage précise · à un prix accepté · sous des conditions explicites · avec présence vérifiable · paiement sécurisé · réputation engagée · et règlement garanti par Micro Rave.*

Un talent peut avoir plusieurs Engagements dans le même event si et seulement si les plages horaires ne se chevauchent pas.

**\[BLOC 1 — V8\] Règle multi-rôle contextuel :**

Un même UserProfile peut tenir plusieurs rôles contextuels dans le système. Ces rôles ne sont pas exclusifs — ils sont contextuels par Engagement :

- Un utilisateur peut être talent dans un event et organisateur dans un autre, sans conflit.  
- Un utilisateur peut être talent dans l'event qu'il organise lui-même (`Engagement.talentUserId == Event.organizerUserId`).

Lorsque ce cas se produit, trois règles s'appliquent :

1. **Auto-notation bloquée :** l'utilisateur ne peut jamais noter sa propre prestation, même via son rôle organisateur. La matrice de notation SOTS supprime la permission `Organisateur → ce talent spécifique` dès que `organizerUserId == talentUserId` pour cet Engagement.  
2. **Condition 6 des 11 auto-satisfaite par délai :** la confirmation de l'organisateur ne peut pas être une action active de la même personne. Elle est satisfaite par expiration du délai de contestation sans contestation reçue.  
3. **Flag automatique en cas de litige :** si un DisputeRecord est ouvert sur cet Engagement, `DISPUTE_ADMIN` reçoit un flag `CONFLICT_OF_INTEREST_SELF` automatique.

Un même utilisateur peut tenir un seul rôle dans le QuickPlay : il peut être talent. Il ne peut pas être simultanément organisateur/checkpoint et membre d'un lobby soumis à cet organisateur/checkpoint dans le même event.

**Champ calculé sur l'Engagement :** `isSelfOrganized: boolean` — true si `Engagement.talentUserId === Event.organizerUserId`. Déclenche les trois règles ci-dessus.

## 2.3 Le Lobby — objet unique à stades multiples

Il existe un seul Lobby à stades multiples. Il n'existe pas un lobby QuickPlay distinct d'un lobby CreateEvent.

| Stade | Ce qui se passe |
| :---- | :---- |
| Formation | Lobby ouvert, membres recrutés selon leurs rôles |
| Tarification | Chaque membre confirme son cachet individuel depuis ses préférences tarifaires. Le système calcule le prix total. Lobby non soumettable tant qu'un membre présent n'a pas confirmé. |
| Proposition | MissionApplication collective générée avec prix total calculé par le système |
| Acceptation | EngagementCollectif créé — tout ou rien |
| Structuration | MissionSlots remplis dans le Lineup — un Engagement par rôle par membre |
| Contractualisation | ContractSnapshot phase 1 WORM |
| Activation | event\_sealed — lobby financièrement actif |
| Jour J | Event performed — présence réelle |
| Check-in | AudienceCheckIn \+ TalentCheckIn — présences prouvées |
| Mémoire | SOTS \+ ReputationLedger — lobby archivé avec sa mémoire |

*QuickPlay lance le lobby. Chaque talent confirme son prix depuis ses préférences. Le système calcule le total. L'organisateur répond — il ne négocie pas. Le Lineup structure. Le ContractSnapshot verrouille. Le Jour J rend réel. Le check-in prouve. Le SOTS mémorise.*

## 2.4 QuickPlay — deux origines, un seul pipeline

Deux voies d'entrée mènent au même chemin nominal :

**Origine A — Organisateur-led :** CreateEvent → MissionSlots ouverts → négociation → Engagements.

**Origine B — QuickPlay-led :** Lobby → chaque membre confirme son cachet depuis ses préférences tarifaires → le système calcule le prix total → candidature collective soumise à un organisateur/checkpoint → placement au calendrier → validation de la plage horaire par les membres → EngagementCollectif → Engagements individuels.

Après l'acceptation, les étapes du pipeline sont identiques pour les deux origines.

**Le lobby ne crée pas seul la mission finale.** Un lobby QuickPlay est une capacité collective prête à être proposée — une équipe avec ses tarifs, ses rôles et ses styles. Il ne devient une mission réelle que lorsqu'un organisateur ou un responsable de checkpoint l'associe à un événement, à une plage horaire et à un lieu. Le lobby peut donc précéder l'Event, mais il ne peut jamais produire un Engagement sans qu'un besoin réel ait été créé ou confirmé.

**L'EngagementCollectif est indivisible.** L'organisateur accepte tout le lobby ou rien. Une fois accepté, les prix sont verrouillés — aucune renégociation individuelle n'est possible.

**Différence fondamentale avec la voie CreateEvent :** Dans la voie CreateEvent, la négociation se fait entre l'organisateur et chaque talent individuellement. Dans la voie QuickPlay, chaque talent déclare son prix depuis ses préférences avant même de rencontrer l'organisateur. L'organisateur reçoit une offre groupée déjà construite — il répond, il ne négocie pas.

**Sens du mot "négociation" selon la voie :**

- **CreateEvent :** échange talent ↔ organisateur sur le cachet, le roleMetier, le style et la plage horaire, avec possibilité de contre-offre. L'historique complet de cet échange — chaque proposition, chaque contre-offre, chaque ajustement de rôle ou de style ou de plage horaire — est snapshoté dans le ContractSnapshot au moment de l'acceptation.  
- **QuickPlay :** pré-confirmation interne des cachets par les membres du lobby, avant soumission. L'organisateur ne négocie pas ligne par ligne — il accepte ou refuse l'offre groupée.

**Les deux scénarios d'imbrication :**

*Scénario A — QuickPlay pur (lobby précède l'Event) :* Les talents se regroupent dans un lobby, confirment leurs cachets, choisissent un checkpoint cible et soumettent. Le responsable du checkpoint place la candidature à son calendrier. À ce moment, le système crée ou complète en arrière-plan un Event et les MissionSlots correspondants. Les membres du lobby valident la plage horaire dans un délai configurable (ex. 24 h). Si tous valident → EngagementCollectif → Engagements individuels → pipeline standard.

*Scénario B — CreateEvent enrichi par QuickPlay (Event précède le lobby) :* Un organisateur crée un Event avec des MissionSlots ouverts. Il reçoit des candidatures individuelles et peut aussi recevoir des lobbies QuickPlay suggérés ou cohérents avec ses besoins. Il peut sélectionner un lobby pour remplir un ou plusieurs MissionSlots. Le lobby devient alors une MissionApplication collective rattachée aux MissionSlots existants → EngagementCollectif → Engagements individuels.

## 2.5 Le Capitaine QuickPlay — statut de lobby, pas rôle métier

*Le capitaine est un statut de lobby, pas un rôle métier.*

roleMetier  \= DJ / photographe / vidéaste / VJ / MC / hôte /

technicien son / technicien lumière

lobbyStatus \= captain / member

Ces deux dimensions sont indépendantes. **Le capitaine est le premier utilisateur arrivé dans le lobby.** Si le capitaine quitte, le suivant dans l'ordre d'arrivée prend le statut.

**\[BLOC 8 — V8\] Deux niveaux de sunset du statut capitaine :**

- **Niveau opérationnel :** le statut capitaine disparaît au lancement de l'EngagementCollectif (analogie StarCraft 2 — l'hôte lance la partie et devient un joueur ordinaire). À partir de ce moment, il n'existe plus aucun pouvoir de capitaine sur l'Engagement.  
- **Niveau réputationnel :** le statut capitaine n'existe pas dans le ReputationLedger. Il ne génère ni bonus ni pénalité SOTS à l'archivage. Il est purement opérationnel — aucune mémoire institutionnelle ne lui est attachée.

Un développeur qui valorise le rôle capitaine dans le ReputationLedger ou dans le SOTSScoreSnapshot commet une erreur architecturale.

## 2.5.1 Préférences tarifaires — source du prix dans le lobby

Le prix total du lobby n'est pas déclaré par le capitaine. Il est **calculé par le système** à partir des préférences tarifaires de chaque membre, puis confirmé individuellement par chaque membre.

**Profil de préférences du talent :**

* TalentRolePreference (par roleMetier) :  
  * roleMetier          : DJ / photographe / VJ / MC / etc.  
  * styleSignature      : signature de style pour ce rôle  
  * tarifType           : HORAIRE / FIXE\_PAR\_EVENT  
  * tarifValeurCents    : tarif visé en cents  
  * dureeMinutesRef     : durée de référence si HORAIRE

Un talent peut avoir plusieurs `TalentRolePreference` — une par roleMetier. Chaque rôle a sa propre signature de style et son propre tarif.

**Calcul du cachet par membre dans le lobby :**

* Si tarifType \= HORAIRE : cachet\_suggéré\_i \= tarifValeurCents × (durée\_event\_minutes / 60\)  
* Si tarifType \= FIXE\_PAR\_EVENT : cachet\_suggéré\_i \= tarifValeurCents

Le système calcule et présente le cachet suggéré.  
Le talent confirme ou ajuste avant la soumission du lobby.

**Recalcul si la durée change :** Si la durée de l'event est modifiée après qu'un talent a confirmé son prix, le système recalcule automatiquement le cachet suggéré et exige une nouvelle confirmation du talent concerné. Le lobby ne peut pas être soumis tant que la confirmation n'est pas renouvelée.

**Talent multi-rôles dans un même lobby :** Un talent engagé pour deux rôles (ex. DJ \+ Humoriste) produit **deux Engagements distincts**, chacun avec son propre cachet confirmé. Les deux cachets s'additionnent dans le lineup.

Exemple :

Engagement 1 — DJ        : cachet confirmé 300 $  
Engagement 2 — Humoriste : cachet confirmé 200 $  
Contribution au lineup   :                 500 $

**Prix total du lobby :**  
prix\_total\_lobby \= sum(cachet\_confirmé\_i, tous membres, tous rôles)

Le système additionne automatiquement. Le capitaine ne peut pas modifier ce total. Personne ne voit les cachets des autres membres — ni le capitaine ni les autres talents. Seul le système connaît tous les cachets pour calculer le total.

## 2.5.2 Séquence QuickPlay — consentement par préférences

**Scénario A — QuickPlay pur (lobby → checkpoint → Event créé en arrière-plan) :**

1. Formation du lobby (membres rejoignent selon leurs rôles et styles)  
     
2. Pour chaque membre — **triple confirmation obligatoire** :

**a) Confirmation du roleMetier :**

→ le membre confirme le rôle avec lequel il participe à ce lobby

→ si le membre a plusieurs rôles dans son profil, il choisit lequel activer pour ce lobby

→ STATUT : `role_confirmé = true`

**b) Confirmation du style :**

→ le membre confirme le style associé à son rôle pour cet event

Exemples de styles par roleMetier :

DJ          : techno / house / disco / hip-hop / afrobeat / trance / drum & bass / ambient / commercial / etc.

Humoriste   : stand-up / clown / impro / sketch / burlesque / etc.

Photographe : street / mode / reportage / portrait / concert / etc.

Vidéaste    : documentaire / clip / corporate / live / etc.

VJ          : mapping / génératif / minimaliste / immersif / etc.

MC / Hôte   : animation / slam / spoken word / freestyle / etc.

Technicien  : son / lumière / scène / régie / etc.

→ STATUT : `style_confirmé = true`

**c) Confirmation du cachet :**

→ le système calcule le cachet suggéré depuis

`TalentRolePreference` (tarif × durée si HORAIRE, montant fixe si FIXE\_PAR\_EVENT)

→ le membre confirme ou ajuste son cachet individuel

→ chaque membre voit uniquement son propre cachet, pas celui des autres membres

→ STATUT : `prix_confirmé = true`

**Délai de confirmation :**

Si un membre ne complète pas sa triple confirmation dans le délai configurable

→ il est **exclu momentanément** du lobby

→ le MissionSlot correspondant se libère

→ il peut rejoindre à nouveau s'il le souhaite

3. Le système calcule le prix total du lobby

\= sum(cachets confirmés, tous membres, tous rôles)

Le capitaine ne voit pas le détail des cachets des autres membres.

Le système connaît tous les cachets pour calculer le total.

4. Quand tous les membres présents ont `role_confirmé + style_confirmé + prix_confirmé = true` :

→ le lobby est soumettable

5. Le capitaine choisit le checkpoint cible  
     
6. Le capitaine peut soumettre même si le lobby n'est pas complet

(des MissionSlots peuvent être vides — analogie SC2)

7. Si la durée estimée de l'event change après confirmation :

→ recalcul automatique des cachets HORAIRE affectés

→ nouvelles confirmations requises des membres affectés

→ lobby bloqué jusqu'à nouvelles confirmations

8. Le capitaine lance la soumission — candidature de lobby envoyée au checkpoint cible  
     
9. Le responsable du checkpoint reçoit la candidature :

→ lineup proposé (rôles et styles, pas les cachets individuels)

→ prix total calculé par le système

→ checkpoint ciblé

10. Le responsable du checkpoint place la candidature au calendrier

→ le système crée ou complète en arrière-plan : Event \+ MissionSlots \+ MissionApplication collective

11. User A et User B reçoivent une notification : plage horaire proposée

→ chaque membre doit valider la plage horaire

→ délai configurable (ex. 24 h)

→ si un membre ne valide pas dans le délai → il est exclu momentanément du lobby, il peut rejoindre à nouveau s'il veut

12. Lorsque tous les membres valident la plage horaire :  
    →  Le responsable du checkpoint selle la candidature au calendrier

→ MissionApplication collective → MissionProposal collective

→ EngagementCollectif → Engagements individuels

→ ContractSnapshot phase 1 WORM

13. Pipeline standard activé : dépôt → balance → event\_sealed → présence → SOTS → payout → archive

---

**Scénario B — CreateEvent enrichi par QuickPlay (Event existe déjà) :**

1. L'organisateur crée un Event avec MissionSlots ouverts  
     
2. Les lobbies QuickPlay cohérents avec les besoins sont suggérés en parallèle des candidatures individuelles  
     
3. L'organisateur sélectionne un lobby pour remplir un ou plusieurs MissionSlots  
     
4. Le lobby devient une MissionApplication collective rattachée aux MissionSlots existants  
     
5. Les membres du lobby reçoivent notification et valident la plage horaire (délai configurable)  
     
6. Si tous valident → EngagementCollectif → Engagements individuels → ContractSnapshot → pipeline standard

**Pouvoirs exclusifs du capitaine :**

1. Soumettre la MissionApplication avant que le lobby soit complet  
     
2. Exclure un membre du lobby

→ seul le capitaine ou le système (pour délai trop long) peut exclure un membre

→ l'exclusion libère le MissionSlot correspondant

3. Confirmer le checkpoint cible

Si le lineup est complet, tous les membres ont `prix_confirmé = true` et tous les critères sont satisfaits → **le système lance automatiquement** sans attendre une action du capitaine.

Analogie : l'hôte d'une partie StarCraft 2\. Son rôle dans la partie est identique aux autres. Son statut disparaît au lancement.

**Interdits absolus :**

- Aucun MissionSlot ni Engagement "capitaine"  
- Aucun payout de capitaine en tant que capitaine  
- Le capitaine ne peut pas modifier le cachet confirmé d'un autre membre  
- Le capitaine ne peut pas soumettre si un membre présent n'a pas confirmé son prix

## 2.6 La machine d'état de l'Engagement

proposed → negotiating → accepted → placed → deposit\_pending

→ deposit\_secured → balance\_pending → event\_sealed → performed

→ event\_completed → sots\_window\_closed → payable → settled → archived

États alternatifs :

disputed / no\_show / cancelled\_pre\_deposit / cancelled\_J30

/ cancelled\_J7 / transfer\_requested / transfer\_accepted

/ transfer\_refused / no\_show\_pre\_event / refunded

**Note sur l'état d'entrée selon la voie :**

- **Voie CreateEvent :** L'Engagement entre en état `proposed` quand un talent soumet une candidature à un MissionSlot. Les états `negotiating` et `accepted` reflètent l'échange talent ↔ organisateur (roleMetier, prix, style, plage horaire, contre-offres).  
    
- **Voie QuickPlay :** L'Engagement individuel ne passe pas par `proposed` → `negotiating` dans le sens CreateEvent. Il entre directement en état `accepted` dès que l'EngagementCollectif est validé par l'organisateur/checkpoint, parce que le prix, le style et la plage horaire ont déjà été confirmés en interne dans le lobby. L'état `negotiating` n'existe pas dans le chemin QuickPlay — il est remplacé par le stade **Tarification** du lobby (confirmation individuelle des cachets depuis `TalentRolePreference`).  
    
- **deposit\_pending :** l'acompte (ratio configuré dans EventPaymentConfig, défaut ≈20%) réserve le Lineup complet — pas un talent individuel. L'EPR est créée au niveau de l'Event. Tout le Lineup est engagé dès que l'acompte est reçu.

## 2.7 Les 6 moments WORM

**\[BLOC 2 — V8\] Hiérarchie de sévérité des WORM — trois niveaux :**

Les 6 moments WORM ne se valent pas institutionnellement. Toute tentative de modification d'un état WORM doit être traitée selon son niveau de sévérité :

- **Niveau 1 — Erreur :** ACCEPTED, DEPOSIT\_SECURED. Toucher à ces états est une erreur de développement — détectable, corrigeable, jamais silencieuse. Exception : SoloFounderOverride avec AdminIncidentRecord obligatoire.  
- **Niveau 2 — Fraude :** EVENT\_SEALED. Toucher à cet état constitue une tentative de fraude financière. Déclenchement immédiat d'un AdminIncidentRecord P0 et SYSTEM\_HOLD sur tous les fonds liés.  
- **Niveau 3 — Architecturalement impossible :** ARCHIVED. Aucun mécanisme dans le système ne permet de modifier un état archivé. Pas même le SoloFounderOverride. Le seul mouvement possible est un reversal en avant (nouvelle écriture ajoutée), jamais une modification de l'existant.

| Moment | État | Ce qui devient immuable | Niveau WORM |
| :---- | :---- | :---- | :---- |
| 1 | accepted | **Voie CreateEvent :** cachet brut, tier, taux, SOTS snapshot, historique complet de négociation. **Voie QuickPlay :** TalentRolePreferenceId, roleMetier, tarifType, tarifValeurCents, durée, cachet confirmé, timestamp, styleSignature. | 🔒 Niveau 1 — Erreur |
| 2 | deposit\_secured | Liaison contractuelle des parties | 🔒 Niveau 1 — Erreur |
| 3 | event\_sealed | WORM financier complet — montants, taux, taxes, Stripe | 🔒🔒 Niveau 2 — Fraude |
| 4 | event\_completed | Ouverture fenêtre SOTS 24h | 🔒 Niveau 1 — Erreur |
| 5 | sots\_window\_closed | WORM réputationnel — scores consolidés | 🔒 Niveau 1 — Erreur |
| 6 | archived | WORM global — lecture seule | 🔒🔒🔒 Niveau 3 — Architecturalement impossible |

## 2.7.1 Guards de transition — table souveraine

**\[PATCH V9\] Architecture anti-corruption de la machine d'état**

**Loi fondatrice de cette section :**

*L'état ne se déclare pas. Il se prouve. Chaque transition est une preuve, pas une assignation. Une porte sans gardien n'est pas une porte — c'est une faille.*

Toute mutation du champ `status` d'un Engagement est interdite sauf via la fonction souveraine :

transitionEngagement({

  engagementId,

  targetState,

  actor,

  context

})

Cette fonction est **l'unique point d'entrée** pour tout changement d'état. Elle exécute les guards dans l'ordre suivant, sans exception :

1. `MissionConversionGuard` — valide la légitimité de la transition demandée et l'autorisation de l'acteur  
2. `WORMGuard` — vérifie qu'aucun état immuable n'est violé selon les niveaux de sévérité (section 2.7)  
3. Guard spécifique à la transition (voir table ci-dessous)  
4. `FinancialInvariantGuard` — si la transition touche un flux financier (LOI LEDGER-02)  
5. `AuditLogger` — toujours, sans exception, append au DataAccessLedger

**TABLE DES GUARDS PAR TRANSITION :**

| Transition | Guard spécifique | Conditions obligatoires |
| :---- | :---- | :---- |
| `proposed → negotiating` | `MissionConversionGuard` | MissionSlot existe · acteur autorisé |
| `proposed → accepted` | `MissionConversionGuard` | MissionSlot existe · prix confirmé · roleMetier défini |
| `negotiating → accepted` | `MissionConversionGuard` | Contre-offre acceptée · prix final confirmé · historique snapshoté |
| `accepted → placed` | `PlacementGuard` | ContractSnapshot phase 1 existe · signatures valides · Lineup cohérent · Event existe |
| `placed → deposit_pending` | `EventPaymentGuard` | EventPaymentRecord créé · Lineup verrouillé · prix calculé · LOI LINEUP-03 respectée |
| `deposit_pending → event_sealed` | `SealingGuard` | Dépôt reçu · balance reçue · ContractSnapshot phase 2 créé · LOI LINEUP-01/02 vérifiées |
| `event_sealed → performed` | `PresenceWindowGuard` | Date event passée · check-in window ouverte · SessionPresence initiée |
| `performed → event_completed` | `EventCompletionGuard` | Tous les talents en état `performed` · aucun no-show non résolu |
| `event_completed → sots_window_closed` | `SOTSWindowGuard` | Fenêtre 24h écoulée · SOTSSubmissions consolidées |
| `performed → payable` | `PresenceProofGuard` | Présence prouvée via PresenceProofResolver · payout conditions PASS · ledger équilibré · event non disputé |
| `payable → settled` | `LedgerInvariantGuard` | LOI LEDGER-02 respectée · zéro cent · Stripe payout confirmé · KYCStatus \= VERIFIED |
| `settled → archived` | `ArchiveWORMGuard` | SOTS window closed · tous les LedgerRecords finaux · GoNoGoDecisionRecord \= GO · BugReplayRecords P0 \= PASSED |
| `performed → no_show` | `NoShowGuard` | Absence confirmée · délai de grâce écoulé · LOI NO-SHOW-01 applicable |
| `* → disputed` | `DisputeGuard` | Standing de l'acteur validé · EvidenceBundle soumis · LOI DISPUTE-01 déclenchée |
| `disputed → *` | `DisputeResolutionGuard` | DecisionRecord existant · SettlementInstruction émise · acteur admin autorisé |

**Toute transition non listée ici est interdite par défaut — fail-closed.**

**Toute tentative de mutation directe du champ `status` sans passer par `transitionEngagement()` déclenche :**

- Une erreur bloquante non-récupérable  
- Un `AdminIncidentRecord` de sévérité P0  
- Un `DataAccessLedger` entry avec acteur, timestamp, valeur tentée

**Règle d'extension :** Toute nouvelle transition ajoutée au système doit d'abord apparaître dans cette table avec son guard et ses conditions avant d'être implémentée. La table est la loi. Le code est son exécution.

**Note sur isSelfOrganized (alignement section 2.2 et 6.3) :** Lorsque `isSelfOrganized = true`, la Condition 6 des 11 conditions de section 6.3 est auto-satisfaite par délai configurable — le `MissionConversionGuard` applique ce cas spécial automatiquement. Ce cas est documenté directement dans la section 6.3 (Condition 6, exception inline) et prévaut par la règle BLOC 1 V8. Les trois sources sont cohérentes : section 2.2 BLOC 1 V8 · section 2.7.1 (cette note) · section 6.3 Condition 6.

## 2.8 EventLocation et Checkpoint — deux objets distincts

### EventLocation

L'EventLocation est l'endroit physique où un event a lieu. C'est un objet autonome — un event peut exister avec seulement une EventLocation, sans aucun Checkpoint.

EventLocation :

systemId

latitude        ← identifiant de mémoire, pas l'adresse

longitude       ← identifiant de mémoire, pas l'adresse

address         (optionnel — jamais exposé publiquement

       pour les lieux privés)

isPrivate       : true / false

isVirtual       : true / false

culturalMemory  : attachée aux coordonnées lat/long

**La mémoire culturelle est attachée aux coordonnées lat/long, pas à l'adresse.** Si le même rang privé accueille trois mariages avec DJ sur cinq ans, le système reconnaît que ces trois events ont eu lieu aux mêmes coordonnées et accumule une mémoire culturelle interne — sans jamais exposer l'adresse résidentielle.

**Exemples d'EventLocation sans Checkpoint :**

- Mariage dans un rang  
- Fête dans une salle scolaire ou paroissiale  
- Réception dans une résidence privée  
- Event virtuel (livestream, open mic en ligne)

### Checkpoint

Un Checkpoint est une EventLocation enrichie — reconnue, programmable et publiquement exploitable dans l'écosystème Micro Rave. Il est toujours associé à une EventLocation sous-jacente (avec ses coordonnées lat/long).

Checkpoint :

systemId

ownerId         : propriétaire / gestionnaire

eventLocationId : EventLocation sous-jacente (lat/long)

name            : nom public

type            : bar / salle culturelle / studio /

        galerie / terrasse / lieu événementiel

status          : VERIFIED / UNVERIFIED / PRIVATE

capacity

calendarId

culturalProfile : CheckpointCulturalProfile (EMA)

Un Checkpoint a un propriétaire reconnu, un calendrier de disponibilités, une capacité d'acceptation QuickPlay, et un `CheckpointCulturalProfile` calculé par EMA sur l'historique des events hébergés.

**Règle d'identification de la mémoire :**

EventLocation sans Checkpoint :

mémoire attachée aux coordonnées lat/long

interne au système — jamais exposée publiquement

sans propriétaire désigné

Checkpoint :

mémoire attachée aux coordonnées lat/long

ET associée à un propriétaire reconnu

ET exposée publiquement via CheckpointCulturalProfile

*Un lieu devient ce qu'il accueille — qu'il soit Checkpoint ou simple EventLocation.*

**Granularité publique pour les lieux privés :** Jamais l'adresse exacte ni les coordonnées précises. Zoom ≥ 10 en affichage public — rue ou quartier uniquement.

### Relation avec le triptyque

Le triptyque `talent ↔ organisateur/payeur ↔ lieu` est valide pour tous les events. Le "lieu" est soit un Checkpoint (lieu reconnu), soit une EventLocation (lieu ponctuel). La présence d'un Checkpoint n'est jamais une condition obligatoire pour créer un event ou un Engagement.

## 2.9 IDFactory — identifiants souverains

Chaque entité du système possède un systemId unique, lisible, préfixé, portable et indépendant de l'infrastructure. Le systemId est immuable une fois créé. Le Base44 id n'est jamais un identifiant métier souverain.

## 2.10 Vendeur — droits économiques conditionnels

Le vendeur détient un droit d'attribution économique conditionnel sur ses clients activés — pas une propriété. Le client appartient institutionnellement à Micro Rave.

| Objet | Définition |
| :---- | :---- |
| ClientAttributionRight | Droit économique conditionnel sur les flux d'un client activé — 36 mois renouvelables |
| FirstCommission | Commission sur la première transaction admissible |
| ResidualCommission | Commission future sur les transactions admissibles du client activé |
| SellerPortfolio | Agrégat des ClientAttributionRights actifs |

*Micro Rave te permet de transformer ton réseau en portefeuille.*

---

# PARTIE III — MODÈLE FINANCIER

## 3.1 LOI FONDAMENTALE — Prix accepté

**LOI-GR-01 originale rejetée.** La loi V3 :

*Le prix accepté est un cachet brut transparent, soumis au courtage connu du talent.*

La commission MR est prélevée sur le cachet brut offert, jamais ajoutée par-dessus. Les taxes et les frais Stripe sont ajoutés au payeur.

**Ce que le talent voit obligatoirement avant d'accepter :**

**Voie CreateEvent** (l'organisateur a fait une offre) :

- Cachet brut offert par l'organisateur  
- Tier abonnement  
- Taux de courtage de base  
- Score SOTS et modulation  
- Taux effectif  
- Commission Micro Rave  
- Cachet net estimé

**Voie QuickPlay** (le talent a déclaré son tarif depuis ses préférences) :

- Cachet calculé par le système depuis `TalentRolePreference` (tarif × durée ou fixe)  
- Tier abonnement  
- Taux de courtage de base  
- Score SOTS et modulation  
- Taux effectif  
- Commission Micro Rave  
- Cachet net estimé  
- Mention : *"Ce montant est basé sur vos préférences tarifaires pour ce rôle."*

Dans les deux voies, cette ventilation s'affiche intégralement avant que le bouton de confirmation soit activable. Le talent ne peut pas confirmer sans avoir vu sa ventilation complète.

## 3.2 Standard numérique invariant

*Le dollar est une unité d'affichage. Le cent est une unité de vérité. Le ppm est une unité de taux.*

MONEY   \= integer cents (jamais float)

RATE    \= integer ppm (1% \= 10 000 ppm, 9,975% \= 99 750 ppm)

SCORE   \= integer units 0-5000 (SOTS 4,1/5 \= 4 100 units)

RATIO   \= numerator / denominator (jamais float)

DISPLAY \= dérivé uniquement — jamais source de calcul

**Interdits absolus :** `amount: 1000.00` / `commissionRate: 0.19` / `sotsScore: 4.1`

## 3.3 LOI WATERFALL-01

**Cas nominal (tous les cachets signés \> 0\) :**

ÉTAPE 1 : coefficient \= max(1, prix\_vendu\_client / total\_lineup\_effectif)

ÉTAPE 2 : cachet\_brut\_final\_i \= cachet\_signé\_i × coefficient

ÉTAPE 3 : commission\_MR\_i \= floor(cachet\_brut\_final\_i × taux\_snapshot\_i / 1 000 000\)

ÉTAPE 4 : talent\_net\_i \= cachet\_brut\_final\_i − commission\_MR\_i

ÉTAPE 5 : commission\_MR\_totale \= sum(commission\_MR\_i)

ÉTAPE 6 : taxes résolues par TaxLiabilityAllocation selon juridiction

(voir doctrine fiscale section 3.10)

ÉTAPE 7 : sous\_total \= prix\_vendu\_client \+ taxes applicables

ÉTAPE 8 : frais\_stripe \= ceil(sous\_total × stripe\_ppm / 1 000 000\) \+ stripe\_fixe

(si TaxConfig.paymentFeesTaxTreatment \= DEBOURS : non taxables)

ÉTAPE 9 : total\_payeur \= sous\_total \+ frais\_stripe

**Cas avec talents gratuits (cachet signé \= 0\) — LOI LINEUP-02 :**

FORMULE EN DEUX COUCHES :

base\_contractuelle\_i \= cachet\_signé\_i

surplus\_pool \=

si total\_lineup\_signé \> 0 :

prix\_vendu\_client − total\_lineup\_signé

sinon (tous gratuits) :

prix\_vendu\_client

effective\_weight\_i \=

si cachet\_signé\_i \> 0 : cachet\_signé\_i

si cachet\_signé\_i \= 0 : freeWeightCents

total\_lineup\_effectif \= sum(effective\_weight\_i, tous talents)

cachet\_brut\_final\_i \=

base\_contractuelle\_i

+ allocation\_prorata(surplus\_pool,  
    
       effective\\\\\\\_weight\\\\\\\_i,    
    
       total\\\\\\\_lineup\\\\\\\_effectif)

freeWeightCents \= 100 cents (1,00 $)

→ configuré dans LedgerCodeMap / PolicyConfig

→ jamais hardcodé

**Règle souveraine — plancher contractuel :**

*Aucun talent ne peut recevoir un cachet brut final inférieur à son cachet signé, sauf annulation, no-show, dispute ou décision formelle.*

**Cas 1 — Deux talents gratuits, event vendu 1 000 $ :**

Talent A signé : 0 $  → base \= 0, poids \= 100 cents

Talent B signé : 0 $  → base \= 0, poids \= 100 cents

total\_lineup\_signé \= 0 → surplus\_pool \= 1 000 $

total\_lineup\_effectif \= 200 cents

Talent A brut final \= 0 \+ (1 000 × 100/200) \= 500,00 $ ✅  
Taux MR 12% :

commission\_MR\_A \= floor(50 000 × 120 000 / 1 000 000\) \= 6 000 cents \= 60,00 $

talent\_net\_A    \= 50 000 − 6 000 \= 44 000 cents \= 440,00 $

Talent B brut final \= 0 \+ (1 000 × 100/200) \= 500,00 $ ✅

commission\_MR\_B \= 60,00 $  /  talent\_net\_B \= 440,00 $

Contrôle LOI LEDGER-02 :

440 \+ 440 \+ 60 \+ 60 \= 1 000 $ ✅

**Cas 2 — Talent A signé 1 000 $, Talent B gratuit, vendu 1 000 $ :**

Talent A signé : 1 000 $  → base \= 1 000 $, poids \= 100 000 cents

Talent B signé : 0 $      → base \= 0 $,     poids \= 100 cents

total\_lineup\_signé \= 1 000 $ → surplus\_pool \= 0 $

Talent A brut final \= 1 000 $ \+ 0 \= 1 000,00 $ ✅

Talent B brut final \= 0 $ \+ 0 \= 0,00 $

Le contrat signé de A est préservé intégralement.

B ne reçoit rien — il n'y a pas de surplus à distribuer. ✅

**Cas 3 — Talent A signé 1 000 $, Talent B gratuit, vendu 2 000 $ :**

surplus\_pool \= 2 000 − 1 000 \= 1 000 $

poids A \= 100 000 cents  /  poids B \= 100 cents

total\_lineup\_effectif \= 100 100 cents

Talent A brut final \= 1 000 \+ (1 000 × 100 000/100 100\) ≈ 1 999,00 $

Talent B brut final \= 0 \+ (1 000 × 100/100 100\) ≈ 1,00 $

A reçoit sa base \+ presque tout le surplus (proportionnel à son poids).

B reçoit une part symbolique du surplus.

Jamais au détriment du prix signé de A. ✅

Le vendeur reçoit 0 $ du produit vendu dans tous les cas. Sa rémunération, si applicable, vient uniquement de SellerCompensationPlan — budget commercial séparé.

*Le coefficient augmente les talents. Le taux de chaque talent calcule sa commission. Le vendeur est hors waterfall. Aucun dollar ne doit être compté deux fois.*

*Le net talent n'est pas un deuxième calcul; c'est le reste protégé.*

**Règle invariante — base taxable :**

*La base taxable est la contrepartie totale de la fourniture taxable — pas la commission Micro Rave. La commission MR est une ventilation économique interne, pas une assiette fiscale distincte.*

**Interdits absolus :**

❌ TPS \= round(commission\_MR\_totale × tps\_ppm / 1 000 000\)

→ calcule les taxes seulement sur la commission MR

→ faux sous toutes les doctrines

❌ TPS\_tiers \= TPS\_totale − TPS\_MR

→ formule impossible : il n'y a pas de TPS\_MR distincte

sous Doctrine A (commission \= ventilation interne)

→ faux sous Doctrine B également

## 3.4 Lois du Lineup

**LOI LINEUP-01 :** `coefficient = max(1, prix_vendu_client / total_lineup_effectif)`.

Si tous les cachets signés \> 0 :

total\_lineup\_effectif \= total\_lineup\_signé

Si un ou plusieurs talents ont un cachet signé \= 0 :

total\_lineup\_effectif \= sum(effective\_weight\_i)

où effective\_weight\_i \= freeWeightCents pour les gratuits

Tout le lineup monte proportionnellement si le prix vendu dépasse le lineup effectif. Le coefficient est toujours ≥ 1\.

**LOI LINEUP-02 :** Talent gratuit \= `freeWeightCents` (100 cents \= 1,00 $) pour les calculs de poids effectif. Le `signed_price_cents` reste 0 dans le ContractSnapshot — la valeur symbolique est uniquement un poids de calcul, jamais un montant contractuel.

**LOI LINEUP-03 :** L'EPR ne peut pas être créée si `prix_vendu_client < total_lineup_signé`. Erreur : `LINEUP_PRICE_FLOOR_VIOLATION`.

## 3.5 Rémunération vendeur — LOI SELLER-COMP-01

*Le vendeur est hors waterfall événementiel.*

LOI SELLER-COMP-01

Le vendeur ne reçoit jamais :

\- une part du prix vendu

\- une part de la surprime

\- une part du cachet talent

\- une part automatique de la commission MR

Le vendeur est rémunéré uniquement par SellerCompensationPlan,

financé par un budget commercial séparé :

vente / promotion / acquisition client.

Formes possibles (configurées en database) :

prime fixe par produit vendu

prime d'activation d'un nouveau client

bonus de volume trimestriel

bonus de rétention

bonus qualité

Sa rémunération ne provient jamais du produit vendu

de l'événement.

**Pourquoi cette séparation est non négociable :** Un vendeur payé depuis la commission MR ou depuis le prix vendu est structurellement incité à maximiser la commission, donc à influencer le prix, le lineup ou la structure économique de l'événement. Ce comportement doit être architecturalement impossible. Uniquement la qualité du fit "meilleur talent pour le bon gig au bon prix au bon moment" doit être priorisé comme doctrine.

**Conséquence sur le waterfall :** L'ÉTAPE 5 ne calcule plus aucune commission vendeur. Le waterfall de l'événement se clôt sur `commission_MR_totale` et `talent_net_total`. La rémunération vendeur est une dépense commerciale distincte, hors du flux événementiel.

## 3.6 Coefficient de vente — LOI COEFFICIENT-01

*Le coefficient est un mécanisme de vérité économique du lineup, pas une feature seller-led.*

LOI COEFFICIENT-01

Le coefficient s'active dès que :

prix\_vendu\_client \> total\_lineup\_effectif

Il sert à transformer la valeur vendue réelle

en cachets bruts finaux par talent,

selon leurs poids économiques respectifs.

Il ne crée aucun droit vendeur.

Il ne dépend d'aucun statut vendeur.

**Formule canonique :**

coefficient \= prix\_vendu\_client / total\_lineup\_effectif

(toujours ≥ 1 par définition de LOI LINEUP-03)

**Cas nominal (tous les talents ont un cachet signé \> 0\) :**

cachet\_brut\_final\_i \= cachet\_signé\_i × coefficient

**Cas avec talents gratuits (cachet signé \= 0\) :** Voir LOI LINEUP-02 et la formule de poids effectif en section 3.3-A.

**Relation avec les tests SC-03 :** Les tests SC-03 peuvent rester conditionnels pour des scénarios de validation avancés. Mais l'activation du coefficient lui-même ne dépend d'aucune condition vendeur. Tout event où `prix_vendu > lineup_effectif` déclenche le coefficient, vendeur assigné ou non.

## 3.7 Scénarios économiques canoniques

| Code | Description | Statut |
| :---- | :---- | :---- |
| SC-01 nominal | Waterfall complet, 1 talent | P0 global |
| SC-01 multi | 3 talents, taux différents | P0 global |
| SC-03 coeff | Coefficient \> 1, prorata multi-talents | Conditionnel — prix\_vendu \> lineup\_effectif |
| SC-05 annulation | \> J-30, remboursement dépôt | P0 global |
| SC-06 balance J-6 | Annulation auto, payout dépôt talents | P0 global |
| SC-07 no-show | Talent 0$, organisateur remboursé, MR garde commission | P0 global |
| SC-08 dispute | Gel chirurgical, résolution partielle | P0 global |
| SC-10 billetterie | Comptes 4540/7410 ségrégués | Conditionnel — si payants |
| SC-11 gratuit | Billet 0$, droit SOTS, aucune fausse recette | P0 global |
| SC-12 hybride | CreateEvent × QuickPlay | Event 3 |
| SC-13 lobby | Formation → lineup → check-ins → SOTS → archive | Event 2+ |
| SC-14 no-show refund | Rail REFUND, ledger équilibré | P0 global |
| SC-15 transfert | Talent A → Talent B, payout Talent B, ledger zéro cent | Conditionnel |
| SC-16 SOTS contesté | Quarantaine → review → DecisionRecord → reversal | Conditionnel |

## 3.8 MoneyMovementRouter

Tout mouvement d'argent doit choisir son rail. Contournement \= interdit absolu.

| Rail | Usage |
| :---- | :---- |
| COLLECT | Réception paiement payeur |
| HOLD | Gel de fonds — SYSTEM\_HOLD, dispute |
| DISTRIBUTE | Payout talent, vendeur, commission |
| REFUND | Remboursement payeur / organisateur |
| TRANSFER | Mouvement interne Stripe |
| RECONCILE | Réconciliation comptable |

## 3.9 Facture payeur — structure canonique

**Sous Doctrine A (Micro Rave mandataire, talent inscrit) :**

Ligne 1 — Prestation artistique          : 1 500,00 $

(dont service Micro Rave : 180,00 $)

Ligne 2 — TPS sur 1 500 $                :    75,00 $

Ligne 3 — TVQ sur 1 500 $                :   149,63 $

Ligne 4 — Frais de paiement              :    45,00 $

Total payeur                             : 1 769,63 $

La ligne "service Micro Rave" est une **ventilation économique lisible par le payeur**. Elle ne définit pas la base taxable. La taxe s'applique sur la totalité de la contrepartie de la fourniture taxable.

**Précision sur les frais de paiement :**

Les frais de paiement sont non taxables si et seulement si `TaxConfig.paymentFeesTaxTreatment = DEBOURS` (remboursement de débours Stripe). Si cette valeur est absente ou différente, les frais constituent une fourniture distincte ou accessoire et doivent être taxés.

Règle fail-closed : si `TaxConfig.paymentFeesTaxTreatment` est absent → blocage. Jamais de valeur par défaut silencieuse.

**Règle invariante :**

*La base taxable n'est pas la commission Micro Rave. La base taxable est la contrepartie totale de la fourniture taxable.*

## 3.10 Doctrine fiscale — TaxLiabilityAllocation

**\[BLOC 10 — V8\] DOCTRINE A — SEED FISCAL · STATUT : HYPOTHÈSE EN COURS DE VALIDATION**

**⚠️ VALIDATION FISCALISTE REQUISE AVANT TOUT LANCEMENT COMMERCIAL RÉEL**

La différence entre une décision prise et une hypothèse non encore testée en justice a des conséquences légales réelles. Ce statut doit être confirmé par un fiscaliste avant de générer des transactions réelles au-delà des tests internes.

---

Micro Rave agit comme courtier / agent marketplace sous Doctrine A.

*Micro Rave est courtier par doctrine. Les flux sont les preuves. Le ledger est le témoin.*

**Trois hypothèses fiscales :**

**Doctrine A — Micro Rave mandataire, talent inscrit TPS/TVQ :** Le talent est le fournisseur. Les taxes s'appliquent sur le prix vendu client total. Micro Rave perçoit les taxes au nom du talent. À l'encaissement : `4325` et `4326` reçoivent la totalité des taxes. `4410/4420` \= 0\. Les taxes sont remises à l'État depuis `4325/4326` à l'archivage.

**Doctrine B — Micro Rave fournisseur principal :** Micro Rave est le fournisseur. Les taxes s'appliquent sur le prix vendu total. Tout va dans `4410/4420`. (Hypothèse universitaire — validation fiscaliste requise.)

**Doctrine C — Micro Rave collecteur désigné :** Structure à définir selon entente formelle. Validation légale/fiscale requise avant activation.

**Six distinctions fondamentales :**

Base taxable ≠ commission Micro Rave

Commission économique ≠ fourniture taxable totale

Montant encaissé ≠ revenu gagné

Taxe collectée ≠ revenu

Courtier déclaré ≠ mandataire fiscalement reconnu

Fournisseur fiscal ≠ responsable technique du paiement

**TaxLiabilityAllocation — snapshot par transaction :**

Chaque transaction scellée conserve la décision fiscale résolue au moment du scellement. Un changement de taux ultérieur n'affecte pas les transactions passées.

TaxLiabilityAllocation champs :

eventId

provinceOfSupply

taxRegime (GST\_QST / HST / GST\_only)

taxRateConfigId

paymentFeesTaxTreatment (DEBOURS / TAXABLE\_SERVICE)

taxableBaseCents

gstHstCents

qstCents

payerInvoiceLines

ledgerPostingInstructionId

sealedAt

**Règle fail-closed :** Si `TaxLiabilityAllocation` est absente, ambiguë ou non supportée → `event_sealed` bloqué. Aucun paiement réel. Aucune facture fiscale.

---

# PARTIE IV — LEDGER ET COMPTABILITÉ

## 4.1 LOI LEDGER-01 — Revenu reconnu à l'archivage

Aucun revenu n'est reconnu tant que l'Engagement n'est pas archivé.

**Écriture complète sous Doctrine A — débours pass-through**

*(Condition préalable : `TaxConfig.paymentFeesTaxTreatment = DEBOURS`, explicitement configuré. Fail-closed si absent.)*

**À l'encaissement :**

DR  5200  Stripe en attente           1 769,63 $

CR  4310  Talent payable net       1 320,00 $

CR  4325  TPS fourniture event.       75,00 $

CR  4326  TVQ fourniture event.      149,63 $

CR  4530  Revenus différés MR        180,00 $

CR  4190  Frais paiement différés     45,00 $

Contrôle : 1 320 \+ 75 \+ 149,63 \+ 180 \+ 45 \= 1 769,63 $ ✅

4310 \= prix\_vendu\_client − commission\_MR \= 1 500 − 180 \= 1 320 $

4410/4420 \= 0 à l'encaissement sous Doctrine A

**À l'archivage — 5 mouvements ordonnés :**

1. Sortie cash frais Stripe (Stripe reprend physiquement) :

DR  4190  Frais paiement différés      45,00 $

CR  5200  Stripe en attente            45,00 $

2. Remise taxes à l'État (ARC / Revenu Québec) :

DR  4325  TPS fourniture event.        75,00 $

DR  4326  TVQ fourniture event.       149,63 $

CR  5200  Stripe en attente           224,63 $

3. Payout talent :

DR  4310  Talent payable net        1 320,00 $

CR  5200  Stripe en attente        1 320,00 $

4. Transfert commission MR vers disponible :

DR  5100  Banque / Stripe disponible   180,00 $

CR  5200  Stripe en attente            180,00 $

5. Reconnaissance revenu MR :

DR  4530  Revenus différés MR          180,00 $

CR  7110  Revenus courtage complétés   180,00 $

**Contrôle final :**

Compte 5200 :

Débit initial           : 1 769,63 $

CR frais Stripe         :    45,00 $

CR remise taxes         :   224,63 $

CR payout talent        : 1 320,00 $

CR commission MR → 5100 :   180,00 $

Total crédits           : 1 769,63 $

Solde 5200              :     0,00 $ ✅

Compte 4190 :

CR à l'encaissement     :    45,00 $

DR sortie cash Stripe   :    45,00 $

Solde 4190              :     0,00 $ ✅

**Rôle de 4190 — compte de débours en transit :**

4190 est crédité à l'encaissement parce que les frais sont inclus dans le virement Stripe entrant. Il est débité au mouvement 1 quand Stripe reprend physiquement les frais. Pas de reconnaissance de charge MR sous doctrine DEBOURS — les frais sont avancés pour le payeur, jamais une charge Micro Rave.

**Rôle de 6110 — non utilisé sous doctrine DEBOURS :**

6110 est réservé pour la doctrine TAXABLE\_SERVICE si TaxConfig qualifie les frais comme charge MR refacturée. Dans ce cas, une écriture alternative distincte doit être définie. 6110 ne peut jamais être crédité.

**Interdits absolus :**

❌ DR 6110 / CR 4190 sous doctrine DEBOURS

❌ valeur par défaut silencieuse sur TaxConfig.paymentFeesTaxTreatment

❌ 4410/4420 à l'encaissement sous Doctrine A

❌ 4310 \= prix\_vendu − commission\_MR − taxes (faux)

→ 4310 \= prix\_vendu − commission\_MR uniquement

*Le paiement n'est pas encore un revenu gagné; c'est une obligation de service.*

## 4.2 LOI LEDGER-02 — Invariant zéro cent

sum(talent\_net\_payable\_i)

\+ sum(commission\_MR\_i)

\+ rounding\_adjustment\_cents

\= prix\_vendu\_client\_cents

Si cet invariant n'est pas respecté → `LEDGER_BALANCE_VIOLATION` → event\_sealed bloqué.

*Le résidu peut naître dans le calcul; il doit mourir dans l'écriture ledger.*

## 4.3 Comptes critiques

**Séparation absolue de ségrégation :**

- `4410/4420` \= taxes Micro Rave propres (perçues sur les fournitures de MR). Sous Doctrine A, ces comptes restent à zéro à l'encaissement.  
- `4325/4326` \= taxes tiers — perçues par MR au nom du talent mandant. Remises à l'État depuis ces comptes. **Jamais mélangés avec 4410/4420.**  
- `4530` \= événementiel / `4535` \= SaaS / `4540` \= billetterie / `4545` \= commandites. **Jamais mélangés.**  
- `6110` \= frais Stripe (doctrine TAXABLE\_SERVICE uniquement) / `6119` \= écarts processeur réels. **Distincts.**  
- `4190` \= débours en transit (doctrine DEBOURS). Solde \= 0 après archivage.

*6591 explique les poussières mathématiques; 6119 explique les surprises du processeur.*

## 4.4 Règles d'arrondi

| Calcul | Règle |
| :---- | :---- |
| Commission MR par talent | floor |
| Net talent | brut\_final − commission\_floorée (jamais re-calculé) |
| Taxes TPS/TVQ | round sur base postée/facturée |
| Frais Stripe refacturés | ceil |
| Seller commission | floor \+ cap |
| Coefficient de vente | allocation largest remainder |
| Ajustements d'arrondi | compte 6591 \+ RoundingReconciliationRecord |

## 4.5 Règle universelle de configuration financière

Aucune constante financière n'est dans le code. Tout taux, commission, seuil, compte ledger, règle d'arrondi vit dans une table de configuration en database.

Configuration absente → erreur bloquante. **Jamais de valeur par défaut silencieuse.**

*Un concept métier \= une source de vérité.*

---

## 4.6 TaxConfig juridictionnel — Ontario, Maritimes et expansion

Micro Rave détermine la taxe applicable selon le **lieu de fourniture** de l'événement, jamais selon l'adresse de Micro Rave Inc.

*Le code ne connaît pas les taux. Le code connaît seulement comment résoudre une configuration fiscale valide.*

Pour une prestation événementielle localisée, le lieu de performance est le signal principal. La règle est résolue par `PlaceOfSupplyRuleConfig`.

**Configuration par province :**

ProvinceTaxRateConfig :

QC : régime GST\_QST  — GST 5%  \+ QST 9,975%

ON : régime HST      — HST 13%

NB : régime HST      — HST 15%

NS : régime HST      — HST 14% (depuis 1er avril 2025\)

PE : régime HST      — HST 15%

NL : régime HST      — HST 15%

**Structure ledger juridictionnelle :**

Québec :

4325 \= GST/TPS (5%) sur fourniture événementielle

4326 \= QST/TVQ (9,975%) sur fourniture événementielle

Ontario / Maritimes (HST) :

4325 \= HST (taux provincial) sur fourniture événementielle

4326 \= 0

Le code lit LedgerCodeMap selon taxRegime résolu.

Il ne présume jamais QC.

**Activation d'une nouvelle province :**

1. Ajouter lignes dans `ProvinceTaxRateConfig`  
2. Ajouter règles dans `PlaceOfSupplyRuleConfig`  
3. Valider avec fiscaliste  
4. Zéro modification du moteur financier

**Règle fail-closed :** Si la juridiction fiscale est absente, ambiguë ou non supportée → EPR bloquée, aucun paiement réel, aucune facture fiscale, aucun `event_sealed`.

---

# PARTIE V — SOTS ET RÉPUTATION

## 5.0 Principe général et statuts doctrinaux

**\[BLOC 4 — V8\] Donnée-témoin vs donnée-pétrole — fondation philosophique du SOTS**

Avant toute description technique, il est essentiel de comprendre pourquoi le SOTS existe :

**Donnée-pétrole (ce que le SOTS refuse d'être) :** extraite à l'insu de l'acteur, raffinée par la plateforme, vendue à des tiers, brûlée, disparue. Elle réduit l'acteur à un comportement observable. Elle ne le représente pas — elle l'exploite.

**Donnée-témoin (ce que le SOTS construit) :** co-produite avec le consentement de l'acteur, conservée append-only dans le ReputationLedger, contestable par procédure formelle, portée par ceux qui l'ont vécue en présence vérifiée. La donnée réputationnelle est une preuve d'existence. Et une existence mérite une mémoire.

*Le SOTS ne mesure pas un comportement. Il mémorise ce que des personnes réelles ont vécu avec toi, en ta présence, vérifiée. C'est la différence entre un score Uber et une mémoire culturelle.*

Cette distinction est une loi invariante (LOI SOTS-TEMOIN-01 — voir section 16.0).

---

**SOTS \= Spirit of the Sound.**

Clin d'œil au *Spirit of the Game* du ultimate frisbee — doctrine où l'arbitrage externe est remplacé par la construction collective d'un fair play bienveillant. Dans le SOTS, il n'y a pas d'oracle central qui juge : ce sont les acteurs de l'événement qui témoignent, par regards croisés, de ce qui s'est passé. La mémoire est co-produite. Le fair play est architecturé.

| Élément | Statut |
| :---- | :---- |
| Principe SOTS | VALIDÉ |
| 7 dimensions quantitatives | SEED CONFIGURABLE — jamais hardcodées dans le code |
| Couche qualitative (champ libre) | VALIDÉ — `SOTSQualitativeRecord` append-only, financièrement neutre |
| Source de vérité des dimensions | `SOTSDimensionConfig` en database |
| Calcul EMA | Principe VALIDÉ — paramètre alpha \= CONFIG VALUE REQUIRED dans `SOTSCalculationPolicyConfig` |
| Modulation commission | Principe VALIDÉ après seuil 10 — courbe \= CONFIG VALUE REQUIRED dans `SOTSCommissionModulationConfig` · multiplicateurs en ppm entiers |
| Valeur neutre sous seuil | VALIDÉE \= 1 000 000 ppm |
| Score par défaut | VALIDÉ \= 3/5 \= 3 000 score\_units pour **tout acteur entrant** : Talent, Checkpoint, EventLocation promue, roleMetier sans historique suffisant |
| Décomposition byRole | VALIDÉE dès le MVP — coexiste avec le score global |
| Fenêtre de notation | VALIDÉE \= 24h unique pour quantitatif \+ qualitatif — une seule soumission SOTS complète |
| Fail-closed | Si `SOTSCalculationPolicyConfig` absente → calcul EMA bloqué |

**Règle : ne jamais hardcoder une dimension, un poids, une courbe ou un multiplicateur SOTS dans le code. Tout vit en database.**

## 5.1a Les 7 dimensions — configuration seed

Les 7 dimensions ci-dessous constituent la configuration initiale de `SOTSDimensionConfig`. Elles peuvent être renommées, pondérées, désactivées ou remplacées par database sans toucher au code.

| \# | Question posée à l'utilisateur | Nom technique (seed) |
| :---- | :---- | :---- |
| 1 | La performance artistique était-elle bonne ? | `performance_artistique` |
| 2 | Le talent était-il fiable et ponctuel ? | `fiabilite_operationnelle` |
| 3 | Le talent était-il professionnel et agréable ? | `professionnalisme_relationnel` |
| 4 | L'expérience vécue était-elle positive ? | `experience_generee` |
| 5 | Le talent était-il le bon choix pour ce mandat ? | `adequation_mandat` |
| 6 | Le talent était-il respectueux de tous ? | `non_toxicite` |
| 7 | L'auriez-vous référencé à quelqu'un ? | `reference` |

Poids par dimension : CONFIG VALUE REQUIRED dans `SOTSDimensionConfig.weight_ppm` (entiers ppm). Aucun poids hardcodé.

## 5.1 Architecture

**ReputationLedger** (append-only) \+ **SOTSScoreSnapshot** (projection périodique par EMA) \+ **SOTSQualitativeRecord** (couche mémorielle parallèle, financièrement neutre).

Le ReputationLedger est la source de vérité. Le snapshot est une dérivée de lecture. Jamais modifiable directement.

Calcul EMA : principe validé. Paramètre alpha \= CONFIG VALUE REQUIRED dans `SOTSCalculationPolicyConfig`. Si cette config est absente → **fail-closed** : le snapshot n'est pas calculé, le score n'est pas mis à jour, aucune valeur par défaut silencieuse.

**Couche qualitative — SOTSQualitativeRecord :**

SOTSQualitativeRecord {

submissionId     : UUID

eventId          : E001

engagementId     : ENG001  // optionnel — si lié à un Engagement spécifique

noteurId         : anonymisé après fenêtre

targetEntityId   : talent / checkpoint / organisateur

targetEntityType : TALENT | CHECKPOINT | ORGANISATEUR

texteLibre       : "le pain était bon"  // champ libre, aucune contrainte de format

timestamp        : 2026-05-15T02:15:00Z

windowStatus     : OPEN | CLOSED

financialEffect  : NONE  // invariant — jamais dans le multiplicateur

}

**Fenêtre de soumission :** identique au quantitatif — **24h après `event_completed`**. Une seule soumission SOTS complète par noteur par event. Le champ qualitatif est optionnel dans la soumission — il peut être vide.

**Deux couches. Deux régimes de causalité :**

| Couche | Objet | Effet financier | Traitement |
| :---- | :---- | :---- | :---- |
| Quantitative | `SOTSQuantitativeRecord` | Module la commission | EMA en temps réel |
| Qualitative | `SOTSQualitativeRecord` | **Jamais** | Archivé append-only — traitement sémantique différé quand volume suffisant |

**Règle invariante :** Le `SOTSQualitativeRecord` n'alimente jamais un multiplicateur de commission. Il vit dans une couche mémorielle parallèle — le portrait sémantique — affiché mais jamais exécuté financièrement.

*Le ReputationLedger garde pourquoi; le snapshot dit combien; le portrait sémantique dit comment c'était vécu.*

## 5.2 Score par défaut

Tout acteur entrant dans l'écosystème commence à **3/5 \= 3 000 score\_units \= multiplicateur neutre (1 000 000 ppm)**.

Cette présomption de valeur neutre est universelle :

| Acteur | Application |
| :---- | :---- |
| Nouveau Talent | 3/5 dès la création du profil |
| Nouveau Checkpoint / EventLocation | 3/5 dès la première activation |
| roleMetier sans historique suffisant | 3/5 dans la décomposition `byRole` jusqu'au seuil de confiance |

**Principe :** *tu existes déjà avant d'avoir prouvé quoi que ce soit. Tu as une valeur par défaut.* La hiérarchie réputationnelle se construit par la preuve, pas par la naissance dans le système.

## 5.3 Matrice de notation — par relation réelle

| Noteur | Peut noter | Condition |
| :---- | :---- | :---- |
| Audience | Talent(s), Checkpoint | TicketAdmissionRight actif \+ AudienceCheckIn validé |
| Talent | Organisateur, Checkpoint | Engagement actif \+ présence validée |
| Organisateur | Talent(s) | Est organisateur \+ event complété |
| Payeur | Organisateur, Vendeur | A payé \+ event complété |
| Vendeur | Organisateur, Talent(s) | SellerAttribution actif sur l'event |
| Admin | Tout acteur | SOTS\_ADJUSTMENT — AdminAction obligatoire |

**Règle :** Tu ne peux pas noter une expérience que le système ne t'a pas vu vivre.

**\[BLOC 1 — V8\] Exception cas isSelfOrganized :** Lorsque `Engagement.isSelfOrganized = true` (l'organisateur est aussi le talent de cet Engagement), la permission `Organisateur → ce talent spécifique` est supprimée. L'organisateur peut noter les autres talents de l'event, mais jamais lui-même — même via le rôle organisateur.

**Pondération des notes Talent → Checkpoint par roleMetier actif :**

La note d'un Talent sur le Checkpoint est pondérée par son `roleMetier` actif dans l'Engagement concerné. Cette pondération est configurée dans `SOTSDimensionConfig.noteurRoleWeight`. Elle n'exclut aucune dimension — elle module le poids de chaque note dans l'EMA du Checkpoint.

Exemples de pondération accrue par rôle :

- **DJ / technicien son** → poids accru sur : qualité sonore de la régie, acoustique, monitoring  
- **Photographe / vidéaste** → poids accru sur : luminosité, espace de mouvement, accès aux zones clés  
- **MC / hôte** → poids accru sur : acoustique de la voix, disposition de scène, interaction audience

Tout Talent peut noter toutes les dimensions. Le poids varie selon la compétence de rôle — pas la permission de noter.

**Note du Checkpoint par l'Audience :**

L'Audience note le Checkpoint sur les dimensions d'expérience vécue — ambiance, accueil, confort, qualité du service. Pas de pondération par rôle pour l'Audience : son regard est celui du public, pas du prestataire.

## 5.4 Seuils de confiance

| Seuil | Comportement |
| :---- | :---- |
| 1 soumission | Score interne uniquement |
| 3 soumissions | Affichage limité avec indicateur "en construction" |
| 5 soumissions | Score public standard |
| 10 soumissions | Modulation complète de commission |

En dessous de 10 soumissions : multiplicateur forcé à **1 000 000 ppm (neutre)** — VALIDÉ.

Au-dessus de 10 soumissions : multiplicateur résolu depuis `SOTSCommissionModulationConfig` — CONFIG VALUE REQUIRED. Multiplicateurs en ppm entiers. Aucune courbe hardcodée.

**Décomposition byRole dans SOTSScoreSnapshot — VALIDÉE dès le MVP :**

SOTSScoreSnapshot {

talentId         : T001

globalScore      : 4 200 score\_units   // EMA de tous les Engagements

byRole: {

DJ: {

  score            : 4 600 score\\\_units

  engagementCount  : 23

  lastEngagement   : 2026-04-12

}

MC: {

  score            : 3 100 score\\\_units

  engagementCount  : 4

  lastEngagement   : 2026-02-08

}

photographe: {

  score            : null            // Aucun Engagement noté dans ce rôle

  engagementCount  : 0

}

}

}

**Règle de modulation par rôle :**

Le multiplicateur de commission dans un Engagement est calculé sur le **score du roleMetier actif dans cet Engagement** — pas sur le score global — quand le seuil de confiance par rôle est atteint. Ce seuil est configuré dans `SOTSConfidencePolicyConfig.roleScoreMinEngagements`. Sous ce seuil, c'est le score global qui s'applique.

**\[BLOC 6 — V8\] Formulation canonique du SOTS — étendue aux styles :**

*Le score global mesure la fiabilité institutionnelle du talent. Le score par rôle mesure sa compétence contextuelle. L'un garantit la confiance. L'autre informe le choix.*

*Le Spirit of the Sound (SOTS) mesure ce qui a été livré, comment cela a été livré, et à quel point c'était bon — par qui, dans quel rôle, dans quel lieu, ressenti par qui — pour les talents, les lieux, les rôles et les styles. Le ReputationLedger garde tout ça. Le seuil de confiance décide quand ce score peut toucher l'argent.*

## 5.5 Fraude SOTS — garde-fou structurel

La condition nécessaire pour soumettre une note audience : TicketAdmissionRight actif \+ AudienceCheckIn validé. Rejet avant ledger si absent.

Auto-note directe ou indirecte : blocage absolu. Voir section 2.2 pour le cas spécifique `isSelfOrganized`.

Soumissions en quarantaine : inscrites avec statut QUARANTINED. **Jamais supprimées.**

## 5.6 Contestation

Motifs admissibles : fraude prouvée / erreur manifeste / noteur non admissible / vengeance prouvable / preuve factuelle contraire.

**Désaccord subjectif n'est jamais admissible.**

Traitement : entrée de reversal dans ReputationLedger, liée à DecisionRecord \+ EvidenceBundle. L'entrée originale reste. Jamais suppression.

---

# PARTIE VI — DECISIONKERNEL ET ARBITRAGE

## 6.1 Doctrine — greffier incorruptible

*Le DecisionKernel MVP ne doit pas prétendre être un juge parfait. Il doit être un greffier incorruptible : il automatise seulement ce qui est prouvé, il gèle ce qui est incertain, il exige une décision humaine pour les cas ambigus, et il ne laisse jamais une sortie d'argent se produire sans trace institutionnelle.*

**\[BLOC 3 — V8\] LOI CO-DÉPENDANCE-01 — La co-dépendance paiement/présence**

*Tu n'es pas payé parce que tu as signé. Tu es payé parce que tu étais là.*

La présence est la condition du règlement. Sans preuve de présence, sans argent — jamais silencieux, jamais automatique. Ce n'est pas une règle de produit. C'est le contrat fondamental de Micro Rave. Il ne se négocie pas cas par cas.

Cette loi se manifeste à trois niveaux :

- **Contractuellement :** le ContractSnapshot enregistre l'obligation de présence au moment de l'accepted (WORM 1).  
- **Opérationnellement :** la condition 3-5 des 11 conditions de paiement (section 6.3) vérifica la présence physique prouvée.  
- **Architecturalement :** aucun chemin de code ne peut déclencher un payout sans que `SessionPresence.checkedInAt != null` soit vrai pour l'Engagement concerné.

Les 11 conditions de la section 6.3 sont la preuve opérationnelle de cette co-dépendance — pas une liste de règles séparées.

## 6.2 Automatique au MVP

`PAYOUT_APPROVED` (preuve forte) / `SYSTEM_HOLD` (anomalie) / `DISPUTE_HOLD_APPLIED` (DisputeRecord valide) / `TRANSFER_APPROVED` (Talent B accepte) / `CHARGEBACK_HOLD_APPLIED` (webhook Stripe)

**Manuel (admin review) au MVP :** dispute complexe / no-show contesté / refund partiel / payout refusé / chargeback résolu / override exceptionnel.

## 6.3 11 conditions pour payout automatique

Ces 11 conditions sont la preuve opérationnelle de la LOI CO-DÉPENDANCE-01 (section 6.1). Chaque condition répond à une question : "Est-ce que la présence est prouvée ? Est-ce que l'argent est sécurisé ?"

1. event\_sealed \= true  
     
2. Engagement.status admissible  
     
3. SessionPresence.checkedInAt \!= null  
     
4. Géolocalisation cohérente avec maxDistancePolicy (database)  
     
5. Présence temporelle cohérente avec minDurationPolicy (database)  
     
6. Présence validée par organisateur/délégué OU délai de contestation expiré sans contestation reçue.   
   * **Exception `isSelfOrganized` :** si `Engagement.isSelfOrganized = true`, la validation active de l'organisateur est architecturalement impossible (même personne que le talent). Dans ce cas, la Condition 6 est satisfaite exclusivement par expiration du délai — jamais par action active. Le `MissionConversionGuard` applique cette règle automatiquement. Source : section 2.2 BLOC 1 V8 \+ section 2.7.1. 

7. SOTSSubmission talent soumis — requis, pas optionnel  
     
8. Aucun DisputeRecord open/blocking  
     
9. Aucun SafetyReport bloquant  
     
10. Ledger invariant vérifié (LOI LEDGER-02)  
      
11. Escrow réellement secured

Si une condition manque → admin review. **Jamais blocage silencieux.**

## 6.4 LOI DISPUTE-01 — Chaîne de règlement

DisputeRecord

→ EvidenceBundle

→ DecisionRecord

→ SettlementInstruction

→ FinancialLedger

→ ReputationLedger

→ Archive

*Une dispute n'est pas un bouton rembourser ou payer. C'est une procédure : geler, qualifier, prouver, répondre, décider, régler, mémoriser.*

## 6.5 Standing légitime

Standing \= actorRole (filtre statique) \+ relation directe avec targetObject (vérification dynamique) \+ statut actif dans l'Event \+ fenêtre temporelle valide.

*Le standing ne vient pas du rôle seul; il vient du lien prouvable entre l'acteur et l'objet contesté.*

*Tout le monde peut parler. Seuls les acteurs avec standing peuvent geler. Le ledger n'obéit qu'à une décision valide.*

## 6.6 Droits de dispute par acteur

Tout DisputeRecord bloquant exige : actorRole, standingLevel, targetObjectType, targetObjectId, disputeType, policyId, reasonCode.

Toute dispute financière exige : amountDisputedCents.

Un IncidentRecord ne gèle **jamais** automatiquement les fonds.

---

# PARTIE VII — SÉCURITÉ ET VIE PRIVÉE

## 7.1 Doctrine

*Le BLOC 11 est une doctrine de preuve, accès minimal et journalisation — pas seulement de la cybersécurité.*

*Chaque employé voit uniquement l'information nécessaire pour accomplir sa tâche, au moment où il en a besoin, et toute consultation d'information sensible doit être justifiée, autorisée et journalisée.*

## 7.2 Hiérarchie de sensibilité — 5 niveaux

| Niveau | Catégorie | Accès |
| :---- | :---- | :---- |
| 1 | Données publiques (profil talent, SOTS, Checkpoint, events publics) | Tout utilisateur |
| 2 | Semi-privées (ventilation talent, statut payout, facture payeur) | Parties de l'Engagement |
| 3 | Confidentielles (commissions vendeur, SellerPortfolio) | Parties \+ rôles autorisés — DataAccessLedgerEntry obligatoire |
| 4 | Très sensibles (FinancialLedger, DecisionRecord, AdminAction logs) | Admin — DataAccessLedgerEntry obligatoire |
| 5 | Critiques (secrets Stripe, LedgerCodeMap) | Fondateur — double validation |

**Règle transversale :** tout accès niveau 3+ → DataAccessLedgerEntry obligatoire. Immuable.

## 7.3 Confidentialité bancaire

Les événements SECRET ne sont pas visibles par défaut aux employés de cellule, gestionnaires, ni admins centraux.

Accès possible uniquement : support client, fraude, fiscalité, paiement, litige, sécurité, conformité ou incident P0.

Chaque accès produit un DataAccessLedgerEntry obligatoire.

*On efface l'identité; on conserve la preuve.*

## 7.4 PresenceProofResolver — faisceau d'indices

La présence est résolue par un faisceau d'indices pondérés. GPS n'est pas obligatoire — signal fort parmi d'autres.

| Signal | Poids | Condition |
| :---- | :---- | :---- |
| TicketAdmissionRight validé | Fort | Événement avec billetterie |
| AudienceCheckIn / TalentCheckIn | Fort | Toujours |
| GPS cohérent avec le lieu | Fort | Si disponible — événement physique |
| QR code scanné sur place | Fort | Si déployé |
| Validation staff / délégué | Moyen | Si délégué présent |
| Timestamp cohérent avec la plage | Moyen | Toujours |
| Log de connexion plateforme | Fort | Événements virtuels uniquement |

**Résolution :**

- Faisceau convergent → présence confirmée → payout automatique éligible  
- Signaux contradictoires → admin review obligatoire  
- Aucun signal → absence présumée → admin review

GPS spoofing seul \= HOLD \+ admin review. Pas nécessairement arrêt si faisceau alternatif valide.

## 7.5 PresencePrivacyGate

La présence peut être comptée publiquement en agrégé; l'identité reste protégée.

| Acteur | Accès |
| :---- | :---- |
| Organisateur | Liste complète des présences de son event |
| Talent / Audience | Sa propre présence uniquement |
| Public | Agrégat seulement (X personnes présentes) |

## 7.6 Rétention des données

7 ans \= plancher légal, pas plafond. Priorité au code de justification le plus contraignant applicable.

| Type | Rétention | Sur demande d'effacement |
| :---- | :---- | :---- |
| Données financières, ContractSnapshot | 7 ans minimum | Pseudonymisation |
| DecisionRecord, SettlementInstruction | 7 ans minimum | Pseudonymisation |
| Données personnelles non financières | Durée compte actif | Suppression réelle possible |
| GPS / présence | 2 ans post-event | Pseudonymisation si aucun litige |

## 7.7 Secrets Stripe — 10 règles

1. Aucun secret dans le code source  
2. dev \+ staging → Stripe test keys uniquement / prod → Stripe live keys  
3. Secrets dans variables d'environnement plateforme uniquement  
4. Rotation planifiée dans SecretsRotationPolicyConfig \+ rotation après incident  
5. KYC Stripe Connect obligatoire avant payout (KYCStatus \= VERIFIED)  
6. Webhook signature validation obligatoire — raw body préservé  
7. Idempotency obligatoire — WebhookProcessedLog  
8. Restricted keys Stripe par usage (moindre privilège)  
9. Aucune clé prod dans logs, Base44 UI, debug  
10. Toute rotation \= AdminAction \+ DataAccessLedgerEntry

---

# PARTIE VIII — SCHEDULER ET OPÉRATIONS

## 8.1 Doctrine

*Le cron réveille; la tâche dit quoi faire.*

*Quand Micro Rave connaît une échéance, elle crée le réveil immédiatement.*

La SchedulerDueTask est l'unité métier centrale. Le dispatcher se réveille périodiquement, lit les tâches dues, les exécute ou les escalade.

**Anti-double exécution :** lockedByRunId. Tout verrou déclenché \= PayoutBlockReason créé avec code explicite. **Jamais de blocage silencieux.**

## 8.2 Architecture — 3 dispatchers

| Dispatcher | Fréquence | Traite |
| :---- | :---- | :---- |
| scheduler\_dispatcher\_p0 | 15 min | Tâches P0 : SOTS close, deadlines, payout, webhooks, ledger pre-check |
| scheduler\_dispatcher\_p1 | 1h | Tâches P1 : relances, attributions, SaaS |
| scheduler\_dispatcher\_daily | 1/jour | Audits, rapports, réconciliations |

**Jobs P0 :** capture\_deposit, deposit\_deadline\_check, balance\_deadline\_check, seal\_event, sots\_window\_close, payout\_approver, execute\_payout\_transfer, chargeback\_hold, expire\_dispute\_window, transfer\_expiry\_check, ledger\_balance\_check.

## 8.3 Anti-double payout — 6 verrous

1. lockedByRunId — anti-double-exécution  
2. Status check — Engagement.status admissible  
3. PayoutExecutionRecord — si existant → no-op absolu  
4. Stripe idempotency key — systemId \+ "payout" \+ attempt\_version  
5. SettlementInstruction.consumedAt — consommable une seule fois  
6. Invariant LEDGER-02 — si Dr ≠ Cr → SYSTEM\_HOLD \+ PayoutBlockReason

## 8.4 Budget cron — CronBudgetPolicyConfig

| État | Crédits | Comportement |
| :---- | :---- | :---- |
| healthy | \< 6 500 | Normal |
| watch | 6 500–8 000 | Réduire P2, alerte interne |
| critical\_only | 8 000–9 900 | P0 \+ P1 seulement, alerte fondateur |
| exhausted | \> 9 900 | P0 seulement \+ alerte fondateur immédiate |

Si exhausted pendant 3 mois consécutifs → signal MigrationTriggerPolicyConfig.

## 8.5 Surveillance opérationnelle

Deux dimensions : HEARTBEAT\_MISSING (dispatcher ne se réveille pas) et DUE\_TASK\_OVERDUE (tâche P0 non traitée même si dispatcher tourne).

---

# PARTIE IX — ADMIN AUTHORITY MATRIX

## 9.1 Doctrine

*Certains pouvoirs ne doivent pas exister, parce que leur existence détruirait la confiance que Micro Rave est censée incarner.*

*Lire n'est pas modifier. Modifier n'est pas approuver. Approuver n'est pas exécuter. Exporter est un pouvoir distinct.*

## 9.2 Dix rôles canoniques

| Rôle | Niveau | Description |
| :---- | :---- | :---- |
| FOUNDER | 5 | Autorité ultime. Absorbe les rôles vacants au MVP. |
| FINANCE\_ADMIN | 4 | Finance, payouts, ledger, TaxConfig, reversals. |
| OPS\_ADMIN | 3 | Opérations quotidiennes, relances non financières. |
| SUPPORT\_ADMIN | 2 | Lecture niveaux 1-2. Escalade. Aucun payout ni config. |
| DISPUTE\_ADMIN | 3 | Disputes, DecisionRecord. Déclaration de conflit d'intérêt obligatoire. |
| DEV\_ADMIN | 2 | Déploiement, logs. Zéro données financières réelles en prod. |
| PRIVACY\_SECURITY\_ADMIN | 3 | LPRPDE, pseudonymisation, DataRetentionPolicyConfig. |
| POLICY\_ADMIN | 3 | Modification PolicyConfig standard et élevée. Pas configs critiques. |
| CELL\_MANAGER | 2 | Post-MVP. Territoire uniquement. Jamais events SECRET. |
| AUDITOR\_EXTERNAL | 1 | Lecture seulement sur périmètre DataAccessAuditRoleConfig. |

## 9.3 SoloFounderOverride ≠ DualApproval

*SoloFounderOverride est une exception documentée. Ce n'est pas une validation — c'est une exception qui doit rester exceptionnelle.*

Conditions : délai configurable (recommandé 60s), confirmation explicite obligatoire, AdminIncidentRecord type SOLO\_FOUNDER\_OVERRIDE, DataAccessLedgerEntry marqueur FOUNDER\_SOLO\_OVERRIDE.

**\[BLOC 9 — V8\] Dette architecturale temporaire — condition de sunset :**

Le SoloFounderOverride est une dette architecturale temporaire, pas un droit permanent du fondateur. Son existence est légitime au MVP — aucune infrastructure de double-approbation n'est encore en place. Son maintien au-delà de la première levée institutionnelle (Series A) est un signal d'alarme : une institution mature distribue le pouvoir, elle ne le concentre pas.

**Condition de sunset obligatoire : à définir et documenter AVANT Series A.**

Si un investisseur, un conseil d'administration ou un auditeur externe lit cet OS et constate que le SoloFounderOverride est toujours actif sans sunset planifié, c'est un indicateur de gouvernance insuffisante. Le fondateur s'engage à proposer un plan de remplacement par DualApproval ou FounderBoardApproval avant toute levée institutionnelle.

## 9.4 Dix-neuf interdits absolus

Ces actions sont architecturalement impossibles — même pour le fondateur.

**\[BLOC 13 — V8\] Mapping par domaine :**

**Intégrité des contrats (1-3) :**

1. Modifier ou supprimer une écriture FinancialLedger  
2. Supprimer une ReputationLedgerEntry  
3. Modifier les données d'un ContractSnapshot WORM

**Intégrité de la machine d'état (4-6) :** 4\. Sauter une transition d'état obligatoire  
5\. Revenir en arrière sur un état WORM  
6\. Modifier un Engagement archivé

**Traçabilité administrative (7-14) :** 7\. Supprimer un DecisionRecord  
8\. Supprimer un AdminAction log  
9\. Supprimer un DataAccessLedgerEntry  
10\. Supprimer ou falsifier un BugReplayRecord  
11\. Modifier un WebhookIdempotencyRecord traité  
12\. Désactiver le DataAccessLedger  
13\. Modifier un SchedulerRun complété  
14\. Supprimer un AdminIncidentRecord

**Infrastructure et intégrité systémique (15-19) :** 15\. Modifier le systemId d'un objet existant  
16\. Modifier les préfixes IDFactory d'objets déjà créés  
17\. Contourner le MoneyMovementRouter  
18\. Créer une SettlementInstruction sans DecisionRecord valide  
19\. Contourner les 6 verrous anti-double payout

## 9.5 PolicyConfigChangeRecord — règle universelle

Toute modification de toute PolicyConfig produit : AdminAction \+ DataAccessLedgerEntry \+ PolicyConfigChangeRecord. Modification directe en database de production \= interdit absolu.

*GitHub trace le code. La database trace la config. Ces deux registres sont distincts et complémentaires. Un changement de PolicyConfig sans PolicyConfigChangeRecord est un interdit absolu — même si le code GitHub est à jour.*

## 9.6 Classification des configs

**Critique (double validation) :** TaxConfig, LedgerCodeMap, MembershipPlan, SOTSCommissionModulationConfig, DataRetentionPolicyConfig, MigrationTriggerPolicyConfig, SecretsRotationPolicyConfig, DualApprovalThresholdConfig.

**Élevé :** PresencePolicyConfig, DisputeAccessPolicyConfig, KYCPolicyConfig, CronBudgetPolicyConfig, PaymentProviderConfig.

**Standard :** FraudDetectionPolicyConfig, SOTSConfidencePolicyConfig, EventPaymentConfig, DisputePolicyConfig, LiquidityPolicyConfig.

**Opérationnel :** SchedulerCreditBudget, SOTSCalculationPolicyConfig.

## 9.7 ConflictOfInterestRecord

*Micro Rave ne règle jamais une dispute par proximité sociale. Elle règle par preuve, rôle, indépendance, décision et trace.*

Tout arbitrage potentiellement conflictuel exige une déclaration de conflit d'intérêt formelle et une désignation d'un arbitre de remplacement.

---

# PARTIE X — UX ET VÉRITÉ PERÇUE

## 10.1 Principe fondateur

*L'interface ne projette que ce que le système sait avec certitude.*

Si la vérité métier est incertaine : afficher un état intermédiaire honnête ("en traitement") — jamais un état faux optimiste.

## 10.2 Format universel par état — talent

Chaque état visible affiche obligatoirement :

1. **Statut** — où en est l'Engagement  
2. **Argent** — montant net attendu / reçu / bloqué  
3. **Prochaine action** — ce que le talent doit faire maintenant  
4. **Délai** — avant quelle date agir  
5. **Preuve ou blocage** — ce qui manque ou ce qui protège

## 10.3 Vocabulaire UX obligatoire

- ✅ "Fonds protégés"  
- ❌ "Escrow" — **interdit dans l'interface**

Notifications négatives : non accusatoires. Structure obligatoire : raison lisible → preuve utilisée → règle appliquée → recours → délai → arbitre.

## 10.4 Explication des frais

**Pour le talent :** "Le taux Micro Rave couvre la mise en relation, la contractualisation, la sécurisation du paiement, la preuve de présence et la garantie de règlement. Ton net est garanti si tu es présent."

**Pour le payeur :** "Les frais de service Micro Rave couvrent la sélection du talent, la gestion du contrat, la sécurisation des fonds et le règlement garanti de la prestation."

## 10.5 Le Checkpoint — troisième côté de la marketplace

*Le talent joue. L'organisateur crée le besoin. Le checkpoint donne la scène.*

*Le checkpoint est comme un listing Airbnb, mais pour la performance événementielle.*

Le Checkpoint est un rôle utilisateur à part entière avec : calendrier de disponibilités, capacité d'acceptation QuickPlay, pouvoir de créer des événements, réputation calculée par usage réel.

---

# PARTIE XI — TECHNOLOGIE ET INFRASTRUCTURE

## 11.1 Base44 — rampe, pas prison

*Base44 est la rampe. L'architecture souveraine est la destination. On ne confond pas les deux.*

*Base44 sert à aller vite. L'architecture souveraine sert à durer. Le MVP doit bénéficier de Base44 sans devenir prisonnier de Base44.*

**Couches portables — jamais propriété de Base44 :** IDFactory / MissionGraph / Machine d'état Engagement / ContractSnapshot WORM logic / FinancialLedger \+ LedgerCodeMap V3 / Payment waterfall / Stripe webhook \+ idempotency / Anti-double payout 6 verrous / SOTS \+ ReputationLedger / PolicyConfig resolver / SchedulerDueTask / AdminAuthorityResolver / DataAccessLedger / i18n strings / PresenceProofResolver / MoneyMovementRouter / MissionConversionGuard / CheckpointCulturalProfile (calcul EMA)

**Peut rester couplé Base44 au MVP :** UI / pages / formulaires / routing / auth technique MVP / queries simples non critiques

**Règle :** Le code Base44 ne contient jamais la vérité métier. Il appelle des fonctions métier portables.

## 11.2 Repository interfaces — couche d'adaptation

Base44 est seulement un adapter. Toute logique métier critique passe par une interface portable. Si Micro Rave migre vers PostgreSQL, ces interfaces restent identiques — seul l'adapter change.

Interfaces validées : EngagementRepository / EventRepository / LedgerRepository / PaymentRepository / SchedulerRepository / UserRepository / CheckpointRepository / DisputeRepository / ReputationRepository / AdminRepository / PolicyConfigRepository.

## 11.3 Webhook Stripe — test P0 bloquant

Si Base44 ne permet pas la validation fiable du raw body Stripe → **webhook proxy externe obligatoire avant argent réel** — pas un plan B, une précondition.

Le proxy doit : recevoir le webhook, valider la signature avec raw body, préserver l'idempotency key, ne transmettre que des événements validés.

## 11.4 Seuils de migration — MigrationTriggerPolicyConfig

**Alerte :** crédits cron \> 8 000 / mois, dégradation performance observée.

**Migration à planifier :** crédits \> 9 900 pendant 3 mois consécutifs / \> 50 events actifs simultanément / \> 10 000 Engagements / limitation ORM relations complexes impossibles.

**Migration accélérée :** bug financier P0 causé par Base44 / impossibilité de valider Stripe webhooks / impossibilité de garantir invariants ledger/payout/WORM.

**Destination préférée :** PostgreSQL relationnel. Décision finale au moment de la migration selon coût / performance / conformité.

*Une sortie théorique n'est pas une stratégie de sortie. Il faut tester qu'on peut vraiment sortir.*

## 11.5 Discipline de développement

GitHub obligatoire dès le premier commit V3

Branches : dev / staging / main

PR obligatoire avant merge main

Environnements : dev / staging / prod — séparés

dev \+ staging → Stripe test keys uniquement

prod → Stripe live keys (accès minimal)

Secrets séparés par environnement

Aucun secret dans code / logs / GitHub

## 11.6 Portability Readiness — précondition Event 0B

Un item FAILED \= Event 0B interdit.

1. Aucun objet métier critique sans systemId  
2. Mapping Base44 id → systemId documenté  
3. Schema registry versionné  
4. Export complet tables critiques lisible hors Base44  
5. Backup planifié avec fréquence définie  
6. Test de restauration réussi hors Base44  
7. Vérification intégrité référentielle : Event ↔ Lineup ↔ MissionSlot ↔ Engagement ↔ Ledger

## 11.7 Observabilité MVP — 10 alertes P0

Infrastructure obligatoire avant Event 0B : logs externalisés, Sentry ou équivalent, monitoring heartbeat externe, dashboard fondateur.

| \# | Alerte |
| :---- | :---- |
| 1 | Ledger imbalance |
| 2 | Double payout tenté |
| 3 | Webhook Stripe invalide |
| 4 | Heartbeat manquant |
| 5 | SchedulerDueTask P0 expirée sans traitement |
| 6 | event\_sealed bloqué |
| 7 | Payout bloqué sans PayoutBlockReason explicite |
| 8 | CriticalConfig manquante — fail-closed déclenché |
| 9 | Consommation cron anormalement rapide (signal boucle infinie) |
| 10 | Échec d'écriture DataAccessLedger sur action sensible |

---

# PARTIE XII — LIQUIDITÉ COMMERCIALE

## 12.1 Corridor de lancement — H2T / H2X / H2Z

*On ne lance pas une ville; on allume un corridor.*

H2T → Mile-End / Plateau culturel / scène créative

H2X → Plateau sud / Quartier latin / axe étudiant-culturel

H2Z → Quartier des spectacles / centre-ville / potentiel corporate

Un corridor concentre les talents, les checkpoints et les organisateurs dans un périmètre où la réputation se propage naturellement. Liquidité locale avant liquidité urbaine.

## 12.2 Deux produits d'amorçage

*Le 4 à 7 finance la preuve. ALL NIGHT LONG prouve la culture. L'hybride prouve Micro Rave.*

**Produit 1 — 4 à 7 Premium (wedge corporatif) :**

- Chemin : CreateEvent contrôlé  
- Cible : PME 20-150 employés, RH, direction  
- Format : 4 à 7 après-bureau avec DJ  
- Prix : 1500$ à 2500$ CAD  
- Rôle : premier cash réel, test EPR \+ payout \+ ledger

**Produit 2 — ALL NIGHT LONG (wedge culturel) :**

- Chemin : QuickPlay / Lobby / Checkpoint / Billetterie mince  
- Format : nuit au checkpoint, billets 0$ ou symboliques  
- Rôle : première preuve culturelle, test QuickPlay \+ SOTS audience

**Event 3 — Hybride :** Un MissionSlot créé par CreateEvent rempli par un lobby QuickPlay. Preuve que les deux chemins s'interalimentent.

## 12.3 Plafond MVP

- Standard : 350 000 cents (3 500$ CAD) dans EventPaymentConfig  
- Exception contrôlée : 500 000 cents (5 000$ CAD) avec SoloFounderOverride \+ AdminAction \+ reasonCode

Les valeurs vivent en database. Jamais hardcodées.

## 12.4 Liquidité progressive — 5 phases

*Le système peut recommander tôt. Il ne contractualise pas automatiquement tôt.*

| Phase | Volume | Mode |
| :---- | :---- | :---- |
| 1 Amorçage | 0–5 events | 100% manuel — fondateur place les talents |
| 2 Démarrage | 5–15 events | Suggestions système, humain valide |
| 3 Liquidité minimale | 15–30 events | Auto-suggestion QuickPlay, acceptation humaine |
| 4 Liquidité active | 30–50 events | Matching auto limité — missions simples, rôles connus |
| 5 Liquidité établie | 50+ events | Matching auto élargi \+ RSI critère de gouvernance |

Seuils dans LiquidityPolicyConfig en database.

## 12.5 RSI — Référencement Spontané Identifiable / Intégré

RSI mesure la vitalité organique du réseau selon deux dimensions complémentaires.

**Dimension qualitative :**

- RSI Identifiable : référence traçable dans la plateforme (invitation directe, partage de profil, lien)  
- RSI Intégré : comportement récurrent (return rate, rebooking, recommandation active)

**Dimension quantitative :**

Coefficient RSI \= ratio moyen d'utilisateurs référencés

  par un seul nouvel utilisateur

Coefficient \> 1 : croissance organique — viralité active

Coefficient 1.0 : un utilisateur → un autre

Coefficient \< 1 : injection promotionnelle nécessaire

**Statut MVP :** Interne. Observé. Non exposé comme mécanique utilisateur. Jamais présenté comme revenue share. Devient critère de gouvernance à 50+ events.

## 12.6 Les 20 premiers talents

*"Fiabilité avant notoriété."*

10 DJs / 3 photographes-vidéastes / 2 VJ / 2 MC-hôtes / 2 techniciens son-lumière / 1 talent hybride (ex. DJ \+ photo). Total : 20 talents métiers.

N'importe lequel peut être capitaine selon l'ordre d'arrivée dans le lobby. Aucun recrutement de "profil capitaine".

*La liquidité ne s'achète pas. Elle se construit talent par talent, checkpoint par checkpoint, event par event, dans un corridor assez dense pour que la réputation se propage naturellement.*

---

# PARTIE XIII — MVP SCOPE LOCK

## 13.1 Périmètre MVP non négociable

*Le MVP ne doit pas prouver que Micro Rave a beaucoup de features. Il doit prouver qu'un besoin réel peut devenir une mission, une mission peut devenir un engagement, et un engagement peut être payé, vécu, évalué, réglé et comptabilisé.*

**Chemin nominal — 13 étapes :**

Proposition → **Négociation (CreateEvent) ou Confirmation interne (QuickPlay)** → ContractSnapshot phase 1 → Placement Lineup → Dépôt → Balance → event\_sealed ContractSnapshot phase 2 → Prestation \+ SessionPresence → event\_completed SOTS 24h → SOTS Window Closed → Payout approuvé → Talent payé ledger équilibré → Archivage WORM global.

**Distinction entre les deux voies à l'étape 2 :**

- **CreateEvent :** échange talent ↔ organisateur sur le cachet, le roleMetier, le style et la plage horaire, avec possibilité de contre-offre. Historique complet snapshoté dans le ContractSnapshot.  
- **QuickPlay :** confirmation individuelle par chaque membre de son cachet depuis `TalentRolePreference`. Pas de contre-offre. Pas d'échange avec l'organisateur. L'organisateur reçoit l'offre groupée déjà construite — il accepte ou refuse.

**Inclus MVP :** Machine d'état complète, QuickPlay mince, Billetterie mince (TicketAdmissionRight 0$), SOTS actif (modulation neutre sous seuil), Scheduler P0/P1/P2, Matrice Admin 10 rôles.

**Manual-first au MVP :** Disputes complexes, matching automatique, T4A automatique, valeur portefeuille formelle, décisions post-archive.

## 13.2 Minimum Viable Trust — 12 critères

| \# | Critère | Seuil |
| :---- | :---- | :---- |
| 1 | Talent voit ventilation complète avant acceptation | Premier event |
| 2 | Talent voit état payout avec raison de blocage lisible | Premier event |
| 3 | Payeur comprend "fonds protégés" | Premier event |
| 4 | Frais MR expliqués comme service de confiance | Premier event |
| 5 | Décision négative \= explication \+ recours | Premier event |
| 6 | Payout readiness prouvé (payout de test réussi) | Premier event |
| 7 | Event 0 documenté — test interne | Premier event |
| 8 | Premier event pilote contrôlé avec participants connus | Premier event |
| 9 | Canal support disponible avec délai de réponse | Premier event |
| 10 | Procédure de recours documentée | Premier event |
| 11 | QuickPlay compréhensible en 30 secondes | Premier event |
| 12 | Au moins un event réel complété — payout sans intervention manuelle, ledger zéro cent, visible ou référençable | Ouverture élargie seulement |

## 13.3 Roadmap V3.0 → V3.3

**MVP (V3.0) :** Chemin nominal complet, QuickPlay mince, Billetterie mince, SOTS, Scheduler, Admin.

**V3.0.1 :** Billetterie complète, anglais i18n, TalentTaxProfile UI, corrections frictions pilote.

**V3.1 :** Seller-led complet, ClientAttributionRight UI, ResidualCommission active, OfficialEventContent, Disputes automatisées (si 10 cas analysés).

**V3.2 :** Cellules-succursales, CELL\_MANAGER actif, Commandites complètes, Dashboard Checkpoint.

**V3.3 :** Pivot de Marché, Circuit physique Micro Rave, Expansion territoriale.

**Hors scope indéfini :** PortfolioTransfer (légal non validé), PortfolioValuation formelle.

---

# PARTIE XIV — PREMIER ÉVÉNEMENT RÉEL

## 14.1 Principe fondateur

*Le premier événement réel n'est pas un lancement marketing. C'est un examen institutionnel : argent réel, présence réelle, confiance réelle, ledger réel, erreurs rejouables.*

*Un event pilote peut échouer. Il ne doit jamais échouer silencieusement.*

## 14.2 Séquence des events pilotes

| Event | Description |
| :---- | :---- |
| 0A | Test interne Stripe test mode — scénarios larges, comptes tests |
| 0B | Stripe live symbolique (5$-10$) — prouver que l'argent réel entre et sort |
| 1 | 4 à 7 Premium — premier event réel, argent externe |
| 2 | ALL NIGHT LONG — audience \+ QuickPlay |
| 3 | Hybride CreateEvent × QuickPlay — preuve marketplace vivante |

## 14.3 Participants co-testeurs consentants

Event 1 implique des co-testeurs, pas des clients ordinaires.

- **Talent :** fiable du réseau direct du fondateur, disponible pour débriefing  
- **Organisateur :** connu du fondateur, budget réel, ouvert aux frictions UX  
- **Payeur :** identique à l'organisateur (SC-01)  
- **Admin :** fondateur — admin concierge sur place

**Reconnaissance pilote obligatoire :** Tous acceptent explicitement : *"Je comprends que je participe à un événement pilote Micro Rave avec argent réel, support humain, et suivi post-event."*

## 14.4 Montant de l'Event 1

- Event 0B : 5$-10$ CAD Stripe live symbolique  
- Event 1 : cachet net talent recommandé 300$ CAD, fourchette 300$-500$ CAD

Le prix vendu client total est calculé par le système selon EventPaymentConfig, taxes, frais et waterfall. **Jamais hardcodé.**

## 14.5 Readiness par chemin critique

*On ne lance pas selon un pourcentage global. On lance seulement quand le chemin exact qu'on va utiliser est vert.*

**Seuil 1 — Premier event réel :** 100% tests P0 du chemin exercé \= PASS, 0 BugReplayRecord non PASSED, GoNoGoDecisionRecord \= GO après Event 0\. Un seul P0 FAILED \= event interdit sans exception.

**Seuil 2 — Ouverture publique élargie :** Tout seuil 1 \+ au moins un event réel complété avec payout sans intervention manuelle, ledger zéro cent, GoNoGoDecisionRecord \= GO, support opérationnel, procédure de recours testée.

## 14.6 Définition de succès — trois statuts

**FULL SUCCESS :** Dépôt reçu, balance reçue, event\_sealed sans intervention manuelle, présence prouvée, SOTS soumis, payout automatique, ledger zéro cent, aucun BugReplayRecord non PASSED, GoNoGoDecisionRecord \= GO. → Event 2 autorisé sans réserve.

**CONTROLLED SUCCESS :** Event complété, argent sécurisé, ledger équilibré, mais une intervention humaine documentée a été nécessaire. GoNoGoDecisionRecord \= GO avec réserves si aucun P0 FAILED. Corrections avant Event 2\.

**NO-GO :** P0 FAILED / ledger imbalance / payout manuel non prévu / BugReplayRecord FAILED-PENDING / ContractSnapshot WORM violé / présence impossible à prouver / DataAccessLedger manquant sur action sensible. → Event 2 bloqué jusqu'à résolution complète.

## 14.7 AbortProtocol — arrêt immédiat

**Déclencheurs :** Test P0 FAILED sur chemin exercé / ledger imbalance / double payout tenté / webhook invalide / ContractSnapshot WORM violé / état impossible machine Engagement / payout sans PayoutExecutionRecord / DataAccessLedger non écrit sur action sensible / systemId manquant / AdminIncidentRecord P0 non résolu / SessionPresence sans aucun signal valide.

**Procédure en 8 étapes :**

1. Placer rail HOLD sur l'event concerné  
2. Bloquer payout et mouvement d'argent sortant  
3. Créer AdminIncidentRecord avec contexte complet  
4. Notifier talent et organisateur honnêtement  
5. Ne pas rembourser ni payer silencieusement  
6. Créer BugReplayRecord si vérité irréversible touchée  
7. Émettre DecisionRecord avant toute action financière corrective  
8. GoNoGoDecisionRecord \= NO-GO jusqu'à résolution

## 14.8 Après l'event — documentation et décision

**Vérifications (dans les 2h) :** Ledger zéro cent, PayoutExecutionRecord complété, SchedulerDueTasks critiques \= done, SOTS window planifiée, aucun AdminIncidentRecord P0 non résolu, DataAccessLedger complet.

**Documentation (dans les 24h) :** BugReplayRecord pour tout bug touchant une vérité irréversible (pas les mineurs), retour talent et organisateur documentés, frictions UX classées P0/P1/P2.

**Décision (dans les 48h) :** GoNoGoDecisionRecord créé : FULL SUCCESS / CONTROLLED SUCCESS / NO-GO. Si GO avec réserves : corrections listées avec owners avant Event 2\. Si NO-GO : blocants listés avec owners.

**Apprentissage :** Le talent recommanderait-il Micro Rave? L'organisateur rachèterait-il? Quelle friction UX a le plus nui? Quelle preuve sociale peut être utilisée sans violer confidentialité ou droits image?

## 14.9 \[BLOC 12 — V8\] Cas canonique de référence — La Pierre de Rosette

*Le premier événement réel n'est pas seulement un test opérationnel. C'est la preuve que la constitution vit.*

**Cas canonique :** DJ Alex Dubois · 200$ CAD net garanti · Le Trèfle, Montréal · Checkpoint CP-PLATEAU-0001 · Mai 2026

Cet event est la Pierre de Rosette : il traverse les 8 autres cartes constitutionnelles en une seule nuit. Chaque loi est vérifiable contre un résultat concret.

| Carte | Loi / Principe | Ce qui se passe concrètement | Résultat attendu |
| :---- | :---- | :---- | :---- |
| C00 Philosophie | Loi Zéro | Alex est à Montréal. Son SOTS est visible (12 notes, score 4.3/5). CP-PLATEAU le reconnaît comme talent local. | ✅ Engagement créé · DRAFT → ACCEPTED |
| C01 Ontologie | Engagement comme atome | Voie CreateEvent. Le Trèfle crée l'event, slot 23h-01h, attache Alex. | ✅ ACCEPTED · Dépôt demandé · 🔒 WORM 1 |
| C02 Machine État | Séquence WORM complète | accepted → deposit\_secured → event\_sealed → performed → payable → settled | ✅ settled · 🔒🔒🔒 ARCHIVED |
| C03 Waterfall | Invariant Zéro Cent | 200$ signé · coefficient 1.0 · taux X% · net calculé au centime | ✅ Livres \= 0 · LEDGER-02 respecté |
| C05 SOTS | Donnée-témoin | Le Trèfle note Alex 24h après. Append-only. SOTSQuantitative \+ SOTSQualitative. | ✅ 13ème note · Mémoire permanente créée |
| C06 Admin | 11 conditions | GPS ✓ · SOTS ✓ · Ledger ✓ · Pas de dispute ✓ · 11/11. | ✅ Paiement automatique · SoloFounderOverride non utilisé |
| C08 Lois Inv. | 6 lois traversées | ① Loi Zéro ✓ ② Co-dépendance ✓ ③ Zéro Cent ✓ ④ Témoin ✓ ⑤ Greffier ✓ ⑥ Append-Only ✓ | ✅ 6/6 · Constitution vivante |

**Séquence temporelle :**

- J-30 : Contrat signé ACCEPTED 🔒  
- J-7 : Dépôt reçu DEPOSIT\_SECURED 🔒  
- Soir J : Event SEALED 🔒🔒 · GPS OK  
- 23h→01h : Alex performe PERFORMED  
- J+24h : Le Trèfle note · SOTS append-only  
- 11 conditions : Paiement auto PAYABLE → SETTLED  
- Pour toujours : Mémoire créée ARCHIVED 🔒🔒🔒

*Si cet event fonctionne, la constitution est vivante. S'il échoue, les cartes 00 à 08 indiquent exactement où regarder.*

---

# PARTIE XV — TESTS ET QUALITÉ

## 15.1 Principe fondateur

*Un bug corrigé mais non rejoué est un bug qui attend de revenir.*

*Le système de tests ne sert pas à croire que le système marche. Il sert à prouver que le système ne peut pas oublier ses propres erreurs.*

## 15.2 BugReplayRecord — mémoire institutionnelle

Un bug n'est officiellement corrigé que lorsque son BugReplayRecord a `replayStatus = PASSED`. La correction de code seule ne suffit pas.

**Portée :** Tout bug touchant une vérité irréversible — argent, contrat, présence, réputation, admin, sécurité, portabilité ou état WORM.

**Ne déclenche pas BugReplayRecord :** Bug CSS mineur, affichage sans conséquence métier, comportement UX sans impact sur vérité irréversible.

## 15.3 Distinction P0 global / P0 conditionnel

**P0 global :** Toujours requis avant argent réel — WEBHOOK-RAWBODY-01, PORTABILITY-RESTORE-01, LEDGER-INV-01, DOUBLE-PAY-01 et chemin nominal complet.

**P0 conditionnel :** Requis seulement quand le chemin exercé utilise cette fonction.

| Test conditionnel | Déclencheur |
| :---- | :---- |
| SC-03 coefficient | Si prix\_vendu\_client \> total\_lineup\_effectif activé |
| SC-10 billetterie | Si billets payants |
| SC-15 transfert | Si transfert d'Engagement activé |
| SC-16 SOTS contesté | Si SOTS audience actif |
| PhoneFreeRitualGuard | Si Micro-Onde activé |

## 15.4 Huit catégories de tests P0

1. Frontières ontologiques critiques (MissionConversionGuard, capitaine, lobby, présence, config fail-closed)  
2. Finance et ledger (invariant LEDGER-02, double payout, arrondis, no-hardcode)  
3. Stripe et webhooks (signature, idempotency, raw body)  
4. SOTS et réputation (check-in requis, auto-note bloquée, append-only)  
5. Admin, sécurité et PolicyConfig (19 interdits, DataAccessLedger, double validation)  
6. Scheduler (heartbeat, overdue, anti-double, vélocité cron)  
7. Portabilité Base44 (systemId, export, restauration, intégrité référentielle)  
8. UX et vérité perçue (ventilation avant acceptation, état payout lisible, fonds protégés, QuickPlay 30s)

## 15.5 Grille de readiness par event

| Event | Tests requis en plus |
| :---- | :---- |
| 0A | 100% P0 chemin nominal, 0 BugReplayRecord non PASSED |
| 0B | \+ WEBHOOK-RAWBODY-01, Portability Readiness D-132, 10 alertes P0 |
| 1 | \+ 100% P0 chemin CreateEvent, EPR/Stripe/ledger/payout, ContractSnapshot WORM, SC-01/SC-05/SC-06/SC-07 |
| 2 | \+ Billetterie mince, TicketAdmissionRight, PresenceProofResolver, SOTS audience, SC-11/SC-13 |
| 3 | \+ Lobby unique, MissionConversionGuard, EngagementCollectif → individuels, SC-12 hybride |

---

# PARTIE XVI — LOIS CANONIQUES ET PHRASES FONDATRICES

## 16.0 \[BLOC 11 — V8\] Lois invariantes — ce qui ne changera jamais

Ces 6 lois ne sont pas des règles de produit. Ce sont les conditions de possibilité de l'institution. Violer l'une d'elles, c'est cesser d'être Micro Rave. Elles n'ont pas été décidées — elles ont été découvertes.

| Identifiant | Nom | Formulation canonique | Carte source |
| :---- | :---- | :---- | :---- |
| LOI-ZERO-01 | La Loi Zéro | *Une capacité culturelle locale devient un engagement vérifiable, puis un règlement économique, puis une mémoire territoriale. Tout le reste découle de ça.* | Carte 00, toutes les cartes |
| CODEP-PRES-01 | Co-dépendance paiement/présence | *Tu n'es pas payé parce que tu as signé. Tu es payé parce que tu étais là. Sans preuve de présence, sans argent — jamais silencieux, jamais automatique.* | Carte 02, Carte 06 |
| LEDGER-02 | Invariant Zéro Cent | *Chaque dollar qui entre doit sortir vers une destination nommée. Les livres tombent à zéro. Toujours. L'argent ne disparaît pas — il est prouvé.* | Carte 03 |
| SOTS-TEMOIN-01 | La donnée-témoin | *Le SOTS ne mesure pas un comportement. Il mémorise une présence vérifiée. La réputation n'est pas un score — c'est une mémoire.* | Carte 00, Carte 05 |
| GREFFIER-01 | Le greffier, pas le juge | *Micro Rave automatise seulement ce qui est prouvé. Elle gèle ce qui est incertain. Son architecture est son humilité.* | Carte 02, toutes les transitions |
| WORM-APPEND-01 | L'append-only comme sacré | *Ce qui a été écrit reste. Les corrections s'ajoutent — elles ne remplacent pas. C'est la différence entre une mémoire et un mensonge.* | Carte 02, Carte 05, WORM |

*Si une décision future contredit l'une de ces 6 lois, elle n'est pas une évolution de Micro Rave. C'est une trahison de sa fondation.*

## 16.1 Lois financières

| Loi | Formulation |
| :---- | :---- |
| LOI-GR-01 REJETÉE | La commission MR est prélevée sur le cachet brut offert, jamais ajoutée par-dessus |
| LOI LINEUP-01 | `coefficient = max(1, prix_vendu_client / total_lineup_effectif)`. total\_lineup\_effectif \= total\_lineup\_signé si tous les cachets \> 0; inclut freeWeightCents pour les gratuits. |
| LOI LINEUP-02 | Formule deux couches : base\_contractuelle\_i \= cachet\_signé\_i. surplus\_pool \= prix\_vendu − total\_lineup\_signé (ou prix\_vendu si tous gratuits). cachet\_brut\_final\_i \= base \+ prorata(surplus, poids\_effectif). Aucun talent ne reçoit moins que son cachet signé. freeWeightCents \= 100 cents (configurable, jamais hardcodé). |
| LOI LINEUP-03 | EPR bloquée si prix\_vendu \< total\_lineup\_signé. Erreur : LINEUP\_PRICE\_FLOOR\_VIOLATION. |
| LOI COEFFICIENT-01 | Le coefficient s'active dès que prix\_vendu\_client \> total\_lineup\_effectif. Il répartit la valeur vendue vers les talents selon leurs poids. Il ne dépend d'aucun statut vendeur et ne crée aucun droit vendeur. |
| LOI SELLER-COMP-01 | Le vendeur est hors waterfall événementiel. Sa rémunération est résolue par SellerCompensationPlan, financé par budget commercial séparé. Jamais une part du prix vendu, de la surprime, des cachets ou de la commission MR. |
| LOI WATERFALL-01 | coefficient → poids\_effectif → brut\_final → commission\_par\_talent → net → taxes → Stripe → total\_payeur. Le vendeur est hors waterfall. |
| LOI LEDGER-01 | Revenu reconnu seulement à l'archivage. Sous Doctrine A : 4325/4326 reçoivent les taxes à l'encaissement. 4410/4420 \= 0\. |
| LOI LEDGER-02 | `sum(nets) + sum(commissions) + rounding = prix_vendu_client` — invariant zéro cent. |
| LOI ANNULATION-01 | Annulation \> J-30 \= remboursement total moins frais Stripe. |
| LOI ANNULATION-02 | Balance impayée J-6 \= annulation automatique \+ payout dépôt aux talents. |
| LOI NO-SHOW-01 | No-show \= talent 0$ \+ organisateur remboursé net talent \+ MR garde commission. |

## 16.2 Lois de processus

| Loi | Formulation |
| :---- | :---- |
| LOI DISPUTE-01 | DisputeRecord → EvidenceBundle → DecisionRecord → SettlementInstruction → FinancialLedger → ReputationLedger → Archive |
| LOI DISPUTE-02 | Jamais par intuition. Toujours par preuve, délai, montant, décision, écriture ledger et archive. |
| LOI QUICKPLAY-MISSION-01 | En QuickPlay, un lobby est une capacité collective prête à être proposée. Il ne devient une mission réelle que lorsqu'un organisateur ou un responsable de checkpoint l'associe à un événement, à une plage horaire et à un lieu. Le lobby peut précéder l'Event, mais il ne peut jamais produire un Engagement sans qu'un besoin réel ait été créé ou confirmé. |
| LOI QUICKPLAY-CALENDAR-01 | Lorsqu'un responsable de checkpoint ou un organisateur place une candidature QuickPlay au calendrier, le système crée ou complète en arrière-plan l'Event, les MissionSlots nécessaires et la MissionApplication collective. Les membres du lobby doivent confirmer la plage horaire dans un délai configurable. Sans confirmation complète de tous les membres, aucun EngagementCollectif n'est créé. |
| LOI CREATEEVENT-QUICKPLAY-01 | Dans CreateEvent, les MissionSlots existent avant la candidature. Dans QuickPlay, le lobby existe avant les MissionSlots, mais les MissionSlots sont générés ou rattachés lorsque l'organisateur/checkpoint place la candidature dans un événement réel. Dans les deux cas, aucun Engagement n'existe sans MissionSlot, prix confirmé et ContractSnapshot. |
| LOI CO-DÉPENDANCE-01 | Tu n'es pas payé parce que tu as signé. Tu es payé parce que tu étais là. Sans preuve de présence → zéro paiement. Jamais silencieux. Jamais automatique sans preuve. |
| LOI TRANSITION-01 | Toute mutation du champ `status` d'un Engagement est interdite sauf via `transitionEngagement()`. Aucun accès direct au champ `status` n'est permis — ni depuis le code applicatif, ni depuis un script admin, ni depuis une migration, ni depuis une console de debug. Toute tentative de mutation directe est une violation de Niveau 2 (fraude architecturale) et déclenche un `AdminIncidentRecord` P0 bloquant. La table des guards de la section 2.7.1 est la source souveraine de toutes les transitions autorisées. |

## 16.3 Phrases canoniques fondatrices

**La Loi Zéro :**

*Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale.*

**Identité :**

*Micro Rave est courtier par doctrine. Les flux sont les preuves. Le ledger est le témoin.*

**Finance :**

*Le dollar est une unité d'affichage. Le cent est une unité de vérité. Le ppm est une unité de taux.*  
*Le net talent n'est pas un deuxième calcul; c'est le reste protégé.*  
*Le paiement n'est pas encore un revenu gagné; c'est une obligation de service.*  
*Le résidu peut naître dans le calcul; il doit mourir dans l'écriture ledger.*

**Fiscalité :**

*La base taxable est la contrepartie totale de la fourniture taxable — pas la commission Micro Rave.*  
*Le code ne connaît pas les taux. Le code connaît seulement comment résoudre une configuration fiscale valide.*  
*Base taxable ≠ commission Micro Rave. Commission économique ≠ fourniture taxable totale. Montant encaissé ≠ revenu gagné. Taxe collectée ≠ revenu.*

**Architecture :**

*Base44 est la rampe. L'architecture souveraine est la destination. On ne confond pas les deux.*  
*GitHub trace le code. La database trace la config. Ces deux registres sont distincts et complémentaires.*  
*Une sortie théorique n'est pas une stratégie de sortie. Il faut tester qu'on peut vraiment sortir.* *L'état ne se déclare pas. Il se prouve. Chaque transition est une preuve, pas une assignation. Une porte sans gardien n'est pas une porte — c'est une faille.*

**Scheduler :**

*Le cron réveille; la tâche dit quoi faire.*

**Disputes :**

*Une dispute n'est pas un bouton rembourser ou payer. C'est une procédure : geler, qualifier, prouver, répondre, décider, régler, mémoriser.*  
*Tout le monde peut parler. Seuls les acteurs avec standing peuvent geler. Le ledger n'obéit qu'à une décision valide.*

**Admin :**

*Certains pouvoirs ne doivent pas exister, parce que leur existence détruirait la confiance que Micro Rave est censée incarner.*  
*Lire n'est pas modifier. Modifier n'est pas approuver. Approuver n'est pas exécuter. Exporter est un pouvoir distinct.*

**Sécurité :**

*On efface l'identité; on conserve la preuve.*  
*Chaque employé voit uniquement l'information nécessaire pour accomplir sa tâche, au moment où il en a besoin, et toute consultation d'information sensible doit être justifiée, autorisée et journalisée.*

**UX :**

*Un lieu devient ce qu'il accueille.*  
*Le talent joue. L'organisateur crée le besoin. Le checkpoint donne la scène.*

**QuickPlay :**

*Le capitaine est un statut de lobby, pas un rôle métier.*  
*Le prix du lobby vient des préférences tarifaires de chaque membre, calculées par le système, confirmées individuellement. Le capitaine ne fixe pas le prix — il lance quand tout le monde est prêt, ou il soumet avant que le lobby soit complet.*  
*Quand le lobby est complet et tous les prix confirmés, le système lance automatiquement.*

*QuickPlay crée une capacité collective. L'organisateur ou le checkpoint crée le besoin réel. Le système marie les deux en mission, puis en engagement.*

*Le lobby dit : nous sommes prêts à jouer ensemble. Le checkpoint dit : je vous place ici, à cette date. Le système dit : voici votre contrat.*

**Co-dépendance :**

*Tu n'es pas payé parce que tu as signé. Tu es payé parce que tu étais là.*

**Donnée-témoin :**

*Le pétrole n'a pas de mémoire. La donnée-témoin en a une.*

**Marketplace :**

*On ne lance pas une ville; on allume un corridor.*  
*Le 4 à 7 finance la preuve. ALL NIGHT LONG prouve la culture. L'hybride prouve Micro Rave.*  
*Fiabilité avant notoriété.*  
*La liquidité ne s'achète pas. Elle se construit talent par talent, checkpoint par checkpoint, event par event, dans un corridor assez dense pour que la réputation se propage naturellement.*

**Tests :**

*Un bug corrigé mais non rejoué est un bug qui attend de revenir.*

**Premier event :**

*Le premier événement réel n'est pas un lancement marketing. C'est un examen institutionnel.*  
*Un event pilote peut échouer. Il ne doit jamais échouer silencieusement.*

**DecisionKernel :**

*Le DecisionKernel MVP ne doit pas prétendre être un juge parfait. Il doit être un greffier incorruptible.*

---

*Fin du document principal.*  
*Voir document séparé : MICRO RAVE V3 — ANNEXE TECHNIQUE (formules, schémas, suites de tests, configs canoniques)*

---

**MICRO RAVE V3 — FOUNDER-VALIDATED OPERATING SYSTEM**  
Interrogatoire souverain : 18 BLOCs / 151 décisions validées / 4 amendements / 7 précisions  
V6 : LOI QUICKPLAY-MISSION-01, LOI QUICKPLAY-CALENDAR-01, LOI CREATEEVENT-QUICKPLAY-01  
V7 : doctrine EventLocation vs Checkpoint, triptyque corrigé, négociation CreateEvent, machine d'état QuickPlay, TalentRolePreference dans hiérarchie  
**V8 : alignement cartes constitutionnelles V4 — 13 blocs — mai 2026** **V9 : Guards souverains — LOI TRANSITION-01 — section 2.7.1 — architecture anti-corruption machine d'état — mai 2026** **V10 : Cohérence notes isSelfOrganized (2.7.1 ↔ 6.3) · carte 02 machine d'état mise à jour guards souverains — mai 2026**  
Blocs V8 : BLOC 1 (règle multi-rôle isSelfOrganized) · BLOC 2 (hiérarchie WORM 3 niveaux) · BLOC 3 (LOI CO-DÉPENDANCE-01 nommée) · BLOC 4 (donnée-témoin vs pétrole en 5.0) · BLOC 6 (phrase canonique SOTS \+ styles) · BLOC 8 (capitaine sunset 2 niveaux) · BLOC 9 (SoloFounderOverride dette \+ sunset Series A) · BLOC 10 (Doctrine A HYPOTHÈSE en tête) · BLOC 11 (section 16.0 Lois Invariantes) · BLOC 12 (Pierre de Rosette section 14.9) · BLOC 13 (mapping interdits par domaine)

Fondateur : Frédérik Gélin — Montréal, mai 2026  
*"Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale."*  
