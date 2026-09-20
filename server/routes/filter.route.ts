import express from 'express'
import {Booklist, Booklist_filter, Booklist_search} from '../controllers/filter.controller.js';
import { validate } from '../middleware/validate.js';
import { filterSchemas } from '../schemas/index.js';
const router = express.Router();

router.get("/booklist",Booklist);
router.post("/booklist_filter", validate(filterSchemas.filter), Booklist_filter);
router.post("/booklist_search", validate(filterSchemas.search), Booklist_search);

export default router;
