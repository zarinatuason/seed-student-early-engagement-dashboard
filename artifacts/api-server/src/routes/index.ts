import { Router, type IRouter } from "express";
import healthRouter from "./health";
import seedRouter from "./seed";
import sessionRouter from "./session";
import workspaceRouter from "./workspace";
import conversationsRouter from "./conversations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionRouter);
router.use(workspaceRouter);
router.use(conversationsRouter);
router.use(seedRouter);

export default router;
