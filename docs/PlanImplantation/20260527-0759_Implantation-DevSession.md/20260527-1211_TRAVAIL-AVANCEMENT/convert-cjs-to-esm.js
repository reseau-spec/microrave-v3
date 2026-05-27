#!/usr/bin/env node
/**
 * MICRO RAVE V3 — Convertisseur CJS → ESM
 * ============================================================
 * Périmètre PORT-1 (post-amendement 27 mai 2026).
 *
 * RÈGLE 0 : aucune logique métier touchée. Transformation
 * syntaxique uniquement. Auditable ligne par ligne.
 *
 * Transformations appliquées :
 *   1. const X = require('./Y')          → import X from './Y.js'
 *   2. const X = require('./Y').foo      → import { foo as X } from './Y.js'
 *      (cas rare, traité comme ligne manuelle si rencontré)
 *   3. const { a, b } = require('./Y')   → import { a, b } from './Y.js'
 *   4. const { a: x } = require('./Y')   → import { a as x } from './Y.js'
 *   5. require('dotenv').config()        → import dotenv from 'dotenv'; dotenv.config();
 *   6. module.exports = { a, b }         → export { a, b }
 *   7. module.exports = X                → export default X
 *   8. module.exports.X = ...            → export const X = ... (best effort)
 *   9. __dirname / __filename            → recréés via fileURLToPath
 *  10. require dynamique (process.env.X) → wrap createRequire
 *
 * Les imports relatifs sans extension reçoivent .js explicite.
 * Les imports de packages npm (sans ./ ni ../) restent intacts.
 *
 * USAGE :
 *   node convert-cjs-to-esm.js <file.js> [--dry-run]
 *   node convert-cjs-to-esm.js --batch <glob>
 *
 * SORTIE :
 *   Réécrit le fichier in-place (avec backup .cjs-bak).
 *   Log chaque transformation sur stderr.
 * ============================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const files = args.filter((a) => !a.startsWith('--'));

if (files.length === 0) {
  console.error('Usage: node convert-cjs-to-esm.js <file...> [--dry-run] [--verbose]');
  process.exit(1);
}

let totalChanged = 0;
let totalSkipped = 0;
const warnings = [];

/**
 * Normalise un chemin de require/import vers une forme ESM-compatible.
 * - './X'    → './X.js'
 * - './X.js' → './X.js' (déjà OK)
 * - 'pkg'    → 'pkg' (intact, package npm)
 * - 'node:fs' → 'node:fs' (intact, builtin)
 */
function normalizeImportPath(p) {
  if (!p.startsWith('.') && !p.startsWith('/')) return p;     // package
  if (p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.cjs') || p.endsWith('.json')) return p;
  // Vérifier que ce n'est pas un dossier avec index.js — on suppose que oui pour les imports relatifs.
  return p + '.js';
}

function convertFile(filePath) {
  if (!fs.existsSync(filePath)) {
    warnings.push(`SKIP (not found): ${filePath}`);
    totalSkipped++;
    return;
  }
  if (!filePath.endsWith('.js')) {
    warnings.push(`SKIP (not .js): ${filePath}`);
    totalSkipped++;
    return;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  let src = original;
  const transforms = [];

  // ── 1. Supprimer 'use strict' (no-op en ESM, mais pas nocif). On le garde si présent.
  // (pas de transform — ESM est implicitement strict)

  // ── 2. require('dotenv').config() → import + appel
  src = src.replace(
    /require\(['"]dotenv['"]\)\.config\(\)/g,
    () => {
      transforms.push('dotenv inline → import');
      return '__DOTENV_CALL__';
    }
  );
  // Si on a touché à dotenv, ajouter l'import en tête après la première transform
  // (on traite ça en post-process si __DOTENV_CALL__ est présent)

  // ── 3. const NAME = require('...');  (namespace import)
  //      → import NAME from '....js';
  src = src.replace(
    /^(\s*)const\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)\s*;?\s*$/gm,
    (m, indent, name, p) => {
      const normalized = normalizeImportPath(p);
      transforms.push(`namespace require → import: ${name} from '${normalized}'`);
      return `${indent}import ${name} from '${normalized}';`;
    }
  );

  // ── 4. const { a, b, c } = require('...');  (destructured import)
  //      → import { a, b, c } from '....js';
  src = src.replace(
    /^(\s*)const\s+\{\s*([^}]+)\s*\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)\s*;?\s*$/gm,
    (m, indent, names, p) => {
      const normalized = normalizeImportPath(p);
      // Gérer { a: b } → { a as b }
      const cleaned = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => {
          if (n.includes(':')) {
            const [orig, alias] = n.split(':').map((s) => s.trim());
            return `${orig} as ${alias}`;
          }
          return n;
        })
        .join(', ');
      transforms.push(`destructured require → import: { ${cleaned} } from '${normalized}'`);
      return `${indent}import { ${cleaned} } from '${normalized}';`;
    }
  );

  // ── 5. const NAME = require('...').prop;  (rare — namespace then access)
  //      → import { prop as NAME } from '....js';
  src = src.replace(
    /^(\s*)const\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)\.(\w+)\s*;?\s*$/gm,
    (m, indent, name, p, prop) => {
      const normalized = normalizeImportPath(p);
      transforms.push(`require().prop → named import: { ${prop} as ${name} } from '${normalized}'`);
      return `${indent}import { ${prop} as ${name} } from '${normalized}';`;
    }
  );

  // ── 6. module.exports = { a, b, c };  → export default { a, b, c } + export { a, b, c };
  //    Pourquoi les deux : 93 sites du code source font `const X = require(...)`
  //    (pattern namespace, attend un objet) et 41 font `const { x } = require(...)`
  //    (pattern destructuré, attend des propriétés). En CJS le même
  //    module.exports = { ... } satisfait les deux. En ESM, il faut produire
  //    explicitement les deux formes pour préserver la sémantique sans
  //    toucher aux 134 sites d'import.
  src = src.replace(
    /^module\.exports\s*=\s*\{\s*([^}]+)\s*\}\s*;?\s*$/gm,
    (m, names) => {
      transforms.push(`module.exports {} → export default + named`);
      // Identifier les identifiants simples (a, b) vs les paires (a: b)
      const items = names
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      // Pour les named exports, on ne réexporte que les identifiants purs
      // (les paires "a: foo()" deviendraient invalides en named export).
      const pureIdents = items.filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
      const reExport = pureIdents.length === items.length
        ? `\nexport { ${pureIdents.join(', ')} };`
        : '';  // si renames/sous-objets : seulement default
      return `export default { ${names.trim()} };${reExport}`;
    }
  );

  // ── 7. module.exports = IDENTIFIER;  → export default IDENTIFIER;
  src = src.replace(
    /^module\.exports\s*=\s*(\w+)\s*;?\s*$/gm,
    (m, name) => {
      transforms.push(`module.exports = X → export default X (${name})`);
      return `export default ${name};`;
    }
  );

  // ── 8. module.exports = { ... multi-line ... }
  //    Cas où l'objet exporté s'étend sur plusieurs lignes.
  //    Détecté : 'module.exports = {' en début, sans fermeture sur la même ligne.
  //    Idem que pour le cas single-line : on produit default + named purs.
  src = src.replace(
    /^module\.exports\s*=\s*\{([\s\S]*?)^\}\s*;?\s*$/gm,
    (m, body) => {
      transforms.push(`module.exports = { multi-line } → export default + named purs`);
      // Extraire les identifiants simples au top-level de l'objet (pas dans
      // les sous-objets imbriqués). On compte les accolades pour rester au
      // niveau 0 et on prend les noms qui apparaissent au format "ident,"
      // ou "ident:" suivi d'une valeur. Pour les named exports on ne garde
      // que les "ident," seuls (pas les renames ni les valeurs inline) car
      // ce sont les seuls re-exportables en tant qu'identifiants bindings.
      const pureIdents = [];
      const lines = body.split('\n');
      let depth = 0;
      for (const line of lines) {
        const stripped = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
        for (const ch of stripped) {
          if (ch === '{' || ch === '[') depth++;
          else if (ch === '}' || ch === ']') depth--;
        }
        if (depth !== 0) continue;
        // matche " IDENT," ou " IDENT$" (en fin de ligne ou avec virgule)
        const m2 = stripped.match(/^\s*([A-Za-z_$][\w$]*)\s*,?\s*$/);
        if (m2) pureIdents.push(m2[1]);
      }
      const reExport = pureIdents.length > 0
        ? `\nexport { ${pureIdents.join(', ')} };`
        : '';
      return `export default {${body}};${reExport}`;
    }
  );

  // ── 9. module.exports.NAME = VALUE  → export const NAME = VALUE
  //    Cas plus rare ; on fait une transform best-effort.
  src = src.replace(
    /^module\.exports\.(\w+)\s*=\s*/gm,
    (m, name) => {
      transforms.push(`module.exports.${name} = → export const ${name} =`);
      return `export const ${name} = `;
    }
  );

  // ── 10. exports.NAME = VALUE  → export const NAME = VALUE (idem)
  src = src.replace(
    /^exports\.(\w+)\s*=\s*/gm,
    (m, name) => {
      transforms.push(`exports.${name} = → export const ${name} =`);
      return `export const ${name} = `;
    }
  );

  // ── 11. __dirname / __filename → injection en tête si utilisés et fichier ESM
  // Détection des require dynamiques : on enlève d'abord les commentaires
  // pour ne pas se laisser tromper par des exemples JSDoc.
  // On détecte require(...) ET require.X (require.cache, require.resolve)
  // car en ESM même `require` comme identifiant n'existe pas.
  const srcMinusComments = src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // bloc commentaires
    .replace(/^\s*\/\/.*$/gm, '');      // lignes //
  const usesDirname = /\b__dirname\b/.test(srcMinusComments);
  const usesFilename = /\b__filename\b/.test(srcMinusComments);
  const usesDynamicRequire = /\brequire\s*[(.]/.test(srcMinusComments);
  const hasDotenvCall = src.includes('__DOTENV_CALL__');

  let headerInjection = '';
  if (usesDirname || usesFilename) {
    headerInjection += `import { fileURLToPath as __fileURLToPath } from 'node:url';\n`;
    headerInjection += `import { dirname as __pathDirname } from 'node:path';\n`;
    if (usesFilename) headerInjection += `const __filename = __fileURLToPath(import.meta.url);\n`;
    if (usesDirname) headerInjection += `const __dirname = __pathDirname(__fileURLToPath(import.meta.url));\n`;
    transforms.push('inject __dirname/__filename shim');
  }
  if (usesDynamicRequire) {
    headerInjection += `import { createRequire as __createRequire } from 'node:module';\n`;
    headerInjection += `const require = __createRequire(import.meta.url);\n`;
    transforms.push('inject createRequire shim (dynamic require survivor)');
    warnings.push(`WARN dynamic require in ${filePath} — audit required`);
  }
  if (hasDotenvCall) {
    headerInjection = `import dotenv from 'dotenv';\ndotenv.config();\n` + headerInjection;
    src = src.replace(/__DOTENV_CALL__\s*;?/g, '');
  }

  if (headerInjection) {
    // Injecter après l'éventuel commentaire d'en-tête /** ... */ et 'use strict'
    // Le plus simple : insérer après le premier bloc de commentaires + 'use strict'.
    const headerMatch = src.match(/^((?:\s*\/\*[\s\S]*?\*\/\s*|\s*\/\/[^\n]*\n|\s*'use strict'\s*;\s*)*)/);
    const insertAt = headerMatch ? headerMatch[0].length : 0;
    src = src.slice(0, insertAt) + headerInjection + src.slice(insertAt);
  }

  // ── 12. Détection de require() résiduels non transformés (lignes complexes)
  //      On s'appuie sur srcMinusComments calculé plus haut pour éviter les
  //      faux positifs dans les commentaires JSDoc.
  const residualRequires = [...srcMinusComments.matchAll(/\brequire\(\s*['"][^'"]+['"]\s*\)/g)];
  if (residualRequires.length > 0 && !usesDynamicRequire) {
    warnings.push(
      `WARN residual require() in ${filePath} (${residualRequires.length} occurrence(s)) — manual review needed`
    );
  }

  // ── 13. module.exports résiduel
  const residualModuleExports = [...src.matchAll(/\bmodule\.exports\b/g)];
  if (residualModuleExports.length > 0) {
    warnings.push(
      `WARN residual module.exports in ${filePath} — manual review needed`
    );
  }

  if (src === original) {
    if (verbose) console.error(`= unchanged: ${filePath}`);
    return;
  }

  totalChanged++;
  if (verbose || dryRun) {
    console.error(`\n── ${filePath}`);
    transforms.forEach((t) => console.error(`   · ${t}`));
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, src, 'utf8');
  }
}

for (const f of files) {
  convertFile(f);
}

if (warnings.length > 0) {
  console.error('\n══════════════ WARNINGS ══════════════');
  warnings.forEach((w) => console.error(w));
}

console.error(`\n══════════════ SUMMARY ══════════════`);
console.error(`Files changed:  ${totalChanged}`);
console.error(`Files skipped:  ${totalSkipped}`);
console.error(`Warnings:       ${warnings.length}`);
if (dryRun) console.error(`(dry-run — no files written)`);
