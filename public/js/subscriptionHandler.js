// public/js/subscriptionHandler.js

let cachedUserSubscriptions = {}; // Cache for subscriptions: { webhookId: [hydratedSubscriptionObjects] }

// Get the user's access token from localStorage
function getUserAccessToken() {
    const tokenData = localStorage.getItem('tokenData');
    if (!tokenData) {
        throw new Error('No access token found. Please log in first.');
    }
    try {
        const { access_token } = JSON.parse(tokenData);
        if (!access_token) {
            throw new Error('Invalid token data. Please log in again.');
        }
        return access_token;
    } catch (error) {
        console.error('Error parsing token data:', error);
        throw new Error('Invalid token data. Please log in again.');
    }
}

// Helper function to get the current access token
function getAccessToken() {
    const tokenData = localStorage.getItem('tokenData');
    if (!tokenData) {
        throw new Error('No access token found. Please log in.');
    }
    try {
        const { access_token } = JSON.parse(tokenData);
        if (!access_token) {
            throw new Error('Invalid token data. Please log in again.');
        }
        return access_token;
    } catch (error) {
        console.error('Error parsing token data:', error);
        throw new Error('Invalid token data. Please log in again.');
    }
}

// Refactored to fetch and return user data, not directly update DOM for individual placeholders.
async function fetchUserDetailsForSubscription(userId) {
    // const userDetailsPlaceholder = document.getElementById(`user-details-${userId}`); // No longer directly updates placeholder here
    try {
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse user details error' }));
            console.error(`Error fetching user details for ${userId}: ${response.status}`, errorData);
            // Return a structured error or null so Promise.all can handle it gracefully
            return { id: userId, error: true, status: response.status, details: errorData.error || errorData.details?.message || errorData.message || 'Failed to fetch' };
        }
        const userDataResponse = await response.json();
        if (userDataResponse && userDataResponse.data) {
            return userDataResponse.data; // Return the user data object
        } else {
            console.warn(`User details not found or in unexpected format for ${userId}.`);
            return { id: userId, error: true, message: 'User details not found or in unexpected format.' };
        }
    } catch (error) {
        console.error(`Failed to fetch user details for ${userId}:`, error);
        return { id: userId, error: true, message: error.message || 'Network error or similar' };
    }
}

function renderSubscriptionCards(webhookId, subscriptionsArray) {
    const container = document.getElementById('subscriptions-list-container');
    if (!container) {
        console.error("Subscription list container not found for rendering.");
        return;
    }

    if (!subscriptionsArray || subscriptionsArray.length === 0) {
        container.innerHTML = '<p>No active subscriptions for this webhook.</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.id = 'subscriptions-list';
    container.innerHTML = ''; // Clear loading/previous message.
    container.appendChild(ul);

    subscriptionsArray.forEach(async subscription => {
        const li = document.createElement('li');
        li.id = `subscription-card-${subscription.id}`;

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-subscription-btn';
        deleteButton.innerHTML = '<img src="/public/img/icons/delete-icon.svg" alt="Delete">';
        deleteButton.setAttribute('aria-label', 'Delete Subscription');
        deleteButton.setAttribute('title', 'Delete Subscription');
        deleteButton.onclick = () => confirmDeleteSubscription(webhookId, subscription.id);

        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = '<div class="loading-spinner"></div> Loading user details...';
        
        li.appendChild(deleteButton);
        li.appendChild(contentDiv);
        ul.appendChild(li);

        try {
            // Get the access token from localStorage
            const tokenData = localStorage.getItem('tokenData');
            if (!tokenData) {
                throw new Error('No authentication token found');
            }
            const { access_token } = JSON.parse(tokenData);

            // Fetch user details through our backend proxy
            const response = await fetch(`/auth/users/${subscription.user_id}`, {
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch user details: ${response.status}`);
            }

            const userData = await response.json();
            const user = userData.data;

            // Update the content with user details
            const profileUrl = `https://x.com/${user.username}`;
            const userDetailsHtml = `
                <div class="user-card-layout">
                    <div class="user-info-container">
                        <p class="user-handle">@${user.username}</p>
                        <p class="user-name">${user.name}</p>
                        <p class="user-id-subtext">ID: ${user.id}</p>
                    </div>
                </div>
            `;
            contentDiv.innerHTML = userDetailsHtml;

        } catch (error) {
            console.error('Error fetching user details:', error);
            contentDiv.innerHTML = `
                <div class="user-card-layout">
                    <div class="user-info-container">
                        <p class="user-handle">Error loading user details</p>
                        <p class="user-id-subtext">ID: ${subscription.user_id}</p>
                        <p class="error-message">${error.message}</p>
                    </div>
                </div>
            `;
        }
    });
}

// Update fetchAndDisplaySubscriptions to use user token
async function fetchAndDisplaySubscriptions(webhookId) {
    try {
        const accessToken = getAccessToken();
        console.log('Fetching subscriptions for webhook:', webhookId);
        
        if (!webhookId) {
            throw new Error('Please select a webhook first');
        }

        // First check if we have any subscriptions
        const checkResponse = await fetch(`/api/webhooks/${webhookId}/subscriptions`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!checkResponse.ok) {
            const errorData = await checkResponse.json().catch(() => ({ message: 'Failed to parse error response' }));
            console.error('Subscription check failed:', errorData);
            throw new Error(errorData.message || 'Failed to check subscriptions');
        }

        const checkData = await checkResponse.json();
        console.log('Subscription check response:', checkData);
        
        if (checkData.data && checkData.data.subscribed) {
            // If subscribed, fetch the list of subscriptions
            const listResponse = await fetch(`/api/webhooks/${webhookId}/subscriptions/list`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!listResponse.ok) {
                const errorData = await listResponse.json().catch(() => ({ message: 'Failed to parse error response' }));
                console.error('Subscription list fetch failed:', errorData);
                throw new Error(errorData.message || 'Failed to fetch subscription list');
            }

            const subscriptions = await listResponse.json();
            console.log('Subscriptions list:', subscriptions.data.subscriptions);
            await renderSubscriptionCards(webhookId, subscriptions.data.subscriptions);
        } else {
            // If not subscribed, show empty state
            const container = document.getElementById('subscriptions-list-container');
            if (container) {
                container.innerHTML = '<div class="no-subscriptions">No active subscriptions found</div>';
            }
        }
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        const container = document.getElementById('subscriptions-list-container');
        if (container) {
            container.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    }
}

function confirmDeleteSubscription(webhookId, userId) {
    if (confirm(`Are you sure you want to delete the subscription for User ID: ${userId} from webhook ${webhookId}?`)) {
        handleDeleteSubscription(userId);
    }
}

async function handleDeleteSubscription(userId) {
    try {
        const accessToken = getAccessToken();
        const webhookId = document.getElementById('webhook-select').value;
        
        if (!webhookId || !userId) {
            throw new Error('Missing webhook ID or user ID');
        }

        const response = await fetch(`/api/webhooks/${webhookId}/subscriptions/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete subscription');
        }

        // Refresh the subscription list
        await fetchAndDisplaySubscriptions(webhookId);
    } catch (error) {
        console.error('Error deleting subscription:', error);
        alert(error.message);
    }
}

async function handleAddSubscription() {
    try {
        const accessToken = getAccessToken();
        const webhookId = document.getElementById('webhook-select-for-subscriptions').value;
        console.log('Adding subscription for webhook:', webhookId);
        
        if (!webhookId) {
            throw new Error('Please select a webhook first');
        }

        console.log('Making subscription request with token:', accessToken.substring(0, 10) + '...');
        const response = await fetch(`/api/webhooks/${webhookId}/subscriptions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({})
        });

        console.log('Subscription response status:', response.status);
        const responseText = await response.text();
        console.log('Raw response:', responseText);

        if (!response.ok) {
            let errorMessage;
            try {
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.message || errorData.error || 'Failed to add subscription';
                console.error('Add subscription failed with parsed error:', errorData);
            } catch (e) {
                errorMessage = `Failed to add subscription: ${response.status} ${response.statusText}`;
                console.error('Add subscription failed with unparseable response:', responseText);
            }
            throw new Error(errorMessage);
        }

        let result;
        try {
            result = JSON.parse(responseText);
            console.log('Add subscription response:', result);
        } catch (e) {
            console.warn('Could not parse successful response as JSON:', responseText);
        }

        // Refresh the subscription list
        await fetchAndDisplaySubscriptions(webhookId);
        
        // Show success message
        const messageElement = document.getElementById('add-subscription-message');
        if (messageElement) {
            messageElement.textContent = 'Subscription added successfully!';
            messageElement.style.color = 'green';
            setTimeout(() => {
                messageElement.textContent = '';
            }, 3000);
        }
    } catch (error) {
        console.error('Error adding subscription:', error);
        const messageElement = document.getElementById('add-subscription-message');
        if (messageElement) {
            messageElement.textContent = `Error: ${error.message}`;
            messageElement.style.color = 'red';
        }
    }
}

// Ensure functions are globally accessible if called by onclick or from other scripts directly
if (typeof window !== 'undefined') {
    window.fetchAndDisplaySubscriptions = fetchAndDisplaySubscriptions;
    window.handleAddSubscription = handleAddSubscription;
    window.confirmDeleteSubscription = confirmDeleteSubscription; // Make this global for the button's onclick
    window.handleDeleteSubscription = handleDeleteSubscription; // Though called internally, good practice if it were directly used
    window.fetchUserDetailsForSubscription = fetchUserDetailsForSubscription; // Expose if needed, though called internally
} 