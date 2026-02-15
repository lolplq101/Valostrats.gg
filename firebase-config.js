// Firebase Configuration (Encoded)
// Note: This is basic obfuscation, not real security
// Your data is still protected by Firestore Security Rules

const encodedConfig = "eyJhcGlLZXkiOiJBSXphU3lBTHZIU3RxTE9KS1lNdG0wcDJGbTA4R3dDYTV4MnVnZGciLCJhdXRoRG9tYWluIjoidmFsb3JhbnQtc3RyYXQtbWFrZXIuZmlyZWJhc2VhcHAuY29tIiwicHJvamVjdElkIjoidmFsb3JhbnQtc3RyYXQtbWFrZXIiLCJzdG9yYWdlQnVja2V0IjoidmFsb3JhbnQtc3RyYXQtbWFrZXIuZmlyZWJhc2VzdG9yYWdlLmFwcCIsIm1lc3NhZ2luZ1NlbmRlcklkIjoiNjY2NDkyNjI0MjY3IiwiYXBwSWQiOiIxOjY2NjQ5MjYyNDI2Nzp3ZWI6MjQwOWM5YmE5OGU5ZDJmYTIwZTM4ZSJ9";

const firebaseConfig = JSON.parse(atob(encodedConfig));

// Export so app.js can use it
export default firebaseConfig;
