import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkPeers, isStable, parseSpec, pickNpmVersion, resolveAll, satisfies } from '../scripts/lib/versions.mjs';

describe('satisfies', () => {
  const cases = [
    ['1.2.3', '^1.0.0', true],
    ['2.0.0', '^1.0.0', false],
    ['0.2.5', '^0.2.1', true],
    ['0.3.0', '^0.2.1', false],
    ['0.0.4', '^0.0.3', false],
    ['1.9.0', '^1', true],
    ['1.2.9', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['1.9.0', '~1', true],
    ['5.0.0', '>=4.0.0', true],
    ['3.9.9', '>=4', false],
    ['1.3.0', '>1.2', true],
    ['1.2.9', '>1.2', false],
    ['1.2.9', '<=1.2', true],
    ['1.3.0', '<=1.2', false],
    ['4.0.0', '>=3 <5', true],
    ['5.0.0', '>=3 <5', false],
    ['19.1.0', '^18.0.0 || ^19.0.0', true],
    ['17.0.0', '^18.0.0 || ^19.0.0', false],
    ['1.5.0', '1.x', true],
    ['2.0.0', '1.x', false],
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '1.2.3', false],
    ['3.0.0', '*', true],
    ['2.5.0', '1.0.0 - 2.5.0', true],
    ['2.5.1', '1.0.0 - 2.5.0', false],
    ['5.0.0', '>=5.0.0-beta.1', true],
    ['4.9.9', '>=5.0.0-beta.1', false],
    ['22.17.1', '>= 20.19.0', true],
    ['22.17.1', '^20.19.0 || >=22.12.0', true],
    ['21.0.0', '^20.19.0 || >=22.12.0', false],
  ];
  for (const [version, range, expected] of cases) {
    test(`${version} ${expected ? 'satisfies' : 'does not satisfy'} ${range}`, () => {
      assert.equal(satisfies(version, range), expected);
    });
  }

  test('unknown syntax returns null', () => {
    assert.equal(satisfies('1.0.0', 'workspace:*'), null);
  });

  test('a known alternative still matches when another is unknown', () => {
    assert.equal(satisfies('1.0.0', 'workspace:* || ^1.0.0'), true);
  });
});

describe('specs and stable versions', () => {
  test('parses every spec form', () => {
    assert.deepEqual(parseSpec('node'), { source: 'node', name: 'node', range: null });
    assert.deepEqual(parseSpec('astro'), { source: 'npm', name: 'astro', range: null });
    assert.deepEqual(parseSpec('npm:@astrojs/mdx@^4'), { source: 'npm', name: '@astrojs/mdx', range: '^4' });
    assert.deepEqual(parseSpec('@types/node'), { source: 'npm', name: '@types/node', range: null });
    assert.deepEqual(parseSpec('github:gitleaks/gitleaks'), { source: 'github', name: 'gitleaks/gitleaks', range: null });
    assert.throws(() => parseSpec('github:nope'), /owner\/repo/);
  });

  test('prereleases are not stable', () => {
    assert.equal(isStable('7.4.12'), true);
    assert.equal(isStable('7.4.4-beta.0'), false);
    assert.equal(isStable('0.0.0-wasm-20220921185024'), false);
  });

  const packument = {
    'dist-tags': { latest: '3.1.0', beta: '4.0.0-beta.1' },
    versions: {
      '2.9.0': {},
      '3.0.0': {},
      '3.1.0': {},
      '3.2.0': { deprecated: 'broken' },
      '4.0.0-beta.1': {},
    },
  };

  test('takes the latest tag when it is stable', () => {
    assert.equal(pickNpmVersion(packument), '3.1.0');
  });

  test('a range picks the highest stable match', () => {
    assert.equal(pickNpmVersion(packument, '^2'), '2.9.0');
  });

  test('skips a prerelease latest tag and deprecated versions', () => {
    const p = { ...packument, 'dist-tags': { latest: '4.0.0-beta.1' } };
    assert.equal(pickNpmVersion(p), '3.1.0');
  });
});

describe('peer check', () => {
  const pkg = (name, version, peerDependencies = {}, extra = {}) => ({ name, version, peerDependencies, optionalPeers: [], ...extra });

  test('reports ok, conflict, missing and engines', () => {
    const results = checkPeers([
      pkg('node', '24.11.0'),
      pkg('react', '19.1.0'),
      pkg('plugin-a', '1.0.0', { react: '^19.0.0' }),
      pkg('plugin-b', '1.0.0', { react: '^18.0.0' }),
      pkg('plugin-c', '1.0.0', { vite: '^7' }),
      pkg('plugin-d', '1.0.0', { sass: '*' }, { optionalPeers: ['sass'] }),
      pkg('tool', '1.0.0', {}, { engines: { node: '>=26' } }),
    ]);
    const status = Object.fromEntries(results.map((r) => [`${r.package}>${r.peer}`, r.status]));
    assert.deepEqual(status, {
      'plugin-a>react': 'ok',
      'plugin-b>react': 'conflict',
      'plugin-c>vite': 'missing',
      'tool>node (engines)': 'conflict',
    });
  });
});

describe('resolveAll', () => {
  const responses = {
    'https://nodejs.org/dist/index.json': [
      { version: 'v27.0.0', lts: false },
      { version: 'v26.13.1', lts: 'Lithium' },
      { version: 'v24.11.0', lts: 'Krypton' },
    ],
    'https://registry.npmjs.org/astro': {
      'dist-tags': { latest: '7.4.12' },
      versions: { '7.4.12': { peerDependencies: { '@astrojs/markdown-remark': '^7.3.0' }, peerDependenciesMeta: { '@astrojs/markdown-remark': { optional: true } }, engines: { node: '>=22.12.0' } } },
    },
    'https://registry.npmjs.org/@astrojs%2Fmdx': {
      'dist-tags': { latest: '5.0.0' },
      versions: { '5.0.0': { peerDependencies: { astro: '^7.0.0' } } },
    },
    'https://api.github.com/repos/gitleaks/gitleaks/releases/latest': { tag_name: 'v8.30.0' },
    'https://api.github.com/repos/gitleaks/gitleaks/git/ref/tags/v8.30.0': { object: { type: 'tag', url: 'https://api.github.com/repos/gitleaks/gitleaks/git/tags/abc' } },
    'https://api.github.com/repos/gitleaks/gitleaks/git/tags/abc': { object: { sha: 'f'.repeat(40) } },
  };
  const fetchJson = async (url) => {
    if (!(url in responses)) throw new Error(`${url} → HTTP 404`);
    return structuredClone(responses[url]);
  };

  test('resolves a stack and checks it as a set', async () => {
    const r = await resolveAll(['node', 'astro', 'npm:@astrojs/mdx', 'github:gitleaks/gitleaks', 'nope'], {
      fetchJson,
      now: new Date('2026-11-16T12:00:00Z'),
    });
    assert.equal(r.resolvedAt, '2026-11-16');
    assert.deepEqual(r.packages.map((p) => `${p.name}@${p.version}`), ['node@26.13.1', 'astro@7.4.12', '@astrojs/mdx@5.0.0', 'gitleaks/gitleaks@8.30.0']);
    assert.equal(r.packages[0].lts, 'Lithium');
    assert.equal(r.packages[3].sha, 'f'.repeat(40), 'annotated tag resolved to its commit');
    assert.deepEqual(r.peers.map((p) => [p.package, p.peer, p.status]), [
      ['astro', 'node (engines)', 'ok'],
      ['@astrojs/mdx', 'astro', 'ok'],
    ]);
    assert.deepEqual(r.errors, [{ spec: 'nope', error: 'https://registry.npmjs.org/nope → HTTP 404' }]);
  });
});
