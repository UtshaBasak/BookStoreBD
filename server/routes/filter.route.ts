import express from 'express';

import { Booklist, Featured } from '../controllers/filter.controller.js';
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
router.get('/featured', validate(filterSchemas.featured), Featured);

export default router;
