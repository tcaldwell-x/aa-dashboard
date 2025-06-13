import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Store PKCE code verifiers
const pkceStore = new Map<string, string>();

// Helper to create a JSON response with logging
function jsonResponse(status: number, body: any, method: string, pathname: string): Response {
    const bodyStr = JSON.stringify(body);
    console.log(`[AUTH_RESPONSE] ${method} ${pathname} - Status: ${status}, Body: ${bodyStr}`);
    return new Response(bodyStr, {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// Get current user info
async function getCurrentUser(req: Request, url: URL): Promise<Response> {
    // Get the access token from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse(401, { error: "Missing or invalid Authorization header" }, req.method, url.pathname);
    }
    const accessToken = authHeader.split(' ')[1];

    try {
        const response = await fetch('https://api.twitter.com/2/users/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Failed to get user info:", data);
            return jsonResponse(response.status, { error: "Failed to get user info", details: data }, req.method, url.pathname);
        }

        return jsonResponse(200, data, req.method, url.pathname);
    } catch (error) {
        console.error("Error getting user info:", error);
        return jsonResponse(500, { error: "Internal server error" }, req.method, url.pathname);
    }
}

// Start OAuth flow
router.get('/start', (req: Request, res: Response) => {
    try {
        const clientId = process.env.X_CLIENT_ID;
        const redirectUri = process.env.X_REDIRECT_URI;

        if (!clientId || !redirectUri) {
            return res.status(500).json({ error: 'Missing required environment variables' });
        }

        // Generate PKCE values
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');

        // Generate state
        const state = crypto.randomBytes(16).toString('hex');

        // Store code verifier
        pkceStore.set(state, codeVerifier);

        // Construct authorization URL
        const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('scope', 'tweet.read users.read offline.access dm.read, dm.write');
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');

        res.json({ authUrl: authUrl.toString() });
    } catch (error) {
        console.error('Error starting OAuth flow:', error);
        res.status(500).json({ error: 'Failed to start login process' });
    }
});

// Handle OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
    try {
        const { code, state } = req.query;
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;
        const redirectUri = process.env.X_REDIRECT_URI;

        if (!code || !state || !clientId || !clientSecret || !redirectUri) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // Get stored code verifier
        const codeVerifier = pkceStore.get(state as string);
        if (!codeVerifier) {
            return res.status(400).json({ error: 'Invalid state parameter' });
        }

        // Clean up used state
        pkceStore.delete(state as string);

        // Exchange code for tokens
        const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code: code as string,
                grant_type: 'authorization_code',
                client_id: clientId,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }),
        });

        if (!tokenResponse.ok) {
            const error = await tokenResponse.json();
            console.error('Token exchange failed:', error);
            return res.status(400).json({ error: 'Failed to exchange code for tokens' });
        }

        const tokens = await tokenResponse.json() as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
        };

        // Redirect to frontend with tokens
        const frontendUrl = new URL(process.env.FRONTEND_URL || 'https://aa-dashboard-huye.vercel.app');
        frontendUrl.searchParams.append('access_token', tokens.access_token);
        frontendUrl.searchParams.append('refresh_token', tokens.refresh_token);
        frontendUrl.searchParams.append('expires_in', tokens.expires_in.toString());

        res.redirect(frontendUrl.toString());
    } catch (error) {
        console.error('Error handling OAuth callback:', error);
        res.status(500).json({ error: 'Failed to complete login process' });
    }
});

// Get current user info
router.get('/users/me', async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Missing or invalid Authorization header" });
        }
        const accessToken = authHeader.split(' ')[1];

        const response = await fetch('https://api.twitter.com/2/users/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Failed to get user info:", data);
            return res.status(response.status).json({ error: "Failed to get user info", details: data });
        }

        res.json(data);
    } catch (error) {
        console.error("Error getting user info:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router; 