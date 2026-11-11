import express from 'express';
import { registerApiRoutes } from '../server/registerApiRoutes.js';
import { filterTmdbMovieLists } from '../server/movieVisibilityMiddleware.js';

export { registerApiRoutes };

const vercelApiApp = express();
vercelApiApp.disable('x-powered-by');
vercelApiApp.use(express.json({ limit: '256kb' }));
vercelApiApp.use(filterTmdbMovieLists);
registerApiRoutes(vercelApiApp);

export default vercelApiApp;
