import type { NotificationItem, NotificationType } from '@shared/api.js';

import Notification from '../models/Notification.model.js';
import User from '../models/user.model.js';
import { createLogger } from '../config/logger.js';
import { deliverToUser } from '../sockets/chatSocket.js';
import { categoryOf, recipientsWanting } from './notificationPrefs.js';

const log = createLogger('notify');

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/**
 * Tells these people about something: stored for the bell, and pushed live to
 * any page they have open.
 *
 * Never throws. A notification is a courtesy on top of something that has
 * already happened - an order placed, a status changed - and failing to send
 * one must not turn that into an error for the person who did it. The actor is
 * left out: nobody needs telling what they just did themselves.
 */
export const notify = async (
  recipients: readonly (string | null | undefined)[],
  input: NotificationInput,
  { except }: { except?: string | null } = {}
): Promise<void> => {
  const named = [...new Set(recipients.filter((email): email is string => Boolean(email)))].filter(
    (email) => email !== except
  );
  if (!named.length) return;

  try {
    // Less whoever has turned this kind of notification off.
    const people = await recipientsWanting(named, categoryOf(input.type), 'inApp');
    if (!people.length) return;
    const saved = await Notification.insertMany(
      people.map((recipient) => ({
        recipient,
        type: input.type,
        title: input.title,
        body: input.body ?? '',
        link: input.link ?? '',
      }))
    );
    for (const doc of saved) {
      deliverToUser(doc.recipient, 'notification', toWire(doc));
    }
  } catch (error) {
    log.warn({ err: error, type: input.type }, 'Could not send a notification');
  }
};

/** Every administrator's address, for what needs one of them to act. */
export const adminEmails = async (): Promise<string[]> =>
  (await User.find({ role: 'admin' }, { email: 1 }).lean()).map((user) => user.email);

/** A stored notification as the API sends it. */
export const toWire = (doc: {
  _id: unknown;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read?: boolean | null;
  createdAt?: Date | null;
}): NotificationItem => ({
  _id: String(doc._id),
  type: doc.type as NotificationType,
  title: doc.title,
  body: doc.body ?? '',
  link: doc.link ?? '',
  read: Boolean(doc.read),
  createdAt: (doc.createdAt ?? new Date()).toISOString(),
});
