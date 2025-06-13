import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import authRoutes from './routes/authRoutes.js';
import { handleWebhookRoutes } from './routes/webhookRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/auth', authRoutes);

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

        // Redirect back to the frontend with the tokens
        const params = new URLSearchParams({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_in: tokenData.expires_in.toString()
        });
        
        // Redirect to the frontend with tokens in URL
        res.redirect(`/?${params.toString()}`);
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

export default app; 