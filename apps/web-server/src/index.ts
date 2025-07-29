import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';

import { loadEnvironmentConfig, validateEnvironment, log } from '@matchexec/shared';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import apiRoutes from './routes/api';
import gameRoutes from './routes/games';
import healthRoutes from './routes/health';

// Load environment variables
dotenv.config();

async function createApp() {
  const config = loadEnvironmentConfig();
  
  // Validate required environment variables
  try {
    validateEnvironment();
  } catch (error) {
    log.error('Environment validation failed', { error: (error as Error).message });
    process.exit(1);
  }

  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  }));

  // CORS configuration
  app.use(cors({
    origin: config.NODE_ENV === 'production' 
      ? false // Configure specific origins in production
      : true, // Allow all origins in development
    credentials: true,
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
  });
  app.use(limiter);

  // Compression
  app.use(compression());

  // Session configuration
  app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(requestLogger);

  // API routes
  app.use('/api', apiRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/health', healthRoutes);

  // Serve React static files
  const frontendPath = path.join(__dirname, '../../../packages/frontend/build');
  app.use(express.static(frontendPath));

  // React Router fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}

async function startServer() {
  try {
    const config = loadEnvironmentConfig();
    const app = await createApp();
    
    const server = app.listen(config.PORT, () => {
      log.info('Web server started', {
        port: config.PORT,
        environment: config.NODE_ENV,
        process: 'web-server',
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      log.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        log.info('Web server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      log.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        log.info('Web server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    log.error('Failed to start web server', { error: (error as Error).message });
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

export { createApp, startServer }; 