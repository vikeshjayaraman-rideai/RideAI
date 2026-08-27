import React, {useEffect, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {getAuth, onAuthStateChanged} from '@react-native-firebase/auth';
import {ActivityIndicator, View} from 'react-native';
import TabNavigator from './TabNavigator';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import {colors} from '../theme/colors';
import {getUserProfile} from '../services/authService';
import TripPlannerScreen from '../screens/TripPlannerScreen';
import ShareTripScreen from '../screens/ShareTripScreen';
import ExpenseDraftScreen from '../screens/ExpenseDraftScreen';
import ExpenseHistoryScreen from '../screens/ExpenseHistoryScreen';
import ActiveRideScreen from '../screens/ActiveRideScreen';
import CreateMemoryScreen from '../screens/CreateMemoryScreen';
import DiscoveryMapScreen from '../screens/DiscoveryMapScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import MemoryMapScreen from '../screens/MemoryMapScreen';
import TripInvitesScreen from '../screens/TripInvitesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import GroupChatsListScreen from '../screens/GroupChatsListScreen';
import GroupChatScreen from '../screens/GroupChatScreen';
import EchoesScreen from '../screens/EchoesScreen';
import EchoDetailScreen from '../screens/EchoDetailScreen';



const Stack = createStackNavigator();

const AppNavigator = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      setUser(currentUser);
      if (currentUser) {
        const profile = await getUserProfile(currentUser.uid);
        setOnboardingDone(!!profile?.bikeBrand);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
     <Stack.Navigator
initialRouteName={!user ? 'Login' : onboardingDone ? 'Main' : 'Onboarding'}
  screenOptions={{
    headerShown: false,
    cardStyle: {backgroundColor: colors.background},
  }}>
  <Stack.Screen name="Login" component={LoginScreen} />
  <Stack.Screen name="Onboarding" component={OnboardingScreen} />
  <Stack.Screen name="Main" component={TabNavigator} />
  <Stack.Screen name="ShareTrip" component={ShareTripScreen} />
  <Stack.Screen name="ExpenseDraft" component={ExpenseDraftScreen} />
<Stack.Screen name="ExpenseHistory" component={ExpenseHistoryScreen} />
<Stack.Screen name="ActiveRide" component={ActiveRideScreen} /> 
<Stack.Screen name="CreateMemory" component={CreateMemoryScreen} />
<Stack.Screen name="DiscoveryMap" component={DiscoveryMapScreen} />
<Stack.Screen name="MapView" component={MemoryMapScreen} options={{ headerShown: false }} />
<Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ headerShown: false }} />
<Stack.Screen name="TripInvites" component={TripInvitesScreen} options={{ headerShown: false }} />
<Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
<Stack.Screen name="GroupChatsList" component={GroupChatsListScreen} options={{ headerShown: false }} />
<Stack.Screen name="GroupChat" component={GroupChatScreen} options={{ headerShown: false }} />
<Stack.Screen name="EchoDetail" component={EchoDetailScreen} options={{ headerShown: false }} />
</Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;


