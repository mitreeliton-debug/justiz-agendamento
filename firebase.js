// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCcYQpxDDv-ifAoUyPI0BVgYNehwcUF3Mg",
  authDomain: "justiz-saloon.firebaseapp.com",
  projectId: "justiz-saloon",
  storageBucket: "justiz-saloon.firebasestorage.app",
  messagingSenderId: "550642870581",
  appId: "1:550642870581:web:c89ed600002415e861047c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);