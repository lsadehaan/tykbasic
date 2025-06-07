const express = require('express');
const https = require('https');
const fs = require('fs');

class TestAPIServer {
  constructor(options = {}) {
    this.app = express();
    this.httpServer = null;
    this.httpsServer = null;
    this.options = {
      httpPort: options.httpPort || 3001,
      httpsPort: options.httpsPort || 3002,
      enableHttps: options.enableHttps || false,
      cert: options.cert || null,
      key: options.key || null,
      ...options
    };
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // JSON parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Headers: ${Object.keys(req.headers).length}`);
      next();
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        server: 'test-api-server',
        version: '1.0.0'
      });
    });

    // Simple GET endpoint
    this.app.get('/api/simple', (req, res) => {
      res.json({
        message: 'Simple GET endpoint working',
        method: 'GET',
        timestamp: new Date().toISOString(),
        query: req.query,
        headers: this.sanitizeHeaders(req.headers)
      });
    });

    // Echo endpoint (returns request data)
    this.app.all('/api/echo', (req, res) => {
      res.json({
        method: req.method,
        path: req.path,
        query: req.query,
        headers: this.sanitizeHeaders(req.headers),
        body: req.body,
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    });

    // Rate limit testing endpoints
    this.app.get('/api/rate-limit-test', (req, res) => {
      res.json({
        message: 'Rate limit test endpoint',
        timestamp: new Date().toISOString(),
        requestNumber: Math.floor(Math.random() * 1000)
      });
    });

    // Authentication testing
    this.app.get('/api/auth-test', (req, res) => {
      const authHeader = req.get('Authorization');
      const apiKey = req.get('X-API-Key');
      
      res.json({
        message: 'Authentication test endpoint',
        hasAuthHeader: !!authHeader,
        hasApiKey: !!apiKey,
        authType: authHeader ? authHeader.split(' ')[0] : 'none',
        timestamp: new Date().toISOString()
      });
    });

    // Large response endpoint
    this.app.get('/api/large-response', (req, res) => {
      const size = parseInt(req.query.size) || 1000;
      const data = Array.from({ length: size }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: `This is item number ${i} in the large response test`,
        timestamp: new Date().toISOString(),
        randomValue: Math.random()
      }));
      
      res.json({
        message: 'Large response test',
        itemCount: data.length,
        data: data
      });
    });

    // Slow response endpoint
    this.app.get('/api/slow', (req, res) => {
      const delay = parseInt(req.query.delay) || 2000;
      setTimeout(() => {
        res.json({
          message: 'Slow response endpoint',
          delay: delay,
          timestamp: new Date().toISOString()
        });
      }, delay);
    });

    // Error testing endpoints
    this.app.get('/api/error/:code', (req, res) => {
      const code = parseInt(req.params.code) || 500;
      const errorMessages = {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable'
      };
      
      res.status(code).json({
        error: true,
        code: code,
        message: errorMessages[code] || 'Unknown Error',
        timestamp: new Date().toISOString()
      });
    });

    // POST endpoint for testing body handling
    this.app.post('/api/data', (req, res) => {
      res.json({
        message: 'Data received successfully',
        receivedData: req.body,
        contentType: req.get('Content-Type'),
        bodySize: JSON.stringify(req.body).length,
        timestamp: new Date().toISOString()
      });
    });

    // PUT endpoint
    this.app.put('/api/data/:id', (req, res) => {
      res.json({
        message: 'Data updated successfully',
        id: req.params.id,
        updatedData: req.body,
        timestamp: new Date().toISOString()
      });
    });

    // DELETE endpoint
    this.app.delete('/api/data/:id', (req, res) => {
      res.json({
        message: 'Data deleted successfully',
        id: req.params.id,
        timestamp: new Date().toISOString()
      });
    });

    // Headers testing endpoint
    this.app.get('/api/headers', (req, res) => {
      res.set('X-Custom-Header', 'test-value');
      res.set('X-Server-Time', new Date().toISOString());
      res.json({
        message: 'Headers test endpoint',
        receivedHeaders: this.sanitizeHeaders(req.headers),
        customHeadersSent: {
          'X-Custom-Header': 'test-value',
          'X-Server-Time': new Date().toISOString()
        }
      });
    });

    // JSON response with specific structure for transformation testing
    this.app.get('/api/transform-test', (req, res) => {
      res.json({
        original_field: 'original_value',
        nested: {
          inner_field: 'inner_value',
          array: [1, 2, 3, 4, 5]
        },
        timestamp: new Date().toISOString(),
        server_info: {
          name: 'test-api-server',
          version: '1.0.0'
        }
      });
    });

    // WebSocket simulation endpoint
    this.app.get('/api/websocket-sim', (req, res) => {
      res.json({
        message: 'WebSocket simulation endpoint',
        connectionId: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString()
      });
    });

    // File upload simulation
    this.app.post('/api/upload', (req, res) => {
      res.json({
        message: 'File upload simulation',
        receivedData: req.body,
        contentType: req.get('Content-Type'),
        timestamp: new Date().toISOString()
      });
    });

    // GraphQL simulation endpoint
    this.app.post('/api/graphql', (req, res) => {
      const { query, variables } = req.body;
      res.json({
        data: {
          message: 'GraphQL simulation response',
          query: query,
          variables: variables,
          timestamp: new Date().toISOString()
        }
      });
    });

    // Catch-all endpoint
    this.app.all('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        method: req.method,
        path: req.path,
        availableEndpoints: [
          'GET /health',
          'GET /api/simple',
          'ALL /api/echo',
          'GET /api/rate-limit-test',
          'GET /api/auth-test',
          'GET /api/large-response',
          'GET /api/slow',
          'GET /api/error/:code',
          'POST /api/data',
          'PUT /api/data/:id',
          'DELETE /api/data/:id',
          'GET /api/headers',
          'GET /api/transform-test',
          'GET /api/websocket-sim',
          'POST /api/upload',
          'POST /api/graphql'
        ],
        timestamp: new Date().toISOString()
      });
    });
  }

  sanitizeHeaders(headers) {
    // Remove sensitive headers for logging
    const { authorization, cookie, ...safeHeaders } = headers;
    return safeHeaders;
  }

  async start() {
    return new Promise((resolve, reject) => {
      // Start HTTP server
      this.httpServer = this.app.listen(this.options.httpPort, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        console.log(`🌐 Test API Server (HTTP) running on port ${this.options.httpPort}`);
        console.log(`   Health check: http://localhost:${this.options.httpPort}/health`);
        
        // Start HTTPS server if enabled
        if (this.options.enableHttps && this.options.cert && this.options.key) {
          const httpsOptions = {
            key: this.options.key,
            cert: this.options.cert
          };
          
          this.httpsServer = https.createServer(httpsOptions, this.app);
          this.httpsServer.listen(this.options.httpsPort, (err) => {
            if (err) {
              console.error('HTTPS server failed to start:', err);
            } else {
              console.log(`🔒 Test API Server (HTTPS) running on port ${this.options.httpsPort}`);
              console.log(`   Health check: https://localhost:${this.options.httpsPort}/health`);
            }
          });
        }
        
        resolve({
          httpPort: this.options.httpPort,
          httpsPort: this.options.httpsPort,
          httpServer: this.httpServer,
          httpsServer: this.httpsServer
        });
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      let shutdownCount = 0;
      const expectedShutdowns = this.httpsServer ? 2 : 1;
      
      const onShutdown = () => {
        shutdownCount++;
        if (shutdownCount === expectedShutdowns) {
          console.log('🛑 Test API Server stopped');
          resolve();
        }
      };
      
      if (this.httpServer) {
        this.httpServer.close(onShutdown);
      }
      
      if (this.httpsServer) {
        this.httpsServer.close(onShutdown);
      }
      
      if (expectedShutdowns === 0) {
        resolve();
      }
    });
  }

  getUrls() {
    return {
      http: `http://localhost:${this.options.httpPort}`,
      https: this.options.enableHttps ? `https://localhost:${this.options.httpsPort}` : null
    };
  }
}

module.exports = TestAPIServer;

// If run directly, start the server
if (require.main === module) {
  const server = new TestAPIServer({
    httpPort: 3001,
    httpsPort: 3002,
    enableHttps: false
  });
  
  server.start()
    .then(() => {
      console.log('Test API Server started successfully!');
      console.log('Press Ctrl+C to stop');
    })
    .catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
} 