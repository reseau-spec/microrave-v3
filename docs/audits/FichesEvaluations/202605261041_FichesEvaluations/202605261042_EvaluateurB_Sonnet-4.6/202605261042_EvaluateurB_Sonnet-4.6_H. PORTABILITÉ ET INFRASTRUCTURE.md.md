━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — H. PORTABILITÉ ET INFRASTRUCTURE
Date d'évaluation : 26 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 §2.9)
  • src/core/IDFactory.js
  • codeBase44_v3/base44/functions/ (generateId() inline dans 12 fonctions)
  • codeBase44_v3/dataBase/ (20 CSV exports — 143 à 0 lignes selon entité)
  • codeBase44_v1/dataBase/ (40 entités, 13 144 lignes au total)
  • scripts/ (20 scripts, 0 export/restore tooling)
  • tests/p0/ADMIN-ABS-SYSTEMID.js (4/4 PASSED)
  • Analyse référentielle computationnelle : Python sur tous les exports
Niveau de confiance : HAUTE sur IDFactory et exports actuels ;
                     HAUTE sur les lacunes d'infrastructure identifiées.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
   (Tirés de l'OS V15)

Ce domaine est prêt pour la première transaction quand :

• Chaque objet possède un systemId généré avant insertion en DB,
  distinct du Base44 `id` — OS V15 §2.9 IDFactory (inchangé — voir V11) :
  "Le systemId est généré ICI, avant toute insertion en database.
  Le Base44 id n'est JAMAIS un identifiant métier souverain."

• Le systemId est immuable après création — D-107 interdit #15 :
  "Modifier le systemId d'un objet existant."
  D-107 interdit #16 : "Modifier les préfixes IDFactory d'objets déjà créés."
  ADMIN-ABS-SYSTEMID 4/4 PASSED.

• Les exports CSV constituent une trace d'audit accessible sans accès
  à la plateforme Base44 — prérequis implicite pour tout audit forensique
  (ce prompt l'illustre).

Ce domaine bloque tout le reste si :

• IDFactory.generate() produit des IDs identiques (collision) — D-107 #15.
  Techniquement improbable (timestamp+random), non prouvé possible.

• Les clés étrangères (engagementId, talentUserId) dans les entités
  financières référencent des Engagements inexistants — LOI GREFFIER-01 :
  toute écriture doit être traçable à une source valide.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

  IDFACTORY CANONIQUE (src/core/IDFactory.js) :
  24 types d'entités avec préfixes définis. Format : PREFIX-TIMESTAMP36-RANDOM6.
  Exemple : ENG-M5KQZA-3F9X2B. generate() + validate() + getType(). Tests
  ADMIN-ABS-SYSTEMID 4/4 PASSED. Le systemId est généré côté application,
  pas côté Base44.

  EXPORTS DB V3 :
  20 entités exportées dans codeBase44_v3/dataBase/, représentant un
  point-in-time snapshot de la production :
  — LedgerRecord : 143 lignes (le plus fourni)
  — Engagement : 22 enregistrements (ENG-*)
  — Event : 24 enregistrements
  — AdminAction : 9 ; AdminIncidentRecord : 4 ; DAL : 4
  — PayoutExecutionRecord : 1 ; SettlementInstruction : 1
  — SOTSDimensionConfig : 7 ; SOTSSubmission : 1 ; ReputationLedger : 1
  Ces exports servent de base aux scripts de seed et aux audits forensiques.

  ENTITÉS AVEC SYSTEMID COUVERTS EN PRODUCTION :
  11 entités ont des systemIds applicatifs présents dans les exports :
  EventPaymentRequest (23), Engagement (22), Event (24), LedgerRecord (143),
  AdminAction (10), AdminIncidentRecord (5), ReputationLedger (1),
  SOTSSubmission (1), SettlementInstruction, PayoutExecutionRecord, DAL.

  V1 DATA (RÉFÉRENCE) :
  codeBase44_v1/dataBase/ : 40 entités, 13 144 lignes. Schéma complet et
  documenté. Sert de preuve de concept opérationnel.

Ce qui vient de V1 et est encore actif :
  V1 opère sur microrave.ca (en production séparée). Les 13 144 lignes V1
  existent mais sont incompatibles avec le schéma V3. Pas de migration.
  Acquis : la volumétrie et le domaine sont validés par V1.

Ce qui vient de V2 et a survécu :
  Aucun.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT — aucun absolu pour la première transaction

DÉGRADANT (réduit la qualité, n'empêche pas) :

• [D-H-01] DUALITÉ D'ALGORITHME IDFactory — RISQUE D'AMBIGUÏTÉ VISUELLE.
  Deux générateurs d'IDs coexistent en production :
  (A) Canonique (IDFactory.js) : base36 complet → charset 0-9 A-Z, inclut
      les caractères ambigus 0 (zéro), O (lettre), I (lettre), 1 (un).
  (B) Déployé (generateId() dans 12 fonctions Base44) : charset explicite
      ABCDEFGHJKLMNPQRSTUVWXYZ23456789 — EXCLUT délibérément I, O, 0, 1.
  Résultat documenté en production : deux engagements avec IDs
  quasi-identiques coexistent dans le LedgerRecord :
  — ENG-MPIG0BUZ-N084HN (zéro, généré par scripts canoniques)
  — ENG-MPIGOBUZ-N084HN (lettre O, généré par autre script/déployé)
  Ce sont deux entités distinctes. Leurs données financières sont
  partiellement croisées dans les exports.
  Source : analyse Python sur LedgerRecord_export.csv (23 engagementIds
  distincts, incluant les deux variants).

• [D-H-02] INTÉGRITÉ RÉFÉRENTIELLE : ENG-MPIG0BUZ-N084HN HORS EXPORT.
  L'Engagement ENG-MPIG0BUZ-N084HN (l'engagement pilote avec le vrai
  payout tr_1TaHDt2eLVUrCnnJyDflLNEa) est absent de l'Engagement_export.csv.
  36 enregistrements (LedgerRecord × 31, AdminIncidentRecord × 4,
  SettlementInstruction × 1) le référencent en engagementId sans source
  dans l'export. Soit l'export est un snapshot antérieur au pilote complet,
  soit l'Engagement a été supprimé/archivé hors-export.
  Source : Python referential integrity check + PayoutExecutionRecord
  référençant ENG-MPIG0BUZ-N084HN.
  Impact : les exports ne constituent pas un backup fidèle de l'état actuel
  de la DB. Toute restauration à partir des exports serait incomplète.

• [D-H-03] 9 ENTITÉS SANS SYSTEMID APPLICATIF.
  DataAccessLedgerEntry, LedgerCodeMap, MembershipPlan, MissionSlot,
  PolicyConfig, SOTSDimensionConfig, StripePaymentSignal, UserMembership,
  WebhookProcessedLog — n'ont pas de colonne systemId dans leurs exports.
  Ces entités ne sont identifiables que par leur Base44 auto-id (ObjectId).
  En cas de migration hors Base44, ces entités perdent leur identifiant
  portable. Pour les entités à faible cardinalité (PolicyConfig, clé fonc-
  tionnelle = `key`) ce n'est pas bloquant. Pour WebhookProcessedLog et
  StripePaymentSignal (idempotency critique), l'absence de systemId portable
  fragilise une migration.
  Source : Python scan headers sur 20 exports.

• [D-H-04] AUCUN EXPORT/RESTORE TOOLING.
  scripts/ contient 20 scripts (backfill, seed, corrections, cron) mais 0
  outil d'export ou de restauration complet. La sauvegarde de la DB V3
  repose entièrement sur Base44 (plateforme SaaS). Aucun processus de
  sauvegarde côté application n'est documenté.
  Source : ls scripts/ — 0 fichier nommé export*, backup*, restore*.

REPORTABLE (peut attendre l'événement 2+) :

• IdMapping (IDM-*) est défini dans IDFactory.PREFIXES mais aucune entité
  IdMapping n'existe dans Base44. Le mapping V1→V3 pour les IDs utilisateurs
  est non documenté.

• Migration V1→V3 : 40 entités V1, 13 144 lignes, schéma incompatible.
  Aucun outil de migration dans scripts/. V1 continue d'opérer en parallèle
  sur microrave.ca sans impact sur V3.

• IDFactory doit aligner les deux charsets (canonique et déployé) pour
  éviter les collisions visuelles futures.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première
transaction que l'OS ne documente pas explicitement ?

→ OUI — INFÉRENCE NON DOCUMENTÉE : L'OS ne définit pas de procédure
  de backup/restauration. Base44 (SaaS) est implicitement délégué à cette
  responsabilité. Mais en cas de corruption ou d'incident majeur Base44,
  les exports CSV partiels (snapshot incomplet, intégrité référentielle
  manquante) ne permettent pas une restauration complète. La question
  "comment restaurer Micro Rave V3 à partir de 0 si Base44 disparaît" n'a
  pas de réponse documentée dans l'OS V15. À clarifier avant Event 1 si
  la continuité d'exploitation est une exigence.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

V1 est une dette de migration permanente : 13 144 lignes dans un schéma
incompatible. Tant que V1 opère sur microrave.ca, aucune urgence — mais
toute convergence future des deux plateformes nécessitera un chantier
de migration significatif.

La dualité IDFactory (canonique vs déployé) est une dette technique V3
introduite par la coexistence des scripts Node.js (canonical) et des
fonctions Base44 Deno (deployed). Elle est solvable en alignant le charset
du canonical IDFactory sur celui du déployé, mais exige de patcher toutes
les références existantes ou de laisser coexister les deux formats.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour Event 1 commercial : aligner les charsets IDFactory (supprimer 0/I
de l'IDFactory canonique pour éviter les confusions visuelles futures), et
produire un export DB complet incluant ENG-MPIG0BUZ-N084HN avant Event 1
pour disposer d'un snapshot cohérent. Ces actions ne bloquent pas
techniquement la transaction mais évitent des ambiguïtés opérationnelles.

──────────────────────────────────────────────────
6. STATUT FINAL

  ☑ PRÊT SOUS CONDITIONS

  La transaction peut se dérouler sur l'infrastructure actuelle sans
  risque bloquant. Les lacunes identifiées sont qualitatives (dualité
  IDFactory, snapshot incomplet, 9 entités sans systemId portable) et
  ne compromettent pas le chemin nominal.

  Conditions pour la confiance institutionnelle :
  (1) Produire un export DB complet et cohérent avant Event 1 ;
  (2) Documenter la politique de backup Base44 comme seul plan de
  continuité d'exploitation.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

• A. Ontologie dépend de H pour l'unicité des systemIds Engagement.
  La dualité 0/O confirme que deux engagements quasi-homonymes peuvent
  coexister, confondant les guards et les outils d'audit.

• B. Finance dépend de H pour l'intégrité référentielle du LedgerRecord.
  Les 31 lignes LedgerRecord référençant ENG-MPIG0BUZ-N084HN absent de
  l'Engagement export constituent un risk comptable si l'export est pris
  comme source de vérité pour la réconciliation.

  INFÉRENCE : tous les domaines s'appuient implicitement sur Base44
  comme infrastructure de persistance. La durabilité de l'ensemble de
  V3 dépend de la continuité du service Base44. Aucun contrat SLA ou
  plan de continuité n'est visible dans le codebase.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — H. PORTABILITÉ ET INFRASTRUCTURE
Conserver pour le Prompt de Synthèse.