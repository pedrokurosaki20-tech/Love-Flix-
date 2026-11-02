import express from 'express';
import { registerApiRoutes } from '../server/registerApiRoutes.js';

export { registerApiRoutes };

const vercelApiApp = express();
vercelApiApp.disable('x-powered-by');
vercelApiApp.use(express.json({ limit: '256kb' }));
registerApiRoutes(vercelApiApp);

export default vercelApiApp;