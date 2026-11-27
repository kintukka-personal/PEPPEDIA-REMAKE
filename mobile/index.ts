// App entry: the reminder background task has to be defined before the router
// loads, so a "Log" press on a notification works even when the app is closed.
import './src/lib/reminder-task';
import 'expo-router/entry';
