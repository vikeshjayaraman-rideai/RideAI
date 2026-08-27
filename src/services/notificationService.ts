import notifee, {
  AndroidImportance,
  TriggerType,
} from '@notifee/react-native';

export const requestNotificationPermission = async () => {
  try {
    await notifee.requestPermission();
  } catch (e) {}
};

export const createNotificationChannel = async () => {
  try {
    await notifee.createChannel({
      id: 'tripper_rides',
      name: 'Ride Reminders',
      importance: AndroidImportance.HIGH,
    });
  } catch (e) {}
};

export const scheduleRideReminder = async (
  tripId: string,
  tripTitle: string,
  tripDate: string,
  reminderHoursBefore: number,
) => {
  try {
    await createNotificationChannel();

    // Parse trip date e.g. "12 Jun 2026"
    const months: Record<string, number> = {
      Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
      Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11,
    };

    const parts = tripDate.split(' ');
    if (parts.length < 3) return null;

    const rideDate = new Date(
      parseInt(parts[2]),
      months[parts[1]] ?? 0,
      parseInt(parts[0]),
      6, 0, 0, 0,
    );

    const reminderTime = new Date(
      rideDate.getTime() - reminderHoursBefore * 60 * 60 * 1000,
    );

    if (reminderTime.getTime() <= Date.now()) {
      return null;
    }

    await notifee.createTriggerNotification(
      {
        id: `ride_${tripId}`,
        title: '🏍️ Ride Reminder!',
        body: `${tripTitle} is coming up. Get your bike ready!`,
        android: {
          channelId: 'tripper_rides',
          importance: AndroidImportance.HIGH,
          pressAction: {id: 'default'},
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: reminderTime.getTime(),
      },
    );

    return `ride_${tripId}`;
  } catch (e) {
    console.error('Notification error:', e);
    return null;
  }
};

export const cancelRideReminder = async (tripId: string) => {
  try {
    await notifee.cancelTriggerNotification(`ride_${tripId}`);
  } catch (e) {}
};