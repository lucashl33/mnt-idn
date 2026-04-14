import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  deleteDoc, 
  doc,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { auth } from '../firebase';

export interface Notification {
  id?: string;
  userId: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  createdAt: Timestamp;
  read: boolean;
  data?: Record<string, string>;
  action?: 'open_url' | 'open_app' | 'custom';
  actionData?: Record<string, string>;
}

let messaging: Messaging | null = null;

// Inicializar FCM
export async function initNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    console.warn('Notificações não suportadas neste navegador');
    return;
  }

  try {
    // Registrar Service Worker
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registrado:', registration);

    // Inicializar FCM
    messaging = getMessaging();

    // Solicitar permissão
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Permissão de notificações concedida');
      await registerFCMToken();
    }

    // Escutar mensagens foreground
    listenToForegroundMessages();
  } catch (error) {
    console.error('Erro ao inicializar notificações:', error);
  }
}

// Registrar token FCM no Firestore
export async function registerFCMToken(): Promise<string | null> {
  if (!messaging) {
    messaging = getMessaging();
  }

  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('Usuário não autenticado');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey: (import.meta as any).env.VITE_FCM_VAPID_KEY as string,
    });

    if (token) {
      // Salvar token no Firestore (collection: users/{uid}/fcmTokens)
      const tokensRef = collection(db, `users/${currentUser.uid}/fcmTokens`);
      await addDoc(tokensRef, {
        token,
        createdAt: Timestamp.now(),
        userAgent: navigator.userAgent,
      });

      console.log('FCM token registrado:', token);
      return token;
    }
  } catch (error) {
    console.error('Erro ao registrar FCM token:', error);
  }

  return null;
}

// Escutar mensagens quando app está em foreground
function listenToForegroundMessages(): void {
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    console.log('Mensagem recebida em foreground:', payload);

    const notification = payload.notification;
    const data = payload.data || {};

    // Mostrar notificação
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(notification?.title || 'Notificação', {
          body: notification?.body,
          icon: notification?.icon || '/favicon.png',
          tag: data.tag,
          data: data,
        } as NotificationOptions);
      });
    }

    // Salvar no Firestore como backup
    if (auth.currentUser) {
      const notifData = {
        userId: auth.currentUser.uid,
        title: notification?.title || 'Notificação',
        body: notification?.body || '',
        icon: notification?.icon,
        tag: data.tag,
        data: data as Record<string, string>,
        createdAt: Timestamp.now(),
        read: false,
      };
      saveNotificationToFirestore(notifData);
    }
  });
}

// Salvar notificação no Firestore
export async function saveNotificationToFirestore(notification: Omit<Notification, 'id'>): Promise<string | null> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('Usuário não autenticado');
      return null;
    }

    const notificationsRef = collection(db, `users/${currentUser.uid}/notifications`);
    const docRef = await addDoc(notificationsRef, notification);
    
    console.log('Notificação salva no Firestore:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Erro ao salvar notificação:', error);
    return null;
  }
}

// Buscar notificações do usuário
export async function getUserNotifications(unreadOnly = false): Promise<Notification[]> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return [];
    }

    const notificationsRef = collection(db, `users/${currentUser.uid}/notifications`);
    
    let q;
    if (unreadOnly) {
      q = query(
        notificationsRef,
        where('read', '==', false),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(notificationsRef, orderBy('createdAt', 'desc'));
    }

    const snapshot = await getDocs(q);
    const notifications: Notification[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as any;
      notifications.push({
        id: doc.id,
        userId: data.userId || '',
        title: data.title || '',
        body: data.body || '',
        icon: data.icon,
        badge: data.badge,
        tag: data.tag,
        createdAt: data.createdAt,
        read: data.read || false,
        data: data.data,
        action: data.action,
        actionData: data.actionData,
      });
    });

    return notifications;
  } catch (error) {
    console.error('Erro ao buscar notificações:', error);
    return [];
  }
}

// Marcar notificação como lida
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const notificationRef = doc(db, `users/${currentUser.uid}/notifications/${notificationId}`);
    await updateNotification(notificationRef, { read: true });
  } catch (error) {
    console.error('Erro ao marcar como lida:', error);
  }
}

// Deletar notificação
export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const notificationRef = doc(db, `users/${currentUser.uid}/notifications/${notificationId}`);
    await deleteDoc(notificationRef);
  } catch (error) {
    console.error('Erro ao deletar notificação:', error);
  }
}

// Helper para atualizar notificação
async function updateNotification(ref: any, data: Partial<Notification>): Promise<void> {
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(ref, data);
}
