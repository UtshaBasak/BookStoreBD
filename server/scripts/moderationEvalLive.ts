/**
 * Measures automatic moderation against the labelled set: the rule layer
 * (free, local) and the model layer, which here calls the REAL Gemini model.
 *
 *   npm run eval:moderation:live -- --yes
 *   npm run eval:moderation:live -- --yes --pace=8000 --write
 *
 * Only public text goes to the model - the reviews and listings in
 * server/eval/moderationCases.ts, which are invented for this - never chat,
 * and never anything from the database. One request per item (~70), spaced
 * `--pace` ms apart (default 6500, under 10 a minute).
 *
 * The rules need rows to look at (duplicates, bursts, shared photos), so it
 * seeds them into a separate `<db>_eval` database on the MONGO server and
 * drops that afterwards. Refuses to run without --yes, or when NODE_ENV is
 * production.
 *
 *   --yes        confirm (required)
 *   --pace=ms    milliseconds between Gemini requests
 *   --write      also save the tables to docs/eval/moderation-live-<date>.md
 */
import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';

import { geminiSettings } from '../config/env.js';
import { DEFAULT_PACE_MS } from '../eval/liveTransport.js';
import { runModelLayer, runRuleLayer } from '../eval/runModerationEval.js';
import { assertMayRun, openScratchDatabase, parseEvalArgs, pickCases } from './evalDb.js';
import { MODERATION_CASES } from '../eval/moderationCases.js';

const run = async (): Promise<void> => {
  const args = parseEvalArgs(process.argv.slice(2));
  assertMayRun(args, 'Live evaluation of automatic moderation (real Gemini calls, public text only).');
  const paceMs = args.paceMs ?? DEFAULT_PACE_MS;
  const settings = geminiSettings();
  console.log(`Moderation model: ${settings.moderationModel}. One request every ${paceMs} ms or slower.`);

  const scratch = await openScratchDatabase();
  try {
    const rules = await runRuleLayer();
    const cases = pickCases(MODERATION_CASES, args.only);
    if (!cases.length) throw new Error(`No case id starts with "${args.only}".`);
    const model = await runModelLayer({ mode: 'live', paceMs, cases, onProgress: (line) => console.log(line) });
    const date = new Date().toISOString().slice(0, 10);
    const document = [
      `# Automatic moderation, live evaluation, ${date}`,
      '',
      `Model: ${settings.moderationModel}. Real Gemini responses for ${model.items} invented public-text items, paced at ${paceMs} ms. Chat is rules only and never sent.`,
      args.only ? `Model layer: only cases starting with "${args.only}". The rule layer always runs in full.` : 'All cases.',
      '',
      '## Rule layer',
      '',
      rules.markdown,
      '',
      '## Model layer',
      '',
      model.markdown,
      '',
    ].join('\n');
    console.log(`\n${document}`);
    if (args.write) {
      const dir = fileURLToPath(new URL('../../docs/eval/', import.meta.url));
      await mkdir(dir, { recursive: true });
      const file = `${dir}moderation-live-${date}.md`;
      await writeFile(file, document, 'utf8');
      console.log(`Wrote ${file}`);
    }
  } finally {
    await scratch.drop();
  }
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
