import {
  Classification,
  type HealthStatus,
  type Protocol,
  type TriageLevel,
} from '@fieldlink/contract';
import type { LlmEngine } from './engine.ts';
import { lexiconHits } from './lexicon.ts';
import { dedupeTags } from './tags.ts';

const WARMUP_TEXT = 'victim unresponsive, not breathing';

export class ScriptedEngine implements LlmEngine {
  private ready = false;
  private loadMs = 0;
  private warmMs = 0;

  health(): HealthStatus {
    return {
      status: this.ready ? 'ready' : 'loading',
      model: 'scripted',
      load_ms: this.loadMs,
      warm_ms: this.warmMs,
      engine: 'scripted',
    };
  }

  async warmup(): Promise<void> {
    const start = performance.now();
    this.loadMs = 1;
    await this.classify(WARMUP_TEXT);
    this.warmMs = Math.max(1, Math.round(performance.now() - start));
    this.ready = true;
  }

  async classify(text: string): Promise<Classification> {
    const hemorrhage = lexiconHits(text, 'massive_hemorrhage').length;
    const drowning = lexiconHits(text, 'cpr_drowning').length;

    let protocol: Protocol = 'out_of_scope';
    let triage_level: TriageLevel = 'Unknown';
    let condition_tags: string[] = [];

    if (hemorrhage > drowning && hemorrhage > 0) {
      protocol = 'massive_hemorrhage';
      triage_level = 'Immediate';
      condition_tags = ['arterial_bleed'];
      if (/thigh|leg|arm|limb/i.test(text)) condition_tags.push('extremity_wound');
      if (/conscious|awake|talking/i.test(text)) condition_tags.push('conscious');
    } else if (drowning > 0) {
      protocol = 'cpr_drowning';
      triage_level = 'Immediate';
      condition_tags = [];
      if (/unresponsive|unconscious/i.test(text)) condition_tags.push('unresponsive');
      if (/not breathing|no breath/i.test(text)) condition_tags.push('not_breathing');
      if (/pulse|no pulse/i.test(text)) condition_tags.push('no_pulse');
      if (/water|drown|immersion|pulled from/i.test(text)) {
        condition_tags.push('water_immersion');
      }
    }

    return Classification.parse({
      protocol,
      triage_level,
      condition_tags: dedupeTags(condition_tags),
    });
  }
}
