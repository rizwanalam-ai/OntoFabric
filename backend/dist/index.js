import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import apiRouter from './routes/api.js';
import resolutionRouter from './routes/resolution.js';
import { abacMiddleware } from './middleware/abacMiddleware.js';
import sopRouter from './routes/sop.js';
import schemaRouter from './routes/schema.js';
import relationalRouter from './routes/relationalRoutes.js';
import aiRouter from './routes/ai.js';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });
const app = express();
const port = Number(process.env.PORT ?? 3001);
app.use(cors());
app.use(express.json());
app.use(abacMiddleware);
app.use('/api', apiRouter);
app.use('/api/resolution', resolutionRouter);
app.use('/api/sop', sopRouter);
app.use('/api/schema', schemaRouter);
app.use('/api', relationalRouter);
app.use('/api/ai', aiRouter);
app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'ontofabric-backend' });
});
app.listen(port, () => {
    console.log(`OntoFabric backend listening on port ${port}`);
});
//# sourceMappingURL=index.js.map