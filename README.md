# Account Activity Dashboard Enterprise

A Node.js application that provides a dashboard for monitoring Twitter/X account activity using the Account Activity API.

## Features

- Real-time account activity monitoring
- Webhook subscription management
- User subscription management
- Activity data visualization
- Secure OAuth 2.0 authentication

## Prerequisites

- Node.js 18 or higher
- Twitter/X Developer Account with Enterprise access
- Twitter/X API v2 credentials

## Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/account-activity-dashboard-enterprise.git
cd account-activity-dashboard-enterprise
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `env.template`:
```bash
cp env.template .env
```

4. Configure your environment variables in `.env`:
   - `X_BEARER_TOKEN`: Your Twitter/X API Bearer Token
   - `X_CLIENT_ID`: Your OAuth 2.0 client ID
   - `X_CLIENT_SECRET`: Your OAuth 2.0 client secret
   - `X_REDIRECT_URI`: Your OAuth 2.0 redirect URI (default: http://localhost:3000/auth/callback)
   - `PORT`: Server port (default: 3000)

5. Start the server:
```bash
npm start
```

## OAuth 2.0 Authentication Flow

The application uses OAuth 2.0 PKCE (Proof Key for Code Exchange) for secure user authentication. Here's how it works:

1. **Start Authentication**:
   - Call `GET /api/auth/start` to begin the OAuth flow
   - The server generates PKCE values and returns an authorization URL
   - Redirect the user to this URL

2. **User Authorization**:
   - User logs in to Twitter/X and authorizes the application
   - Twitter/X redirects back to your callback URL with an authorization code

3. **Token Exchange**:
   - The server exchanges the authorization code for access and refresh tokens
   - Tokens are returned to the client for storage

4. **Token Refresh**:
   - Use `POST /api/auth/refresh` with the refresh token to get a new access token
   - Access tokens expire after 2 hours

## API Endpoints

### Authentication
- `GET /api/auth/start` - Start OAuth 2.0 PKCE flow
- `GET /auth/callback` - Handle OAuth callback
- `POST /api/auth/refresh` - Refresh access token

### Webhooks
- `GET /api/webhooks` - List all webhooks
- `POST /api/webhooks` - Create a new webhook
- `DELETE /api/webhooks/:id` - Delete a webhook
- `PUT /api/webhooks/:id` - Update webhook URL

### Subscriptions
- `GET /api/webhooks/:id/subscriptions` - List all subscriptions for a webhook
- `POST /api/webhooks/:id/subscriptions` - Subscribe a user to a webhook
- `DELETE /api/webhooks/:id/subscriptions/:userId` - Unsubscribe a user from a webhook

## Security Notes

- All user-context endpoints require a valid OAuth 2.0 access token
- Access tokens should be stored securely on the client side
- Refresh tokens should be stored securely and used to obtain new access tokens
- The application uses PKCE to prevent authorization code interception attacks

## Development

To run the application in development mode with hot reloading:

```bash
npm run dev
```

## License

MIT
