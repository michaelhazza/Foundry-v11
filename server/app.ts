import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { errorHandler } from './middleware/error-handler';
import { standardRateLimiter } from './middleware/rate-limit';

// Import routes
import authRoutes from './routes/auth.routes';
import projectsRoutes from './routes/projects.routes';
import dataSourcesRoutes from './routes/data-sources.routes';
import schemaMappingsRoutes from './routes/schema-mappings.routes';
import jobsRoutes from './routes/jobs.routes';
import datasetsRoutes from './routes/datasets.routes';
import oauthRoutes from './routes/oauth.routes';
import organisationsRoutes from './routes/organisations.routes';
import healthRoutes from './routes/health.routes';

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  })
);

app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:5000',
      /\.replit\.app$/,
      /\.replit\.dev$/,
      /\.repl\.co$/,
    ],
    credentials: true,
  })
);

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply standard rate limiting to all API routes
app.use('/api', standardRateLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/data-sources', dataSourcesRoutes);
app.use('/api/schema-mappings', schemaMappingsRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/datasets', datasetsRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/organisations', organisationsRoutes);
app.use('/api', healthRoutes);

// Static file serving (production)
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(process.cwd(), 'dist/public');
  app.use(express.static(staticPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req: Request, res: Response) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(staticPath, 'index.html'));
    }
  });
}

// Error handler (MUST be last)
app.use(errorHandler);

export default app;
