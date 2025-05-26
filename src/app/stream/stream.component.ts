import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule, HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { webSocket, WebSocketSubject, WebSocketSubjectConfig } from 'rxjs/webSocket';
import { Subscription, timer } from 'rxjs';
import { catchError, retryWhen, delayWhen, tap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

interface FrameData {
  type: string;
  timestamp: string;
  frameNumber: number;
  image: string;
}

@Component({
  selector: 'app-stream',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './stream.component.html',
  styleUrl: './stream.component.css'
})
export class StreamComponent implements OnInit, OnDestroy {
  rtspUrl: string = 'rtsp://localhost:8554/mystream'; // Default for testing
  currentImageSrc: any | null = null;
  status: string = 'Idle';
  isLoading: boolean = false;
  hasAttemptedStart: boolean = false;
  currentFrameNumber: number = 0;
  currentTimestamp: string = '';

  private readonly BACKEND_URL = 'http://localhost:3000';
  private readonly WS_URL = 'ws://localhost:3000';

  private socket$: WebSocketSubject<FrameData> | null = null;
  private wsSubscription: Subscription | null = null;

  // --- Properties for smoother animation ---
  private imageQueue: FrameData[] = [];
  private targetFps: number = 10; // IMPORTANT: Should match backend's OUTPUT_FRAME_RATE
  private frameIntervalMs: number = 1000 / this.targetFps;
  private lastFrameRenderTime: number = 0;
  private animationFrameId: number | null = null;
  // --- End animation properties ---

  constructor(private http: HttpClient, private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    this.frameIntervalMs = 1000 / this.targetFps; // Initialize frame interval
  }

  private connectWebSocket(): void {
    if (this.socket$ && !this.socket$.closed) {
      this.status = 'WebSocket already connected. Re-initiating render loop.';
      this.startRenderLoop();
      return;
    }

    this.isLoading = true;
    this.status = 'Connecting to WebSocket...';
    this.imageQueue = [];

    const config: WebSocketSubjectConfig<FrameData> = {
      url: this.WS_URL,
      openObserver: {
        next: () => {
          console.log('WebSocket connection established.');
          this.status = 'WebSocket connected. Waiting for frames...';
          this.isLoading = false;
          this.startRenderLoop();
        }
      },
      closeObserver: {
        next: () => {
          console.log('WebSocket connection closed.');
          if (this.hasAttemptedStart) {
            this.status = 'WebSocket disconnected. Stream might have stopped or encountered an issue.';
          } else {
            this.status = 'WebSocket closed.';
          }
          this.isLoading = false;
          this.currentImageSrc = null;
          this.stopRenderLoop();
          this.imageQueue = [];
        }
      }
    };

    this.socket$ = webSocket<FrameData>(config);

    this.wsSubscription = this.socket$.pipe(
      tap(() => {
        if(this.isLoading) this.isLoading = false;
        if(this.status.startsWith('WebSocket connected')) this.status = 'Streaming frames...';
      }),
      retryWhen(errors =>
        errors.pipe(
          tap(err => {
            console.error('WebSocket error, attempting to reconnect...', err);
            this.status = 'WebSocket error. Reconnecting...';
            this.isLoading = true;
            this.stopRenderLoop();
          }),
          delayWhen(() => timer(5000))
        )
      ),
      catchError((error) => {
        console.error('WebSocket failed permanently after retries:', error);
        this.status = 'WebSocket connection failed. Please check backend and network.';
        this.isLoading = false;
        this.currentImageSrc = null;
        this.stopRenderLoop();
        this.imageQueue = [];
        return [];
      })
    ).subscribe(
      (frameData: FrameData) => {
        if (frameData.type === 'frame') {
          console.log(`📸 Frame ${frameData.frameNumber} received at ${frameData.timestamp}`);
          this.imageQueue.push(frameData);
        }
      }
    );
  }

  // --- Render loop methods ---
  private startRenderLoop(): void {
    if (this.animationFrameId) {
      // console.log("Render loop already running or requested.");
      return; // Already running
    }
    console.log(`Requesting render loop start. Target FPS: ${this.targetFps}, interval: ${this.frameIntervalMs.toFixed(2)}ms`);
    this.lastFrameRenderTime = 0; // Reset, will be initialized by renderLoop itself
    // Ensure `renderLoop` is bound correctly to `this` context
    this.animationFrameId = requestAnimationFrame(this.boundRenderLoop);
  }

  // Arrow function to bind 'this' or use .bind(this) if it were a regular method
  private boundRenderLoop = (currentTime: DOMHighResTimeStamp): void => {
    this.renderLoop(currentTime);
  }

  private renderLoop(currentTime: DOMHighResTimeStamp): void {
    this.animationFrameId = requestAnimationFrame(this.boundRenderLoop); // Schedule next frame

    if (!this.socket$ || this.socket$.closed) { // Stop if socket is unexpectedly closed
        this.stopRenderLoop();
        return;
    }

    if (this.lastFrameRenderTime === 0) { // Initialize on the first actual run
        this.lastFrameRenderTime = currentTime;
    }

    const elapsed = currentTime - this.lastFrameRenderTime;

    if (elapsed >= this.frameIntervalMs) {
      if (this.imageQueue.length > 0) {
        const frameData = this.imageQueue.shift();
        if (frameData) {
          this.currentImageSrc = frameData.image;
          this.currentFrameNumber = frameData.frameNumber;
          this.currentTimestamp = frameData.timestamp;
        }
        // Adjust lastFrameRenderTime to maintain a consistent rhythm,
        // accounting for any time we overshot the interval.
        this.lastFrameRenderTime = currentTime - (elapsed % this.frameIntervalMs);
      }
    }
  }

  private stopRenderLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
      console.log("Render loop stopped.");
    }
  }
  // --- End render loop methods ---

  startStream(): void {
    if (!this.rtspUrl) {
      alert('Please enter an RTSP URL.');
      return;
    }
    this.hasAttemptedStart = true;
    this.isLoading = true;
    this.status = 'Requesting to start stream...';
    this.currentImageSrc = null;
    this.imageQueue = [];

    // Sanitize the RTSP URL by removing any problematic characters
    const sanitizedUrl = this.rtspUrl.trim().replace(/[<>]/g, '');

    const headers = {
      'Content-Type': 'application/json'
    };

    this.http.post<{ message: string }>(
      `${this.BACKEND_URL}/api/stream/start-stream`,
      { cctvUrl: sanitizedUrl },
      { headers }
    ).subscribe({
      next: (res) => {
        console.log('Start stream response:', res);
        this.status = res.message || 'Stream start requested. Connecting...';
        if (!this.socket$ || this.socket$.closed) {
          this.connectWebSocket();
        } else {
          this.startRenderLoop();
          this.isLoading = false;
          this.status = 'Streaming frames... (re-initiated on existing connection)';
        }
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error starting stream:', err);
        this.status = `Error starting stream: ${err.error?.error || err.message}`;
        this.isLoading = false;
        this.hasAttemptedStart = false;
        this.stopRenderLoop();
      }
    });
  }

  stopStream(): void {
    this.isLoading = true; // Set loading true while stopping
    this.status = 'Requesting to stop stream...';

    this.http.post<{ message: string }>(`${this.BACKEND_URL}/api/stream/stop-stream`, {})
      .subscribe({
        next: (res) => {
          console.log('Stop stream response:', res);
          this.status = res.message || 'Stream stop requested.';
          this.stopRenderLoop();
          this.imageQueue = [];
          this.currentImageSrc = null;
          if (this.socket$) {
            this.socket$.complete(); // Gracefully close WebSocket from client side
            // this.socket$ = null; // Handled by closeObserver
          }
          this.isLoading = false;
          this.hasAttemptedStart = false;
        },
        error: (err: HttpErrorResponse) => {
          console.error('Error stopping stream:', err);
          this.status = `Error stopping stream: ${err.error?.error || err.message}`;
          this.isLoading = false;
          // Don't reset hasAttemptedStart, stream might still be technically running if API call failed
        }
      });
  }

  ngOnDestroy(): void {
    this.stopRenderLoop();
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
    if (this.socket$) {
      this.socket$.complete();
    }
    this.imageQueue = [];
  }
}
