const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

async function test() {
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json'));
  console.log("Config:", config);
  const app = initializeApp({
    projectId: config.projectId,
    credential: applicationDefault()
  });
  const db = getFirestore(app, config.firestoreDatabaseId);
  try {
    const doc = await db.collection('system_config').doc('vapid').get();
    console.log("Success:", doc.exists);
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
