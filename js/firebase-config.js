// ============================================================
// firebase-config.js
// Este archivo SOLO conecta la app con tu proyecto de Firebase.
// No debe contener lógica de eventos: eso vive en eventos-service.js
// y en los archivos propios de cada página.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBqhjFhoOYZeVKpiKwdxG3Y_pZKznymNxc",
  authDomain: "equipocomercial-b8ec6.firebaseapp.com",
  projectId: "equipocomercial-b8ec6",
  storageBucket: "equipocomercial-b8ec6.firebasestorage.app",
  messagingSenderId: "1011005581841",
  appId: "1:1011005581841:web:86db2337abd897fce91fb0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

console.log("Firebase conectado correctamente ✅");
