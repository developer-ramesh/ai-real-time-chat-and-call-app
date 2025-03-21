let socket;
let username = "";
let peerConnection;

const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }] // STUN server for NAT traversal
};

function joinRoom() {
    username = document.getElementById("usernameInput").value.trim();
    const roomId = document.getElementById("roomIdInput").value.trim();

    if (!username || !roomId) {
        alert("Please enter both username and Room ID.");
        return;
    }

    socket = new WebSocket(`wss://ramesh-cq-chat.koyeb.app/ws/${roomId}`); // Production / live
    //socket = new WebSocket(`ws://localhost:8000/ws/${roomId}`); // Local development


    socket.onopen = () => console.log("✅ WebSocket connected successfully!");
    socket.onerror = error => console.error("❌ WebSocket error:", error);

    document.getElementById("startAudioCall").removeAttribute("disabled");
    document.getElementById("startVideoCall").removeAttribute("disabled");
    document.getElementById("chatSection").style.display = "block";

    socket.onmessage = event => {
        const data = JSON.parse(event.data);
        console.log("Received WebSocket message:", data);

        // Handle text messages
        if (data.type === "text" && data.username !== username) {
            displayMessage(data.username, data.message);
        }

        // Handle incoming call (Show "Receive Call" button)
        if (data.type === "call") {
            console.log("call...");
            showReceiveCallButton();
        }

        // Handle incoming WebRTC messages
        if (data.type === "offer") {
            console.log("Incoming video call...");
    
            // Show "Accept Call" button
            document.getElementById("acceptCallButton").style.display = "block";
    
            // Store offer details for later use
            window.incomingOffer = data.offer;
    
            handleOffer(data.offer);
        }
        if (data.type === "answer") {
            console.log("answer...");
            peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        if (data.type === "candidate") {
            console.log("candidate...");
            peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    };

    socket.onclose = () => {
        console.log("Disconnected from WebSocket, attempting to reconnect...");
        setTimeout(joinRoom, 3000); // Auto-reconnect after 3 seconds
    };
}

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

function toggleSendButton() {
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendButton");

    if (messageInput.value.trim() !== "") {
        sendButton.removeAttribute("disabled");
    } else {
        sendButton.setAttribute("disabled", "true");
    }
}

function startVideoCall() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error("Socket not initialized yet. WebRTC signaling will not work until you join a room.");
        alert("Please join a room before starting a video call.");
        return;
    }
    console.log("Starting video call...");
    document.querySelector(".video-container").style.display = "flex";

    // Get user media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            document.getElementById("localVideo").srcObject = stream;

            peerConnection = new RTCPeerConnection(config);
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
                }
            };

            peerConnection.ontrack = event => {
                console.log("Received remote video stream....");
                document.getElementById("remoteVideo").srcObject = event.streams[0];
            };

            peerConnection.createOffer()
                .then(offer => {
                    return peerConnection.setLocalDescription(offer);
                })
                .then(() => {
                    socket.send(JSON.stringify({ type: "offer", offer: peerConnection.localDescription }));
                });

        })
        .catch(error => {
            console.error("Error accessing camera/microphone:", error);
        });
}

// Show "Receive Call" button when a call is incoming
function showReceiveCallButton() {
    let receiveCallBtn = document.getElementById("receiveCall");

    if (!receiveCallBtn) {
        receiveCallBtn = document.createElement("button");
        receiveCallBtn.id = "receiveCall";
        receiveCallBtn.textContent = "Receive Call";
        receiveCallBtn.classList.add("btn", "btn-success", "mt-2");
        receiveCallBtn.onclick = receiveCall;

        document.getElementById("callControls").appendChild(receiveCallBtn);
    }
}

// Function to handle receiving a call
function handleOffer(offer) {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            document.getElementById("localVideo").srcObject = stream;
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            return peerConnection.createAnswer();
        })
        .then(answer => {
            return peerConnection.setLocalDescription(answer);
        })
        .then(() => {
            socket.send(JSON.stringify({ type: "answer", answer: peerConnection.localDescription }));
        });

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    peerConnection.ontrack = event => {
        console.log("Received remote video stream.");
        document.getElementById("remoteVideo").srcObject = event.streams[0];
    };
}

// async function acceptCall() {
//     console.log("Call accepted!");

//     document.querySelector(".video-container").style.display = "flex";

//     document.getElementById("acceptCallButton").style.display = "none"; // Hide button

//     // Set up WebRTC peer connection
//     await setupPeerConnection();

//     // Set remote offer received from WebSocket
//     await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));

//     // Create an answer and send it back to the caller
//     const answer = await peerConnection.createAnswer();
//     await peerConnection.setLocalDescription(answer);

//     socket.send(JSON.stringify({ type: "answer", answer }));
// }

async function acceptCall() {
    console.log("Call accepted!");

    document.querySelector(".video-container").style.display = "flex";
    document.getElementById("acceptCallButton").style.display = "none"; // Hide button

    // Handle the incoming offer and start the call
    handleOffer(window.incomingOffer);
}
