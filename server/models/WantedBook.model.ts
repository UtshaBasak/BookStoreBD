import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/** One person asking for the book. */
const RequesterSchema = new Schema(
  {
    email: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * A book somebody wants that nobody has listed yet, on the Wanted board.
 *
 * One entry per book, however many ask: a second request for the same book
 * joins the first (utils/wanted.ts decides what "the same" is). When a
 * matching listing appears, everyone on the entry is told and it is marked
 * found.
 */
const WantedBookSchema = new Schema(
  {
    title: { type: String, required: true },
    author: { type: String, default: '' },
    /** As digits, ISBN-13, so an ISBN-10 and its ISBN-13 are one book. */
    isbn: { type: String, default: '' },
    /** Edition, language or anything else that matters, from whoever asked first. */
    details: { type: String, default: '' },
    /** Sound-alike keys, so Bangla and English spellings of one title match. */
    titleKey: { type: String, required: true, index: true },
    authorKey: { type: String, default: '' },
    requesters: { type: [RequesterSchema], default: [] },
    requesterCount: { type: Number, default: 0 },
    status: { type: String, enum: ['open', 'found'] as const, default: 'open' },
    foundBook: { type: Schema.Types.ObjectId, ref: 'AddBook', default: null },
    foundAt: { type: Date, default: null },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

WantedBookSchema.index({ status: 1, requesterCount: -1, createdAt: -1 });
WantedBookSchema.index({ isbn: 1 });
WantedBookSchema.index({ 'requesters.email': 1 });

export type WantedBookAttributes = InferSchemaType<typeof WantedBookSchema>;
export type WantedBookDocument = HydratedDocument<WantedBookAttributes>;

export default defineModel<WantedBookAttributes>('WantedBook', WantedBookSchema);
