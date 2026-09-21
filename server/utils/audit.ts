import type { Request } from 'express';

import AuditLog from '../models/AuditLog.model.js';
import { actingUser } from '../middleware/auth.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('audit');

export interface AuditEntry {
  /** What happened, as a stable identifier: `user.delete`, `order.status`. */
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

/**
 * Records a privileged change.
 *
 * Awaited by its callers, and failure is logged rather than thrown: by the time
 * this runs the change has already happened, so raising here would report a
 * failure for something that succeeded. A dropped row is still a hole in the
 * trail, which is why it is logged at error level and not swallowed silently.
 */
export const recordAudit = async (req: Request, entry: AuditEntry): Promise<void> => {
  try {
    const actor = actingUser(req);
    await AuditLog.create({
      action: entry.action,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: entry.targetType,
      targetId: entry.targetId,
      details: entry.details,
      // `req.id` is typed as string | number by pino-http.
      requestId: req.id === undefined ? undefined : String(req.id),
    });
  } catch (error) {
    log.error({ err: error, action: entry.action }, 'Could not write the audit trail');
  }
};

export default recordAudit;
