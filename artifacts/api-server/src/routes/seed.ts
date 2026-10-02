import { Router, type IRouter } from "express";
import { GetReferenceGuideResponse } from "@workspace/api-zod";
import { findRequestSession } from "../lib/workspace-session";
import { seedData } from "../lib/seed-data";

const router: IRouter = Router();

/**
 * Former globally-scoped operational routes are intentionally retired. V2
 * routes use the cookie-bound workspace session; leaving these endpoints live
 * would expose or mutate rows that predate session isolation.
 */
function retireLegacyRoute(path: string, method: "get" | "put" | "post"): void {
  router[method](path, async (req, res): Promise<void> => {
    if (!(await findRequestSession(req))) {
      res.status(401).json({ error: "Start or resume a workspace session first." });
      return;
    }
    res.status(410).json({
      error: "This legacy operational endpoint has been retired. Use the session-scoped workspace API.",
    });
  });
}

retireLegacyRoute("/advisor/summary", "get");
retireLegacyRoute("/records", "get");
retireLegacyRoute("/records/:learnerId/:courseCode", "get");
retireLegacyRoute("/records/:learnerId/:courseCode/review", "put");
retireLegacyRoute("/records/:learnerId/:courseCode/contact", "post");
retireLegacyRoute("/records/:learnerId/:courseCode/response", "post");
retireLegacyRoute("/tracker", "get");
retireLegacyRoute("/demo-date", "get");
retireLegacyRoute("/demo-date", "put");

router.get("/reference", (_req, res): void => {
  res.json(GetReferenceGuideResponse.parse(seedData.makeReferenceGuide()));
});

export default router;