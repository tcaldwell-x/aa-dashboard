import type { ServerWebSocket } from 'bun';
import crypto from 'crypto';
import { handleSubscriptionRoutes } from './subscriptionRoutes'; // Import new handler

// Helper to create a JSON response with logging
function jsonResponse(status: number, body: any, method: string, pathname: string): Response {
    const bodyStr = JSON.stringify(body);
    console.log(`[RESPONSE] ${method} ${pathname} - Status: ${status}, Body: ${bodyStr}`);
    return new Response(bodyStr, {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// Helper for responses with no content (e.g., 204 No Content, 202 Accepted)
function noContentResponse(method: string, pathname: string, status: number = 204): Response {
    console.log(`[RESPONSE] ${method} ${pathname} - Status: ${status}, Body: (empty)`);
    return new Response(null, { status });
}

function convertLocalYYYYMMDDHHmmToUTC(localDateTimeStr: string): string {
    const year = parseInt(localDateTimeStr.substring(0, 4), 10);
    const month = parseInt(localDateTimeStr.substring(4, 6), 10) - 1; // Month is 0-indexed in JS Date
    const day = parseInt(localDateTimeStr.substring(6, 8), 10);
    const hour = parseInt(localDateTimeStr.substring(8, 10), 10);
    const minute = parseInt(localDateTimeStr.substring(10, 12), 10);

    const localDate = new Date(year, month, day, hour, minute);

    const utcYear = localDate.getUTCFullYear();
    const utcMonth = (localDate.getUTCMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed, add 1 back
    const utcDay = localDate.getUTCDate().toString().padStart(2, '0');
    const utcHour = localDate.getUTCHours().toString().padStart(2, '0');
    const utcMinute = localDate.getUTCMinutes().toString().padStart(2, '0');

    return `${utcYear}${utcMonth}${utcDay}${utcHour}${utcMinute}`;
}

async function getWebhooks(req: Request, url: URL): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error("X_BEARER_TOKEN not found in environment variables.");
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }
    try {
        const twitterApiUrl = "https://api.twitter.com/2/webhooks";
        const response = await fetch(twitterApiUrl, {
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
                "Content-Type": "application/json",
            },
        });
        const data = await response.json(); // Assuming Twitter API always returns JSON or this will throw
        if (!response.ok) {
            console.error(`Twitter API GET Error: ${response.status} ${response.statusText}`, data);
            return jsonResponse(response.status, { error: "Failed to fetch data from Twitter API.", details: data }, req.method, url.pathname);
        }
        return jsonResponse(200, data, req.method, url.pathname);
    } catch (error) {
        console.error("Error fetching from Twitter API (GET /webhooks):", error);
        return jsonResponse(500, { error: "Internal server error while fetching from Twitter API." }, req.method, url.pathname);
    }
}

async function createWebhook(req: Request, url: URL): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error("X_BEARER_TOKEN not found for POST /api/webhooks.");
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }
    try {
        const body = await req.json() as { url?: string };
        if (!body.url || typeof body.url !== 'string') {
            return jsonResponse(400, { error: "Invalid request body: 'url' is required and must be a string." }, req.method, url.pathname);
        }
        const twitterApiUrl = "https://api.twitter.com/2/webhooks";
        const response = await fetch(twitterApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: body.url }),
        });
        const responseData = await response.json();
        if (!response.ok) {
            console.error(`Twitter API POST Error: ${response.status}`, responseData);
            // Forward Twitter's error response directly, as it contains useful details
            return jsonResponse(response.status, responseData, req.method, url.pathname);
        }
        return jsonResponse(response.status, responseData, req.method, url.pathname); // Usually 201
    } catch (error) {
        let errorBody = { error: "Internal server error while creating webhook." };
        let errorStatus = 500;
        if (error instanceof SyntaxError && req.headers.get("content-type")?.includes("application/json")) {
            errorBody = { error: "Invalid JSON payload." };
            errorStatus = 400;
        }
        console.error("Error creating webhook via Twitter API (POST /webhooks):", error);
        return jsonResponse(errorStatus, errorBody, req.method, url.pathname);
    }
}

async function validateWebhook(req: Request, url: URL, webhookId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error("X_BEARER_TOKEN not found for PUT /api/webhooks/:id.");
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }
    try {
        const twitterApiUrl = `https://api.twitter.com/2/webhooks/${webhookId}`;
        console.log(`[DEBUG] Sending PUT to Twitter API: ${twitterApiUrl}`);
        const response = await fetch(twitterApiUrl, {
            method: "PUT",
            headers: { "Authorization": `Bearer ${bearerToken}` },
        });
        if (!response.ok) {
            let errorDetails = `Failed to send validation request for webhook ${webhookId}.`;
            let errorDataForClient = { error: "Twitter API Error during validation request.", details: errorDetails };
            try {
                const twitterErrorData = await response.json() as any;
                errorDetails = twitterErrorData.title || twitterErrorData.detail || JSON.stringify(twitterErrorData);
                errorDataForClient.details = twitterErrorData;
            } catch (e) {
                const textDetails = await response.text();
                errorDetails = textDetails || response.statusText;
                errorDataForClient.details = errorDetails;
            }
            console.error(`Twitter API PUT Error: ${response.status}`, errorDetails);
            return jsonResponse(response.status, errorDataForClient, req.method, url.pathname);
        }
        return noContentResponse(req.method, url.pathname); // 204 No Content
    } catch (error) {
        console.error("Error sending validation request via Twitter API (PUT /webhooks/:id):", error);
        return jsonResponse(500, { error: "Internal server error while sending validation request." }, req.method, url.pathname);
    }
}

async function deleteWebhook(req: Request, url: URL, webhookId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error("X_BEARER_TOKEN not found for DELETE /api/webhooks/:id.");
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }
    try {
        const twitterApiUrl = `https://api.twitter.com/2/webhooks/${webhookId}`;
        const response = await fetch(twitterApiUrl, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${bearerToken}` },
        });
        if (!response.ok) {
            let errorDetails = `Failed to delete webhook ${webhookId}.`;
            let errorDataForClient = { error: "Failed to delete webhook from Twitter API.", details: errorDetails };
            try {
                const twitterErrorData = await response.json() as any;
                errorDetails = twitterErrorData.title || twitterErrorData.detail || JSON.stringify(twitterErrorData);
                errorDataForClient.details = twitterErrorData;
            } catch (e) {
                const textDetails = await response.text();
                errorDetails = textDetails || response.statusText;
                errorDataForClient.details = errorDetails;
            }
            console.error(`Twitter API DELETE Error: ${response.status}`, errorDetails);
            return jsonResponse(response.status, errorDataForClient, req.method, url.pathname);
        }
        return noContentResponse(req.method, url.pathname); // 204 No Content
    } catch (error) {
        console.error("Error deleting webhook via Twitter API (DELETE /webhooks/:id):", error);
        return jsonResponse(500, { error: "Internal server error while deleting webhook." }, req.method, url.pathname);
    }
}

async function replayWebhookEvents(req: Request, url: URL, webhookId: string): Promise<Response> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
        console.error(`X_BEARER_TOKEN not found for POST /api/webhooks/${webhookId}/replay.`);
        return jsonResponse(500, { error: "Server configuration error: Missing API token." }, req.method, url.pathname);
    }

    try {
        const from_date = url.searchParams.get('from_date');
        const to_date = url.searchParams.get('to_date');

        if (!from_date || typeof from_date !== 'string' || !to_date || typeof to_date !== 'string') {
            return jsonResponse(400, { error: "Invalid query parameters: 'from_date' and 'to_date' are required strings in YYYYMMDDHHmm format representing local time." }, req.method, url.pathname);
        }
        
        // Basic validation for YYYYMMDDHHmm format (length 12, all digits)
        if (from_date.length !== 12 || !/^[0-9]+$/.test(from_date) || to_date.length !== 12 || !/^[0-9]+$/.test(to_date)) {
            return jsonResponse(400, { error: "Invalid date format in query parameters: 'from_date' and 'to_date' must be in YYYYMMDDHHmm format representing local time." }, req.method, url.pathname);
        }

        const from_date_utc = convertLocalYYYYMMDDHHmmToUTC(from_date);
        const to_date_utc = convertLocalYYYYMMDDHHmmToUTC(to_date);

        const twitterApiUrl = `https://api.twitter.com/2/account_activity/replay/webhooks/${webhookId}/subscriptions/all?from_date=${from_date_utc}&to_date=${to_date_utc}`;
        console.log(`[DEBUG] Sending POST to X API for replay: ${twitterApiUrl} (UTC times) from local inputs: from=${from_date}, to=${to_date}`);

        const response = await fetch(twitterApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${bearerToken}`,
                // Content-Type is not needed for POST with query parameters and no body
            },
            // No body for this request as parameters are in URL
        });

        interface XReplaySuccessResponse {
            data: {
                job_id: string;
                created_at: string;
            };
        }

        if (response.status === 200) { // OK
            const responseData = await response.json() as XReplaySuccessResponse;
            console.log(`[DEBUG] X API Replay request successful for webhook ${webhookId}. Job ID: ${responseData?.data?.job_id}`);
            return jsonResponse(200, responseData, req.method, url.pathname); // Forward X API's response
        }
        
        // Handle X API errors
        let errorDetails = `Failed to request replay for webhook ${webhookId}.`;
        let errorDataForClient = { error: "X API Error during replay request.", details: errorDetails };
        try {
            const twitterErrorData = await response.json() as any;
            errorDetails = twitterErrorData.title || twitterErrorData.detail || JSON.stringify(twitterErrorData);
            errorDataForClient.details = twitterErrorData; // Send the whole X error object
        } catch (e) {
            const textDetails = await response.text();
            errorDetails = textDetails || response.statusText;
            errorDataForClient.details = errorDetails;
        }
        console.error(`X API Replay Error: ${response.status}`, errorDetails);
        return jsonResponse(response.status, errorDataForClient, req.method, url.pathname);

    } catch (error) {
        // No SyntaxError check needed here as we are not parsing a request body
        console.error("Error processing replay request (POST /api/webhooks/:id/replay):", error);
        return jsonResponse(500, { error: "Internal server error while requesting event replay." }, req.method, url.pathname);
    }
}

// Handle CRC validation request from Twitter/X
async function handleCRC(req: Request, url: URL): Promise<Response> {
    console.log("[CRC] Received CRC validation request");
    console.log("[CRC] URL:", url.toString());
    console.log("[CRC] Headers:", Object.fromEntries(req.headers.entries()));

    const crcToken = url.searchParams.get('crc_token');
    console.log("[CRC] CRC Token:", crcToken);
    
    if (!crcToken) {
        console.error("[CRC] Missing crc_token in CRC validation request");
        return jsonResponse(400, { error: "Missing crc_token parameter" }, req.method, url.pathname);
    }

    try {
        // Use API Key Secret (Consumer Secret) for CRC validation
        const apiKeySecret = process.env.X_API_KEY_SECRET;
        console.log("[CRC] API Key Secret exists:", !!apiKeySecret);
        
        if (!apiKeySecret) {
            console.error("[CRC] X_API_KEY_SECRET not found in environment variables");
            return jsonResponse(500, { error: "Server configuration error: Missing API Key Secret" }, req.method, url.pathname);
        }

        // Create the HMAC SHA-256 hash
        const hmac = crypto.createHmac('sha256', apiKeySecret);
        hmac.update(crcToken);
        const responseToken = hmac.digest('base64');
        console.log("[CRC] Generated response token:", responseToken);

        // Create the response object exactly as Twitter/X expects it
        const responseBody = {
            response_token: `sha256=${responseToken}`
        };
        console.log("[CRC] Response body:", responseBody);

        // Create the response with exact headers and format
        const response = new Response(
            JSON.stringify(responseBody),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
        console.log("[CRC] Sending response:", response.status, response.statusText);
        return response;
    } catch (error) {
        console.error("[CRC] Error during CRC validation:", error);
        return jsonResponse(500, { error: "Internal server error during CRC validation" }, req.method, url.pathname);
    }
}

export async function handleWebhookRoutes(req: Request, url: URL): Promise<Response | null> {
    if (!url.pathname.startsWith("/api/webhooks")) {
        return null; // Not a webhook route
    }

    // Handle CRC validation request
    if (url.pathname === "/api/webhooks/twitter" && req.method === "GET") {
        return handleCRC(req, url);
    }

    const pathParts = url.pathname.split('/');
    
    // Handle GET /api/webhooks
    if (pathParts.length === 3 && pathParts[1] === 'api' && pathParts[2] === 'webhooks') {
        if (req.method === "GET") {
            return getWebhooks(req, url);
        }
        if (req.method === "POST") {
            return createWebhook(req, url);
        }
    }
    
    // Handle PUT/DELETE /api/webhooks/:id
    if (pathParts.length === 4 && pathParts[1] === 'api' && pathParts[2] === 'webhooks') {
        const webhookId = pathParts[3];
        if (!webhookId) {
            return jsonResponse(400, { error: "Invalid webhook ID" }, req.method, url.pathname);
        }
        if (req.method === "PUT") {
            return validateWebhook(req, url, webhookId);
        }
        if (req.method === "DELETE") {
            return deleteWebhook(req, url, webhookId);
        }
    }
    
    // Handle POST /api/webhooks/:id/replay
    if (pathParts.length === 5 && pathParts[1] === 'api' && pathParts[2] === 'webhooks' && pathParts[4] === 'replay') {
        const webhookId = pathParts[3];
        if (!webhookId) {
            return jsonResponse(400, { error: "Invalid webhook ID" }, req.method, url.pathname);
        }
        if (req.method === "POST") {
            return replayWebhookEvents(req, url, webhookId);
        }
    }
    
    // Handle subscription routes
    const subscriptionResponse = await handleSubscriptionRoutes(req, url);
    if (subscriptionResponse !== null) {
        return subscriptionResponse;
    }
    
    return null;
} 