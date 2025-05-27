import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient, HttpClientModule, HttpErrorResponse } from '@angular/common/http';
import { webSocket, WebSocketSubject, WebSocketSubjectConfig } from 'rxjs/webSocket';
import { Subscription, timer } from 'rxjs';
import { catchError, retryWhen, delayWhen, tap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

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
  rtspUrl: string = 'rtsp://localhost:8554/mystream';
  currentImageSrc: any | null = null;
  status: string = 'Initializing...';
  isLoading: boolean = true;
  hasAttemptedStart: boolean = false;
  currentFrameNumber: number = 0;
  currentTimestamp: string = '';

  private readonly BACKEND_URL = 'http://localhost:3000';
  private readonly WS_URL = 'ws://localhost:3000';

  private socket$: WebSocketSubject<FrameData> | null = null;
  private wsSubscription: Subscription | null = null;

  // --- Properties for smoother animation ---
  private imageQueue: FrameData[] = [];
  private targetFps: number = 10;
  private frameIntervalMs: number = 1000 / this.targetFps;
  private lastFrameRenderTime: number = 0;
  private animationFrameId: number | null = null;

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    this.frameIntervalMs = 1000 / this.targetFps;
    const token = localStorage.getItem('authToken');
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    setTimeout(() => {
      this.startStream();
    }, 1000); 
    setTimeout(() => {
      this.startStream();
    }, 1000); 
    
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!localStorage.getItem('authToken');
  }

  // Sign out method
  signOut(): void {
    // Clear all authentication data from localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    
    // Stop any ongoing streams and WebSocket connections
    this.stopRenderLoop();
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
    if (this.socket$) {
      this.socket$.complete();
    }
    
    // Redirect to home page
    this.router.navigate(['/']);
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

  private startStream(): void {
    this.hasAttemptedStart = true;
    this.isLoading = true;
    this.status = 'Connecting to stream...';
    this.currentImageSrc = null;
    this.imageQueue = [];

    // Sanitize the RTSP URL by removing any problematic characters
    const sanitizedUrl = this.rtspUrl.trim().replace(/[<>]/g, '');

    const headers = {
      'Content-Type': 'application/json'
    };

    this.http.post<{ message: string }>(
      `${this.BACKEND_URL}/api/stream/start-stream`,
      {},
      { headers }
    ).subscribe({
      next: (res) => {
        console.log('Start stream response:', res);
        this.status = res.message || 'Stream started. Connecting to WebSocket...';
        if (!this.socket$ || this.socket$.closed) {
          this.connectWebSocket();
        } else {
          this.startRenderLoop();
          this.isLoading = false;
          this.status = 'Stream active';
        }
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error starting stream:', err);
        this.status = `Failed to start stream: ${err.error?.error || err.message}`;
        this.isLoading = false;
        this.hasAttemptedStart = false;
        this.stopRenderLoop();
        
        // Retry after 5 seconds
        setTimeout(() => {
          this.startStream();
        }, 5000);
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
