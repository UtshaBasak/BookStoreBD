/**
 * Runs the shopping assistant's labelled questions against the REAL Gemini
 * model, to measure how well it does - the offline evaluation (tests/
 * assistantEval.test.ts) only replays recordings.
 *
 *   npm run eval:assistant:live -- --yes
 *   npm run eval:assistant:live -- --yes --pace=8000 --only=pol --write
 *
 * It uses GEMINI_API_KEY and spends the free-tier quota: about one request
 * per tool call plus one for the answer, ~160 for the whole set, spaced
 * `--pace` ms apart (default 6500, under 10 a minute). Questions the engine
 * answers itself make no request and are not delayed.
 *
 * It connects to the MongoDB named by MONGO but seeds the fixtures into a
 * separate `<db>_eval` database and drops that afterwards. Refuses to run
 * without --yes, or when NODE_ENV is production.
 *
 *   --yes        confirm (required)
 *   --pace=ms    milliseconds between Gemini requests
 *   --only=id    only cases whose id starts with this (find, pol, ord, rec, oos, inj, han)
 *   --write      also save the table to docs/eval/assistant-live-<date>.md
 */
import { mkdir, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';

import { geminiSettings } from '../config/env.js';
import { ASSISTANT_CASES } from '../eval/assistantCases.js';
import { DEFAULT_PACE_MS } from '../eval/liveTransport.js';
import { runAssistantEval } from '../eval/runAssistantEval.js';
import { assertMayRun, openScratchDatabase, parseEvalArgs, pickCases } from './evalDb.js';

const run = async (): Promise<void> => {
  const args = parseEvalArgs(process.argv.slice(2));
  assertMayRun(args, 'Live evaluation of the shopping assistant (real Gemini calls).');
  const paceMs = args.paceMs ?? DEFAULT_PACE_MS;
  const cases = pickCases(ASSISTANT_CASES, args.only);
  if (!cases.length) throw new Error(`No case id starts with "${args.only}".`);

  const settings = geminiSettings();
  console.log(`Model: ${settings.model}. ${cases.length} cases, one request every ${paceMs} ms or slower.`);
  const scratch = await openScratchDatabase();
  try {
    const result = await runAssistantEval({ mode: 'live', paceMs, cases, onProgress: (line) => console.log(line) });
    const date = new Date().toISOString().slice(0, 10);
    const header = [
      `# Shopping assistant, live evaluation, ${date}`,
      '',
      `Model: ${settings.model}. Real Gemini responses, ${result.modelRequests} requests, paced at ${paceMs} ms.`,
      args.only ? `Only cases starting with "${args.only}".` : 'All cases.',
      'Fixture shop from server/eval/fixtures.ts, seeded into a scratch database.',
      '',
    ].join('\n');
    const document = `${header}\n${result.markdown}\n`;
    console.log(`\n${document}`);
    if (args.write) {
      const dir = fileURLToPath(new URL('../../docs/eval/', import.meta.url));
      await mkdir(dir, { recursive: true });
      const file = `${dir}assistant-live-${date}.md`;
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
