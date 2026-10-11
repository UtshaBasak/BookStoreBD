import express from 'express';

import type { NotificationPage } from '@shared/api.js';

import Notification from '../models/Notification.model.js';
import { actingUser, requireAuth } from '../middleware/auth.js';
import { validate, validatedQuery } from '../middleware/validate.js';
import { notificationSchemas, type IdParams, type MarkNotificationsBody, type NotificationListQuery } from '../schemas/index.js';
import { toWire } from '../utils/notify.js';

const router = express.Router();

// A person's own notifications, and nobody else's.
router.use(requireAuth);

/** A page of the caller's notifications, newest first, and how many are unread. */
router.get('/', validate(notificationSchemas.list), async (req, res, next) => {
  try {
    const { email } = actingUser(req);
    const { page, pageSize, unreadOnly } = validatedQuery<NotificationListQuery>(req);
    const filter = { recipient: email, ...(unreadOnly ? { read: false } : {}) };

    const [items, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: email, read: false }),
    ]);

    const body: NotificationPage = {
      items: items.map(toWire),
      unread,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
});

/**
 * One of the caller's notifications. The Android app asks for it when a push
 * arrives, since the push itself carries only the id.
 */
router.get('/:id', validate(notificationSchemas.byId), async (req, res, next) => {
  try {
    const { email } = actingUser(req);
    const { id } = req.params as unknown as IdParams;
    const doc = await Notification.findOne({ _id: id, recipient: email }).lean();
    if (!doc) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }
    res.json(toWire(doc));
  } catch (error) {
    next(error);
  }
});

/** Marks some of the caller's notifications read, or all of them. */
router.post('/read', validate(notificationSchemas.markRead), async (req, res, next) => {
  try {
    const { email } = actingUser(req);
    const { ids } = req.body as MarkNotificationsBody;
    const { modifiedCount } = await Notification.updateMany(
      { recipient: email, read: false, ...(ids?.length ? { _id: { $in: ids } } : {}) },
      { $set: { read: true } }
    );
    res.json({ message: 'Marked as read', updated: modifiedCount });
  } catch (error) {
    next(error);
  }
});

export default router;
