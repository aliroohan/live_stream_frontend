import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  constructor(private router: Router) {}

  isAuthenticated() {
    const token = localStorage.getItem('authToken');
    return token !== null;
  }

  signOut() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    this.router.navigate(['/']);
  }
}
