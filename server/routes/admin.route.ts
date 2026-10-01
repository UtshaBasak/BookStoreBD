import express, { type Request, type Response } from 'express';

import type { AdminMessageResponse, AudienceCount, MessageAudience } from '@shared/api.js';

import User from '../models/user.model.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate, validatedQuery } from '../middleware/validate.js';
import { adminSchemas, type AdminMessageBody, type AudienceQuery } from '../schemas/index.js';
import { notify } from '../utils/notify.js';
import { adminMessageEmail, sendShopMailNow } from '../utils/shopMail.js';
import { recordAudit } from '../utils/audit.js';
import { createLogger } from '../config/logger.js';

/**
 * The administrator's messages: a notification, an e-mail or both, to chosen
 * people or to every buyer, every seller or everyone.
 *
 * "Seller" and "buyer" mean what they mean in User Management: a seller has
 * a bKash merchant number to be paid at, and a buyer does not. Administrators
 * are never among the recipients.
 */

const log = createLogger('admin');
const router = express.Router();

router.use(requireAuth, requireAdmin);

/** Who a message to this audience reaches, by e-mail address. */
const recipientsFor = async (audience: MessageAudience, emails: readonly string[] = []): Promise<string[]> => {
  const filter: Record<string, unknown> = {
    role: 'user',
    ...(audience === 'sellers' ? { bkashMerchant: { $nin: [null, ''] } } : {}),
    ...(audience === 'buyers' ? { bkashMerchant: { $in: [null, ''] } } : {}),
    ...(audience === 'users' ? { email: { $in: emails.map(String) } } : {}),
  };
  return (await User.find(filter, { email: 1 }).lean()).map((user) => user.email);
};

/** How many a message would reach, shown before it is sent. */
router.get('/message/audience', validate(adminSchemas.audience), async (req: Request, res: Response, next) => {
  try {
    const { audience } = validatedQuery<AudienceQuery>(req);
    const body: AudienceCount = { audience, recipients: (await recipientsFor(audience)).length };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

/** E-mails in small batches, so a large audience does not open a hundred connections. */
const BATCH = 4;

router.post('/message', validate(adminSchemas.message), async (req: Request, res: Response, next) => {
  try {
    const { channel, audience, emails, title, body, link } = req.body as AdminMessageBody;
    const recipients = await recipientsFor(audience, emails);
    if (!recipients.length) {
      res.status(400).json({ message: 'Nobody matches that audience.' });
      return;
    }

    let notified = 0;
    if (channel !== 'email') {
      await notify(recipients, { type: 'announcement', title, body, link: link || '' });
      notified = recipients.length;
    }

    let emailed = 0;
    let failed = 0;
    if (channel !== 'notification') {
      const mail = adminMessageEmail(title, body, link || null);
      for (let i = 0; i < recipients.length; i += BATCH) {
        const sent = await Promise.all(recipients.slice(i, i + BATCH).map((to) => sendShopMailNow(to, mail)));
        emailed += sent.filter(Boolean).length;
        failed += sent.filter((ok) => !ok).length;
      }
    }

    await recordAudit(req, {
      action: 'admin.message',
      targetType: 'users',
      targetId: audience,
      details: { channel, recipients: recipients.length, notified, emailed, failed, title },
    });
    log.info({ channel, audience, recipients: recipients.length, emailed, failed }, 'Admin message sent');

    const parts = [
      notified ? `${notified} notified` : '',
      emailed ? `${emailed} e-mailed` : '',
      failed ? `${failed} e-mails could not be sent` : '',
    ].filter(Boolean);
    const response: AdminMessageResponse = {
      message: `Sent to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}: ${parts.join(', ') || 'nothing was sent'}.`,
      recipients: recipients.length,
      notified,
      emailed,
      failed,
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
