import express from 'express';
import { returnBook } from '../controllers/return.controller.js';

const router = express.Router();

router.post('/', returnBook);

export default router;
