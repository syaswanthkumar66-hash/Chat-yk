const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
async function makeAdmin() {
  const snapshot = await db.collection('users').where('email', '==', 'syaswanthkumar66@gmail.com').get();
  if (snapshot.empty) {
    console.log('User not found');
  } else {
    snapshot.forEach(async doc => {
      console.log('Found user:', doc.id);
      await db.collection('users').doc(doc.id).update({ isAdmin: true });
      console.log('Made user admin');
    });
  }
}
makeAdmin();
