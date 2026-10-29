import React from 'react';import {createRoot} from 'react-dom/client';import App from './App';import './style.css';createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./style.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
