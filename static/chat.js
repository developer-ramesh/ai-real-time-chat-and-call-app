let socket;
let username = "";
let peerConnection;
let remoteStream;

const config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function joinRoom() {
    username = document.getElementById("usernameInput").value.trim();
    const roomId = document.getElementById("roomIdInput").value.trim();

    if (!username || !roomId) {
        alert("Please enter both username and Room ID.");
        return;
    }

    socket = new WebSocket(`wss://ramesh-cq-chat.koyeb.app/ws/${roomId}`); // Production / live
    //socket = new WebSocket(`ws://localhost:8000/ws/${roomId}`);

    socket.onopen = () => console.log("✅ WebSocket connected successfully!");
    socket.onerror = error => console.error("❌ WebSocket error:", error);

    document.getElementById("startAudioCall").removeAttribute("disabled");
    document.getElementById("startVideoCall").removeAttribute("disabled");
    document.getElementById("chatSection").style.display = "block";

    socket.onmessage = async event => {
        const data = JSON.parse(event.data);
        console.log("Received WebSocket message:", data);

        if (data.type === "text" && data.username !== username) {
            displayMessage(data.username, data.message);
        }

        if (data.type === "offer") {
            console.log("Incoming video call...");
            await handleOffer(data.offer);
        }

        if (data.type === "answer") {
            console.log("Received answer...");
            if (peerConnection && !peerConnection.remoteDescription) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        }

        if (data.type === "candidate") {
            console.log("Received ICE candidate...");
            if (peerConnection) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        }
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

async function startVideoCall() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert("Please join a room before starting a video call.");
        return;
    }
    console.log("Starting video call...");

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = stream;

    setupPeerConnection();

    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.send(JSON.stringify({ type: "offer", offer: peerConnection.localDescription }));
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    remoteStream = new MediaStream();
    document.getElementById("remoteVideo").srcObject = remoteStream;

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    peerConnection.ontrack = event => {
        console.log("🎥 Received remote video stream...");
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };
}

async function handleOffer(offer) {
    console.log("Processing incoming offer...");

    if (!peerConnection) {
        setupPeerConnection();
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.send(JSON.stringify({ type: "answer", answer }));
}
