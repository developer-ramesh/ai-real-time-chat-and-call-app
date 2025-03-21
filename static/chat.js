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

        if (data.type === "text" && data.username !== username) {
            displayMessage(data.username, data.message);
        }

        if (data.type === "call") {
            console.log("call...");
            showReceiveCallButton();
        }

        if (data.type === "offer") {
            console.log("Incoming video call...");
            window.incomingOffer = data.offer;  // Store for later use
            showAcceptCallUI();
        }

        if (data.type === "answer") {
            console.log("Received answer...");
            if (peerConnection && peerConnection.remoteDescription === null) {
                peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        }

        if (data.type === "candidate") {
            console.log("Received ICE candidate...");
            if (peerConnection) {
                peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        }
    };

    socket.onclose = () => {
        console.log("Disconnected from WebSocket, attempting to reconnect...");
        setTimeout(joinRoom, 3000);
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
        console.error("Socket not initialized yet.");
        alert("Please join a room before starting a video call.");
        return;
    }
    console.log("Starting video call...");

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            document.getElementById("localVideo").srcObject = stream;

            setupPeerConnection();
            stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

            peerConnection.createOffer()
                .then(offer => peerConnection.setLocalDescription(offer))
                .then(() => {
                    socket.send(JSON.stringify({ type: "offer", offer: peerConnection.localDescription }));
                });

        })
        .catch(error => {
            console.error("Error accessing camera/microphone:", error);
        });
}

function showReceiveCallButton() {
    let receiveCallBtn = document.getElementById("receiveCall");

    if (!receiveCallBtn) {
        receiveCallBtn = document.createElement("button");
        receiveCallBtn.id = "receiveCall";
        receiveCallBtn.textContent = "Receive Call";
        receiveCallBtn.classList.add("btn", "btn-success", "mt-2");
        receiveCallBtn.onclick = acceptCall;

        document.getElementById("callControls").appendChild(receiveCallBtn);
    }
}

function showAcceptCallUI() {
    document.getElementById("acceptCallButton").style.display = "block";
    document.getElementById("overlay").style.display = "block";
}

async function acceptCall() {
    console.log("Call accepted!");

    document.getElementById("acceptCallButton").style.display = "none";
    document.getElementById("overlay").style.display = "none";

    if (document.getElementById("dimBackground")) {
        document.getElementById("dimBackground").remove();
    }

    if (!peerConnection) {
        setupPeerConnection();
    }

    if (!peerConnection.remoteDescription) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.send(JSON.stringify({ type: "answer", answer }));
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

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
