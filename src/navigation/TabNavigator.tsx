import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {View, Text, StyleSheet} from 'react-native';
import {colors} from '../theme/colors';
import HomeScreen from '../screens/HomeScreen';
import TripPlannerScreen from '../screens/TripPlannerScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TripHistoryScreen from '../screens/TripHistoryScreen';
import FeedScreen from '../screens/FeedScreen';
import EchoesScreen from '../screens/EchoesScreen';

const ExpensesScreen = () => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderEmoji}>💰</Text>
    <Text style={styles.placeholderTitle}>Expenses</Text>
    <Text style={styles.placeholderSub}>Coming soon — split group costs</Text>
  </View>
);

const Tab = createBottomTabNavigator();

const TabIcon = ({emoji, label, focused}: any) => (
  <View style={[styles.tabItem, focused && styles.tabItemFocused]}>
    <Text style={styles.tabEmoji}>{emoji}</Text>
    <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>
      {label}
    </Text>
  </View>
);

const TabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon emoji="🏠" label="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon emoji="📸" label="Feed" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Plan"
        component={TripPlannerScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon emoji="🗺️" label="Plan" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Echoes"
        component={EchoesScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon emoji="✨" label="Echoes" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon emoji="💰" label="Expenses" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={TripHistoryScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon emoji="📋" label="History" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon emoji="👤" label="Profile" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 0.5,
    height: 65,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 55,
  },
  tabItemFocused: {
    backgroundColor: `${colors.primary}22`,
  },
  tabEmoji: {fontSize: 20},
  tabLabel: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: '500',
  },
  tabLabelFocused: {
    color: colors.primary,
    fontWeight: '700',
  },
  placeholder: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  placeholderEmoji: {fontSize: 60},
  placeholderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  placeholderSub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default TabNavigator;
