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

        socket.send(JSON.stringify({ type: "join", room: roomId, username: username }));
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

        if (data.type === "call-request") {
            showReceiveCallButton(data.caller);
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
        
        // Handle Incoming Audio Calls
        if (data.type === "audio-offer") {
            window.incomingOffer = data.offer;
            handleAudioOffer(data.offer);
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
    // console.log("📹 Starting video call...");

    // // Request video & audio permissions
    // navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    //     .then(stream => {
    //         document.getElementById("localVideo").srcObject = stream;
    //         setupPeerConnection();
    //         stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    //         peerConnection.createOffer()
    //             .then(offer => peerConnection.setLocalDescription(offer))
    //             .then(() => socket.send(JSON.stringify({ type: "offer", offer: peerConnection.localDescription })));
    //     })
    //     .catch(error => console.error("❌ Media error:", error));


    console.log("📹 Sending call request...");

    // Notify the remote user about the call
    socket.send(JSON.stringify({ type: "call-request", caller: username }));
}

function showReceiveCallButton(caller) {
    document.getElementById("acceptCallButton").style.display = "block";
    document.getElementById("rejectCallButton").style.display = "block";
    document.getElementById("overlay").style.display = "block";
    //document.getElementById("callerName").textContent = `${caller} is calling...`;
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

    // peerConnection.ontrack = event => {
    //     console.log("🎥 Received remote stream");
    //     event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    // };

    peerConnection.ontrack = event => {
        console.log("📡 Received remote media stream");
    
        const stream = event.streams[0];
    
        // Check if the stream contains a video track
        const hasVideo = stream.getVideoTracks().length > 0;
        const hasAudio = stream.getAudioTracks().length > 0;
    
        if (hasVideo) {
            console.log("📹 Video track detected");
    
            let remoteVideo = document.getElementById("remoteVideo");
            if (!remoteVideo) {
                remoteVideo = document.createElement("video");
                remoteVideo.id = "remoteVideo";
                remoteVideo.autoplay = true;
                remoteVideo.playsInline = true;
                document.body.appendChild(remoteVideo);
            }
    
            remoteVideo.srcObject = stream;
        }
    
        if (hasAudio) {
            console.log("🎙️ Audio track detected");
    
            let remoteAudio = document.getElementById("remoteAudio");
            if (!remoteAudio) {
                remoteAudio = document.createElement("audio");
                remoteAudio.id = "remoteAudio";
                remoteAudio.autoplay = true;
                document.body.appendChild(remoteAudio);
            }
    
            remoteAudio.srcObject = stream;
        }
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
    // console.log("✅ Call accepted!");

    // document.getElementById("acceptCallButton").style.display = "none";
    // document.getElementById("rejectCallButton").style.display = "none";
    // document.getElementById("overlay").style.display = "none";
    // document.getElementById("endCallButton").style.display = "block";

    // await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));
    // const answer = await peerConnection.createAnswer();
    // await peerConnection.setLocalDescription(answer);
    // socket.send(JSON.stringify({ type: "answer", answer }));


    console.log("✅ Call accepted!");
    document.getElementById("overlay").style.display = "none";
    
    // Request media permissions and proceed with the video call
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

// Start Audio Call
function startAudioCall() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert("Please join a room first!");
        return;
    }
    console.log("🎙️ Starting audio call...");

    navigator.mediaDevices.getUserMedia({ audio: true }) // Audio-only
        .then(stream => {
            document.getElementById("startAudioCall").disabled = true;
            document.getElementById("startVideoCall").disabled = true;
            document.getElementById("endCallButton").style.display = "block";

            setupPeerConnection(); // Setup WebRTC
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => {
                    socket.send(JSON.stringify({ type: "audio-offer", offer: peerConnection.localDescription }));
                });
        })
        .catch(error => console.error("❌ Audio error:", error));
}

// Handle Incoming Audio Offer
function handleAudioOffer(offer) {
    document.getElementById("acceptCallButton").style.display = "block";
    document.getElementById("rejectCallButton").style.display = "block";
    document.getElementById("overlay").style.display = "block";

    setupPeerConnection(); // Setup WebRTC connection

    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => navigator.mediaDevices.getUserMedia({ audio: true })) // Audio-only
        .then(stream => {
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
            return peerConnection.createAnswer();
        })
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
            socket.send(JSON.stringify({ type: "answer", answer: peerConnection.localDescription }));
        })
        .catch(error => console.error("❌ Error handling audio offer:", error));
}

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Hide call UI buttons
    document.getElementById("startAudioCall").disabled = false;
    document.getElementById("startVideoCall").disabled = false;
    document.getElementById("endCallButton").style.display = "none";

    // Remove remote audio
    const remoteAudio = document.getElementById("remoteAudio");
    if (remoteAudio) {
        remoteAudio.pause();
        remoteAudio.srcObject = null;
        remoteAudio.remove();
    }

    console.log("🔴 Call ended.");
}



