import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cssValue, namespace, tokensToCss } from '../scripts/lib/tokens.mjs';

const srgb = (hex) => ({ colorSpace: 'srgb', components: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), hex });

describe('tokens to Tailwind theme', () => {
  const tokens = {
    color: {
      $type: 'color',
      light: { surface: { $value: srgb('#ffffff') }, primary: { $value: srgb('#4338ca') }, 'primary-foreground': { $value: '{color.light.surface}' } },
      dark: { surface: { $value: srgb('#0b1020') }, primary: { $value: srgb('#a5b4fc') } },
    },
    font: { $type: 'fontFamily', display: { $value: ['Bricolage Grotesque', 'system-ui', 'sans-serif'] }, bold: { $type: 'fontWeight', $value: 700 } },
    size: { $type: 'dimension', base: { $value: { value: 1, unit: 'rem' } } },
    'line-height': { $type: 'number', body: { $value: 1.5 } },
    space: { $type: 'dimension', md: { $value: { value: 16, unit: 'px' } } },
    radius: { $type: 'dimension', md: { $value: { value: 8, unit: 'px' } } },
    duration: { $type: 'duration', fast: { $value: { value: 150, unit: 'ms' } } },
    easing: { $type: 'cubicBezier', standard: { $value: [0.2, 0, 0, 1] } },
  };

  test('maps every group to Tailwind namespaces, with dark overrides', () => {
    assert.equal(
      tokensToCss(tokens),
      [
        '/* Generated from design/tokens.json by KeelWright — do not edit; change the tokens and regenerate. */',
        '',
        '@theme {',
        '  --color-surface: #ffffff;',
        '  --color-primary: #4338ca;',
        '  --color-primary-foreground: #ffffff;',
        '  --font-display: "Bricolage Grotesque", system-ui, sans-serif;',
        '  --font-weight-bold: 700;',
        '  --text-base: 1rem;',
        '  --leading-body: 1.5;',
        '  --spacing-md: 16px;',
        '  --radius-md: 8px;',
        '  --ease-standard: cubic-bezier(0.2, 0, 0, 1);',
        '}',
        '',
        ':root {',
        '  --duration-fast: 150ms;',
        '}',
        '',
        '@media (prefers-color-scheme: dark) {',
        '  :root {',
        '    --color-surface: #0b1020;',
        '    --color-primary: #a5b4fc;',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  test('colour values without hex, with alpha, in other colour spaces', () => {
    assert.equal(cssValue('color', { colorSpace: 'srgb', components: [1, 0, 0] }), '#ff0000');
    assert.equal(cssValue('color', { colorSpace: 'srgb', components: [1, 0, 0], alpha: 0.5 }), 'rgb(255 0 0 / 0.5)');
    assert.equal(cssValue('color', { colorSpace: 'oklch', components: [0.7, 0.1, 200] }), 'color(oklch 0.7 0.1 200)');
  });

  test('unknown groups are plain custom properties', () => {
    assert.equal(namespace('dimension', 'gutter'), null);
    assert.equal(namespace('dimension', 'radius'), 'radius');
  });

  test('broken references fail loudly', () => {
    assert.throws(() => tokensToCss({ color: { $type: 'color', light: { a: { $value: '{color.light.zz}' } } } }), /doesn't resolve/);
  });
});

describe('nested groups', () => {
  test('font.family.* and font.weight.* map to --font-* and --font-weight-*', () => {
    const css = tokensToCss({
      font: {
        family: { $type: 'fontFamily', display: { $value: 'Inter' } },
        weight: { $type: 'fontWeight', bold: { $value: 700 } },
        size: { $type: 'dimension', lg: { $value: { value: 1.25, unit: 'rem' } } },
      },
    });
    assert.match(css, /--font-display: Inter;/);
    assert.match(css, /--font-weight-bold: 700;/);
    assert.match(css, /@theme \{[^}]*--text-lg: 1.25rem;/);
  });
});

describe('tokens to TypeScript and Dart', async () => {
  const { tokensToTs, tokensToDart, themeFor } = await import('../scripts/lib/tokens.mjs');
  const tokens = {
    color: { $type: 'color', light: { primary: { $value: srgb('#4338ca') }, 'on-primary': { $value: '{color.light.surface}' }, surface: { $value: srgb('#ffffff') } } },
    font: { family: { $type: 'fontFamily', body: { $value: ['Inter', 'system-ui'] } }, weight: { $type: 'fontWeight', bold: { $value: 700 } } },
    space: { $type: 'dimension', md: { $value: { value: 1, unit: 'rem' } }, half: { $value: { value: 0.25, unit: 'rem' } } },
    duration: { $type: 'duration', fast: { $value: { value: 0.15, unit: 's' } } },
    easing: { $type: 'cubicBezier', standard: { $value: [0.2, 0, 0, 1] } },
  };

  test('TypeScript: a nested object with resolved, unit-free values', () => {
    const ts = tokensToTs(tokens);
    assert.match(ts, /^\/\* Generated from design\/tokens.json by KeelWright/);
    const obj = JSON.parse(/export const tokens = ([\s\S]*) as const;/.exec(ts)[1]);
    assert.deepEqual(obj.color.light, { primary: '#4338ca', 'on-primary': '#ffffff', surface: '#ffffff' });
    assert.deepEqual(obj.font, { family: { body: 'Inter' }, weight: { bold: '700' } });
    assert.deepEqual(obj.space, { md: 16, half: 4 });
    assert.equal(obj.duration.fast, 150);
    assert.deepEqual(obj.easing.standard, [0.2, 0, 0, 1]);
  });

  test('Dart: one typed constant per token', () => {
    const dart = tokensToDart(tokens);
    for (const line of [
      "import 'package:flutter/widgets.dart';",
      'abstract final class Tokens {',
      '  static const colorLightPrimary = Color(0xFF4338CA);',
      '  static const colorLightOnPrimary = Color(0xFFFFFFFF);',
      "  static const fontFamilyBody = 'Inter';",
      '  static const fontWeightBold = FontWeight.w700;',
      '  static const spaceMd = 16.0;',
      '  static const spaceHalf = 4.0;',
      '  static const durationFast = Duration(milliseconds: 150);',
      '  static const easingStandard = Cubic(0.2, 0, 0, 1);',
    ]) assert.ok(dart.includes(line), `missing: ${line}\n${dart}`);
  });

  test('the output file picks the target', () => {
    assert.equal(themeFor('src/styles/tokens.css'), tokensToCss);
    assert.equal(themeFor('src/theme/tokens.ts'), tokensToTs);
    assert.equal(themeFor('lib/theme/tokens.dart'), tokensToDart);
    assert.equal(themeFor('tokens.scss'), null);
  });
});
