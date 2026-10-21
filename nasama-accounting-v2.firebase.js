// ── FIREBASE INIT ─────────────────────────────────
    var db, auth;
    // Google OAuth web client of this Firebase project (public, like the API key).
    // Used by Google's sign-in library on the login page — see AuthGate.
    var GOOGLE_WEB_CLIENT_ID = "738071507036-9c76qjrh826rfvm0ic69sugbifo484dg.apps.googleusercontent.com";
    try {
      const firebaseConfig = {
        apiKey: "AIzaSyDc4SS-bJyGJKo5ZbK0legkZDT3JPFE82A",
        authDomain: "nasama-accuntant.firebaseapp.com",
        projectId: "nasama-accuntant",
        storageBucket: "nasama-accuntant.firebasestorage.app",
        messagingSenderId: "738071507036",
        appId: "1:738071507036:web:131bc36e03f646003a3699",
        measurementId: "G-DBWKJGTS7F"
      };
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      auth = firebase.auth();
      console.log('Firebase initialized — project: nasama-accuntant');

      // Firestore helpers
      const sanitizeFirestoreData = (value) => {
        if (value === undefined) return undefined;
        if (Array.isArray(value)) return value.map(sanitizeFirestoreData).filter(item => item !== undefined);
        if (value && typeof value === "object" && !(value instanceof Date)) {
          return Object.fromEntries(
            Object.entries(value)
              .map(([key, val]) => [key, sanitizeFirestoreData(val)])
              .filter(([, val]) => val !== undefined)
          );
        }
        return value;
      };
      window.fsSetCollection = async function(collName, items) {
        const colRef = db.collection(collName);
        const batch = db.batch();
        const existing = await colRef.get();
        const newMap = new Map();
        items.forEach(item => {
          const id = item.id || colRef.doc().id;
          newMap.set(id, sanitizeFirestoreData({ ...item, id }));
        });
        existing.docs.forEach(d => { if (!newMap.has(d.id)) batch.delete(d.ref); });
        const existingMap = new Map();
        existing.docs.forEach(d => existingMap.set(d.id, d.data()));
        for (const [id, item] of newMap.entries()) {
          const old = existingMap.get(id);
          if (!old || JSON.stringify(old) !== JSON.stringify(item)) batch.set(colRef.doc(id), item);
        }
        await batch.commit();
      };
      // Period lock (see core.jsx PERIOD LOCK). The app registers
      // window.__periodLockGuard({ id, next, op }) once settings load; it throws
      // when a transactions write/delete touches a closed period. Every write to
      // the transactions collection funnels through these three helpers.
      const guardTxnWrite = (collName, id, next, op) => {
        if (collName === 'transactions' && typeof window.__periodLockGuard === 'function') window.__periodLockGuard({ id, next, op });
      };
      window.fsSetDoc = async function(collName, docId, data) {
        guardTxnWrite(collName, docId, data, 'set');
        await db.collection(collName).doc(docId).set(sanitizeFirestoreData(data), { merge: true });
      };
      // Atomic multi-doc write — all succeed or all fail
      window.fsBatchWrite = async function(ops) {
        ops.forEach(({ col, id, data }) => guardTxnWrite(col, id, data, 'set'));
        const batch = db.batch();
        // `merge: true` on an op patches the doc instead of replacing it.
        ops.forEach(({ col, id, data, merge }) => {
          if (merge) batch.set(db.collection(col).doc(id), sanitizeFirestoreData(data), { merge: true });
          else batch.set(db.collection(col).doc(id), sanitizeFirestoreData(data));
        });
        await batch.commit();
      };
      window.fsDeleteDoc = async function(collName, docId) {
        guardTxnWrite(collName, docId, null, 'delete');
        await db.collection(collName).doc(docId).delete();
      };
      window.fsSaveSettings = async function(data) {
        await db.collection('settings').doc('company').set(sanitizeFirestoreData(data));
      };
    } catch (error) {
      console.error('Firebase init error:', error);
      document.body.innerHTML = '<div style="padding:20px;font-family:Arial;color:#DC2626"><h2>Firebase Error</h2><p>' + error.message + '</p></div>';
    }
