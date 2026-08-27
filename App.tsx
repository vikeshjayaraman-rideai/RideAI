import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { setupPlayer } from './src/services/useMusicPlayer';
import { saveFcmToken, requestNotificationPermission } from './src/services/fcmService';

const App = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await setupPlayer();
        console.log('TrackPlayer ready');
      } catch (e) {
        console.log('TrackPlayer setup error:', e);
      }
      try {
        await requestNotificationPermission();
        await saveFcmToken();
      } catch (e) {
        console.log('FCM error:', e);
      }
      setReady(true);
    };
    init();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D0D1A', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF4500" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <AppNavigator />
    </GestureHandlerRootView>
  );
};

export default App;
