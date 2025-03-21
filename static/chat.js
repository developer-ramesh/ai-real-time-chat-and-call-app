// WebSocket Setup (Common for Both)
let socket;         // WebSocket for communication
let username = "";  // Stores the username
let peerConnection; // WebRTC Peer Connection for Video Calls
let remoteStream;   // Stores the remote video/audio stream
let iceCandidateQueue = []; // Store ICE candidates until the remote description is set


// ICE Server configuration for WebRTC
const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Text Chat Functionality
// Join a Room (Text & Video Calls)
function joinRoom() {
    username = document.getElementById("usernameInput").value.trim();
    const roomId = document.getElementById("roomIdInput").value.trim();

    if (!username || !roomId) {
        alert("Please enter both username and Room ID.");
        return;
    }

    // Connect to WebSocket server (Production / Live)
     socket = new WebSocket(`wss://ramesh-cq-chat.koyeb.app/ws/${roomId}`);
    
    // Connect to WebSocket server (Development / Local)
    //socket = new WebSocket(`ws://localhost:8000/ws/${roomId}`);

    let joinButton = document.getElementById("joinButton");
    let joinIcon = document.getElementById("joinIcon");

    // Show loading animation
    joinIcon.classList.remove("bi-box-arrow-in-right");
    joinIcon.classList.add("spinner-border", "spinner-border-sm");
    joinButton.disabled = true;

    // WebSocket connection established
    socket.onopen = () => {
        console.log("✅ WebSocket connected!");

        // Enable chat and call buttons
        document.getElementById("startAudioCall").removeAttribute("disabled");
        document.getElementById("startVideoCall").removeAttribute("disabled");
        document.getElementById("chatSection").style.display = "block";

        // Reset join button UI
        joinIcon.classList.remove("spinner-border", "spinner-border-sm");
        joinIcon.classList.add("bi-box-arrow-in-right");
        joinButton.textContent = "Joined!";
    };

    socket.onerror = error => console.error("❌ WebSocket error:", error);

    // Handle incoming WebSocket messages
    socket.onmessage = event => {
        const data = JSON.parse(event.data);
        console.log("📩 Received message:", data);

        if (data.type === "text" && data.username !== username) {
            displayMessage(data.username, data.message);
        }

        if (data.type === "call") {
            showReceiveCallButton();
        }

        if (data.type === "offer") {
            window.incomingOffer = data.offer;
            handleOffer(data.offer);
        }

        if (data.type === "answer") {
            if (peerConnection.signalingState !== "stable") {
                peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
                    .then(() => {
                        // Process any queued ICE candidates
                        iceCandidateQueue.forEach(candidate => peerConnection.addIceCandidate(candidate));
                        iceCandidateQueue = []; // Clear the queue
                    })
                    .catch(error => console.error("❌ setRemoteDescription error:", error));
            }
        }

        if (data.type === "candidate") {
            if (peerConnection.remoteDescription) {
                // Add the candidate immediately if remote description is set
                peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                    .catch(error => console.error("❌ addIceCandidate error:", error));
            } else {
                // Queue the ICE candidate until remote description is set
                iceCandidateQueue.push(new RTCIceCandidate(data.candidate));
            }
        }

        if (data.type === "reject") {
            console.log("📴 The other user rejected the call.");
            document.getElementById("acceptCallButton").style.display = "none";
            document.getElementById("rejectCallButton").style.display = "none";
            document.getElementById("overlay").style.display = "none";
        }
    
        if (data.type === "end") {
            console.log("📴 The other user ended the call.");
            endCall();
        }
    };

    socket.onclose = () => {
        console.log("🔄 Disconnected, reconnecting...");
        setTimeout(joinRoom, 3000);
    };
}

// Sending & Displaying Messages (Text Chat)
function sendMessage() {
    const messageInput = document.getElementById("messageInput");
    const message = messageInput.value.trim();

    if (message !== "" && socket.readyState === WebSocket.OPEN) {
        const data = JSON.stringify({ type: "text", username, message });

        displayMessage(username, message);
        socket.send(data);

        messageInput.value = "";
        toggleSendButton();
    }
}

// Display received/sent messages in chat
function displayMessage(sender, message) {
    const chatBox = document.getElementById("chatBox");

    const placeholder = chatBox.querySelector(".text-muted");
    if (placeholder) {
        placeholder.remove();
    }

    const messageWrapper = document.createElement("div");
    const messageElement = document.createElement("div");
    const usernameElement = document.createElement("div");

    const isMe = sender === username;
    const displaySender = isMe ? "Me" : sender;

    messageWrapper.className = "d-flex flex-column";
    usernameElement.className = `username text-${isMe ? "end" : "start"}`;
    messageElement.className = `chat-bubble ${isMe ? "sent align-self-end" : "received align-self-start"}`;

    usernameElement.textContent = displaySender;
    messageElement.textContent = message;

    messageWrapper.appendChild(usernameElement);
    messageWrapper.appendChild(messageElement);
    chatBox.appendChild(messageWrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Enable/Disable send button based on input
function toggleSendButton() {
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendButton");

    if (messageInput.value.trim() !== "") {
        sendButton.removeAttribute("disabled");
    } else {
        sendButton.setAttribute("disabled", "true");
    }
}

// Video Call Functionality
// Starting a Video Call
function startVideoCall() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert("Please join a room first!");
        return;
    }
    console.log("📹 Starting video call...");

    // Request video & audio permissions
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            document.getElementById("localVideo").srcObject = stream;
            setupPeerConnection();
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => socket.send(JSON.stringify({ type: "offer", offer: peerConnection.localDescription })));
        })
        .catch(error => console.error("❌ Media error:", error));
}

// Setting Up WebRTC Connection
function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(config);
    remoteStream = new MediaStream();
    document.getElementById("remoteVideo").srcObject = remoteStream;

    peerConnection.ontrack = event => {
        console.log("🎥 Received remote stream:", event.streams);
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState);
    };
}


// Handling Incoming Call Offers
function handleOffer(offer) {
    document.getElementById("acceptCallButton").style.display = "block";
    document.getElementById("rejectCallButton").style.display = "block";
    document.getElementById("overlay").style.display = "block";

    setupPeerConnection();

    // Store the offer until the user accepts
    window.incomingOffer = offer;

    // DO NOT set remote description yet (wait for user to accept)


    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
        .then(stream => {
            console.log("🎥 Local stream started:", stream);
            document.getElementById("localVideo").srcObject = stream;
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream)); // Add local tracks

            return peerConnection.createAnswer();
        })
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => socket.send(JSON.stringify({ type: "answer", answer: peerConnection.localDescription })))
        .catch(error => console.error("❌ handleOffer error:", error));
}

// Accepting a Call
async function acceptCall() {
    console.log("✅ Call accepted!");

    document.getElementById("acceptCallButton").style.display = "none";
    document.getElementById("rejectCallButton").style.display = "none";
    document.getElementById("overlay").style.display = "none";
    document.getElementById("endCallButton").style.display = "block"; // Show End Call button

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = stream;
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: "answer", answer }));

    // Show remote video only after accepting
    document.getElementById("remoteVideo").style.display = "block";
}

// Reject the Call
function rejectCall() {
    console.log("🚫 Call rejected!");
    document.getElementById("acceptCallButton").style.display = "none";
    document.getElementById("rejectCallButton").style.display = "none";
    document.getElementById("overlay").style.display = "none";

    // Send a rejection message
    socket.send(JSON.stringify({ type: "call-rejected" }));
}

async function acceptCall() {
    console.log("✅ Call accepted!");

    document.getElementById("acceptCallButton").style.display = "none";
    document.getElementById("rejectCallButton").style.display = "none";
    document.getElementById("endCallButton").style.display = "block"; // Show end call button
    document.getElementById("overlay").style.display = "none";

    setupPeerConnection();

    await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: "answer", answer }));
}

function endCall() {
    console.log("📴 Ending call...");
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    document.getElementById("localVideo").srcObject = null;
    document.getElementById("remoteVideo").srcObject = null;
    document.getElementById("endCallButton").style.display = "none";
    document.getElementById("acceptCallButton").style.display = "none";
    document.getElementById("rejectCallButton").style.display = "none";
    document.getElementById("overlay").style.display = "none";

    socket.send(JSON.stringify({ type: "call-ended" }));
}


