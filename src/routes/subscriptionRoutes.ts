import type { ServerWebSocket } from 'bun'; // Though not directly used, kept for consistency if other types are needed
import crypto from 'crypto';
import { Request } from 'node-fetch';

// Helper to create a JSON response with logging
function jsonResponse(status: number, body: any, method: string, pathname: string): Response {
    const bodyStr = JSON.stringify(body);
    console.log(`[SUBSCRIPTION_RESPONSE] ${method} ${pathname} - Status: ${status}, Body: ${bodyStr}`);
    return new Response(bodyStr, {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// Helper for 204 No Content response with logging (redefined for this module)
function noContentResponse(method: string, pathname: string): Response {
    console.log(`[SUBSCRIPTION_RESPONSE] ${method} ${pathname} - Status: 204 (No Content)`);
    return new Response(null, { status: 204 });
}

// Get subscription count
async function getSubscriptionCount(req: Request, url: URL): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }

    try {
        const response = await fetch('https://api.twitter.com/2/account_activity/subscriptions/count', {
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Failed to get subscription count:", data);
            return jsonResponse(response.status, { error: "Failed to get subscription count", details: data }, req.method, url.pathname);
        }

        return jsonResponse(200, data, req.method, url.pathname);
    } catch (error) {
        console.error("Error getting subscription count:", error);
        return jsonResponse(500, { error: "Internal server error" }, req.method, url.pathname);
    }
}

// Check if a subscription exists for a webhook
async function checkSubscription(req: Request, url: URL): Promise<Response> {
    const webhookId = url.pathname.split('/')[3];
    if (!webhookId) {
        return jsonResponse(400, { error: "Webhook ID is required" }, req.method, url.pathname);
    }

    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }

    try {
        const response = await fetch(`https://api.twitter.com/2/account_activity/webhooks/${webhookId}/subscriptions/all`, {
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Failed to check subscription:", data);
            return jsonResponse(response.status, { error: "Failed to check subscription", details: data }, req.method, url.pathname);
        }

        return jsonResponse(200, data, req.method, url.pathname);
    } catch (error) {
        console.error("Error checking subscription:", error);
        return jsonResponse(500, { error: "Internal server error" }, req.method, url.pathname);
    }
}

// Get list of subscriptions for a webhook
async function getSubscriptionsList(req: Request, url: URL): Promise<Response> {
    const webhookId = url.pathname.split('/')[3];
    if (!webhookId) {
        return jsonResponse(400, { error: "Webhook ID is required" }, req.method, url.pathname);
    }

    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }

    try {
        const response = await fetch(`https://api.twitter.com/2/account_activity/webhooks/${webhookId}/subscriptions/all/list`, {
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Failed to get subscriptions list:", data);
            return jsonResponse(response.status, { error: "Failed to get subscriptions list", details: data }, req.method, url.pathname);
        }

        return jsonResponse(200, data, req.method, url.pathname);
    } catch (error) {
        console.error("Error getting subscriptions list:", error);
        return jsonResponse(500, { error: "Internal server error" }, req.method, url.pathname);
    }
}

// Subscribe a user to a webhook
async function subscribeUser(req: Request, url: URL): Promise<Response> {
    const webhookId = url.pathname.split('/')[3];
    if (!webhookId) {
        return jsonResponse(400, { error: "Webhook ID is required" }, req.method, url.pathname);
    }

    // Get the access token from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse(401, { error: "Missing or invalid Authorization header" }, req.method, url.pathname);
    }
    const accessToken = authHeader.split(' ')[1];

    try {
        const response = await fetch(`https://api.twitter.com/2/account_activity/webhooks/${webhookId}/subscriptions/all`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Failed to subscribe user:", data);
            return jsonResponse(response.status, { error: "Failed to subscribe user", details: data }, req.method, url.pathname);
        }

        return jsonResponse(200, data, req.method, url.pathname);
    } catch (error) {
        console.error("Error subscribing user:", error);
        return jsonResponse(500, { error: "Internal server error" }, req.method, url.pathname);
    }
}

// Unsubscribe a user from a webhook
async function unsubscribeUser(req: Request, url: URL): Promise<Response> {
    const webhookId = url.pathname.split('/')[3];
    const userId = url.pathname.split('/')[5];
    
    if (!webhookId || !userId) {
        return jsonResponse(400, { error: "Webhook ID and User ID are required" }, req.method, url.pathname);
    }

    // Get the access token from the Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return jsonResponse(401, { error: "Missing or invalid Authorization header" }, req.method, url.pathname);
    }
    const accessToken = authHeader.split(' ')[1];

    try {
        const response = await fetch(`https://api.twitter.com/2/account_activity/webhooks/${webhookId}/subscriptions/${userId}/all`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Failed to unsubscribe user:", data);
            return jsonResponse(response.status, { error: "Failed to unsubscribe user", details: data }, req.method, url.pathname);
        }

        return jsonResponse(200, data, req.method, url.pathname);
    } catch (error) {
        console.error("Error unsubscribing user:", error);
        return jsonResponse(500, { error: "Internal server error" }, req.method, url.pathname);
    }
}

export async function handleSubscriptionRoutes(req: Request, url: URL): Promise<Response | null> {
    // Handle GET /api/webhooks/subscriptions/count
    if (url.pathname === '/api/webhooks/subscriptions/count' && req.method === 'GET') {
        return getSubscriptionCount(req, url);
    }
    
    // Handle GET /api/webhooks/{webhook_id}/subscriptions
    if (url.pathname.match(/^\/api\/webhooks\/[^/]+\/subscriptions$/) && req.method === 'GET') {
        return checkSubscription(req, url);
    }
    
    // Handle GET /api/webhooks/{webhook_id}/subscriptions/list
    if (url.pathname.match(/^\/api\/webhooks\/[^/]+\/subscriptions\/list$/) && req.method === 'GET') {
        return getSubscriptionsList(req, url);
    }
    
    // Handle POST /api/webhooks/{webhook_id}/subscriptions
    if (url.pathname.match(/^\/api\/webhooks\/[^/]+\/subscriptions$/) && req.method === 'POST') {
        return subscribeUser(req, url);
    }
    
    // Handle DELETE /api/webhooks/{webhook_id}/subscriptions/{user_id}
    if (url.pathname.match(/^\/api\/webhooks\/[^/]+\/subscriptions\/[^/]+$/) && req.method === 'DELETE') {
        return unsubscribeUser(req, url);
    }
    
    return null;
}