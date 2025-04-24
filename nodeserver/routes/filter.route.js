import express from 'express'
import {Booklist, Booklist_filter, Booklist_search} from '../controllers/filter.controller.js';
const router = express.Router();

router.get("/booklist",Booklist);
router.post("/booklist_filter",Booklist_filter);
router.post("/booklist_search",Booklist_search);

export default router;