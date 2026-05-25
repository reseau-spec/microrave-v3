Excellente question. C'est probablement **LA décision la plus importante** que vous ayez à prendre pour Micro Rave — plus importante que n'importe quelle feature, n'importe quel design, n'importe quel guard. Parce qu'elle conditionne **tout** : la fiscalité, la responsabilité légale, le modèle d'affaires, le pricing affiché, la conformité, l'assurance, et même la façon dont les talents vous perçoivent.

Je vais vulgariser à fond. Préparez un café.

---

# 🎭 La métaphore du marché public

Imaginez un marché public le samedi matin.

**Modèle 1 — Le gérant du marché (MANDATAIRE)**
Vous gérez le marché. Vous louez les emplacements. Vous tenez la caisse centrale. Quand un client achète des tomates au maraîcher Jean-Pierre, il paie à la caisse centrale (vous). Vous prenez votre commission (disons 15 %) et vous remettez le reste à Jean-Pierre en fin de journée.

**Mais sur le reçu du client, c'est écrit : « TOMATES — FERME JEAN-PIERRE — 10 $ + taxes ».** Pas votre nom. Le client sait qu'il achète à Jean-Pierre. Vous n'êtes que le caissier.

**Modèle 2 — L'épicier (PRINCIPAL)**
Vous tenez une épicerie. Vous achetez des tomates à Jean-Pierre à 7 $/lb. Vous les revendez à 10 $/lb à vos clients. Sur le reçu : « TOMATES — ÉPICERIE CHEZ-VOUS — 10 $ + taxes ». Jean-Pierre n'apparaît nulle part. Le client achète **à vous**.

**Ces deux modèles font exactement la même chose économiquement** (Jean-Pierre touche ~7 $, vous touchez ~3 $, le client paie 10 $ + taxes). **Mais juridiquement et fiscalement, ce sont deux univers complètement différents.**

C'est exactement le choix que Micro Rave doit faire.

---

# 📚 Les deux modèles en détail

## MODÈLE A — Mandataire (le « courtier »)

**Définition simple :** MR agit *au nom du talent*. MR est un intermédiaire transparent. Le contrat de service est entre le **talent** et le **client/organisateur**. MR facilite, perçoit l'argent, prend une commission, mais ne « vend » rien.

### Qui vend quoi à qui ?

```
TALENT  ────vend sa prestation────►  CLIENT
   ▲                                      │
   │                                      │ paie 344,93 $
   │ reçoit 264 $                         │
   │                                      ▼
   └─────────  MICRO RAVE (caissier-mandataire)
              prend 36 $ de commission
              remet 44,93 $ taxes à l'État (au nom du talent)
```

### Conditions à remplir

1. **Convention de mandat écrite** signée entre MR et chaque talent (obligatoire, sinon ça ne tient pas devant Revenu Québec).
2. **Le talent doit être inscrit TPS/TVQ** (sinon, il ne *peut pas* y avoir de taxes facturées en son nom — voir plus bas).
3. **Le client doit savoir qu'il achète au talent**, pas à MR. La facture doit mentionner le talent comme fournisseur.
4. **Soumission à la section 177 LTA** (Loi sur la taxe d'accise) pour MR puisse percevoir et remettre les taxes au nom du talent.
5. **Cadre marketplace post-2021** : depuis juillet 2021, les plateformes numériques canadiennes ont des règles spécifiques (TPS plateforme), à analyser.

### Ce qui apparaît sur la facture client

```
═══════════════════════════════════════════
  Prestation : DJ Set 4h
  Fournisseur : Alexandre Tremblay (DJ Alex)
  N° TPS du fournisseur : 123456789 RT0001
  N° TVQ du fournisseur : 1234567890 TQ0001
  
  Cachet                          300,00 $
  TPS (5%)                         15,00 $
  TVQ (9,975%)                     29,93 $
                                  ─────────
  TOTAL                           344,93 $
  
  Perçu par : Micro Rave inc. (mandataire)
═══════════════════════════════════════════
```

**Point crucial :** ce sont les numéros de taxes **du talent** qui apparaissent, pas ceux de MR.

---

## MODÈLE B — Principal (le « revendeur »)

**Définition simple :** MR *vend* la prestation au client. MR achète d'abord la prestation au talent (sous-traitance), puis la revend. Deux transactions distinctes : (talent → MR) puis (MR → client).

### Qui vend quoi à qui ?

```
TALENT  ───vend sa prestation à MR───►  MICRO RAVE  ───revend au client───►  CLIENT
                                              │
                                              │ Première transaction :
                                              │ Talent facture MR 264 $ + ses taxes (si inscrit)
                                              │
                                              │ Deuxième transaction :
                                              │ MR facture client 300 $ + 44,93 $ taxes (MR perçoit)
                                              │ Marge MR = 36 $
```

### Conditions à remplir

1. **MR doit être inscrit TPS/TVQ** (obligatoire dès 30 000 $/an de revenus taxables).
2. **Contrats de sous-traitance** avec chaque talent (le talent vend à MR, pas au client).
3. **Sur la facture client, c'est MR qui apparaît** comme fournisseur de la prestation.
4. **MR peut réclamer les CTI/RTI** (crédits de taxes sur intrants) sur les taxes que le talent lui facture.

### Ce qui apparaît sur la facture client

```
═══════════════════════════════════════════
  Prestation : DJ Set 4h
  Fournisseur : Micro Rave inc.
  N° TPS de MR : 987654321 RT0001
  N° TVQ de MR : 0987654321 TQ0001
  
  Cachet                          300,00 $
  TPS (5%)                         15,00 $
  TVQ (9,975%)                     29,93 $
                                  ─────────
  TOTAL                           344,93 $
═══════════════════════════════════════════
```

Le client **n'a pas besoin de savoir** qui est le DJ ni s'il existe. Il achète une prestation à MR. MR sous-traite. Point.

---

# ⚖️ Comparatif côte à côte

| Critère | A — Mandataire | B — Principal |
|---|---|---|
| **Qui « vend » au client ?** | Le talent | Micro Rave |
| **Nom sur la facture client** | Talent + mention « perçu par MR » | Micro Rave seulement |
| **Numéros de taxes affichés** | Ceux du talent | Ceux de MR |
| **Convention requise** | Mandat (talent ↔ MR) | Sous-traitance (talent → MR) |
| **Talent doit être inscrit TPS/TVQ ?** | **Oui, obligatoirement**, sinon pas de taxes | Optionnel (si non inscrit, il facture HT à MR) |
| **MR doit être inscrit TPS/TVQ ?** | Oui (pour percevoir/remettre) | **Oui, obligatoirement** |
| **CTI/RTI pour MR** | Aucun sur la prestation | Oui (sur taxes facturées par talent inscrit) |
| **Comptes comptables des taxes** | 4325/4326 (« pour le talent ») | 4410/4420 (« propres à MR ») |
| **Revenus de MR aux livres** | Commission seulement (36 $) | Vente brute (300 $) − Coût d'achat (264 $) = marge brute (36 $) |
| **Top-line apparent** | Petit | **Énorme** (10× plus gros) |
| **Responsabilité civile envers le client** | Limitée (intermédiaire) | **Totale** (vendeur direct) |
| **Si le talent ne se présente pas** | Le client poursuit le talent | Le client poursuit **MR** |
| **Risque d'audit fiscal** | Moyen (faut prouver le mandat) | Standard (modèle classique) |
| **Complexité opérationnelle** | Élevée (gestion taxes au nom d'autrui) | Moyenne |
| **Évolutivité internationale** | Difficile (mandat = règles locales) | Plus facile (vente standard) |

---

# 💥 Les impacts concrets — section par section

## 1. Impact sur le talent

### Sous le modèle A (Mandataire)

**Le talent doit absolument être inscrit TPS/TVQ.** Ça veut dire :

- Le talent doit s'inscrire auprès de Revenu Québec et l'ARC pour obtenir des numéros de TPS/TVQ. C'est gratuit mais administrativement lourd.
- Le talent doit produire des **déclarations TPS/TVQ trimestrielles ou annuelles** (même si MR fait la perception en son nom).
- Le talent doit tenir une comptabilité minimale pour ses revenus.
- Le talent peut réclamer des **CTI/RTI sur ses propres dépenses** (équipement, transport, formation).
- **Mais** : s'il fait < 30 000 $/an, il n'est pas obligé de s'inscrire. Et là, ça bloque tout votre modèle pour ce talent.

**Conséquence pratique :** un DJ amateur qui fait 5 gigs par an à 300 $ chacun = 1 500 $/an. Il n'a aucune obligation d'être inscrit. Il ne *veut* probablement pas s'inscrire (paperasse). **Modèle A impossible pour lui.**

### Sous le modèle B (Principal)

**Le talent n'a pas besoin d'être inscrit.** Trois cas :

- **Talent non inscrit** (petit fournisseur < 30 000 $) : il facture HT à MR. MR ne réclame pas de CTI mais ne paie pas de taxes au talent. Cas simple.
- **Talent inscrit** : il facture taxes incluses à MR. MR paie les taxes au talent et réclame des CTI/RTI. Net pour MR : zéro.
- **Talent incorporé** : facture émise par sa compagnie. Encore plus simple.

**Conséquence pratique :** vous pouvez engager n'importe qui, inscrit ou non, sans bloquer le modèle.

---

## 2. Impact sur le client/organisateur

### Sous le modèle A

- Le client reçoit une facture **au nom du talent**.
- Si le client est une entreprise inscrite, il réclame ses CTI/RTI à partir des numéros de taxes **du talent**.
- Si le client a un problème (talent ne se présente pas, prestation médiocre), juridiquement, **son recours est contre le talent**, pas MR.
- MR peut être tenu responsable si la convention de mandat le prévoit, mais par défaut le contrat de service est talent ↔ client.

### Sous le modèle B

- Le client reçoit une facture **au nom de MR**.
- Le client réclame ses CTI/RTI sur les numéros de **MR**. C'est plus simple pour lui (un seul fournisseur récurrent).
- En cas de problème, **MR est responsable**. C'est MR qui a vendu. Le client se fout que MR ait sous-traité — MR doit livrer.
- MR doit avoir une **assurance responsabilité civile professionnelle** robuste.

---

## 3. Impact sur Micro Rave — comptabilité

### Sous le modèle A — État des résultats

```
═══════════════════════════════════════════
  REVENUS
    Commissions de courtage              36,00 $
                                       ─────────
  Total revenus                          36,00 $
═══════════════════════════════════════════
```

Vos états financiers montrent **36 $ de revenus** pour cette transaction. C'est tout.

### Sous le modèle B — État des résultats

```
═══════════════════════════════════════════
  REVENUS
    Ventes de prestations              300,00 $
                                       ─────────
  Total revenus                        300,00 $
  
  COÛT DES VENTES
    Achats (cachets aux talents)       264,00 $
                                       ─────────
  Marge brute                           36,00 $
═══════════════════════════════════════════
```

Vos états financiers montrent **300 $ de revenus** et 264 $ de coûts. Marge brute : 36 $.

### Pourquoi c'est important — le top-line

**Imaginez Micro Rave traite 1 000 transactions de 300 $ par an.**

| Métrique | Modèle A | Modèle B |
|---|---|---|
| Revenus déclarés | 36 000 $ | **300 000 $** |
| Marge nette | 36 000 $ | 36 000 $ |
| Apparence pour un investisseur | « Petite boîte de courtage 36 K$ » | « Marketplace 300 K$ de GMV » |
| Valorisation potentielle (multiples) | 3-5× | 5-15× |

**Stratégiquement :** si Micro Rave veut **lever des fonds** ou **être acquis**, le modèle B donne un top-line beaucoup plus impressionnant. C'est pour ça que la plupart des marketplaces (Uber, Airbnb dans certains pays, DoorDash) ont des batailles fiscales énormes pour rester en modèle A (moins de taxes) tout en présentant des chiffres style modèle B aux investisseurs (top-line gonflé).

Mais **vous ne pouvez pas avoir les deux**. Comptablement, c'est l'un ou l'autre.

---

## 4. Impact sur la responsabilité juridique

### Sous le modèle A — Le talent est responsable

**Scénario : DJ Alex ne se présente pas au mariage.**

- Le couple poursuit **DJ Alex**, pas MR.
- MR doit prouver qu'il a fait son travail de mandataire (sélection raisonnable, vérification d'identité, communication des termes).
- MR rembourse les sommes perçues au nom du talent (puisque la prestation n'a pas été rendue).
- MR garde sa commission ? Ça dépend du contrat de mandat. Généralement non si la prestation n'a pas été rendue.

### Sous le modèle B — MR est responsable

**Même scénario.**

- Le couple poursuit **MR**. MR a vendu la prestation. MR n'a pas livré.
- MR doit **soit livrer un DJ de remplacement** soit **rembourser intégralement** (et possiblement des dommages).
- MR poursuit ensuite DJ Alex en arrière-plan pour récupérer ses pertes (action récursoire).
- MR a besoin d'une **assurance responsabilité civile professionnelle d'au moins 1-2 M$**.

**Coût concret :** une RCP marketplace tourne autour de 3 000 $ à 15 000 $/an selon le volume. Sous modèle A, beaucoup moins (intermédiaire seulement).

---

## 5. Impact sur la conformité réglementaire

### Sous le modèle A

- **Section 177 LTA** : MR doit respecter les conditions strictes pour percevoir au nom d'autrui (mandats écrits, ségrégation des fonds, etc.).
- **Loi sur la protection du consommateur (Québec)** : MR doit afficher clairement son rôle d'intermédiaire.
- **OCRCVM / AMF** : non concerné en principe (pas un courtier en valeurs).
- **Marketplace tax (depuis 2021)** : règles fédérales spécifiques aux plateformes numériques — MR pourrait être qualifié de « plateforme distributrice » avec des obligations particulières même en modèle A.

### Sous le modèle B

- Modèle commercial **standard**. Aucune règle spéciale.
- Régime fiscal **prévisible et bien documenté**.
- Plus simple à expliquer à un comptable, un banquier, un investisseur, un assureur.

---

## 6. Impact sur la trésorerie

### Sous le modèle A

- MR perçoit 344,93 $ → garde 36 $ → reverse 264 $ au talent + 44,93 $ à l'État.
- **Les 308,93 $ ne sont jamais à MR.** Ils transitent.
- Trésorerie réelle de MR pour cette transaction : 36 $ (commission).
- Risque : si MR pige dans ces fonds (mélange avec son fonds de roulement), c'est **détournement de fonds en fiducie implicite**. Très grave.

### Sous le modèle B

- MR perçoit 344,93 $ → garde tout temporairement.
- MR paie 264 $ au talent (à crédit, généralement 30 jours).
- MR remet 44,93 $ de taxes (− CTI sur les taxes payées au talent inscrit) trimestriellement.
- **Flexibilité de trésorerie** : MR peut avoir 30 à 90 jours de fonds de roulement gratuit.

**Avantage modèle B en trésorerie :** énorme, surtout au démarrage. C'est le « float » qui a financé la croissance de plein de marketplaces.

---

## 7. Impact sur la perception des talents

### Sous le modèle A

Le talent voit MR comme **son agent**. La relation est plus paritaire. Le talent garde sa marque, sa facturation, sa relation client. MR est un facilitateur.

**Avantage :** les talents établis (vrais professionnels) préfèrent généralement ce modèle. Ils ne veulent pas être « dilués » dans une marque générique.

**Inconvénient :** les talents débutants n'ont pas la maturité administrative requise (pas inscrits, pas de compta).

### Sous le modèle B

Le talent voit MR comme **son client**. C'est MR qui l'embauche. Le talent est un sous-traitant.

**Avantage :** beaucoup plus simple pour les débutants. MR gère tout. Le talent reçoit un chèque, point.

**Inconvénient :** les talents établis peuvent se sentir réduits à de la « main d'œuvre interchangeable ». Risque d'attrition des meilleurs.

---

## 8. Impact international / scaling

### Sous le modèle A

- Chaque province / pays a ses propres règles de mandat fiscal.
- Pour scaler en Ontario : règles HST différentes, statut de mandataire à valider.
- Pour scaler aux États-Unis : concept de mandat fiscal n'existe pas de la même façon. Refonte complète.

### Sous le modèle B

- Modèle vente standard, **réplicable partout**.
- Adaptations locales triviales (taux de taxe, mais structure identique).

---

# 🎯 Et Doctrine A dans tout ça ?

Vous avez écrit votre Doctrine A sur le postulat **Mandataire**. Relisons votre carte 07 :

> **DOCTRINE A — SEED FISCAL · STATUT : HYPOTHÈSE EN COURS DE VALIDATION**
> Micro Rave mandataire — Talent inscrit TPS/TVQ
> Micro Rave est l'intermédiaire — le courtier. Pas le vendeur.
> Le talent est le fournisseur. Les taxes appartiennent au talent.
> ⚠️ VALIDATION FISCALISTE REQUISE AVANT LANCEMENT COMMERCIAL RÉEL

Vous avez fait **un choix doctrinal très clair** : modèle A. Mais ce choix a deux talons d'Achille que votre propre doctrine reconnaît :

1. **« Talent inscrit TPS/TVQ »** : qu'est-ce qui se passe quand le talent ne l'est pas ? La Doctrine A ne fonctionne tout simplement pas. Vous avez besoin d'un **fork de doctrine** pour ce cas (ou d'exclure les talents non inscrits, ce qui réduit massivement votre marché).

2. **« Courtier déclaré ≠ mandataire fiscalement reconnu »** : votre propre carte dit que se déclarer mandataire ne suffit pas. Il faut une **convention de mandat signée par chaque talent** + une **opinion fiscale formelle** d'un comptable agréé.

---

# 🧭 Mes recommandations stratégiques

### À court terme (avant tout lancement commercial)

**Option 1 — Modèle A pur (votre Doctrine A actuelle)**
- ✅ Aligné avec votre vision « institution culturelle, pas marchand »
- ✅ Top-line modeste mais propre
- ✅ Responsabilité limitée
- ❌ Bloque les talents non inscrits (~80 % des amateurs et émergents)
- ❌ Nécessite convention de mandat formelle avec chaque talent
- ❌ Complexité de gestion des taxes au nom d'autrui

**Option 2 — Modèle B pur (sous-traitance classique)**
- ✅ Marche pour TOUS les talents (inscrits ou non)
- ✅ Top-line impressionnant pour investisseurs
- ✅ Modèle juridique standard, bien compris
- ❌ Responsabilité totale → assurance coûteuse
- ❌ Trahit votre positionnement « pas un revendeur »
- ❌ Modifie complètement votre comptabilité actuelle

**Option 3 — Modèle hybride (le plus réaliste)**
- Modèle A par défaut **pour les talents inscrits** (qui veulent garder leur marque).
- Modèle B en fallback **pour les talents non inscrits** (simplicité).
- Le **`PolicyConfigAdapter`** détermine le mode par talent au moment de l'engagement.
- Plus complexe à coder mais **commercialement viable**.

### Ma recommandation forte

**Ne décidez pas seul.** Cette décision :
- A des **conséquences fiscales irréversibles** (vous ne pouvez pas dire « finalement on était modèle B » deux ans après avoir opéré en A).
- Engage votre **responsabilité civile** (couverture d'assurance différente).
- Modifie votre **plan comptable, vos états financiers, votre valorisation**.

**Faites valider par un fiscaliste CPA spécialisé en marketplaces ET un avocat en droit commercial.** Budget : 2 000 $ à 5 000 $. C'est le meilleur investissement que vous ferez. Une erreur ici coûte 50 000 $ à 500 000 $ de redressement fiscal + intérêts + pénalités si Revenu Québec requalifie votre modèle dans 3 ans.

### Ce que vous devriez préparer pour ce rendez-vous

1. Votre **OS V15** (le document de 785 lignes).
2. Votre **carte 07 fiscalité** (drawio).
3. Un **exemple de transaction complète** anonymisée.
4. Vos **conventions actuelles** (s'il y en a) avec les talents.
5. Une question écrite très précise : *« Pouvons-nous opérer en mandataire au sens de la section 177 LTA et de l'article 41.0.1 LTVQ, et si oui, quelles sont les conditions strictes à respecter ? »*

---

# 🍞 Résumé en une page

| Question | Réponse |
|---|---|
| **C'est quoi le choix ?** | MR vend-elle elle-même au client (Principal) ou aide-t-elle juste le talent à vendre (Mandataire) ? |
| **Doctrine A actuelle ?** | Mandataire. |
| **Quel impact sur les taxes ?** | Identique pour le client (44,93 $ sur 300 $). Différent sur les comptes (4325/4326 vs 4410/4420) et le redevable légal (talent vs MR). |
| **Quel impact sur les revenus déclarés ?** | Énorme. Mandataire = 36 $/transaction. Principal = 300 $/transaction. |
| **Quel impact sur la responsabilité ?** | Énorme. Mandataire = talent responsable. Principal = MR responsable. |
| **Quel impact sur les talents ?** | Mandataire = exige qu'ils soient inscrits TPS/TVQ. Principal = ouvert à tous. |
| **Décision irréversible ?** | Quasi. Changer de modèle après plusieurs années d'opération = redressement fiscal probable. |
| **Quoi faire ?** | Consulter un fiscaliste CPA marketplaces + un avocat commercial AVANT le lancement réel. Votre propre carte 07 le dit en rouge. |

