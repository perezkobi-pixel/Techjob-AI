/*
 * TechJob AI — app configuration.
 *
 * Paste your Firebase web app config here (Firebase console → Project settings → General → Your apps → SDK setup → Config).
 * These values are public by design: the security rules in firebase/firestore.rules and firebase/storage.rules
 * make sure every user can read and change only their own data.
 *
 * Leave apiKey empty to run in local mode: real jobs work, and accounts are kept only in this browser.
 */
window.TJ_CONFIG = {
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  }
};
