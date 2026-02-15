# Security Information

## Firebase Configuration

The `firebase-config.js` file contains Base64-encoded configuration. This provides **basic obfuscation** to make the keys less obvious in the source code.

### Important Notes

⚠️ **This is NOT real security** - anyone can decode Base64 in seconds.

✅ **Real security comes from**:

1. **Firestore Security Rules** - Controls who can read/write your database
2. **Authorized Domains** - Prevents other websites from using your Firebase project
3. **Firebase Authentication** - Verifies user identity

### Your Data is Protected By

Your Firestore data is secure because:

- Only authenticated users can access data
- Users can only read/write their own compositions
- Firestore Security Rules enforce these restrictions server-side

### If You Need to Update the Config

To generate a new encoded string:

```javascript
const config = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const encoded = btoa(JSON.stringify(config));
console.log(encoded);
```

Then replace the `encodedConfig` value in `firebase-config.js`.
