import express from 'express';
import path from 'path';
import authRoutes from './routes/authRoutes.js';
import { handleWebhookRoutes } from './routes/webhookRoutes.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/auth', authRoutes);

// Handle webhook routes
app.use(async (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    // Create a proper Request object
    const request = new Request(url.toString(), {
        method: req.method,
        headers: new Headers(req.headers as Record<string, string>),
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });
    const response = await handleWebhookRoutes(request, url);
    if (response) {
        // Convert Response to Express response
        res.status(response.status);
        for (const [key, value] of response.headers.entries()) {
            res.setHeader(key, value);
        }
        const body = await response.text();
        res.send(body);
    } else {
        next();
    }
});

// Serve index.html for all other routes
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

export default app; 