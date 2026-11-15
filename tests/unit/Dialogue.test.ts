import { describe, expect, it } from 'vitest';
import type { CommandNode, FlagValue, ScriptNode } from '@/systems/content/types';
import { DialogueRunner, type DialogueHost, type SayPage } from '@/systems/DialogueSystem';

function host(choices: number[] = []) {
  const flags: Record<string, FlagValue> = {};
  const log: string[] = [];
  const h: DialogueHost = {
    async say(p: SayPage) {
      log.push(`${p.who ?? '-'}:${p.text}`);
    },
    async choose(options: string[]) {
      log.push(`choose[${options.join('|')}]`);
      return choices.shift() ?? 0;
    },
    async command(c: CommandNode) {
      log.push(`do:${c.do}`);
    },
    setFlags(changes) {
      for (const [k, v] of Object.entries(changes)) flags[k] = typeof v === 'string' && v.startsWith('+') ? Number(flags[k] ?? 0) + Number(v) : v;
    },
    resolver: () => (key: string) => (key.startsWith('flag:') ? flags[key.slice(5)] : undefined),
  };
  return { h, flags, log };
}

const scripts: Record<string, ScriptNode[]> = {
  main: [
    { say: ['첫 장', '둘째 장'], who: 'ledger' },
    { if: '!flag:met', then: [{ say: '처음 뵙네요.' }, { set: { met: true } }], else: [{ say: '또 오셨군요.' }] },
    { choice: [{ text: '응', then: 'yes' }, { text: '비밀', if: 'flag:secret', then: 'yes' }, { text: '아니', set: { refused: '+1' } }] },
    { do: 'sfx', id: 'ui-move' },
    { say: '끝.' },
  ],
  yes: [{ say: '좋아요.' }],
  jumper: [{ say: 'A' }, { goto: 'landing' }, { say: 'never' }],
  landing: [{ say: 'B' }],
  ender: [{ say: 'X' }, { do: 'end' }, { say: 'never' }],
  loop: [{ goto: 'loop' }],
};
const lookup = (id: string) => scripts[id];

describe('DialogueRunner', () => {
  it('runs pages, branches, choices (filtered by condition) and commands', async () => {
    const { h, flags, log } = host([1]);
    expect(await new DialogueRunner(lookup, h).run('main')).toBe('completed');
    expect(log).toEqual(['ledger:첫 장', 'ledger:둘째 장', '-:처음 뵙네요.', 'choose[응|아니]', 'do:sfx', '-:끝.']);
    expect(flags).toEqual({ met: true, refused: 1 });

    const second = host([0]);
    second.flags.met = true;
    await new DialogueRunner(lookup, second.h).run('main');
    expect(second.log).toContain('-:또 오셨군요.');
    expect(second.log).toContain('-:좋아요.');
  });

  it('goto replaces the rest of the script; end stops everything', async () => {
    const a = host();
    await new DialogueRunner(lookup, a.h).run('jumper');
    expect(a.log).toEqual(['-:A', '-:B']);
    const b = host();
    expect(await new DialogueRunner(lookup, b.h).run('ender')).toBe('ended');
    expect(b.log).toEqual(['-:X']);
  });

  it('survives infinite loops and unknown scripts', async () => {
    const err = await import('vitest').then(({ vi }) => vi.spyOn(console, 'error').mockImplementation(() => {}));
    expect(await new DialogueRunner(lookup, host().h).run('loop')).toBe('ended');
    expect(await new DialogueRunner(lookup, host().h).run('missing')).toBe('completed');
    err.mockRestore();
  });

  it('abort stops at the next node', async () => {
    const { h, log } = host();
    const runner = new DialogueRunner(lookup, {
      ...h,
      async say(p) {
        log.push(p.text);
        runner.abort();
      },
    });
    expect(await runner.run('main')).toBe('aborted');
    expect(log).toEqual(['첫 장']);
  });
});
