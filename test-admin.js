const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
async function checkAdmin() {
  const snapshot = await db.collection('users').where('email', '==', 'syaswanthkumar66@gmail.com').get();
  if (snapshot.empty) {
    console.log('User not found');
  } else {
    snapshot.forEach(doc => {
      console.log(doc.id, '=>', doc.data());
    });
  }
}
checkAdmin();
