import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import authRoutes from './routes/authRoutes.js';
import { handleWebhookRoutes } from './routes/webhookRoutes.js';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active connections
const clients = new Map<WebSocket, { token: string }>();

// WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection');
    
    // Handle authentication
    ws.on('message', (message: Buffer) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'auth' && data.token) {
                // Store the authenticated connection
                clients.set(ws, { token: data.token });
                console.log('Client authenticated');
                
                // Send acknowledgment
                ws.send(JSON.stringify({
                    type: 'connection_ack',
                    message: 'Connected to live events stream'
                }));
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    });

    // Handle disconnection
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/auth', authRoutes);

// Status endpoint
app.get('/auth/status', (req: Request, res: Response) => {
    const accessToken = req.cookies.access_token;
    res.json({ isLoggedIn: !!accessToken });
});

// OAuth callback route
app.get('/auth/callback', async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query;
        
        if (!code || !state) {
            return res.redirect('/?error=missing_parameters');
        }

        // Exchange the code for tokens
        const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')}`
            },
            body: new URLSearchParams({
                code: code as string,
                grant_type: 'authorization_code',
                client_id: process.env.X_CLIENT_ID!,
                redirect_uri: process.env.X_REDIRECT_URI!,
                code_verifier: req.query.code_verifier as string || ''
            })
        });

        if (!tokenResponse.ok) {
            const error = await tokenResponse.json();
            console.error('Token exchange error:', error);
            return res.redirect('/?error=auth_failed');
        }

        const tokenData = await tokenResponse.json() as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
        };

        // Redirect to the frontend with tokens in URL
        const params = new URLSearchParams({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in.toString()
        });

        // Use a 307 Temporary Redirect to preserve the POST method
        res.redirect(307, `/?${params.toString()}`);
    } catch (error) {
        console.error('Callback error:', error);
        res.redirect('/?error=auth_failed');
    }
});

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

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Export for testing
export { app, server, wss }; 