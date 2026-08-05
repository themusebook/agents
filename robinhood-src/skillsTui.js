/**
 * Interactive Skill Hub multi-select TUI / REPL.
 *
 * Browse the remote catalog (or offline packs), toggle skills, then either:
 *  - attach refs only (agent JSON stays lean — default, no bloat)
 *  - sparse-install ONLY the selected SKILL.md files into ./.agents/skills
 *
 * Usage:
 *   ct-agents skills              # TTY → this picker
 *   ct-agents skills pick|tui|repl
 *   ct-agents design              # design flow reuses pickSkillsInteractive
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

import {
  loadSkillCatalog,
  loadSkillHubIndex,
  searchSkills,
  resolveSkillRefs,
  attachSkillsToAgent,
  installSkillsSparse,
  skillRefsForAgent,
  DEFAULT_INSTALL_DIR,
} from './skillHub.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const PAGE_SIZE = 14;

// ─── helpers ──────────────────────────────────────────────────────────────────

function createRl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
}

function question(rl, prompt, defaultValue = '') {
  const suffix =
    defaultValue !== '' && defaultValue !== undefined
      ? ` ${DIM}[${defaultValue}]${RESET}`
      : '';
  return new Promise((resolve) => {
    rl.question(`${prompt}${suffix}: `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed === '' ? defaultValue : trimmed);
    });
  });
}

function uniqueCategories(skills) {
  const set = new Set();
  for (const s of skills) {
    if (s.category) set.add(s.category);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Parse selection tokens: "1", "1,3,5", "2-6", "a" (all page), "u" (none page).
 * Numbers are 1-based absolute indices into the *filtered* list.
 */
export function parseSelectionTokens(input, { pageStart = 0, pageLen = 0, total = 0 } = {}) {
  const raw = String(input || '').trim();
  if (!raw) return { absolute: [], pageAll: false, pageNone: false };

  if (raw === 'a' || raw === 'all') return { absolute: [], pageAll: true, pageNone: false };
  if (raw === 'u' || raw === 'none') return { absolute: [], pageAll: false, pageNone: true };

  const absolute = [];
  const parts = raw.split(/[,\s]+/).filter(Boolean);
  for (const p of parts) {
    const range = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let lo = parseInt(range[1], 10);
      let hi = parseInt(range[2], 10);
      if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
      if (lo > hi) [lo, hi] = [hi, lo];
      for (let n = lo; n <= hi; n++) {
        if (n >= 1 && n <= total) absolute.push(n - 1);
      }
      continue;
    }
    // relative page index if single digit and small? Always treat as absolute 1-based.
    const n = parseInt(p, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= total) absolute.push(n - 1);
  }
  return { absolute, pageAll: false, pageNone: false, pageStart, pageLen };
}

function filterSkills(skills, { query = '', packId = null, category = null, packs = {} } = {}) {
  let list = skills;
  if (packId && packs[packId]) {
    const set = new Set(packs[packId].skills || []);
    list = list.filter((s) => set.has(s.slug));
  }
  if (category) {
    const c = category.toLowerCase();
    list = list.filter((s) => String(s.category || '').toLowerCase().includes(c));
  }
  if (query) {
    list = searchSkills(list, query, { limit: Math.max(list.length, 500) });
  }
  return list;
}

function printBanner({ count, source, selectedCount }) {
  process.stdout.write(`
${CYAN}  ╔══════════════════════════════════════════════════════════════╗${RESET}
${CYAN}  ║${RESET}  ${BOLD}SKILL HUB PICKER${RESET}  ${DIM}· multi-select · sparse install only${RESET}   ${CYAN}║${RESET}
${CYAN}  ╚══════════════════════════════════════════════════════════════╝${RESET}
${DIM}  ${count} skills · source=${source} · selected=${selectedCount}${RESET}
${DIM}  Catalog stays remote. Only what you pick is downloaded.${RESET}
`);
}

function printHelp() {
  console.log(`
${BOLD}Commands${RESET}
  ${CYAN}n${RESET} / ${CYAN}p${RESET}           next / previous page
  ${CYAN}1${RESET}, ${CYAN}3${RESET}, ${CYAN}5-8${RESET}       toggle skills by list number
  ${CYAN}a${RESET}               select all on this page
  ${CYAN}u${RESET}               unselect all on this page
  ${CYAN}/query${RESET}          filter by search term  ${DIM}(e.g. /vulcan)${RESET}
  ${CYAN}pack <id>${RESET}       filter to a curated pack
  ${CYAN}cat <name>${RESET}      filter by category
  ${CYAN}packs${RESET}           list curated packs
  ${CYAN}cats${RESET}            list categories
  ${CYAN}s${RESET} / ${CYAN}selected${RESET}    show current selection
  ${CYAN}c${RESET} / ${CYAN}clear${RESET}       clear selection
  ${CYAN}reset${RESET}           clear filters (show full catalog)
  ${CYAN}i${RESET} / ${CYAN}install${RESET}     sparse-install selected → ./.agents/skills
  ${CYAN}r${RESET} / ${CYAN}refs${RESET}        print skill refs + install command (no download)
  ${CYAN}attach <file>${RESET}   write skill refs onto an agent JSON (optional install)
  ${CYAN}?${RESET} / ${CYAN}help${RESET}        this help
  ${CYAN}q${RESET} / ${CYAN}quit${RESET}        exit (confirm if selection pending)

${BOLD}Why this exists${RESET}
  Skill Hub has ~595 playbooks. Installing them all bloats your agent.
  Pick only what you need — refs by default, sparse SKILL.md fetch on demand.
`);
}

function printPage(filtered, selected, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = page * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  console.log(
    `\n${BOLD}Skills${RESET} ${DIM}(page ${page + 1}/${totalPages}, ${filtered.length} match, ${selected.size} selected)${RESET}\n`
  );

  if (!slice.length) {
    console.log(`  ${YELLOW}(no skills match filters — type ${CYAN}reset${YELLOW})${RESET}`);
    return;
  }

  slice.forEach((skill, i) => {
    const abs = start + i + 1;
    const on = selected.has(skill.slug);
    const mark = on ? `${GREEN}[x]${RESET}` : `${DIM}[ ]${RESET}`;
    const cat = skill.category ? `${DIM}[${skill.category}]${RESET}` : '';
    const desc = String(skill.description || '')
      .replace(/\s+/g, ' ')
      .slice(0, 52);
    console.log(
      `  ${YELLOW}${String(abs).padStart(3)}${RESET}  ${mark}  ${GREEN}${skill.slug}${RESET}  ${cat}`
    );
    if (desc) console.log(`         ${DIM}${desc}${RESET}`);
  });

  console.log(
    `\n  ${DIM}n/p page · 1,3,5-8 toggle · /search · pack <id> · i install · r refs · ? help · q quit${RESET}`
  );
}

function printSelected(selected, bySlug) {
  if (!selected.size) {
    console.log(`\n${DIM}(nothing selected)${RESET}`);
    return;
  }
  console.log(`\n${BOLD}Selected (${selected.size})${RESET}`);
  for (const slug of selected) {
    const s = bySlug.get(slug);
    const cat = s?.category ? ` ${DIM}[${s.category}]${RESET}` : '';
    console.log(`  ${GREEN}•${RESET} ${slug}${cat}`);
  }
  console.log();
}

function printPacks(index) {
  console.log(`\n${BOLD}Curated packs${RESET} ${DIM}(local index — zero download)${RESET}\n`);
  for (const [id, pack] of Object.entries(index.packs || {})) {
    console.log(`  ${GREEN}${id}${RESET}  ${pack.label || ''}`);
    console.log(`    ${DIM}${pack.description || ''}${RESET}`);
    console.log(`    ${DIM}skills: ${(pack.skills || []).join(', ')}${RESET}`);
  }
  console.log(`\n${DIM}Featured:${RESET} ${(index.featured || []).join(', ')}\n`);
  console.log(`${DIM}Use: pack <id>  then  a  (select all on page) or install the pack id via CLI${RESET}\n`);
}

/**
 * Resolve selected slugs to skill objects (order preserved).
 */
function materializeSelection(selected, catalog, index) {
  const tokens = Array.from(selected);
  const { skills: picked, missing } = resolveSkillRefs(tokens, catalog, index);
  return { picked, missing };
}

// ─── main REPL ────────────────────────────────────────────────────────────────

/**
 * @param {object} [opts]
 * @param {string} [opts.root]
 * @param {string} [opts.targetDir]
 * @param {string} [opts.agentPath]  pre-seed attach path
 * @param {boolean} [opts.autoInstall] if true, install after pick when exiting with selection
 * @param {Set<string>|string[]} [opts.preselect]
 * @param {import('readline').Interface} [opts.rl] shared readline (design TUI)
 * @param {boolean} [opts.returnSelection] return {picked, installed} instead of process exit style
 * @returns {Promise<{picked: object[], installed: boolean, agent?: object} | number>}
 */
export async function runSkillsTui(opts = {}) {
  const root = opts.root || ROOT;
  const targetDir = opts.targetDir || DEFAULT_INSTALL_DIR;
  const ownRl = !opts.rl;
  const rl = opts.rl || createRl();

  try {
    console.log(`\n${DIM}Loading Skill Hub catalog…${RESET}`);
    const { skills: catalog, source, warning, index } = await loadSkillCatalog({
      root,
      forceRefresh: Boolean(opts.refresh),
    });
    if (warning) console.log(`${YELLOW}${warning}${RESET}`);

    const hubIndex = index || loadSkillHubIndex(root);
    const bySlug = new Map(catalog.map((s) => [s.slug, s]));
    const selected = new Set(
      Array.isArray(opts.preselect)
        ? opts.preselect
        : opts.preselect instanceof Set
          ? opts.preselect
          : []
    );

    let query = '';
    let packId = null;
    let category = null;
    let page = 0;

    printBanner({ count: catalog.length, source, selectedCount: selected.size });
    printHelp();

    const recompute = () =>
      filterSkills(catalog, {
        query,
        packId,
        category,
        packs: hubIndex.packs || {},
      });

    let filtered = recompute();
    printPage(filtered, selected, page, PAGE_SIZE);

    while (true) {
      const filterHint = [
        query && `/${query}`,
        packId && `pack:${packId}`,
        category && `cat:${category}`,
      ]
        .filter(Boolean)
        .join(' ');
      const prompt = filterHint
        ? `${CYAN}skills${RESET} ${DIM}[${filterHint}]${RESET}`
        : `${CYAN}skills${RESET}`;

      const ans = (await question(rl, prompt)).trim();
      if (!ans) {
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      const lower = ans.toLowerCase();

      // quit
      if (lower === 'q' || lower === 'quit' || lower === 'exit') {
        if (selected.size && opts.returnSelection) {
          const { picked, missing } = materializeSelection(selected, catalog, hubIndex);
          if (missing.length) {
            console.log(`${YELLOW}dropping unknown: ${missing.join(', ')}${RESET}`);
          }
          return {
            picked,
            installed: false,
            selected: Array.from(selected),
            index: hubIndex,
          };
        }
        if (selected.size && !opts.returnSelection) {
          const leave = (
            await question(
              rl,
              `${YELLOW}${selected.size} selected.${RESET} Install now (i), print refs (r), or quit without (q)?`,
              'r'
            )
          ).toLowerCase();
          if (leave === 'i' || leave === 'install') {
            const { picked } = materializeSelection(selected, catalog, hubIndex);
            await doInstall(picked, { root, targetDir });
            return opts.returnSelection
              ? { picked, installed: true, index: hubIndex }
              : 0;
          }
          if (leave === 'r' || leave === 'refs') {
            const { picked } = materializeSelection(selected, catalog, hubIndex);
            printRefs(picked, hubIndex);
            return opts.returnSelection
              ? { picked, installed: false, index: hubIndex }
              : 0;
          }
        }
        console.log(`${DIM}bye.${RESET}`);
        return opts.returnSelection ? { picked: [], installed: false, index: hubIndex } : 0;
      }

      if (lower === '?' || lower === 'help' || lower === 'h') {
        printHelp();
        continue;
      }

      if (lower === 'n' || lower === 'next') {
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        page = Math.min(totalPages - 1, page + 1);
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      if (lower === 'p' || lower === 'prev' || lower === 'previous') {
        page = Math.max(0, page - 1);
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      if (lower === 's' || lower === 'selected' || lower === 'sel') {
        printSelected(selected, bySlug);
        continue;
      }

      if (lower === 'c' || lower === 'clear') {
        selected.clear();
        console.log(`${DIM}selection cleared${RESET}`);
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      if (lower === 'reset' || lower === 'all') {
        query = '';
        packId = null;
        category = null;
        page = 0;
        filtered = recompute();
        console.log(`${DIM}filters cleared · ${filtered.length} skills${RESET}`);
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      if (lower === 'packs') {
        printPacks(hubIndex);
        continue;
      }

      if (lower === 'cats' || lower === 'categories') {
        const cats = uniqueCategories(catalog);
        console.log(`\n${BOLD}Categories (${cats.length})${RESET}`);
        console.log(cats.map((c) => `  ${CYAN}${c}${RESET}`).join('\n') || `  ${DIM}(none)${RESET}`);
        console.log(`\n${DIM}Use: cat <name>${RESET}\n`);
        continue;
      }

      // /search
      if (ans.startsWith('/')) {
        query = ans.slice(1).trim();
        page = 0;
        filtered = recompute();
        console.log(
          query
            ? `${DIM}filter /${query} → ${filtered.length} match(es)${RESET}`
            : `${DIM}search cleared${RESET}`
        );
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      // pack <id>
      if (lower.startsWith('pack ') || lower.startsWith('pack:')) {
        const id = ans.replace(/^pack[:\s]+/i, '').trim();
        if (!id) {
          printPacks(hubIndex);
          continue;
        }
        if (!hubIndex.packs?.[id]) {
          console.log(
            `${RED}unknown pack:${RESET} ${id}\n${DIM}known: ${Object.keys(hubIndex.packs || {}).join(', ')}${RESET}`
          );
          continue;
        }
        packId = id;
        page = 0;
        filtered = recompute();
        // also pre-select pack members for convenience
        for (const slug of hubIndex.packs[id].skills || []) {
          selected.add(slug);
        }
        console.log(
          `${GREEN}pack ${id}${RESET} · ${filtered.length} listed · pack skills selected`
        );
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      // cat <name>
      if (lower.startsWith('cat ') || lower.startsWith('category ')) {
        category = ans.replace(/^(cat|category)\s+/i, '').trim();
        page = 0;
        filtered = recompute();
        console.log(`${DIM}category "${category}" → ${filtered.length} match(es)${RESET}`);
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      // install
      if (lower === 'i' || lower === 'install') {
        if (!selected.size) {
          console.log(`${YELLOW}select skills first (numbers / pack <id>)${RESET}`);
          continue;
        }
        const { picked, missing } = materializeSelection(selected, catalog, hubIndex);
        if (missing.length) console.log(`${YELLOW}unknown skipped: ${missing.join(', ')}${RESET}`);
        await doInstall(picked, { root, targetDir });
        if (opts.returnSelection) {
          return { picked, installed: true, index: hubIndex };
        }
        continue;
      }

      // refs only
      if (lower === 'r' || lower === 'refs' || lower === 'ref') {
        if (!selected.size) {
          console.log(`${YELLOW}select skills first${RESET}`);
          continue;
        }
        const { picked } = materializeSelection(selected, catalog, hubIndex);
        printRefs(picked, hubIndex);
        if (opts.returnSelection) {
          return { picked, installed: false, index: hubIndex };
        }
        continue;
      }

      // attach <file>
      if (lower.startsWith('attach ')) {
        const agentPath = path.resolve(ans.slice('attach '.length).trim());
        if (!selected.size) {
          console.log(`${YELLOW}select skills first${RESET}`);
          continue;
        }
        if (!fs.existsSync(agentPath)) {
          console.log(`${RED}file not found:${RESET} ${agentPath}`);
          continue;
        }
        let agent;
        try {
          agent = JSON.parse(fs.readFileSync(agentPath, 'utf8'));
        } catch {
          console.log(`${RED}invalid JSON:${RESET} ${agentPath}`);
          continue;
        }
        const { picked } = materializeSelection(selected, catalog, hubIndex);
        const next = attachSkillsToAgent(agent, picked, hubIndex);
        fs.writeFileSync(agentPath, JSON.stringify(next, null, 2) + '\n');
        console.log(`${GREEN}✓ attached ${picked.length} skill ref(s)${RESET} → ${agentPath}`);

        const also = (
          await question(
            rl,
            `${CYAN}also sparse-install these skills?${RESET} ${DIM}(y/N)${RESET}`,
            'n'
          )
        ).toLowerCase();
        if (also === 'y' || also === 'yes') {
          await doInstall(picked, { root, targetDir });
        } else {
          console.log(
            `${DIM}later: ct-agents skills install ${picked.map((s) => s.slug).join(' ')}${RESET}`
          );
        }
        if (opts.returnSelection) {
          return { picked, installed: also === 'y' || also === 'yes', agent: next, index: hubIndex };
        }
        continue;
      }

      // page all / page none / number toggles
      if (
        lower === 'a' ||
        lower === 'u' ||
        lower === 'none' ||
        /^[\d,\s-]+$/.test(ans)
      ) {
        const start = page * PAGE_SIZE;
        const pageLen = Math.min(PAGE_SIZE, Math.max(0, filtered.length - start));
        const { absolute, pageAll, pageNone } = parseSelectionTokens(ans, {
          pageStart: start,
          pageLen,
          total: filtered.length,
        });

        if (pageAll) {
          for (let i = 0; i < pageLen; i++) {
            const s = filtered[start + i];
            if (s) selected.add(s.slug);
          }
          console.log(`${GREEN}+ page selected${RESET} · total ${selected.size}`);
        } else if (pageNone) {
          for (let i = 0; i < pageLen; i++) {
            const s = filtered[start + i];
            if (s) selected.delete(s.slug);
          }
          console.log(`${DIM}− page unselected${RESET} · total ${selected.size}`);
        } else {
          for (const idx of absolute) {
            const s = filtered[idx];
            if (!s) continue;
            if (selected.has(s.slug)) selected.delete(s.slug);
            else selected.add(s.slug);
          }
          console.log(`${DIM}toggled · selected=${selected.size}${RESET}`);
        }
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      // bare pack id shortcut
      if (hubIndex.packs?.[ans]) {
        packId = ans;
        page = 0;
        for (const slug of hubIndex.packs[ans].skills || []) selected.add(slug);
        filtered = recompute();
        console.log(`${GREEN}pack ${ans}${RESET} applied`);
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      // slug toggle if exact / unique fuzzy
      const { skills: hits } = resolveSkillRefs([ans], catalog, hubIndex);
      if (hits.length === 1 && !hits[0].unresolved) {
        const slug = hits[0].slug;
        if (selected.has(slug)) {
          selected.delete(slug);
          console.log(`${DIM}− ${slug}${RESET}`);
        } else {
          selected.add(slug);
          console.log(`${GREEN}+ ${slug}${RESET}`);
        }
        printPage(filtered, selected, page, PAGE_SIZE);
        continue;
      }

      console.log(
        `${YELLOW}unknown command:${RESET} ${ans}  ${DIM}(? for help, /term to search)${RESET}`
      );
    }
  } finally {
    if (ownRl) rl.close();
  }
}

async function doInstall(picked, { root, targetDir }) {
  if (!picked.length) {
    console.log(`${YELLOW}nothing to install${RESET}`);
    return;
  }
  console.log(`${CYAN}Sparse-install ${picked.length} skill(s) → ${targetDir}${RESET}`);
  const { results } = await installSkillsSparse(picked, {
    root,
    targetDir,
    force: false,
  });
  for (const r of results) {
    if (r.status === 'error') console.log(`  ${RED}✗${RESET} ${r.slug}: ${r.error}`);
    else console.log(`  ${GREEN}✓${RESET} ${r.slug} (${r.status}) ${DIM}${r.path || ''}${RESET}`);
  }
  const failed = results.filter((r) => r.status === 'error').length;
  if (failed) {
    console.log(
      `${YELLOW}${failed} failed — try: ct-agents skills install ${picked.map((s) => s.slug).join(' ')} --via-skillhub-cli${RESET}`
    );
  } else {
    console.log(
      `${GREEN}✓ done${RESET} ${DIM}— only these skills were fetched (hub body stays remote)${RESET}`
    );
  }
}

function printRefs(picked, index) {
  const refs = skillRefsForAgent(picked, index);
  console.log(`\n${BOLD}Skill refs${RESET} ${DIM}(no files downloaded)${RESET}\n`);
  console.log(JSON.stringify(refs, null, 2));
  console.log(
    `\n${DIM}install later:${RESET} ${CYAN}ct-agents skills install ${picked.map((s) => s.slug).join(' ')}${RESET}\n`
  );
}

/**
 * Design-TUI entry: multi-select picker that returns an agent with skills attached.
 */
export async function pickSkillsForAgent(rl, agent, { root = ROOT } = {}) {
  const attach = (
    await question(
      rl,
      `${CYAN}open Skill Hub picker?${RESET} ${DIM}(Y/n — multi-select, sparse install only)${RESET}`,
      'y'
    )
  ).toLowerCase();
  if (attach === 'n' || attach === 'no') return agent;

  const result = await runSkillsTui({
    root,
    rl,
    returnSelection: true,
    preselect: Array.isArray(agent.skills)
      ? agent.skills.map((s) => s.slug || s.name).filter(Boolean)
      : [],
  });

  if (!result?.picked?.length) {
    console.log(`${DIM}no skills attached${RESET}`);
    return agent;
  }

  const index = result.index || loadSkillHubIndex(root);
  let next = attachSkillsToAgent(agent, result.picked, index);
  console.log(
    `${GREEN}selected${RESET} ${result.picked.map((s) => s.slug).join(', ')} ${DIM}(refs${result.installed ? ' + installed' : ' only'})${RESET}`
  );

  if (!result.installed) {
    const doInstallNow = (
      await question(
        rl,
        `${CYAN}download only these skills now?${RESET} ${DIM}(y/N → ./.agents/skills)${RESET}`,
        'n'
      )
    ).toLowerCase();
    if (doInstallNow === 'y' || doInstallNow === 'yes') {
      await doInstall(result.picked, { root, targetDir: DEFAULT_INSTALL_DIR });
    } else {
      console.log(
        `${DIM}later: ct-agents skills install ${result.picked.map((s) => s.slug).join(' ')}${RESET}`
      );
    }
  }

  return next;
}

export default runSkillsTui;
