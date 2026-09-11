import { Router } from 'express';
import { querySopGraph, querySopPlanningSummary } from '../services/sopService.js';
const router = Router();
router.get('/graph', async (_request, response) => {
    try {
        response.json(await querySopGraph());
    }
    catch (error) {
        response.status(503).json({ error: 'Unable to query S&OP graph.', message: error instanceof Error ? error.message : 'Request failed.' });
    }
});
router.get('/summary', async (_request, response) => {
    try {
        response.json(await querySopPlanningSummary());
    }
    catch (error) {
        response.status(503).json({ error: 'Unable to query S&OP planning summary.', message: error instanceof Error ? error.message : 'Request failed.' });
    }
});
export default router;
//# sourceMappingURL=sop.js.map