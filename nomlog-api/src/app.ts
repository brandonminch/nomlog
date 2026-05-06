import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

import express, { Express, NextFunction, Request, Response } from 'express';
import { LlmQuotaExceededError } from './ai/openaiResponses';
import cors from 'cors';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import usersRouter from './routes/users';
import logsRouter from './routes/logs';
import authRouter from './routes/auth';
import waterRouter from './routes/water';
import plannerRouter from './routes/planner';
import recipesRouter from './routes/recipes';
import activityLogsRouter from './routes/activityLogs';
import mealPhotosRouter from './routes/mealPhotos';

const app: Express = express();
const port: number = parseInt(process.env.PORT || '3001', 10);
const nodeEnv: string = process.env.NODE_ENV || 'development';
const apiVersion: string = process.env.API_VERSION || 'v1';

// Middleware
// Avoid ETag/304 responses for JSON APIs (clients expect a body)
app.set('etag', false);

// Browser clients (Expo web, hosted web) need CORS; native apps do not send Origin.
const corsProductionOrigins =
  process.env.CORS_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
app.use(
  cors({
    origin:
      nodeEnv === 'development' || nodeEnv === 'test'
        ? true
        : corsProductionOrigins.length > 0
          ? corsProductionOrigins
          : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(morgan(nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Swagger/OpenAPI documentation
const swaggerPath = path.join(__dirname, '../swagger.yaml');
const swaggerDocument = YAML.load(swaggerPath);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Nomlog API Documentation'
}));

// API Routes with versioning
const apiRouter = express.Router();
app.use(`/api/${apiVersion}`, apiRouter);

// Prevent intermediaries from caching API responses
apiRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

apiRouter.use('/users', usersRouter);
apiRouter.use('/logs', logsRouter);
apiRouter.use('/activity-logs', activityLogsRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/water', waterRouter);
apiRouter.use('/planner', plannerRouter);
apiRouter.use('/recipes', recipesRouter);
apiRouter.use('/meal-photos', mealPhotosRouter);

apiRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof LlmQuotaExceededError) {
    res.status(429).json({ error: err.message, code: err.code });
    return;
  }
  next(err);
});

// Default route with auth form
app.get("/", (_req: Request, res: Response) => {
  res.type('html').send(html);
});

const server = app.listen(port, () => {
  console.log(`Server is running in ${nodeEnv} mode on port ${port}`);
});

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;

const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>Nomlog API - Auth Test</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        background: #f5f5f5;
      }
      .container {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      h1 {
        color: #333;
        margin-bottom: 20px;
      }
      .form-group {
        margin-bottom: 15px;
      }
      label {
        display: block;
        margin-bottom: 5px;
        color: #666;
      }
      input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-sizing: border-box;
      }
      button {
        background: #007bff;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
      }
      button:hover {
        background: #0056b3;
      }
      #result {
        margin-top: 20px;
        padding: 15px;
        border-radius: 4px;
        background: #f8f9fa;
        display: none;
      }
      .token-display {
        word-break: break-all;
        background: #e9ecef;
        padding: 10px;
        border-radius: 4px;
        margin-top: 10px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Nomlog API - Auth Test</h1>
      
      <div class="form-group">
        <h2>Sign Up</h2>
        <form id="signupForm">
          <div class="form-group">
            <label for="signupEmail">Email:</label>
            <input type="email" id="signupEmail" required>
          </div>
          <div class="form-group">
            <label for="signupPassword">Password:</label>
            <input type="password" id="signupPassword" required>
          </div>
          <button type="submit">Sign Up</button>
        </form>
      </div>

      <div class="form-group">
        <h2>Login</h2>
        <form id="loginForm">
          <div class="form-group">
            <label for="loginEmail">Email:</label>
            <input type="email" id="loginEmail" required>
          </div>
          <div class="form-group">
            <label for="loginPassword">Password:</label>
            <input type="password" id="loginPassword" required>
          </div>
          <button type="submit">Login</button>
        </form>
      </div>

      <div id="result">
        <h3>Response:</h3>
        <pre id="responseData"></pre>
        <h3>JWT Token (for Postman):</h3>
        <div id="tokenDisplay" class="token-display"></div>
      </div>
    </div>

    <script>
      const API_URL = '/api/v1/auth';
      
      async function handleSubmit(e, endpoint) {
        e.preventDefault();
        const form = e.target;
        const email = form.querySelector('input[type="email"]').value;
        const password = form.querySelector('input[type="password"]').value;
        
        try {
          const response = await fetch(\`\${API_URL}/\${endpoint}\`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          });
          
          const data = await response.json();
          
          document.getElementById('responseData').textContent = JSON.stringify(data, null, 2);
          document.getElementById('result').style.display = 'block';
          
          if (data.session?.access_token) {
            document.getElementById('tokenDisplay').textContent = data.session.access_token;
          }
        } catch (error) {
          document.getElementById('responseData').textContent = 'Error: ' + error.message;
          document.getElementById('result').style.display = 'block';
        }
      }
      
      document.getElementById('signupForm').addEventListener('submit', (e) => handleSubmit(e, 'signup'));
      document.getElementById('loginForm').addEventListener('submit', (e) => handleSubmit(e, 'login'));
    </script>
  </body>
</html>
`;
