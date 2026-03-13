/*
    IMPORTANT: Replace the placeholder below with your Firebase project's config.
    Create a Firebase project at https://console.firebase.google.com/, enable Realtime Database (in test mode for quick setup),
    then paste the config here.
*/
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const storage = firebase.storage();

// Helper: simple path references used across app
const refs = {
    signatures: db.ref('signatures'),
    authorities: db.ref('authorities')
};

// poster metadata (single node)
refs.poster = db.ref('poster');