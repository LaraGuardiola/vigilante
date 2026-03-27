import { networkInterfaces } from "os";
import { file } from "bun";

const PORT = 5174;
const CERTS_DIR = "./certs";
const SOUND_EFFECT = "./assets/sound-effect.mp3";
const DETECTION_INTERVAL = 1000;

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

class PersonDetector {
  private model: any = null;
  private tf: any = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private isProcessing = false;
  private canvasModule: any = null;

  async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize() {
    if (this.isInitialized) return;

    console.log("🤖 Initializing AI person detection...");

    try {
      await import("@tensorflow/tfjs-backend-wasm");
      this.tf = await import("@tensorflow/tfjs");
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      this.canvasModule = await import("canvas");

      await this.tf.setBackend("wasm");
      await this.tf.ready();

      this.model = await cocoSsd.load({
        base: "lite_mobilenet_v2",
      });

      this.isInitialized = true;
      console.log("✅ AI Detection ready (WASM backend)!");
    } catch (error) {
      this.initPromise = null;
      console.error("❌ Error loading AI model:", error);
      console.error("💡 Falling back to default backend");
      throw error;
    }
  }

  async detectPerson(frameBase64: string): Promise<{
    hasPerson: boolean;
    count: number;
    confidence: number;
  }> {
    if (this.isProcessing) {
      return { hasPerson: false, count: 0, confidence: 0 };
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    this.isProcessing = true;

    try {
      const { createCanvas, Image } = this.canvasModule;

      const buffer = Buffer.from(frameBase64, "base64");
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (err: any) => reject(err);
        img.src = buffer;
      });

      const canvas = createCanvas(300, 300);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 300, 300);

      const tensor = this.tf.browser.fromPixels(canvas);
      const predictions = await this.model.detect(tensor);
      tensor.dispose();

      const persons = predictions.filter(
        (pred: any) => pred.class === "person" && pred.score > 0.5,
      );

      const hasPerson = persons.length > 0;
      const avgConfidence =
        persons.length > 0
          ? persons.reduce((sum: number, p: any) => sum + p.score, 0) /
            persons.length
          : 0;

      return {
        hasPerson,
        count: persons.length,
        confidence: avgConfidence * 100,
      };
    } catch (error) {
      console.error("❌ Detection error:", error);
      return { hasPerson: false, count: 0, confidence: 0 };
    } finally {
      this.isProcessing = false;
    }
  }
}

async function serveStaticFile(
  path: string,
  contentType: string,
): Promise<Response> {
  try {
    const f = file(path);
    if (await f.exists()) {
      if (path.endsWith(".ts")) {
        const source = await f.text();
        const transpiler = new Bun.Transpiler({ loader: "ts" });
        const transpiled = await transpiler.transform(source);
        return new Response(transpiled, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
      return new Response(f, { headers: { "Content-Type": contentType } });
    }
  } catch {}
  return new Response("Not Found", { status: 404 });
}

class CameraSecurityServer {
  private cameras = new Map<string, CameraData>();
  private viewers = new Set<any>();
  private nextId = 1;
  private detector: PersonDetector;
  private lastDetectionTime = 0;
  private detectionInterval = DETECTION_INTERVAL;

  constructor() {
    this.detector = new PersonDetector();
    this.start();
  }

  private async start() {
    try {
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

      Bun.serve({
        port: PORT,
        hostname: "0.0.0.0",
        tls: {
          key,
          cert,
        },
        fetch: (req, server) => {
          const url = new URL(req.url);

          if (url.pathname === "/ws") {
            const upgraded = server.upgrade(req);
            if (upgraded) {
              return undefined;
            }
            return new Response("WebSocket upgrade failed", { status: 500 });
          }

          if (url.pathname === "/" || url.pathname === "/index.html") {
            return serveStaticFile("./public/index.html", "text/html");
          }

          if (url.pathname === "/camera" || url.pathname === "/camera.html") {
            return serveStaticFile("./public/camera.html", "text/html");
          }

          if (url.pathname === "/vigilante.css") {
            return serveStaticFile("./public/vigilante.css", "text/css");
          }

          if (url.pathname === "/vigilante.ts") {
            return serveStaticFile("./public/vigilante.ts", "text/typescript");
          }

          if (url.pathname === "/sound-effect.mp3") {
            return serveStaticFile(SOUND_EFFECT, "audio/mpeg");
          }

          return new Response("Not Found", { status: 404 });
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
          this.broadcastFrame(ws.id, data.frame);
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

  private async broadcastFrame(cameraId: string, frame: string) {
    const message = JSON.stringify({
      type: "camera-frame-broadcast",
      cameraId,
      frame,
    });

    this.viewers.forEach((viewer) => {
      try {
        viewer.send(message);
      } catch (error) {
        console.error("Error broadcasting frame:", error);
      }
    });

    const now = Date.now();
    if (now - this.lastDetectionTime >= this.detectionInterval) {
      this.lastDetectionTime = now;
      this.detector.detectPerson(frame).then((result) => {
        if (result.hasPerson) {
          console.log(`🚨 ALERT: Person detected on camera ${cameraId}!`);

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const filename = `alerts/${cameraId}_${timestamp}.jpg`;
          const buffer = Buffer.from(frame, "base64");
          Bun.write(filename, buffer);
          console.log(`📸 Saved alert image: ${filename}`);

          const alertMessage = JSON.stringify({
            type: "person-alert",
            cameraId,
            count: result.count,
            confidence: result.confidence,
          });
          this.viewers.forEach((viewer) => {
            try {
              viewer.send(alertMessage);
            } catch (error) {
              console.error("Error sending alert:", error);
            }
          });
        }
      });
    }
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
