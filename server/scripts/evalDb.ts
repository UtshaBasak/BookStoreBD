/**
 * What the live evaluation scripts share: the safety checks, and a scratch
 * database that is not the one the site uses.
 *
 * The scripts connect to the MongoDB the environment names (MONGO) - in
 * practice a development database - but never write to it. Everything is
 * seeded into a database called `<name>_eval` on the same server, and that
 * database, and only a database whose name ends in `_eval`, is dropped when
 * the run is over.
 */
import mongoose from 'mongoose';

import { config, mongoUri } from '../config/env.js';

export interface EvalArgs {
  yes: boolean;
  write: boolean;
  paceMs: number | null;
  /** Run only the cases whose id starts with this, to spend less of the quota. */
  only: string | null;
}

export const parseEvalArgs = (argv: string[]): EvalArgs => {
  const pace = argv.find((arg) => arg.startsWith('--pace='));
  const only = argv.find((arg) => arg.startsWith('--only='));
  const paceMs = pace ? Number(pace.slice('--pace='.length)) : null;
  if (paceMs !== null && (!Number.isFinite(paceMs) || paceMs < 0)) throw new Error('--pace needs a number of milliseconds, such as --pace=6500');
  return { yes: argv.includes('--yes'), write: argv.includes('--write'), paceMs, only: only ? only.slice('--only='.length) : null };
};

/** The server in a connection string, with no credentials, for the warning. */
const hostOf = (uri: string): string => {
  try {
    return new URL(uri).host || '(unknown host)';
  } catch {
    return '(unreadable connection string)';
  }
};

/** The database name in the connection string, or a default. */
const databaseOf = (uri: string): string => {
  try {
    const name = new URL(uri).pathname.replace(/^\//, '');
    return name || 'bookstore';
  } catch {
    return 'bookstore';
  }
};

/** Exits with a message unless the run is plainly allowed. */
export const assertMayRun = (args: EvalArgs, what: string): void => {
  const problems: string[] = [];
  if (config.env === 'production' || process.env.NODE_ENV === 'production') problems.push('NODE_ENV is production: this never runs against production.');
  if (!args.yes) problems.push('Pass --yes to confirm.');
  if (!process.env.GEMINI_API_KEY?.trim()) problems.push('GEMINI_API_KEY is not set: there is nothing to evaluate live.');
  if (!config.mongoUri) problems.push('MONGO is not set.');
  if (problems.length) {
    console.error(`${what}\n\nNot running:\n${problems.map((line) => `  - ${line}`).join('\n')}\n`);
    process.exit(1);
  }
};

export interface ScratchDatabase {
  name: string;
  drop: () => Promise<void>;
}

/** Connects to `<db>_eval` on the configured server, which this run owns and drops. */
export const openScratchDatabase = async (): Promise<ScratchDatabase> => {
  const uri = mongoUri();
  const base = databaseOf(uri);
  const name = `${base}_eval`;
  console.warn(
    [
      '',
      '  WARNING: this connects to the MongoDB server named by MONGO and uses the real GEMINI_API_KEY.',
      `  Server:   ${hostOf(uri)}`,
      `  Database: ${name} (created for this run and dropped afterwards; ${base} is not touched)`,
      '',
    ].join('\n')
  );
  await mongoose.connect(uri, { dbName: name });
  if (mongoose.connection.name !== name || !name.endsWith('_eval') || name === base) {
    await mongoose.disconnect();
    throw new Error(`Connected to "${mongoose.connection.name}", not the scratch database "${name}". Refusing to continue.`);
  }
  // Start empty, whatever a crashed earlier run left.
  await mongoose.connection.dropDatabase();
  return {
    name,
    drop: async () => {
      // The one place a database is dropped, and only ever the scratch one.
      if (mongoose.connection.name === name && name.endsWith('_eval')) await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    },
  };
};
