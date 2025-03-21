/** WebSocket Setup */
let socket;
let username = "";
let peerConnection; // WebRTC Peer Connection for Video Calls
let remoteStream;   // Stores the remote video/audio stream

// // ICE Server configuration for WebRTC
const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

/** Text Chat Functionality */
function joinRoom() {
    username = document.getElementById("usernameInput").value.trim();
    const roomId = document.getElementById("roomIdInput").value.trim();

    if (!username || !roomId) {
        alert("Please enter both username and Room ID.");
        return;
    }
    
    socket = new WebSocket(`wss://ramesh-cq-chat.koyeb.app/ws/${roomId}`); // Production / live
    //socket = new WebSocket(`ws://localhost:8000/ws/${roomId}`); // Local WebSocket

    // Show loading animation
    let joinButton = document.getElementById("joinButton");
    let joinIcon = document.getElementById("joinIcon");
    // Change the icon to a spinner
    joinIcon.classList.remove("bi-box-arrow-in-right");
    joinIcon.classList.add("spinner-border", "spinner-border-sm");
    joinButton.disabled = true; // Disable button to prevent multiple clicks

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
    }


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
                    .catch(error => console.error("❌ setRemoteDescription error:", error));
            }
        }

        if (data.type === "candidate") {
            if (peerConnection) {
                peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                    .catch(error => console.error("❌ addIceCandidate error:", error));
            }
        }
    };

    socket.onclose = () => {
        console.log("🔄 Disconnected, reconnecting...");
        setTimeout(joinRoom, 3000);
    };
}

/** Sending & Displaying Messages (Text Chat) */
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

/** Video Call Functionality */
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

/** Setting Up WebRTC Connection */
function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(config);
    remoteStream = new MediaStream();
    document.getElementById("remoteVideo").srcObject = remoteStream;
    document.getElementById("remoteVideo").style.display = "block";
    
    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    peerConnection.ontrack = event => {
        console.log("🎥 Received remote stream");
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };
}

/**  Handling Incoming Call Offers */
function handleOffer(offer) {
    document.getElementById("acceptCallButton").style.display = "block";
    document.getElementById("rejectCallButton").style.display = "block";
    document.getElementById("overlay").style.display = "block";

    setupPeerConnection();

    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
        .then(stream => {
            document.getElementById("localVideo").srcObject = stream;
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
            return peerConnection.createAnswer();
        })
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => socket.send(JSON.stringify({ type: "answer", answer: peerConnection.localDescription })))
        .catch(error => console.error("❌ handleOffer error:", error));
}

/** Accepting a Call */
async function acceptCall() {
    console.log("✅ Call accepted!");

    document.getElementById("acceptCallButton").style.display = "none";
    document.getElementById("rejectCallButton").style.display = "none";
    document.getElementById("overlay").style.display = "none";
    document.getElementById("endCallButton").style.display = "block";

    await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: "answer", answer }));
}
