import pino from 'pino';

import { setSecurityLoggerForTesting, type SecurityAction } from '../../utils/securityLog.js';

/** One security event, as it is written. */
export interface SecurityLine {
  time: string;
  log_type: 'security';
  msg: string;
  event: { action: SecurityAction; category: string; outcome: string; severity: string; reason?: string };
  request_id?: string;
  source?: { ip: string };
  user_agent?: string;
  client: string;
  http?: { method: string; route: string };
  user?: { id?: string; email_hash?: string };
  extra?: Record<string, unknown>;
}

export interface SecurityCapture {
  /** Every line written so far, as written. */
  raw: string[];
  lines: () => SecurityLine[];
  of: (action: SecurityAction) => SecurityLine[];
  clear: () => void;
  stop: () => void;
}

/**
 * Sends the app's security events into an array for the rest of the file,
 * through a logger configured like the app's: JSON lines with an ISO time.
 */
export const captureSecurityEvents = (): SecurityCapture => {
  const raw: string[] = [];
  setSecurityLoggerForTesting(
    pino({ level: 'info', timestamp: pino.stdTimeFunctions.isoTime }, { write: (line: string) => void raw.push(line) })
  );
  const lines = () => raw.map((line) => JSON.parse(line) as SecurityLine);
  return {
    raw,
    lines,
    of: (action) => lines().filter((line) => line.event.action === action),
    clear: () => void raw.splice(0),
    stop: () => setSecurityLoggerForTesting(null),
  };
};
