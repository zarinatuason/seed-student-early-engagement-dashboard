import { Router, type IRouter } from "express";
import healthRouter from "./health";
import seedRouter from "./seed";

const router: IRouter = Router();

router.use(healthRouter);
router.use(seedRouter);

export default router;
