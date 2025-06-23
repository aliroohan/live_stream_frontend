import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private baseUrl = 'https://image-forensics-backend.vercel.app/api/user';

  constructor(private http:HttpClient) { }

  register(user: any) {
    return this.http.post(`${this.baseUrl}/register`, user);
  }

  login(user: any) {
    return this.http.post(`${this.baseUrl}/login`, user);
  }
}
