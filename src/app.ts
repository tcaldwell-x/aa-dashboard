import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import authRoutes from './routes/authRoutes.js';
import { handleWebhookRoutes } from './routes/webhookRoutes.js';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Store active SSE connections
const sseClients = new Set<Response>();

// Function to broadcast messages to all connected SSE clients
function broadcastToSSEClients(message: string | object) {
    const messageString = typeof message === 'string' ? message : JSON.stringify(message);
    console.log(`[SSE_BROADCAST] Broadcasting to ${sseClients.size} clients: ${messageString.substring(0,100)}...`);
    for (const client of sseClients) {
        try {
            client.write(`data: ${messageString}\n\n`);
        } catch (e) {
            console.error("[SSE_BROADCAST] Error sending to client:", e);
            sseClients.delete(client);
        }
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/auth', authRoutes);

// Polling endpoint for live events
app.get('/events/poll', (req: Request, res: Response) => {
    const token = req.query.token as string;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Set headers for polling
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Send initial connection message
    res.json({ 
        type: "connection_ack", 
        message: "Connected to live event stream",
        timestamp: new Date().toISOString()
    });
});

// Handle webhook routes
app.use(async (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const request = new Request(url.toString(), {
        method: req.method,
        headers: new Headers(req.headers as Record<string, string>),
        body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });
    const response = await handleWebhookRoutes(request, url);
    if (response) {
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

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Export for testing
export { broadcastToSSEClients };
export default app; 