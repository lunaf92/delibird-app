import * as Notifications from 'expo-notifications';

export const notificationsMock = (
  Notifications as unknown as {
    __state: { lastResponse: unknown; permission: string; pushToken: string };
  }
).__state;

/** Makes the app behave as if the person tapped a notification pointing at `path`. */
export function tappedNotification(path: string | null) {
  notificationsMock.lastResponse =
    path === null ? null : { notification: { request: { content: { data: { path } } } } };
}
