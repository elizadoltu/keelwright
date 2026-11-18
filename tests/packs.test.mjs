import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter, plan, resolvedMajor, saveToCache, validatePack } from '../scripts/lib/packs.mjs';

const dirs = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'keelwright-packs-'));
  dirs.push(d);
  return d;
};
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const SECTIONS = ['Summary', 'Project structure', 'Naming', 'Testing', 'Linting and formatting', 'Security', 'Performance pitfalls', 'CI/CD and release', 'Conventions', 'Version notes'];

function pack({ id = 'astro', major = 7, researchedAt = '2026-11-01', rules, sources } = {}) {
  const prefix = id.toUpperCase().replace(/-/g, '');
  return [
    '---',
    `id: ${id}`,
    'name: Astro',
    'packages: [astro, "@astrojs/*"]',
    `major: ${major}`,
    `researchedAt: ${researchedAt}`,
    'status: draft',
    '---',
    '',
    `# Stack pack: Astro ${major}`,
    '',
    ...SECTIONS.flatMap((s) => [`## ${s}`, '', 'Text.', '']),
    '## Rules',
    '',
    '| ID | Rule | Enforce with | Sources |',
    '|---|---|---|---|',
    ...(rules ?? [`| ${prefix}-01 | Pages live in src/pages. | review | S1 |`]),
    '',
    '## Sources',
    '',
    '| ID | Kind | Title | URL |',
    '|---|---|---|---|',
    ...(sources ?? ['| S1 | official | Project structure | https://docs.astro.build/en/basics/project-structure/ |']),
    '',
  ].join('\n');
}

describe('pack validation', () => {
  test('a complete pack passes', () => {
    assert.deepEqual(validatePack(pack()), []);
  });

  test('front matter is parsed with lists and numbers', () => {
    assert.deepEqual(parseFrontMatter(pack()), { id: 'astro', name: 'Astro', packages: ['astro', '@astrojs/*'], major: 7, researchedAt: '2026-11-01', status: 'draft' });
  });

  test('rules need valid IDs, enforcement and non-community sources', () => {
    const issues = validatePack(
      pack({
        rules: ['| AST-1 | x | maybe | S1 |', '| ASTRO-02 | y | lint: eslint | S9 |', '| ASTRO-03 | z | review | S2 |', '| ASTRO-04 | w | ci | |'],
        sources: ['| S1 | official | Docs | https://docs.astro.build |', '| S2 | community | Blog | https://blog.example |'],
      }),
    );
    assert.deepEqual(issues, [
      'rule "AST-1": id must be ASTRO-NN',
      'rule AST-1: "Enforce with" must start with one of lint, format, types, hook, ci, test, config, review',
      'rule ASTRO-02: cites unknown source S9',
      'rule ASTRO-03: relies on community sources only',
      'rule ASTRO-04: cites no source',
    ]);
  });

  test('sources need an official one, known kinds and https links', () => {
    const issues = validatePack(pack({ sources: ['| S1 | blog | Post | http://x.dev |'] }));
    assert.ok(issues.includes('source S1: kind must be one of official, maintainer, reference-project, community'));
    assert.ok(issues.includes('source S1: url must be an https link'));
    assert.ok(issues.includes('no official source'));
  });

  test('missing sections are reported, and the template is not a valid pack', () => {
    assert.ok(validatePack(pack().replace('## Security', '## Safety')).includes('missing section "## Security"'));
    const template = readFileSync(new URL('../templates/stack-pack.md', import.meta.url), 'utf8');
    assert.ok(validatePack(template).length > 0);
  });
});

describe('plan: reuse or research', () => {
  let plugin;
  let home;
  before(() => {
    plugin = temp();
    home = temp();
    process.env.KEELWRIGHT_HOME = home;
    mkdirSync(join(plugin, 'stack-packs'), { recursive: true });
    writeFileSync(join(plugin, 'stack-packs', 'astro.md'), pack({ researchedAt: '2026-10-01' }));
    writeFileSync(join(plugin, 'stack-packs', 'vitest.md'), pack({ id: 'vitest', researchedAt: '2026-01-01' }).replace('packages: [astro, "@astrojs/*"]', 'packages: [vitest]'));
  });
  after(() => delete process.env.KEELWRIGHT_HOME);
  const NOW = '2026-11-16T00:00:00Z';

  test('fresh, matching packs are reused; old, missing and other majors are researched', () => {
    const p = plan(['astro', 'vitest', 'tailwind'], { astro: '7.4.12', vitest: '5.1.0' }, { pluginRoot: plugin, now: NOW });
    assert.deepEqual(p.map((x) => [x.id, x.action, x.reason]), [
      ['astro', 'reuse', '46 days old, major 7 matches'],
      ['vitest', 'research', 'researched for major 7, project resolves 5'],
      ['tailwind', 'research', 'no pack yet'],
    ]);
  });

  test('age limit and --refresh', () => {
    assert.equal(plan(['astro'], {}, { pluginRoot: plugin, now: '2027-03-01T00:00:00Z' })[0].reason, '151 days old (limit 90)');
    assert.equal(plan(['astro'], { astro: '7.0.0' }, { pluginRoot: plugin, now: NOW, refresh: true })[0].action, 'research');
  });

  test('a newer pack in the user cache wins over the shipped one', () => {
    mkdirSync(join(home, 'stack-packs'), { recursive: true });
    writeFileSync(join(home, 'stack-packs', 'astro.md'), pack({ researchedAt: '2026-11-10' }));
    const [p] = plan(['astro'], { astro: '7.4.12' }, { pluginRoot: plugin, now: NOW });
    assert.equal(p.location, 'user');
    assert.equal(p.researchedAt, '2026-11-10');
  });

  test('an older major in use gets the cached pack for that major, not the newest', () => {
    mkdirSync(join(home, 'stack-packs'), { recursive: true });
    writeFileSync(join(home, 'stack-packs', 'astro@6.md'), pack({ major: 6, researchedAt: '2026-11-01' }));
    const [old] = plan(['astro'], { astro: '6.2.0' }, { pluginRoot: plugin, now: NOW });
    assert.deepEqual([old.action, old.major, old.reason], ['reuse', 6, '15 days old, major 6 matches']);
    const [cur] = plan(['astro'], { astro: '7.4.12' }, { pluginRoot: plugin, now: NOW });
    assert.equal(cur.major, 7);
    rmSync(join(home, 'stack-packs', 'astro@6.md'));
  });

  test('the primary package decides the major, globs allowed', () => {
    const meta = { packages: ['@astrojs/*'] };
    assert.equal(resolvedMajor({ meta }, { astro: '7.4.12', '@astrojs/mdx': '8.1.6' }), 8);
    assert.equal(resolvedMajor({ meta: { packages: ['react'] } }, {}), null);
  });

  test('only valid packs are saved to the user cache', () => {
    const dir = temp();
    writeFileSync(join(dir, 'bad.md'), '# nope');
    assert.throws(() => saveToCache(join(dir, 'bad.md')), /not saved/);
    writeFileSync(join(dir, 'astro.md'), pack());
    const legacy = join(home, 'stack-packs', 'astro.md');
    assert.ok(existsSync(legacy));
    const saved = saveToCache(join(dir, 'astro.md'));
    assert.equal(basename(saved), 'astro@7.md');
    assert.ok(!existsSync(legacy), 'the legacy file for the same major is replaced');
    writeFileSync(join(dir, 'astro6.md'), pack({ major: 6 }));
    saveToCache(join(dir, 'astro6.md'));
    assert.ok(existsSync(join(home, 'stack-packs', 'astro@7.md')), 'another major is kept');
    assert.ok(existsSync(join(home, 'stack-packs', 'astro@6.md')));
  });
});

describe('packs CLI', () => {
  test('install copies the chosen pack into the project', () => {
    const home = temp();
    const project = temp();
    mkdirSync(join(home, 'stack-packs'), { recursive: true });
    writeFileSync(join(home, 'stack-packs', 'astro.md'), pack());
    const cli = fileURLToPath(new URL('../scripts/packs.mjs', import.meta.url));
    const out = execFileSync('node', [cli, 'install', 'astro', '--root', project], { encoding: 'utf8', env: { ...process.env, KEELWRIGHT_HOME: home } });
    assert.match(out, /Installed .*\.keelwright\/stack-packs\/astro\.md/);
    assert.ok(existsSync(join(project, '.keelwright/stack-packs/astro.md')));
  });
});

describe('pack length', () => {
  test('packs over 3,000 words fail', () => {
    const long = pack().replace('## Summary\n\nText.', `## Summary\n\n${'word '.repeat(3100)}`);
    assert.ok(validatePack(long).some((i) => /over the 3000-word limit/.test(i)));
  });
});
