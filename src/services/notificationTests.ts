/**
 * SCRIPT DE TESTE PARA NOTIFICAÇÕES
 * 
 * Use este script para testar a funcionalidade de notificações
 * Execute no console do navegador (F12) ou adicione como botão no seu app
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../firebase';

/**
 * Função para testar envio de notificação
 */
export async function testSendNotification() {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.error('Usuário não autenticado');
      return;
    }

    const functions = getFunctions();
    const sendNotification = httpsCallable(functions, 'sendNotification');

    console.log('Enviando notificação de teste...');
    
    const result = await sendNotification({
      userId: user.uid,
      title: 'Notificação de Teste 🧪',
      body: 'Esta é uma notificação de teste do sistema de notificações.',
      tag: 'test',
      actionUrl: '/',
    });

    console.log('✅ Notificação enviada:', result.data);
    return result.data;
  } catch (error) {
    console.error('❌ Erro ao enviar notificação:', error);
    throw error;
  }
}

/**
 * Função para testar permissão de notificações
 */
export async function testNotificationPermission() {
  try {
    if (!('Notification' in window)) {
      console.warn('⚠️ Notificações não suportadas neste navegador');
      return false;
    }

    const permission = Notification.permission;
    console.log('📍 Permissão de notificações:', permission);

    if (permission === 'granted') {
      console.log('✅ Permissões concedidas');
      return true;
    } else if (permission === 'denied') {
      console.warn('❌ Permissões negadas. Verifique as configurações do navegador');
      return false;
    } else {
      console.log('ℹ️ Solicitando permissão...');
      const result = await Notification.requestPermission();
      console.log('📍 Resultado:', result);
      return result === 'granted';
    }
  } catch (error) {
    console.error('❌ Erro ao verificar permissão:', error);
    return false;
  }
}

/**
 * Função para testar Service Worker
 */
export async function testServiceWorkerRegistration() {
  try {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service Workers não suportados');
      return false;
    }

    const registration = await navigator.serviceWorker.getRegistrations();
    console.log(`📍 Service Workers registrados: ${registration.length}`);

    registration.forEach((reg, idx) => {
      console.log(`  ${idx + 1}. ${reg.scope}`);
    });

    return registration.length > 0;
  } catch (error) {
    console.error('❌ Erro ao verificar Service Workers:', error);
    return false;
  }
}

/**
 * Função para testar FCM Token
 */
export async function testFCMToken() {
  try {
    const { getMessaging, getToken } = await import('firebase/messaging');

    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: (import.meta as any).env.VITE_FCM_VAPID_KEY as string,
    });

    if (token) {
      console.log('✅ FCM Token obtido:', token.substring(0, 20) + '...');
      return token;
    } else {
      console.warn('⚠️ Nenhum token FCM disponível');
      return null;
    }
  } catch (error) {
    console.error('❌ Erro ao obter FCM Token:', error);
    return null;
  }
}

/**
 * Função para executar todos os testes
 */
export async function runAllNotificationTests() {
  console.log('🧪 Iniciando testes de notificações...\n');

  console.log('1️⃣  Testando suporte do navegador...');
  const permissionOk = await testNotificationPermission();
  console.log('');

  console.log('2️⃣  Testando Service Worker...');
  const swOk = await testServiceWorkerRegistration();
  console.log('');

  console.log('3️⃣  Testando FCM Token...');
  const tokenOk = await testFCMToken();
  console.log('');

  console.log('4️⃣  Enviando notificação de teste...');
  try {
    const result = await testSendNotification() as any;
    console.log('');
    
    if (result?.success) {
      console.log('✅ TODOS OS TESTES PASSARAM!');
      console.log('\n📋 Resumo:');
      console.log('  ✓ Permissão de notificações:', permissionOk ? 'OK' : 'FALHOU');
      console.log('  ✓ Service Worker:', swOk ? 'OK' : 'FALHOU');
      console.log('  ✓ FCM Token:', tokenOk ? 'OK' : 'FALHOU');
      console.log('  ✓ Envio de notificação:', (result as any).success ? 'OK' : 'FALHOU');
    }
  } catch (error) {
    console.error('❌ Teste de envio falhou:', error);
  }
}

/**
 * Para usar no seu App.tsx, adicione um botão de teste:
 * 
 * <button 
 *   onClick={() => runAllNotificationTests()}
 *   className="px-4 py-2 bg-blue-500 text-white rounded"
 * >
 *   Testar Notificações
 * </button>
 */
