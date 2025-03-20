from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
import os
from fastapi.middleware.cors import CORSMiddleware
import logging
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Dictionary to manage active rooms and connections
active_connections = {}

@app.post("/upload/{room_id}")
async def upload_file(room_id: str, file: UploadFile = File(...)):
    """Endpoint to upload recorded WebM files for each room."""
    file_path = os.path.join(UPLOAD_DIR, f"{room_id}-{file.filename}")

    try:
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        logging.info(f"File uploaded: {file_path}")
        return {"message": "File uploaded successfully", "filename": file.filename}
    except Exception as e:
        logging.error(f"Error saving file: {e}")
        return {"error": "File upload failed"}

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """Handles WebRTC signaling through WebSockets."""
    await websocket.accept()
    logging.info(f"🔗 WebSocket Connected: Room {room_id}")

    if room_id not in active_connections:
        active_connections[room_id] = set()
    active_connections[room_id].add(websocket)

    try:
        while True:
            message = await websocket.receive_text()
            logging.info(f"📨 Message from Room {room_id}: {message}")

            # Broadcast to all clients in the room except sender
            await broadcast_message(room_id, message, sender=websocket)
    
    except WebSocketDisconnect:
        logging.warning(f"❌ WebSocket Disconnected: Room {room_id}")
        await remove_connection(room_id, websocket)
    
    except Exception as e:
        logging.error(f"⚠️ Unexpected WebSocket Error: {e}")
        await remove_connection(room_id, websocket)


async def broadcast_message(room_id: str, message: str, sender: WebSocket):
    """Send a message to all WebSockets in a room except the sender."""
    if room_id in active_connections:
        for connection in active_connections[room_id]:
            if connection != sender:
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logging.error(f"⚠️ Error sending message: {e}")
                    await remove_connection(room_id, connection)


async def remove_connection(room_id: str, websocket: WebSocket):
    """Remove a disconnected WebSocket and clean up empty rooms."""
    if room_id in active_connections:
        active_connections[room_id].discard(websocket)
        if not active_connections[room_id]:  # If room is empty, remove it
            del active_connections[room_id]
            logging.info(f"🚪 Room {room_id} closed.")


# Serve static files (CSS, JS, etc.)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve index.html at root "/"
@app.get("/")
async def serve_home():
    return FileResponse("static/index.html")


if __name__ == '__main__':
    logging.info("🚀 Starting WebSocket Server...")
    app.run(host='0.0.0.0', port=8000)
