import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { StreamComponent } from './stream/stream.component';
import { LoginComponent } from './login/login.component';
import { SignupComponent } from './signup/signup.component';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
    },
    {
        path: 'home',
        component: HomeComponent
    },
    {
        path: 'stream',
        component: StreamComponent
    },
    {
        path: 'login',
        component: LoginComponent
    },
    {
        path: 'signup',
        component: SignupComponent
    },
    {
        path: '**',
        redirectTo: 'home'
    }
];
