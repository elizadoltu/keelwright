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

describe('other ecosystems', async () => {
  const { comparePy, normalizeTag, pickPypiVersion, satisfiesPy } = await import('../scripts/lib/versions.mjs');

  test('PEP 440 subset', () => {
    assert.ok(comparePy('3.10.0', '3.9.9') > 0);
    assert.equal(comparePy('2.12', '2.12.0'), 0);
    assert.equal(satisfiesPy('3.15.2', '>=3.10'), true);
    assert.equal(satisfiesPy('3.9.1', '>=3.10'), false);
    assert.equal(satisfiesPy('3.15.2', '>=3.9,<3.15'), false);
    assert.equal(satisfiesPy('3.12.4', '==3.12.*'), true);
    assert.equal(satisfiesPy('3.13.0', '!=3.13.*'), false);
    assert.equal(satisfiesPy('1.4.7', '~=1.4.2'), true);
    assert.equal(satisfiesPy('1.5.0', '~=1.4.2'), false);
    assert.equal(satisfiesPy('3.12.0', '>=3.8; python_version'), null);
  });

  test('PyPI: highest final release, skipping prereleases and yanked ones; ranges hold back', () => {
    const file = (extra = {}) => [{ requires_python: '>=3.10', yanked: false, ...extra }];
    const project = { releases: { '1.9.0': file(), '2.0.0': file(), '2.1.0rc1': file(), '2.0.1': file({ yanked: true }), '1.10.0': file(), '0.1': [] } };
    assert.equal(pickPypiVersion(project), '2.0.0');
    assert.equal(pickPypiVersion(project, '<2'), '1.10.0');
  });

  test('release tags', () => {
    assert.equal(normalizeTag('4.7.2-stable'), '4.7.2');
    assert.equal(normalizeTag('4.5-stable'), '4.5.0');
    assert.equal(normalizeTag('v8.30.1'), '8.30.1');
  });

  test('specs', () => {
    assert.deepEqual(parseSpec('pypi:fastapi@<1'), { source: 'pypi', name: 'fastapi', range: '<1' });
    assert.deepEqual(parseSpec('crates:clap'), { source: 'crates', name: 'clap', range: null });
    assert.deepEqual(parseSpec('pub:go_router@^17.0.0'), { source: 'pub', name: 'go_router', range: '^17.0.0' });
    assert.deepEqual(parseSpec('python'), { source: 'python', name: 'python', range: null });
    assert.throws(() => parseSpec('pub:Go-Router'), /invalid pub package name/);
  });

  test('resolves runtimes and packages, and checks their runtime requirements', async () => {
    const responses = {
      'https://www.python.org/api/v2/downloads/release/?is_published=true&pre_release=false&version=3': [
        { name: 'Python 3.15.2', is_published: true, pre_release: false },
        { name: 'Python 3.13.11', is_published: true, pre_release: false },
      ],
      'https://pypi.org/pypi/old-lib/json': { info: { version: '1.0.0' }, releases: { '1.0.0': [{ requires_python: '>=3.8,<3.13', yanked: false }] } },
      'https://pypi.org/pypi/ruff/json': { info: { version: '0.17.5' }, releases: { '0.17.5': [{ requires_python: '>=3.7', yanked: false }] } },
      'https://storage.googleapis.com/flutter_infra_release/releases/releases_macos.json': {
        current_release: { stable: 'abc' },
        releases: [{ hash: 'abc', channel: 'stable', version: '3.50.0', dart_sdk_version: '3.14.0' }],
      },
      'https://pub.dev/api/packages/go_router': { latest: { version: '18.1.4', pubspec: { environment: { sdk: '^3.15.0' } } } },
      'https://api.github.com/repos/rust-lang/rust/releases/latest': { tag_name: '1.100.0' },
      'https://crates.io/api/v1/crates/clap': { crate: { max_stable_version: '4.6.8' }, versions: [{ num: '4.6.8', rust_version: '1.85', yanked: false }] },
    };
    const fetchJson = async (url) => {
      if (!(url in responses)) throw new Error(`unexpected ${url}`);
      return responses[url];
    };
    const r = await resolveAll(['python', 'pypi:old-lib', 'pypi:ruff', 'flutter', 'pub:go_router', 'rust', 'crates:clap'], { fetchJson });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(Object.fromEntries(r.packages.map((p) => [p.name, p.version])), { python: '3.15.2', 'old-lib': '1.0.0', ruff: '0.17.5', flutter: '3.50.0', go_router: '18.1.4', rust: '1.100.0', clap: '4.6.8' });
    const status = Object.fromEntries(r.peers.map((p) => [`${p.package} → ${p.peer}`, p.status]));
    assert.deepEqual(status, { 'old-lib → python (requires)': 'conflict', 'ruff → python (requires)': 'ok', 'go_router → dart (requires)': 'conflict', 'clap → rust (requires)': 'ok' });
  });
});

test('Godot: highest stable 4.x tag, not the newest 3.x maintenance release; Unity: newest LTS', async () => {
  const fetchJson = async (url) =>
    url.includes('godot')
      ? [{ tag_name: '3.6.3-stable', prerelease: false }, { tag_name: '4.7.2-stable', prerelease: false }, { tag_name: '4.7-stable', prerelease: false }]
      : { results: [{ version: '6000.0.85f2' }, { version: '6000.3.28f1' }] };
  const r = await resolveAll(['godot', 'unity'], { fetchJson });
  assert.deepEqual(r.packages.map((p) => [p.name, p.version]), [['godot', '4.7.2'], ['unity', '6000.3.28f1']]);
});
