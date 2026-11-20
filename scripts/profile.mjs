#!/usr/bin/env node
// The personal profile (spec 5.7): ~/.keelwright/profile.json (KEELWRIGHT_HOME overrides the
// folder). Never in the repository; never an email address.
//
//   node profile.mjs show [--json]                      the profile, the role's tag and doctor order
//   node profile.mjs set [--name "…"] [--role <role>] [--jira <KEY>] [--confluence <SPACE>] [--language <lang>]
//   node profile.mjs skip                               asked once and declined: not asked again
//   node profile.mjs split <file>… [--role <role>] [--json]   the working set among these files
//
// Roles: developer, project-manager, business-analyst, account-manager.

import * as P from './lib/profile.mjs';

const argv = process.argv.slice(2);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i === -1 ? undefined : argv[i + 1];
};
const VALUE = new Set(['--name', '--role', '--jira', '--confluence', '--language']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUE.has(argv[i - 1]));
const [cmd, ...rest] = positional;
const json = argv.includes('--json');

try {
  switch (cmd) {
    case 'show': {
      const s = P.summary();
      if (json) console.log(JSON.stringify(s, null, 2));
      else if (!s.asked) console.log(`No profile yet (${s.path}). Set one with \`set --name … --role …\`.`);
      else console.log(`${s.name ?? '(no name)'} · ${s.role ?? 'no role'}${Object.keys(s.defaults).length ? ` · ${Object.entries(s.defaults).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''} (${s.path})`);
      break;
    }
    case 'set': {
      const defaults = Object.fromEntries([['jiraProject', opt('--jira')], ['confluenceSpace', opt('--confluence')], ['language', opt('--language')]].filter(([, v]) => v !== undefined));
      const patch = { defaults };
      if (opt('--name') !== undefined) patch.name = opt('--name');
      if (opt('--role') !== undefined) patch.role = opt('--role');
      const p = P.save(patch);
      console.log(json ? JSON.stringify(p, null, 2) : `Saved: ${p.name ?? '(no name)'} · ${p.role ?? 'no role'} (${P.profilePath()})`);
      break;
    }
    case 'skip': {
      P.save({});
      console.log('Not asked again; `/keelwright:profile` sets one any time.');
      break;
    }
    case 'split': {
      const role = opt('--role') ?? P.load()?.role ?? null;
      const s = P.workingSet(role, rest);
      console.log(json ? JSON.stringify({ role, ...s }, null, 2) : `Working set (${role ?? 'no role: everything'}):\n${s.mine.map((f) => `  ${f}`).join('\n') || '  —'}\nOthers:\n${s.others.map((f) => `  ${f}`).join('\n') || '  —'}`);
      break;
    }
    default:
      console.log('usage: profile.mjs show|set|skip|split — see the header of scripts/profile.mjs');
      process.exitCode = cmd ? 1 : 0;
  }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
