export class CameraClient {
  video: HTMLVideoElement;
  statusDot: HTMLElement;
  statusText: HTMLElement;
  cameraNameInput: HTMLInputElement;

  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private streaming = false;
  private frameCount = 0;
  private useFrontCamera = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private wakeLock: WakeLockSentinel | null = null;

  constructor(options: {
    video: HTMLVideoElement;
    statusDot: HTMLElement;
    statusText: HTMLElement;
    cameraNameInput: HTMLInputElement;
  }) {
    this.video = options.video;
    this.statusDot = options.statusDot;
    this.statusText = options.statusText;
    this.cameraNameInput = options.cameraNameInput;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
  }

  init() {
    this.connectWebSocket();
    this.cameraNameInput.value = localStorage.getItem('cameraName') || 'My Camera';
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host + '/ws';

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ Connected to server');
      this.statusDot.classList.add('connected');
      this.statusText.textContent = 'Connected - Ready to stream';
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    this.ws.onclose = () => {
      console.log('📴 Disconnected');
      this.statusDot.classList.remove('connected');
      this.statusText.textContent = 'Disconnected';
      this.stopStreaming();

      this.reconnectTimeout = setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        this.connectWebSocket();
      }, 3000);
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
  }

  async startStreaming() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('❌ Your browser does not support camera access. Use Chrome, Firefox, or Safari.');
        return;
      }

      const cameraName = this.cameraNameInput.value.trim() || 'Unnamed Camera';
      localStorage.setItem('cameraName', cameraName);

      console.log('🎥 Requesting camera access...');
      this.statusText.textContent = 'Requesting permissions...';

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: this.useFrontCamera ? 'user' : 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      console.log('✅ Camera access granted');
      this.video.srcObject = this.stream;
      this.streaming = true;

      const btnStart = document.getElementById('btn-start');
      const activeControls = document.getElementById('active-controls');
      
      btnStart.style.display = 'none';
      activeControls.style.display = 'flex';
      this.cameraNameInput.disabled = true;

      this.statusText.textContent = '🔴 Streaming: ' + cameraName;
      document.getElementById('stats').classList.add('active');

      this.sendMessage({
        type: 'camera-metadata',
        name: cameraName,
        resolution: '1280x720'
      });

      this.captureFrames();

      setInterval(() => {
        document.getElementById('stat-fps').textContent = '📊 ' + this.frameCount + ' fps';
        document.getElementById('stat-sent').textContent = '📤 ' + this.frameCount + ' frames/s';
        this.frameCount = 0;
      }, 1000);

      this.requestWakeLock();

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
      this.statusText.textContent = 'Error starting';
    }
  }

  captureFrames() {
    if (!this.streaming) return;

    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    this.ctx.drawImage(this.video, 0, 0);

    this.canvas.toBlob((blob) => {
      if (blob && this.streaming) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          this.sendMessage({
            type: 'camera-frame',
            frame: base64
          });
          this.frameCount++;
        };
        reader.readAsDataURL(blob);
      }
    }, 'image/jpeg', 0.5);

    setTimeout(() => this.captureFrames(), 1000 / 30);
  }

  stopStreaming() {
    this.streaming = false;
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.video.srcObject = null;

    const btnStart = document.getElementById('btn-start');
    const activeControls = document.getElementById('active-controls');
    
    btnStart.style.display = 'block';
    activeControls.style.display = 'none';
    this.cameraNameInput.disabled = false;

    document.getElementById('stats').classList.remove('active');
    this.statusText.textContent = 'Connected - Streaming stopped';
    this.sendMessage({ type: 'stop-camera' });
  }

  flipCamera() {
    this.useFrontCamera = !this.useFrontCamera;
    if (this.streaming) {
      this.stopStreaming();
      setTimeout(() => this.startStreaming(), 100);
    }
  }

  sendMessage(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('🔒 Wake Lock activated');
      }
    } catch (err) {
      console.log('Wake Lock not available');
    }
  }
}

export class ViewerClient {
  camerasGrid: HTMLElement;
  cameraUrlEl: HTMLElement;
  private cameras = new Map<string, { card: HTMLElement; fpsInterval: ReturnType<typeof setInterval> }>();
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private enableSound = false;
  private alertSound: HTMLAudioElement;
  private isAlertPlaying = false;

  constructor(options: { camerasGrid: HTMLElement; cameraUrlEl: HTMLElement }) {
    this.camerasGrid = options.camerasGrid;
    this.cameraUrlEl = options.cameraUrlEl;
    this.alertSound = new Audio('/sound-effect.mp3');
  }

  init() {
    this.setupCameraUrl();
    this.enableSound = confirm('Enable sound effects for person detection alerts?');
    this.connectWebSocket();
  }

  setupCameraUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host;
    const url = wsUrl.replace('wss:', 'https:').replace('ws:', 'http:') + '/camera';
    this.cameraUrlEl.textContent = url;
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host + '/ws';

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ Viewer connected');
      this.sendMessage({ type: 'viewer-connected' });
      const statusBar = document.getElementById('status-bar');
      statusBar.style.background = '#4CAF50';
      statusBar.textContent = '🟢 HTTPS server active';
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'camera-list') {
        this.handleCameraList(data.cameras);
      } else if (data.type === 'camera-frame-broadcast') {
        this.updateCameraFrame(data.cameraId, data.frame);
      } else if (data.type === 'camera-disconnected') {
        this.handleCameraDisconnected(data.cameraId);
      } else if (data.type === 'person-alert') {
        this.showPersonAlert(data.cameraId, data.count, data.confidence);
      }
    };

    this.ws.onclose = () => {
      console.log('📴 Disconnected from server');
      const statusBar = document.getElementById('status-bar');
      statusBar.style.background = '#f44336';
      statusBar.textContent = '🔴 Disconnected - Reconnecting...';

      this.reconnectTimeout = setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        this.connectWebSocket();
      }, 3000);
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
  }

  sendMessage(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  handleCameraList(camerasList) {
    console.log('📋 Camera list:', camerasList);

    this.camerasGrid.innerHTML = '';

    if (camerasList.length === 0) {
      this.camerasGrid.innerHTML = '<div class="no-cameras">📱 No cameras connected</div>';
      return;
    }

    camerasList.forEach(camera => {
      this.createCameraCard(camera.id, camera.name);
    });
  }

  createCameraCard(cameraId, cameraName) {
    const card = document.createElement('div');
    card.className = 'camera-card';
    card.id = 'camera-' + cameraId;

    card.innerHTML = `
      <div class="camera-header">
        <div class="camera-name">${cameraName}</div>
        <div class="camera-status">
          <span class="status-indicator"></span>
          <span>Live</span>
        </div>
      </div>
      <div class="camera-view">
        <canvas class="camera-canvas" id="canvas-${cameraId}"></canvas>
        <div class="camera-stats">
          <div id="fps-${cameraId}">-- fps</div>
        </div>
        <div class="person-alert" id="alert-${cameraId}"></div>
      </div>
    `;

    this.camerasGrid.appendChild(card);

    const canvas = document.getElementById('canvas-' + cameraId) as HTMLCanvasElement;
    (canvas as any).frameCount = 0;
    (canvas as any).hasReceivedFrames = false;

    const fpsInterval = setInterval(() => {
      const fpsEl = document.getElementById('fps-' + cameraId);
      if (fpsEl) {
        if ((canvas as any).hasReceivedFrames) {
          fpsEl.textContent = (canvas as any).frameCount + ' fps';
        }
        (canvas as any).frameCount = 0;
        (canvas as any).hasReceivedFrames = false;
      }
    }, 1000);

    this.cameras.set(cameraId, { card, fpsInterval });
  }

  updateCameraFrame(cameraId, frameBase64) {
    const canvas = document.getElementById('canvas-' + cameraId) as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      (canvas as any).frameCount++;
      (canvas as any).hasReceivedFrames = true;
    };

    img.src = 'data:image/jpeg;base64,' + frameBase64;
  }

  showPersonAlert(cameraId, count, confidence) {
    this.playAlertSound();
    const alertEl = document.getElementById('alert-' + cameraId);
    if (alertEl) {
      alertEl.textContent = 'PERSON: ' + count + ' (' + confidence.toFixed(0) + '%)';
      alertEl.classList.remove('active');
      void alertEl.offsetWidth;
      alertEl.classList.add('active');
    }
  }

  handleCameraDisconnected(cameraId) {
    console.log('📴 Camera disconnected:', cameraId);
    const cameraData = this.cameras.get(cameraId);
    if (cameraData) {
      if (cameraData.fpsInterval) {
        clearInterval(cameraData.fpsInterval);
      }
      cameraData.card.remove();
      this.cameras.delete(cameraId);
    }

    if (this.cameras.size === 0) {
      this.camerasGrid.innerHTML = '<div class="no-cameras">📱 No cameras connected</div>';
    }
  }

  playAlertSound() {
    if (!this.enableSound || this.isAlertPlaying) return;
    this.isAlertPlaying = true;
    this.alertSound.currentTime = 0;
    this.alertSound.play().catch(() => {});
    setTimeout(() => { this.isAlertPlaying = false; }, 2000);
  }
}
