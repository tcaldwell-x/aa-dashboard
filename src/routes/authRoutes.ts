import express from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Store PKCE state and code verifier in memory (in production, use a secure session store)
const pkceStore = new Map<string, { codeVerifier: string; timestamp: number }>();

// Clean up expired PKCE entries every hour
setInterval(() => {
    const now = Date.now();
    for (const [state, data] of pkceStore.entries()) {
        if (now - data.timestamp > 3600000) { // 1 hour
            pkceStore.delete(state);
        }
    }
}, 3600000);

// Start OAuth 2.0 PKCE flow
router.get('/start', (req: Request, res: Response) => {
    try {
        console.log('Starting OAuth flow...');
        
        // Generate PKCE code verifier and challenge
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');

        // Generate state parameter for CSRF protection
        const state = crypto.randomBytes(16).toString('hex');

        // Store code verifier and state
        pkceStore.set(state, {
            codeVerifier,
            timestamp: Date.now()
        });

        // Get environment variables
        const clientId = process.env.X_CLIENT_ID;
        const redirectUri = process.env.X_REDIRECT_URI;

        console.log('Environment variables:', {
            clientId: clientId ? 'Set' : 'Not set',
            redirectUri: redirectUri ? 'Set' : 'Not set'
        });

        if (!clientId || !redirectUri) {
            console.error('Missing required environment variables:', { clientId, redirectUri });
            return res.status(500).json({ 
                error: 'Server configuration error: Missing required environment variables',
                details: {
                    clientId: clientId ? 'Set' : 'Not set',
                    redirectUri: redirectUri ? 'Set' : 'Not set'
                }
            });
        }

        // Construct authorization URL
        const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('scope', 'tweet.read users.read offline.access');
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');

        console.log('Generated auth URL:', authUrl.toString());

        res.json({ authUrl: authUrl.toString() });
    } catch (error) {
        console.error('Error starting OAuth flow:', error);
        if (error instanceof Error) {
            console.error('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
        res.status(500).json({ 
            error: 'Failed to start authentication process',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// OAuth callback route
router.get('/callback', async (req: Request, res: Response) => {
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

// Refresh access token
router.post('/refresh', async (req: Request, res: Response) => {
    try {
        const { refresh_token } = req.query;

        if (!refresh_token || typeof refresh_token !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid refresh token' });
        }

        // Get environment variables
        const clientId = process.env.X_CLIENT_ID;
        const clientSecret = process.env.X_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            console.error('Missing required environment variables:', { clientId, clientSecret });
            return res.status(500).json({ error: 'Server configuration error: Missing required environment variables' });
        }

        const client = new TwitterApi({
            clientId,
            clientSecret,
        });

        const { accessToken, refreshToken, expiresIn } = await client.refreshOAuth2Token(refresh_token);

        res.json({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: expiresIn
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

export default router; 