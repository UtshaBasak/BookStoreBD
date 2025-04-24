import express from 'express'
const router = express.Router();
import {Wishlist,Wishlist_delete} from '../controllers/wishlist.controller.js';

router.get("/",Wishlist);
router.get("/delete/:id",Wishlist_delete);


export default router;