// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analyzeRouter from './routes/analyze.js';
import { logger } from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '500kb' }));

// Request logger
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', analyzeRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, _next) => {
  logger.error('Unhandled server exception:', err);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  logger.info(`=================================================`);
  logger.info(`🚀 DraftJobs Backend Server running on port ${PORT}`);
  logger.info(`Grok API Key Configured: ${!!(process.env.GROK_API_KEY && process.env.GROK_API_KEY !== 'your_grok_api_key_here')}`);
  logger.info(`=================================================`);
});
