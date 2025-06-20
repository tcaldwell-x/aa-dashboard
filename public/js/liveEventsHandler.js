let pollInterval = null;
const MAX_EVENTS_DISPLAYED = 50; // Keep a manageable number of events on screen
const POLL_INTERVAL = 5000; // Poll every 5 seconds

function formatXTimestamp(timestamp) {
    // Parses X's timestamp string and formats it
    // Example: "Thu May 15 12:35:18 +0000 2025"
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            return timestamp; // Return original if parsing fails
        }
        return date.toLocaleString(); // User's local time
    } catch (e) {
        return timestamp; // Fallback
    }
}

function createEventCard(eventData) {
    const card = document.createElement('div');
    card.className = 'event-card';

    let title = 'Unrecognized Event Type';
    let details = '';
    let primaryContent = '';
    let footer = '';
    let eventSpecificClass = 'event-card-system'; // Default class
    let receivedTime = new Date().toLocaleTimeString();

    if (eventData.type === "connection_ack") {
        title = 'System Message';
        primaryContent = `<p><em>${eventData.message}</em></p>`;
        footer = `<p><small>At: ${receivedTime}</small></p>`;
        // eventSpecificClass is already event-card-system
    } else if (eventData.tweet_create_events && eventData.tweet_create_events.length > 0) {
        const tweetEvent = eventData.tweet_create_events[0];
        const user = tweetEvent.user;
        title = 'New Post';
        primaryContent = `
            <p><strong>From:</strong> ${user.name} (@${user.screen_name})</p>
            <p><strong>Post:</strong> ${tweetEvent.text}</p>
        `;
        footer = `
            <p><small>Post ID: ${tweetEvent.id_str} | User ID: ${user.id_str}</small></p>
            <p><small>Posted At: ${formatXTimestamp(tweetEvent.created_at)} | Received: ${receivedTime}</small></p>
        `;
        eventSpecificClass = 'event-card-tweet-create';
    } else if (eventData.tweet_delete_events && eventData.tweet_delete_events.length > 0) {
        const deleteEvent = eventData.tweet_delete_events[0];
        title = 'Post Deleted';
        primaryContent = `
            <p><strong>Post ID:</strong> ${deleteEvent.status.id}</p>
            <p><strong>User ID:</strong> ${deleteEvent.status.user_id}</p>
        `;
        footer = `
            <p><small>Event Timestamp (UTC ms): ${deleteEvent.timestamp_ms} | Processed: ${new Date(parseInt(deleteEvent.timestamp_ms)).toLocaleString()}</small></p>
            <p><small>Received by Dashboard: ${receivedTime}</small></p>
        `;
        eventSpecificClass = 'event-card-tweet-delete';
    } else if (eventData.favorite_events && eventData.favorite_events.length > 0) {
        const favEvent = eventData.favorite_events[0];
        title = 'Post Favorited';
        primaryContent = `
            <p><strong>User:</strong> ${favEvent.user.name} (@${favEvent.user.screen_name}) favorited a post.</p>
            <p><strong>Favorited Post ID:</strong> ${favEvent.favorited_status.id_str}</p>
            <p><strong>Favorited Post User:</strong> @${favEvent.favorited_status.user.screen_name}</p>
        `;
        footer = `<p><small>Event At: ${formatXTimestamp(favEvent.created_at)} | Received: ${receivedTime}</small></p>`;
        eventSpecificClass = 'event-card-favorite';
    } else if (eventData.follow_events && eventData.follow_events.length > 0) {
        const followEvent = eventData.follow_events[0];
        const actor = followEvent.source;
        const target = followEvent.target;
        const actionText = followEvent.type === 'follow' ? 'followed' : 'unfollowed';
        title = `User ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`;
        primaryContent = `<p><strong>${actor.name}</strong> (@${actor.screen_name}) ${actionText} <strong>${target.name}</strong> (@${target.screen_name}).</p>`;
        footer = `<p><small>Event Timestamp: ${new Date(parseInt(followEvent.created_timestamp)).toLocaleString()} | Received: ${receivedTime}</small></p>`;
        eventSpecificClass = followEvent.type === 'follow' ? 'event-card-follow' : 'event-card-unfollow';
    } else if (eventData.mute_events && eventData.mute_events.length > 0) {
        const muteEvent = eventData.mute_events[0];
        const actor = muteEvent.source;
        const target = muteEvent.target;
        const actionText = muteEvent.type === 'mute' ? 'muted' : 'unmuted';
        title = `User ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`;
        primaryContent = `<p><strong>${actor.name}</strong> (@${actor.screen_name}) ${actionText} <strong>${target.name}</strong> (@${target.screen_name}).</p>`;
        footer = `<p><small>Event Timestamp: ${new Date(parseInt(muteEvent.created_timestamp)).toLocaleString()} | Received: ${receivedTime}</small></p>`;
        eventSpecificClass = muteEvent.type === 'mute' ? 'event-card-mute' : 'event-card-unmute';
    } else if (eventData.replay_job_status) {
        const statusEvent = eventData.replay_job_status;
        title = 'Replay Job Status';
        primaryContent = `
            <p><strong>Webhook ID:</strong> ${statusEvent.webhook_id}</p>
            <p><strong>Job ID:</strong> ${statusEvent.job_id}</p>
            <p><strong>State:</strong> ${statusEvent.job_state}</p>
            <p><strong>Description:</strong> ${statusEvent.job_state_description || 'N/A'}</p>
        `;
        footer = `<p><small>Received: ${receivedTime}</small></p>`;
        eventSpecificClass = 'event-card-replay-status';
    } else if (eventData.direct_message_events && eventData.direct_message_events.length > 0) {
        const dmEvent = eventData.direct_message_events[0];
        if (dmEvent.type === 'message_create') {
            const messageCreate = dmEvent.message_create;
            const senderId = messageCreate.sender_id;
            const recipientId = messageCreate.target.recipient_id;
            const forUserId = eventData.for_user_id;
            const users = eventData.users || {};
            const sender = users[senderId] || { screen_name: senderId, name: 'Unknown User' };
            const recipient = users[recipientId] || { screen_name: recipientId, name: 'Unknown User' };

            if (senderId === forUserId) {
                title = 'DM - Sent';
                eventSpecificClass = 'event-card-dm-sent';
                primaryContent = `<p><strong>To:</strong> @${recipient.screen_name} (${recipient.name})</p>`;
            } else {
                title = 'DM - Received';
                eventSpecificClass = 'event-card-dm-received';
                primaryContent = `<p><strong>From:</strong> @${sender.screen_name} (${sender.name})</p>`;
            }
            primaryContent += `<p><strong>Message:</strong> ${messageCreate.message_data.text}</p>`;
            footer = `<p><small>DM ID: ${dmEvent.id} | Timestamp: ${new Date(parseInt(dmEvent.created_timestamp)).toLocaleString()}</small></p>`;
            footer += `<p><small>Received: ${receivedTime}</small></p>`;
        } else {
             // Potentially handle other DM event types like 'participants_join', etc.
            title = 'Direct Message Event';
            details = `<pre>${JSON.stringify(eventData, null, 2)}</pre>`;
            footer = `<p><small>Received: ${receivedTime}</small></p>`;
        }
    } else if (eventData.direct_message_indicate_typing_events && eventData.direct_message_indicate_typing_events.length > 0) {
        const typingEvent = eventData.direct_message_indicate_typing_events[0];
        const senderId = typingEvent.sender_id;
        const recipientId = typingEvent.target.recipient_id;
        const forUserId = eventData.for_user_id;
        const users = eventData.users || {};
        const sender = users[senderId] || { screen_name: senderId, name: 'Unknown User' };
        // const recipient = users[recipientId] || { screen_name: recipientId, name: 'Unknown User' }; // Recipient is forUserId

        title = 'DM - Typing Indicator';
        if (recipientId === forUserId) { // Typing event is directed at the subscribed user
            primaryContent = `<p><em>@${sender.screen_name} (${sender.name}) is typing...</em></p>`;
        } else { // Should not happen if webhook is for forUserId, but good to be complete
            primaryContent = `<p><em>@${sender.screen_name} is typing to @${users[recipientId]?.screen_name || recipientId}...</em></p>`;
        }
        footer = `<p><small>Timestamp: ${new Date(parseInt(typingEvent.created_timestamp)).toLocaleString()} | Received: ${receivedTime}</small></p>`;
        eventSpecificClass = 'event-card-dm-typing';
    } else if (eventData.direct_message_mark_read_events && eventData.direct_message_mark_read_events.length > 0) {
        const markReadEvent = eventData.direct_message_mark_read_events[0];
        const readerId = markReadEvent.sender_id; // The user who marked messages as read
        const originalSenderId = markReadEvent.target.recipient_id; // The user whose messages were read (for_user_id in this context)
        const forUserId = eventData.for_user_id;
        const users = eventData.users || {};
        const reader = users[readerId] || { screen_name: readerId, name: 'Unknown User' };
        const originalSender = users[originalSenderId] || { screen_name: originalSenderId, name: 'Unknown User' };

        title = 'DM - Read Receipt';
        // The event indicates that messages *sent by target.recipient_id* were read by *sender_id*.
        // So if forUserId is target.recipient_id, it means their sent messages were read.
        if (originalSenderId === forUserId) {
             primaryContent = `<p><em>@${reader.screen_name} (${reader.name}) read your messages.</em></p>`;
        } else { // This case might be less common if webhooks are configured for a specific user to monitor *their* events.
            primaryContent = `<p><em>@${reader.screen_name} (${reader.name}) read messages from @${originalSender.screen_name} (${originalSender.name}).</em></p>`;
        }
        primaryContent += `<p><small>Last read event ID: ${markReadEvent.last_read_event_id}</small></p>`;
        footer = `<p><small>Timestamp: ${new Date(parseInt(markReadEvent.created_timestamp)).toLocaleString()} | Received: ${receivedTime}</small></p>`;
        eventSpecificClass = 'event-card-dm-read-receipt';
    } else {
        // Fallback for truly unrecognized or new event types not yet handled
        title = 'Unrecognized Event';
        details = `<pre>${JSON.stringify(eventData, null, 2)}</pre>`;
        footer = `<p><small>Received: ${receivedTime}</small></p>`;
        // eventSpecificClass is already event-card-system or a generic one
    }
    
    card.innerHTML = `<h4>${title}</h4>${primaryContent}${details}${footer}`;
    card.classList.add(eventSpecificClass);
    return card;
}

function addEventToContainer(eventData) {
    const container = document.getElementById('live-events-container');
    if (!container) return;

    const card = createEventCard(eventData);
    container.insertBefore(card, container.firstChild); // Add new events to the top

    // Limit the number of displayed events
    while (container.children.length > MAX_EVENTS_DISPLAYED) {
        container.removeChild(container.lastChild);
    }
}

// Make initializeLiveEvents available globally
window.initializeLiveEvents = async function() {
    const liveEventsContainer = document.getElementById('live-events-container');
    if (!liveEventsContainer) {
        console.error("Live events container not found.");
        return;
    }

    liveEventsContainer.innerHTML = '<p><i>Attempting to connect to live event stream...</i></p>';

    if (pollInterval) {
        console.log("Polling already active for live events.");
        addEventToContainer({type: "connection_ack", message: "Re-focused tab. Polling was already active."});
        return;
    }

    // Get the auth token from tokenData
    const tokenData = localStorage.getItem('tokenData');
    if (!tokenData) {
        console.error("[Poll] No token data found");
        liveEventsContainer.innerHTML = '<p style="color:red;"><i>Authentication token not found. Please log in again.</i></p>';
        return;
    }

    try {
        const { access_token } = JSON.parse(tokenData);
        if (!access_token) {
            throw new Error('Invalid token data');
        }

        // Start polling
        pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/events/poll?token=${encodeURIComponent(access_token)}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                console.log("[Poll] Response from server:", data);
                
                // Handle connection acknowledgment
                if (data.type === "connection_ack") {
                    console.log("[Poll] Connection acknowledged by server");
                    if(liveEventsContainer.firstChild && liveEventsContainer.firstChild.tagName === 'P' && liveEventsContainer.firstChild.textContent.includes('Attempting to connect')){
                        liveEventsContainer.innerHTML = ''; // Clear "Attempting to connect..."
                    }
                    return;
                }
                
                addEventToContainer(data);
            } catch (error) {
                console.error("[Poll] Error polling server:", error);
                addEventToContainer({ 
                    type: "system_error", 
                    message: "Error polling server. See console for details.",
                    details: error.message 
                });
            }
        }, POLL_INTERVAL);

        // Initial poll
        const initialResponse = await fetch(`/events/poll?token=${encodeURIComponent(access_token)}`);
        if (!initialResponse.ok) {
            throw new Error(`HTTP error! status: ${initialResponse.status}`);
        }
        const initialData = await initialResponse.json();
        console.log("[Poll] Initial response from server:", initialData);
        
        if (initialData.type === "connection_ack") {
            console.log("[Poll] Initial connection acknowledged by server");
            if(liveEventsContainer.firstChild && liveEventsContainer.firstChild.tagName === 'P' && liveEventsContainer.firstChild.textContent.includes('Attempting to connect')){
                liveEventsContainer.innerHTML = ''; // Clear "Attempting to connect..."
            }
        }

        return {
            stop: () => {
                if (pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = null;
                }
            }
        };
    } catch (e) {
        console.error("[Poll] Error parsing token data:", e);
        liveEventsContainer.innerHTML = '<p style="color:red;"><i>Error parsing authentication token. Please log in again.</i></p>';
        return {
            stop: () => {}
        };
    }
}; 