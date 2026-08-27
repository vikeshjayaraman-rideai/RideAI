
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.sendSOSNotification = functions.firestore
  .document('sos_alerts/{sosId}')
  .onCreate(async (snap) => {
    const sos = snap.data();
    const tokens = [];
    for (const uid of sos.recipientUids) {
      const user = await admin.firestore().collection('users').doc(uid).get();
      if (user.exists && user.data().fcmToken) tokens.push(user.data().fcmToken);
    }
    if (!tokens.length) return;
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: `${sos.emoji} ${sos.senderName} needs help!`,
        body: `${sos.label}: ${sos.message}`,
      },
      data: {
        sosId: snap.id,
        lat: String(sos.location.lat),
        lng: String(sos.location.lng),
        type: sos.sosType,
      },
      android: { priority: 'high', notification: { channelId: 'sos' } },
    });
    await snap.ref.update({ status: 'sent' });
  });
