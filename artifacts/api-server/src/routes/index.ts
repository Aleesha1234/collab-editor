import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import documentsRouter from "./documents.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(documentsRouter);

export default router;
