import { Injectable } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { Subject, Observable, EMPTY, BehaviorSubject } from 'rxjs';
import { catchError, tap, shareReplay, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class StreamService {
  private socket$?: WebSocketSubject<any>; // Keep 'any' for now, as it sends ArrayBuffer
  
  // Subject for raw ArrayBuffer video chunks
  private videoChunkSubject = new Subject<ArrayBuffer>();
  public videoChunk$: Observable<ArrayBuffer> = this.videoChunkSubject.asObservable();

  private readonly WS_ENDPOINT = 'ws://localhost:3000';

  constructor() {
    // Don't connect immediately, let component decide
  }

  public connect(): void {
    if (!this.socket$ || this.socket$.closed) {
      this.socket$ = webSocket({
        url: this.WS_ENDPOINT,
        binaryType: 'arraybuffer', // Crucial: Tell RxJS WebSocket to expect ArrayBuffer
        deserializer: (e: MessageEvent) => e.data, // Data is already ArrayBuffer
        serializer: (value) => value // If sending data back, ensure it's serializable
      });

      this.socket$.pipe(
        tap({
          next: (data) => {
             if (data instanceof ArrayBuffer) {
                console.log(`Received video chunk from WebSocket: ${data.byteLength} bytes`);
                this.videoChunkSubject.next(data);
             } else {
                console.warn('Received non-ArrayBuffer data from WebSocket:', data);
             }
          },
          error: (err) => console.error('WebSocket error:', err),
          complete: () => console.log('WebSocket connection closed by server')
        }),
        catchError(err => {
          console.error('WebSocket error caught, attempting to reconnect...', err);
          this.socket$ = undefined;
          setTimeout(() => this.connect(), 5000);
          return EMPTY;
        })
      ).subscribe(); // Keep the subscription alive
      console.log('WebSocket connection initiated.');
    }
  }

  sendMessage(msg: any): void { // Typically not used for sending large binary data from client
    if (this.socket$ && !this.socket$.closed) {
      this.socket$.next(msg);
    } else {
      console.error('Socket not connected. Cannot send message.');
    }
  }

  closeConnection(): void {
    if (this.socket$) {
      this.socket$.complete(); // This will trigger the 'complete' in tap above
      this.socket$ = undefined;
      console.log('WebSocket connection closed by client.');
    }
  }
}