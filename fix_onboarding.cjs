const fs = require('fs');
let code = fs.readFileSync('src/components/Onboarding.tsx', 'utf-8');

const target1 = `            const userData = userDoc.data();
            login({
              id: user.uid,
              username: userData.username,
              displayName: userData.displayName,
              avatar: userData.avatar,
              description: userData.description,
              isAdmin: userData.isAdmin,
              joinDate: userData.joinDate
            });`;

const replace1 = `            const userData = userDoc.data();
            const isAdmin = userData.isAdmin || (user.email === 'syaswanthkumar66@gmail.com');
            if (isAdmin && !userData.isAdmin) {
               updateDoc(userDocRef, { isAdmin: true }).catch(console.error);
            }
            login({
              id: user.uid,
              username: userData.username,
              displayName: userData.displayName,
              avatar: userData.avatar,
              description: userData.description,
              isAdmin: isAdmin,
              joinDate: userData.joinDate
            });`;

code = code.replace(target1, replace1);

const target2 = `            const userData = userDoc.data();
            login({
              id: firebaseUser.uid,
              username: userData.username,
              displayName: userData.displayName,
              avatar: userData.avatar,
              description: userData.description,
              isAdmin: userData.isAdmin,
              joinDate: userData.joinDate
            });`;

const replace2 = `            const userData = userDoc.data();
            const isAdmin = userData.isAdmin || (firebaseUser.email === 'syaswanthkumar66@gmail.com');
            if (isAdmin && !userData.isAdmin) {
               updateDoc(userDocRef, { isAdmin: true }).catch(console.error);
            }
            login({
              id: firebaseUser.uid,
              username: userData.username,
              displayName: userData.displayName,
              avatar: userData.avatar,
              description: userData.description,
              isAdmin: isAdmin,
              joinDate: userData.joinDate
            });`;

code = code.replace(target2, replace2);

const target3 = `        const userData = userDoc.data();
        login({
          id: user.uid,
          username: userData.username,
          displayName: userData.displayName,
          avatar: userData.avatar,
          description: userData.description,
          isAdmin: userData.isAdmin,
          joinDate: userData.joinDate
        });`;

const replace3 = `        const userData = userDoc.data();
        const isAdmin = userData.isAdmin || (user.email === 'syaswanthkumar66@gmail.com');
        if (isAdmin && !userData.isAdmin) {
           updateDoc(userDocRef, { isAdmin: true }).catch(console.error);
        }
        login({
          id: user.uid,
          username: userData.username,
          displayName: userData.displayName,
          avatar: userData.avatar,
          description: userData.description,
          isAdmin: isAdmin,
          joinDate: userData.joinDate
        });`;

code = code.replace(target3, replace3);

const target4 = `        const userData = userDoc.data();
        login({
          id: user.uid,
          username: userData.username,
          displayName: userData.displayName,
          avatar: userData.avatar,
          description: userData.description,
          isAdmin: userData.isAdmin,
          joinDate: userData.joinDate
        }, 'local');`;

const replace4 = `        const userData = userDoc.data();
        const isAdmin = userData.isAdmin || (user.email === 'syaswanthkumar66@gmail.com');
        if (isAdmin && !userData.isAdmin) {
           updateDoc(userDocRef, { isAdmin: true }).catch(console.error);
        }
        login({
          id: user.uid,
          username: userData.username,
          displayName: userData.displayName,
          avatar: userData.avatar,
          description: userData.description,
          isAdmin: isAdmin,
          joinDate: userData.joinDate
        }, 'local');`;

code = code.replace(target4, replace4);

fs.writeFileSync('src/components/Onboarding.tsx', code);
