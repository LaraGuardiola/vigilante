import { networkInterfaces } from "os";
import { file } from "bun";

const PORT = 5174;
const CERTS_DIR = "./certs";

// MOBILE CLIENT HTML (camera transmitter)
const MOBILE_CLIENT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>📹 Security Camera</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      position: fixed;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #000;
      color: #fff;
      display: flex;
      flex-direction: column;
    }

    #status {
      padding: 10px 15px;
      background: #2a2a2a;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #f44336;
      animation: pulse 2s infinite;
    }

    .status-dot.connected {
      background: #4CAF50;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    #video-container {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      overflow: hidden;
    }

    #video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    #stats {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.8);
      padding: 8px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-family: monospace;
      display: none;
    }

    #stats.active {
      display: block;
    }

    #controls {
      background: #1a1a1a;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }

    button {
      padding: 12px;
      font-size: 15px;
      font-weight: bold;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    button:active {
      opacity: 0.7;
    }

    .btn-primary {
      background: #4CAF50;
      color: white;
    }

    .btn-danger {
      background: #f44336;
      color: white;
    }

    .btn-secondary {
      background: #2196F3;
      color: white;
    }

    #camera-name {
      width: 100%;
      padding: 10px;
      font-size: 15px;
      border: 2px solid #333;
      border-radius: 8px;
      background: #2a2a2a;
      color: #fff;
    }

    .button-row {
      display: flex;
      gap: 8px;
    }

    .button-row button {
      flex: 1;
    }
  </style>
</head>
<body>
  <div id="status">
    <span class="status-dot" id="status-dot"></span>
    <span id="status-text">Disconnected</span>
  </div>

  <div id="video-container">
    <video id="video" autoplay playsinline muted></video>
    <div id="stats">
      <div id="stat-fps">📊 0 fps</div>
      <div id="stat-sent">📤 0 frames</div>
    </div>
  </div>

  <div id="controls">
    <input type="text" id="camera-name" placeholder="Camera name (e.g. Living Room)" value="My Camera">
    <button id="btn-start" class="btn-primary">📹 Start Streaming</button>
    <div class="button-row" style="display:none" id="active-controls">
      <button id="btn-stop" class="btn-danger">⏹ Stop</button>
      <button id="btn-flip" class="btn-secondary">🔄 Flip</button>
    </div>
  </div>

  <script>
    const video = document.getElementById('video');
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    const btnFlip = document.getElementById('btn-flip');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const cameraNameInput = document.getElementById('camera-name');

    let ws;
    let stream;
    let canvas;
    let ctx;
    let streaming = false;
    let frameCount = 0;
    let useFrontCamera = false;
    let reconnectTimeout;

    cameraNameInput.value = localStorage.getItem('cameraName') || 'My Camera';

    function init() {
      connectWebSocket();
      canvas = document.createElement('canvas');
      ctx = canvas.getContext('2d');
    }

    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + '/ws';

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ Connected to server');
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected - Ready to stream';
        clearTimeout(reconnectTimeout);
      };

      ws.onclose = () => {
        console.log('📴 Disconnected');
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
        stopStreaming();

        // Auto-reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          connectWebSocket();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
    }

    async function startStreaming() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert('❌ Your browser does not support camera access. Use Chrome, Firefox, or Safari.');
          return;
        }

        const cameraName = cameraNameInput.value.trim() || 'Unnamed Camera';
        localStorage.setItem('cameraName', cameraName);

        console.log('🎥 Requesting camera access...');
        statusText.textContent = 'Requesting permissions...';

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: useFrontCamera ? 'user' : 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        console.log('✅ Camera access granted');
        video.srcObject = stream;
        streaming = true;

        btnStart.style.display = 'none';
        document.getElementById('active-controls').style.display = 'flex';
        cameraNameInput.disabled = true;

        statusText.textContent = '🔴 Streaming: ' + cameraName;
        document.getElementById('stats').classList.add('active');

        sendMessage({
          type: 'camera-metadata',
          name: cameraName,
          resolution: '1280x720'
        });

        captureFrames();

        setInterval(() => {
          document.getElementById('stat-fps').textContent = '📊 ' + frameCount + ' fps';
          document.getElementById('stat-sent').textContent = '📤 ' + frameCount + ' frames/s';
          frameCount = 0;
        }, 1000);

        requestWakeLock();

      } catch (error) {
        console.error('❌ Error accessing camera:', error);

        let errorMsg = 'Could not access camera.';

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMsg = '❌ Permission denied. Please allow camera access in your browser settings.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMsg = '❌ No camera found on this device.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMsg = '❌ Camera is being used by another application.';
        } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
          errorMsg = '❌ Camera configuration is not compatible.';
        } else if (error.name === 'NotSupportedError') {
          errorMsg = '❌ Your browser does not support camera access. Use Chrome or Safari.';
        } else if (error.name === 'TypeError') {
          errorMsg = '❌ Configuration error. Make sure you are on HTTPS or localhost.';
        }

        alert(errorMsg);
        statusText.textContent = 'Error starting';
      }
    }

    function captureFrames() {
      if (!streaming) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      canvas.toBlob((blob) => {
        if (blob && streaming) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            sendMessage({
              type: 'camera-frame',
              frame: base64,
              timestamp: Date.now()
            });
            frameCount++;
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.7);

      setTimeout(() => captureFrames(), 1000 / 15);
    }

    function stopStreaming() {
      streaming = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      video.srcObject = null;

      btnStart.style.display = 'block';
      document.getElementById('active-controls').style.display = 'none';
      cameraNameInput.disabled = false;

      document.getElementById('stats').classList.remove('active');
      statusText.textContent = 'Connected - Streaming stopped';
      sendMessage({ type: 'stop-camera' });
    }

    async function flipCamera() {
      useFrontCamera = !useFrontCamera;
      if (streaming) {
        stopStreaming();
        setTimeout(() => startStreaming(), 100);
      }
    }

    function sendMessage(data) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    }

    btnStart.addEventListener('click', startStreaming);
    btnStop.addEventListener('click', stopStreaming);
    btnFlip.addEventListener('click', flipCamera);

    let wakeLock = null;
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('🔒 Wake Lock activated');
        }
      } catch (err) {
        console.log('Wake Lock not available');
      }
    }

    init();
  </script>
</body>
</html>`;

// VIEWER CLIENT HTML (PC)
const VIEWER_CLIENT_HTML = (localIP: string, port: number) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #1a1a1a;
      color: #fff;
      min-height: 100dvh;
      padding-bottom: 20px;
    }

    #status-bar {
      background: #4CAF50;
      color: white;
      padding: 12px;
      text-align: center;
      font-weight: bold;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }

    h1 {
      text-align: center;
      margin: 30px 20px 20px 20px;
      font-size: 28px;
    }

    #cameras-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      max-width: 1400px;
      margin: 0 auto;
    }

    @media (min-width: 768px) {
      #cameras-grid {
        grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
      }
    }

    .camera-card {
      background: #2a2a2a;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      margin: 1em;
    }

    .camera-header {
      background: #333;
      padding: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .camera-name {
      font-weight: bold;
      font-size: 18px;
    }

    .camera-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #4CAF50;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .camera-view {
      position: relative;
      width: 100%;
      padding-bottom: 56.25%;
      background: #000;
    }

    .camera-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .camera-stats {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(0,0,0,0.7);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-family: monospace;
    }

    .no-cameras {
      text-align: center;
      padding: 60px 20px;
      font-size: 18px;
      color: #888;
      grid-column: 1 / -1;
    }

    .no-cameras strong {
      color: #4CAF50;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div id="status-bar">🟢 HTTPS server active</div>

  <div id="cameras-grid">
    <div class="no-cameras">
      <p>📱 No cameras connected</p>
      <p style="margin-top: 15px; font-size: 16px;">
        Access from your mobile at:<br>
        <strong style="font-size: 18px; margin-top: 10px; display: inline-block;">
          https://${localIP}:${port}/camera
        </strong>
      </p>
      <p style="margin-top: 10px; font-size: 13px; color: #666;">
        ⚠️ Accept the certificate when prompted by your browser
      </p>
    </div>
  </div>

  <script>
    const statusBar = document.getElementById('status-bar');
    const camerasGrid = document.getElementById('cameras-grid');
    const cameras = new Map();
    let ws;
    let reconnectTimeout;

    function init() {
      connectWebSocket();
    }

    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + '/ws';

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('✅ Viewer connected');
        sendMessage({ type: 'viewer-connected' });
        statusBar.style.background = '#4CAF50';
        statusBar.textContent = '🟢 HTTPS server active';
        clearTimeout(reconnectTimeout);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'camera-list') {
          handleCameraList(data.cameras);
        } else if (data.type === 'camera-frame-broadcast') {
          updateCameraFrame(data.cameraId, data.frame, data.timestamp);
        } else if (data.type === 'camera-disconnected') {
          handleCameraDisconnected(data.cameraId);
        }
      };

      ws.onclose = () => {
        console.log('📴 Disconnected from server');
        statusBar.style.background = '#f44336';
        statusBar.textContent = '🔴 Disconnected - Reconnecting...';

        // Auto-reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          connectWebSocket();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
    }

    function sendMessage(data) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    }

    function handleCameraList(camerasList) {
      console.log('📋 Camera list:', camerasList);

      camerasGrid.innerHTML = '';

      if (camerasList.length === 0) {
        camerasGrid.innerHTML = '<div class="no-cameras">📱 No cameras connected</div>';
        return;
      }

      camerasList.forEach(camera => {
        createCameraCard(camera.id, camera.name);
      });
    }

    function createCameraCard(cameraId, cameraName) {
      const card = document.createElement('div');
      card.className = 'camera-card';
      card.id = 'camera-' + cameraId;

      card.innerHTML = \`
        <div class="camera-header">
          <div class="camera-name">\${cameraName}</div>
          <div class="camera-status">
            <span class="status-indicator"></span>
            <span>Live</span>
          </div>
        </div>
        <div class="camera-view">
          <canvas class="camera-canvas" id="canvas-\${cameraId}"></canvas>
          <div class="camera-stats">
            <div id="fps-\${cameraId}">0 fps</div>
            <div id="latency-\${cameraId}">0 ms</div>
          </div>
        </div>
      \`;

      camerasGrid.appendChild(card);

      const canvas = document.getElementById('canvas-' + cameraId);
      canvas.frameCount = 0;

      const fpsInterval = setInterval(() => {
        const fpsEl = document.getElementById('fps-' + cameraId);
        if (fpsEl) {
          fpsEl.textContent = canvas.frameCount + ' fps';
          canvas.frameCount = 0;
        }
      }, 1000);

      cameras.set(cameraId, { card, fpsInterval });
    }

    function updateCameraFrame(cameraId, frameBase64, timestamp) {
      const canvas = document.getElementById('canvas-' + cameraId);
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const latency = Date.now() - timestamp;
        const latencyEl = document.getElementById('latency-' + cameraId);
        if (latencyEl) {
          latencyEl.textContent = latency + ' ms';
        }

        canvas.frameCount++;
      };

      img.src = 'data:image/jpeg;base64,' + frameBase64;
    }

    function handleCameraDisconnected(cameraId) {
      console.log('📴 Camera disconnected:', cameraId);
      const cameraData = cameras.get(cameraId);
      if (cameraData) {
        if (cameraData.fpsInterval) {
          clearInterval(cameraData.fpsInterval);
        }
        cameraData.card.remove();
        cameras.delete(cameraId);
      }

      if (cameras.size === 0) {
        camerasGrid.innerHTML = '<div class="no-cameras">📱 No cameras connected</div>';
      }
    }

    init();
  </script>
</body>
</html>`;

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInterfaces = nets[name];
    if (!netInterfaces) continue;

    for (const net of netInterfaces) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

interface CameraData {
  name: string;
  resolution: string;
  ws: any;
}

class CameraSecurityServer {
  private cameras = new Map<string, CameraData>();
  private viewers = new Set<any>();
  private nextId = 1;

  constructor() {
    this.start();
  }

  private async start() {
    try {
      // Load SSL certificates
      const keyPath = `${CERTS_DIR}/key.pem`;
      const certPath = `${CERTS_DIR}/cert.pem`;

      console.log("🔐 Loading SSL certificates...");
      console.log(`   Key:  ${keyPath}`);
      console.log(`   Cert: ${certPath}`);

      const keyFile = file(keyPath);
      const certFile = file(certPath);

      if (!(await keyFile.exists()) || !(await certFile.exists())) {
        throw new Error("Certificate files not found");
      }

      const key = await keyFile.text();
      const cert = await certFile.text();

      console.log("✅ Certificates loaded successfully\n");

      // Create HTTPS server with Bun
      Bun.serve({
        port: PORT,
        hostname: "0.0.0.0",
        tls: {
          key,
          cert,
        },
        fetch: (req, server) => {
          const url = new URL(req.url);

          // WebSocket upgrade
          if (url.pathname === "/ws") {
            const upgraded = server.upgrade(req);
            if (upgraded) {
              return undefined;
            }
            return new Response("WebSocket upgrade failed", { status: 500 });
          }

          // Serve camera client
          if (url.pathname.startsWith("/camera")) {
            return new Response(MOBILE_CLIENT_HTML, {
              headers: { "Content-Type": "text/html" },
            });
          }

          // Serve viewer client
          return new Response(VIEWER_CLIENT_HTML(getLocalIP(), PORT), {
            headers: { "Content-Type": "text/html" },
          });
        },
        websocket: {
          open: (ws) => {
            const id = `client_${this.nextId++}`;
            (ws as any).id = id;
            console.log(`📱 Client connected: ${id}`);
          },
          message: (ws, message) => {
            this.handleWebSocketMessage(ws, message);
          },
          close: (ws) => {
            const id = (ws as any).id;
            console.log(`📴 Client disconnected: ${id}`);
            this.viewers.delete(ws);
            this.handleCameraDisconnect(id, ws);
          },
        },
      });

      this.displayStartupInfo();
    } catch (error) {
      console.error("\n❌ ERROR loading SSL certificates:");
      console.error(error);
      console.error("\n💡 Make sure you have certificates in ./certs/");
      console.error("   - key.pem");
      console.error("   - cert.pem\n");
      process.exit(1);
    }
  }

  private handleWebSocketMessage(ws: any, message: string | Buffer) {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case "viewer-connected":
          console.log(`👁️  Viewer connected: ${ws.id}`);
          this.viewers.add(ws);
          this.sendCameraList(ws);
          break;

        case "camera-metadata":
          console.log(`📹 New camera: ${data.name} (${ws.id})`);
          this.cameras.set(ws.id, {
            name: data.name,
            resolution: data.resolution,
            ws: ws,
          });
          this.broadcastCameraList();
          break;

        case "camera-frame":
          this.broadcastFrame(ws.id, data.frame, data.timestamp);
          break;

        case "stop-camera":
          this.handleCameraDisconnect(ws.id, ws);
          break;
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  }

  private sendCameraList(ws: any) {
    const camerasList = Array.from(this.cameras.entries()).map(
      ([id, data]) => ({
        id,
        name: data.name,
      }),
    );

    ws.send(
      JSON.stringify({
        type: "camera-list",
        cameras: camerasList,
      }),
    );
  }

  private broadcastCameraList() {
    const camerasList = Array.from(this.cameras.entries()).map(
      ([id, data]) => ({
        id,
        name: data.name,
      }),
    );

    const message = JSON.stringify({
      type: "camera-list",
      cameras: camerasList,
    });

    this.viewers.forEach((viewer) => {
      try {
        viewer.send(message);
      } catch (error) {
        console.error("Error sending to viewer:", error);
      }
    });
  }

  private broadcastFrame(cameraId: string, frame: string, timestamp: number) {
    const message = JSON.stringify({
      type: "camera-frame-broadcast",
      cameraId,
      frame,
      timestamp,
    });

    this.viewers.forEach((viewer) => {
      try {
        viewer.send(message);
      } catch (error) {
        console.error("Error broadcasting frame:", error);
      }
    });
  }

  private handleCameraDisconnect(id: string, ws: any) {
    if (this.cameras.has(id)) {
      console.log(`🧹 Camera removed: ${id}`);
      this.cameras.delete(id);

      const message = JSON.stringify({
        type: "camera-disconnected",
        cameraId: id,
      });

      this.viewers.forEach((viewer) => {
        try {
          viewer.send(message);
        } catch (error) {
          console.error("Error notifying viewer:", error);
        }
      });
    }
  }

  private displayStartupInfo() {
    const localIP = getLocalIP();

    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║   🎥 SECURITY CAMERAS with HTTPS 🔐                 ║");
    console.log("╚══════════════════════════════════════════════════════╝\n");
    console.log(`🖥️  VIEWER (PC):`);
    console.log(`   👉 https://localhost:${PORT}`);
    console.log(`   👉 https://${localIP}:${PORT}\n`);
    console.log(`📱 CAMERAS (Mobile):`);
    console.log(`   👉 https://${localIP}:${PORT}/camera\n`);
    console.log(`⚠️  FIRST TIME - Accept certificate:`);
    console.log(`   1. Open the URL in your browser`);
    console.log(`   2. You'll see "Connection not secure" or similar`);
    console.log(`   3. Tap "Advanced" → "Continue anyway"`);
    console.log(`   4. In Chrome mobile you can type: thisisunsafe`);
    console.log(`   5. Accept camera permissions and you're ready! 📹\n`);
  }
}

new CameraSecurityServer();
