import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, OnInit, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-videopage',
  imports: [CommonModule, FormsModule],
  templateUrl: './videopage.component.html',
  styleUrls: ['./videopage.component.css', '../home/home.component.css']
})
export class VideopageComponent implements OnInit, AfterViewInit {
  @ViewChild('videoFeed', { static: false }) videoFeed!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: false }) canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('uploadedVideo', { static: false }) uploadedVideo!: ElementRef<HTMLVideoElement>;

  responseText: string = '';
  intervalMs: number = 500;
  isProcessing: boolean = false;
  uploadedVideoLoaded: boolean = false;
  mode: 'camera' | 'upload' = 'camera';
  private stream: MediaStream | null = null;
  private intervalId: any = null;
  uploadedVideoIntervalId: any = null;
  isUploadingProcessing: boolean = false;
  uploadedFileName: string = '';
  isDragOver: boolean = false;
  uploadProgress: number = 0;

  ngOnInit() {}

  ngAfterViewInit() {
    if (this.mode === 'camera') {
      this.initCamera();
    }
  }

  async initCamera() {
    if (!this.videoFeed) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (this.videoFeed && this.videoFeed.nativeElement) {
        this.videoFeed.nativeElement.srcObject = this.stream;
        this.responseText = 'Camera access granted. Ready to start.';
      }
    } catch (err: any) {
      this.responseText = `Error accessing camera: ${err.name} - ${err.message}`;
      alert(this.responseText);
    }
  }

  onModeChange() {
    if (this.mode === 'camera') {
      setTimeout(() => this.initCamera(), 0);
      if (this.uploadedVideoIntervalId) {
        clearInterval(this.uploadedVideoIntervalId);
        this.uploadedVideoIntervalId = null;
      }
      this.isUploadingProcessing = false;
    } else {
      this.handleStop();
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      this.isProcessing = false;
    }
  }

  toggleLive() {
    if (this.isProcessing) {
      this.handleStop();
    } else {
      this.handleStart();
    }
  }

  handleStart() {
    if (!this.stream) {
      this.responseText = 'Camera not available. Cannot start.';
      alert('Camera not available. Please grant permission first.');
      return;
    }
    this.isProcessing = true;
    this.responseText = 'Processing started...';
    this.sendData();
    this.intervalId = setInterval(() => this.sendData(), this.intervalMs);
  }

  handleStop() {
    this.isProcessing = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.responseText = 'Processing stopped.';
  }

  captureImage(): string | null {
    if (!this.stream || !this.videoFeed || !this.videoFeed.nativeElement.videoWidth) {
      return null;
    }
    const video = this.videoFeed.nativeElement;
    const canvas = this.canvas.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return null;
  }

  async sendData() {
    if (!this.isProcessing) return;
    const imageBase64URL = this.captureImage();
    if (!imageBase64URL) {
      this.responseText = 'Failed to capture image. Stream might not be active.';
      return;
    }
    try {
      const response = await this.sendChatCompletionRequest(imageBase64URL);
      this.responseText = response;
    } catch (error: any) {
      this.responseText = `Error: ${error.message}`;
    }
  }

  async sendChatCompletionRequest(imageBase64URL: string): Promise<string> {
    const baseURL = 'http://127.0.0.1:8080';
    const instruction = 'What do you see?';
    console.log('image sent')
    try {
      const response = await fetch(`${baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 100,
          messages: [
            { role: 'user', content: [
              { type: 'text', text: instruction },
              { type: 'image_url', image_url: { url: imageBase64URL } }
            ] },
          ]
        })
      });
      if (!response.ok) {
        const errorData = await response.text();
        return `Server error: ${response.status} - ${errorData}`;
      }
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      this.handleFileUpload(file);
    }
  }

  handleFileUpload(file: File) {
    this.uploadedFileName = file.name;
    const url = URL.createObjectURL(file);
    if (this.uploadedVideo && this.uploadedVideo.nativeElement) {
      this.uploadedVideo.nativeElement.src = url;
      this.uploadedVideo.nativeElement.classList.remove('hidden');
      this.uploadedVideo.nativeElement.removeAttribute('controls');
      this.uploadedVideo.nativeElement.load();
      this.uploadedVideoLoaded = true;
      this.uploadedVideo.nativeElement.onended = () => {
        if (this.uploadedVideoIntervalId) {
          clearInterval(this.uploadedVideoIntervalId);
          this.uploadedVideoIntervalId = null;
        }
        this.isUploadingProcessing = false;
      };
    }
  }

  onVideoUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      this.handleFileUpload(file);
    } else {
      this.uploadedFileName = '';
      this.uploadedVideoLoaded = false;
      if (this.uploadedVideo && this.uploadedVideo.nativeElement) {
        this.uploadedVideo.nativeElement.classList.add('hidden');
      }
    }
  }

  async processUploadedVideo() {
    if (!this.uploadedVideoLoaded) return;
    const video = this.uploadedVideo.nativeElement;
    const canvas = this.canvas.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    video.currentTime = 0;
    video.play();
    this.isUploadingProcessing = true;
    this.uploadProgress = 0;
    if (this.uploadedVideoIntervalId) {
      clearInterval(this.uploadedVideoIntervalId);
    }
    this.uploadedVideoIntervalId = setInterval(async () => {
      if (!this.isUploadingProcessing || video.ended || video.paused) return;
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageBase64URL = canvas.toDataURL('image/jpeg', 0.8);
        this.responseText = 'Processing uploaded video frame...';
        const response = await this.sendChatCompletionRequest(imageBase64URL);
        this.responseText = response;
        // Simulate progress (for demo, increment by 5% per frame)
        if (this.uploadProgress < 100) {
          this.uploadProgress += 5;
        } else {
          this.uploadProgress = 100;
        }
      }
    }, this.intervalMs);
  }

  signOut() {
    localStorage.clear();
    window.location.href = '/home';
  }
}
