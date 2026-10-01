import express from 'express';

import { Booklist, ByIds, Featured, ForYou, Sections, Suggest } from '../controllers/filter.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { filterSchemas } from '../schemas/index.js';

const router = express.Router();

/**
 * Both are GETs with their parameters in the query string, which is what they
 * always should have been: a search is a place you can link to, share and go
 * back to, and the browser and any cache in front of this can treat it as one.
 *
 * They replace a pair of POSTs that took `{ filter_key, filter_input }` - a
 * document path chosen by the caller, which needed a whitelist to stop it
 * becoming a query operator.
 */
router.get('/booklist', validate(filterSchemas.catalogue), Booklist);
// The search box's suggestions as somebody types: a few books and sellers.
router.get('/suggest', validate(filterSchemas.suggest), Suggest);
router.get('/featured', validate(filterSchemas.featured), Featured);

// The homepage's shelves, in one request.
router.get('/sections', Sections);
// A visitor's Recently viewed, kept in their browser.
router.get('/by-ids', validate(filterSchemas.byIds), ByIds);
// Top picks: personal when signed in, from what was viewed either way.
router.get('/for-you', optionalAuth, validate(filterSchemas.forYou), ForYou);

export default router;
