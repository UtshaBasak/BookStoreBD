/**
 * Compile-time checks that the request types the client is written against are
 * ones the server will actually accept.
 *
 * The schemas in `schemas/` are the single source of truth for what an endpoint
 * takes; `shared/api.d.ts` is what the browser compiles against. Nothing at run
 * time connects the two, so this file does it at build time instead: if a
 * schema tightens and the shared type is not updated to match, the server stops
 * type-checking and CI fails.
 *
 * The direction is deliberate. Each check asks "is everything the client may
 * send something the schema accepts?", not "are these identical" - a schema is
 * allowed to be more permissive than the client, for instance by accepting a
 * numeric string where the client always sends a number.
 *
 * There is nothing to run here: declarations only, and the file is excluded
 * from the build.
 */
import type { z } from 'zod';

import type {
  CreateOrderRequest,
  CreatePurchaseRequest,
  CreateReturnRequest,
  DeleteConversationRequest,
  CatalogueParams,
  MarkReadRequest,
  ResetPasswordRequest,
  SendChatRequest,
  SendOtpRequest,
  SignInRequest,
  SignUpRequest,
  UpdateOrderStatusRequest,
  UpdatePriceRequest,
  UpdateProfileRequest,
  UpdateReturnStatusRequest,
  UpdateStockRequest,
  VerifyOtpRequest,
} from '@shared/api.js';

import {
  authSchemas,
  bookSchemas,
  chatSchemas,
  filterSchemas,
  orderSchemas,
  purchaseSchemas,
  returnSchemas,
  userSchemas,
} from '../schemas/index.js';

/** Fails to compile unless the argument is exactly `true`. */
type Expect<T extends true> = T;

/**
 * True when a body the client may send is one the schema accepts.
 *
 * `z.input` rather than `z.infer`: what a caller sends is the schema's input,
 * before trimming, coercion and defaults have been applied.
 */
type Accepts<TSchema extends z.ZodType, TBody> = TBody extends z.input<TSchema> ? true : false;

export type ContractChecks = [
  // ------------------------------------------------------------------ auth
  Expect<Accepts<typeof authSchemas.signup.body, SignUpRequest>>,
  Expect<Accepts<typeof authSchemas.signin.body, SignInRequest>>,
  Expect<Accepts<typeof authSchemas.sendOtp.body, SendOtpRequest>>,
  Expect<Accepts<typeof authSchemas.verifyOtp.body, VerifyOtpRequest>>,
  Expect<Accepts<typeof authSchemas.resetPassword.body, ResetPasswordRequest>>,

  // ------------------------------------------------------------------ book
  Expect<Accepts<typeof bookSchemas.updateStock.body, UpdateStockRequest>>,
  Expect<Accepts<typeof bookSchemas.updatePrice.body, UpdatePriceRequest>>,

  // ---------------------------------------------------------------- filter
  // A query string carries strings, so the schema coerces; what is checked
  // here is that every field the client may send is one the schema accepts.
  Expect<Accepts<typeof filterSchemas.catalogue.query, CatalogueParams>>,

  // ----------------------------------------------------------------- order
  Expect<Accepts<typeof orderSchemas.create.body, CreateOrderRequest>>,
  Expect<Accepts<typeof orderSchemas.updateStatus.body, UpdateOrderStatusRequest>>,

  // -------------------------------------------------------------- purchase
  Expect<Accepts<typeof purchaseSchemas.create.body, CreatePurchaseRequest>>,

  // ---------------------------------------------------------------- return
  Expect<Accepts<typeof returnSchemas.create.body, CreateReturnRequest>>,
  Expect<Accepts<typeof returnSchemas.updateStatus.body, UpdateReturnStatusRequest>>,

  // ------------------------------------------------------------------ chat
  Expect<Accepts<typeof chatSchemas.send.body, SendChatRequest>>,
  Expect<Accepts<typeof chatSchemas.markRead.body, MarkReadRequest>>,
  Expect<Accepts<typeof chatSchemas.remove.body, DeleteConversationRequest>>,

  // ------------------------------------------------------------------ user
  Expect<Accepts<typeof userSchemas.updateProfile.body, UpdateProfileRequest>>,
];
