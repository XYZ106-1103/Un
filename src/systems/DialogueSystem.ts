/**
 * Dialogue script interpreter.
 *
 * Scripts (src/data/dialogues/*.json) are lists of nodes: lines, choices, branches,
 * jumps, flag changes and commands. This runner walks them and delegates everything
 * observable to a host (DialogueUI + WorldScene/BattleScene), so the same script can
 * drive an NPC chat, a cutscene, or a battle intro, and can be tested without Phaser.
 */

import { evaluateCondition, type Resolver } from './script/Condition';
import type { CommandNode, FlagValue, ScriptBody, ScriptNode } from './content/types';

export interface SayPage {
  text: string;
  who?: string;
  face?: string;
  speed?: number;
  /** Index of the page within its node (0-based) and total pages. */
  page: number;
  pages: number;
}

export interface DialogueHost {
  say(page: SayPage): Promise<void>;
  /** Resolves with the index into `options`. */
  choose(options: string[]): Promise<number>;
  command(command: CommandNode): Promise<void>;
  setFlags(changes: Record<string, FlagValue>): void;
  resolver(): Resolver;
}

export type RunResult = 'completed' | 'ended' | 'aborted';

/** Guards against scripts that jump in a loop forever. */
const MAX_STEPS = 5000;

class Jump {
  constructor(readonly target: string) {}
}
class End {}
class Abort {}

export class DialogueRunner {
  private steps = 0;
  private aborted = false;

  constructor(
    private readonly lookup: (id: string) => ScriptNode[] | undefined,
    private readonly host: DialogueHost,
  ) {}

  /** Stops at the next node boundary (e.g. the scene is shutting down). */
  abort(): void {
    this.aborted = true;
  }

  async run(scriptId: string): Promise<RunResult> {
    let current: string | null = scriptId;
    this.steps = 0;
    try {
      while (current !== null) {
        const nodes = this.lookup(current);
        if (!nodes) {
          console.error(`[Dialogue] unknown script "${current}"`);
          return 'completed';
        }
        current = null;
        try {
          await this.runNodes(nodes);
        } catch (signal) {
          if (signal instanceof Jump) current = signal.target;
          else throw signal;
        }
      }
      return 'completed';
    } catch (signal) {
      if (signal instanceof End) return 'ended';
      if (signal instanceof Abort) return 'aborted';
      throw signal;
    }
  }

  private async runBody(body: ScriptBody | undefined): Promise<void> {
    if (body === undefined) return;
    if (typeof body === 'string') {
      const nodes = this.lookup(body);
      if (!nodes) {
        console.error(`[Dialogue] unknown script "${body}"`);
        return;
      }
      await this.runNodes(nodes);
    } else {
      await this.runNodes(body);
    }
  }

  private async runNodes(nodes: ScriptNode[]): Promise<void> {
    for (const node of nodes) {
      if (this.aborted) throw new Abort();
      if (++this.steps > MAX_STEPS) {
        console.error('[Dialogue] step limit reached; stopping script');
        throw new End();
      }
      await this.runNode(node);
    }
  }

  private async runNode(node: ScriptNode): Promise<void> {
    const host = this.host;
    // Commands first: CommandNode's index signature would otherwise defeat narrowing.
    if ('do' in node) {
      if (node.do === 'end') throw new End();
      await host.command(node);
      return;
    }
    if ('say' in node) {
      const pages = Array.isArray(node.say) ? node.say : [node.say];
      for (let i = 0; i < pages.length; i++) {
        if (this.aborted) throw new Abort();
        const page: SayPage = { text: pages[i] as string, page: i, pages: pages.length };
        if (node.who !== undefined) page.who = node.who;
        if (node.face !== undefined) page.face = node.face;
        if (node.speed !== undefined) page.speed = node.speed;
        await host.say(page);
      }
    } else if ('choice' in node) {
      const resolve = host.resolver();
      const options = node.choice.filter((o) => evaluateCondition(o.if, resolve));
      if (options.length === 0) return;
      const picked = options[await host.choose(options.map((o) => o.text))];
      if (!picked) return;
      if (picked.set) host.setFlags(picked.set);
      await this.runBody(picked.then);
    } else if ('if' in node) {
      const pass = evaluateCondition(node.if, host.resolver());
      await this.runBody(pass ? node.then : node.else);
    } else if ('goto' in node) {
      throw new Jump(node.goto);
    } else if ('call' in node) {
      await this.runBody(node.call);
    } else if ('set' in node) {
      host.setFlags(node.set);
    }
  }
}
