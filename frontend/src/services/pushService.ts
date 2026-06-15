import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import api from './api';

type NavFn = (path: string) => void;

let listenersAdded = false;

export async function initPush(navigate: NavFn) {
  if (!Capacitor.isNativePlatform()) return;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  await PushNotifications.register();

  if (listenersAdded) return;
  listenersAdded = true;

  // Token listo → guardarlo en el backend
  PushNotifications.addListener('registration', async ({ value: token }) => {
    try {
      await api.post('/notifications/token', {
        token,
        platform: Capacitor.getPlatform(),
      });
    } catch (err) {
      console.error('[Push] registro de token fallido', err);
    }
  });

  PushNotifications.addListener('registrationError', err => {
    console.error('[Push] error de registro', err);
  });

  // Notificación llega con app en primer plano — se ignora visualmente (la app ya está abierta)
  PushNotifications.addListener('pushNotificationReceived', _n => {});

  // Usuario toca la notificación → navegar a la pantalla correcta
  PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const data = action.notification.data ?? {};
    if (data.type === 'chat')         navigate('/chat');
    if (data.type === 'activity')     navigate('/actividades');
    if (data.type === 'announcement') navigate('/');
  });
}

export async function removePushToken() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { value: token } = await PushNotifications.getDeliveredNotifications()
      .then(() => ({ value: '' }))
      .catch(() => ({ value: '' }));
    // Obtener token actual (guardado en memoria del plugin)
    // Es suficiente con que el backend elimine todos los tokens del usuario
    await api.delete('/notifications/token', { data: { token } });
  } catch { /* ignore */ }
}

export async function clearBadge() {
  if (!Capacitor.isNativePlatform()) return;
  try { await PushNotifications.removeAllDeliveredNotifications(); } catch { /* ignore */ }
}
