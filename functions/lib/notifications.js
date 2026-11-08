"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyOnServiceOrderUpdated = exports.notifyOnServiceOrderCreated = exports.cleanupExpiredTokens = exports.sendNotification = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
// Inicializar Firebase Admin
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
/**
 * Cloud Function para enviar notificações aos usuários
 * Pode ser chamada do frontend via httpsCallable
 */
exports.sendNotification = functions.https.onCall(async (data, context) => {
    // Verificar autenticação
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Usuário não autenticado');
    }
    const { userId, title, body, tag, actionUrl } = data;
    // Validação básica
    if (!userId || !title || !body) {
        throw new functions.https.HttpsError('invalid-argument', 'userId, title e body são obrigatórios');
    }
    try {
        // 1. Buscar todos os FCM tokens do usuário
        const tokensSnapshot = await db
            .collection(`users/${userId}/fcmTokens`)
            .get();
        const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
        let fcmResult = { successCount: 0, failureCount: 0 };
        let fcmError = null;
        // 2. Se houver tokens, enviar via FCM
        if (tokens.length > 0) {
            try {
                const message = {
                    notification: {
                        title,
                        body,
                        icon: '/favicon.png',
                    },
                    data: {
                        tag: tag || 'default',
                        url: actionUrl || '/',
                    },
                    webpush: {
                        notification: {
                            title,
                            body,
                            icon: '/favicon.png',
                            badge: '/favicon.png',
                        },
                    },
                };
                const response = await messaging.sendMulticast({
                    tokens,
                    notification: message.notification,
                    data: message.data,
                    webpush: message.webpush,
                });
                fcmResult = {
                    successCount: response.successCount,
                    failureCount: response.failureCount,
                };
                // Remover tokens que falharam (podem estar expirados)
                if (response.failureCount > 0) {
                    const failedTokenIndices = response.responses
                        .map((resp, idx) => (resp.success ? -1 : idx))
                        .filter(idx => idx !== -1);
                    for (const idx of failedTokenIndices) {
                        const failedToken = tokens[idx];
                        await db
                            .collection(`users/${userId}/fcmTokens`)
                            .where('token', '==', failedToken)
                            .get()
                            .then(snap => {
                            snap.docs.forEach(doc => doc.ref.delete());
                        })
                            .catch(err => console.error(`Erro ao remover token: ${err}`));
                    }
                }
            }
            catch (error) {
                console.error('Erro ao enviar via FCM:', error);
                fcmError = error;
            }
        }
        // 3. Salvar notificação no Firestore (sempre, mesmo que FCM falhe)
        const notificationRef = await db
            .collection(`users/${userId}/notifications`)
            .add({
            userId,
            title,
            body,
            tag: tag || 'default',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            data: {
                url: actionUrl || '/',
            },
        });
        return {
            success: true,
            notificationId: notificationRef.id,
            fcm: {
                method: tokens.length > 0 ? 'fcm' : 'firestore_only',
                successCount: fcmResult.successCount,
                failureCount: fcmResult.failureCount,
            },
            error: fcmError ? fcmError.toString() : null,
        };
    }
    catch (error) {
        console.error('Erro em sendNotification:', error);
        throw new functions.https.HttpsError('internal', 'Erro ao enviar notificação: ' + (error instanceof Error ? error.message : String(error)));
    }
});
/**
 * Cloud Function para limpar tokens expirados periodicamente
 * Disparada diariamente via Cloud Scheduler
 */
exports.cleanupExpiredTokens = functions.pubsub
    .schedule('0 2 * * *') // 2 AM todos os dias
    .timeZone('America/Sao_Paulo')
    .onRun(async () => {
    try {
        const usersSnapshot = await db.collection('users').get();
        let totalTokensDeleted = 0;
        for (const userDoc of usersSnapshot.docs) {
            const tokensSnapshot = await db
                .collection(`users/${userDoc.id}/fcmTokens`)
                .get();
            // Remover tokens com mais de 30 dias
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            for (const tokenDoc of tokensSnapshot.docs) {
                const createdAt = tokenDoc.data().createdAt?.toDate?.();
                if (createdAt && createdAt < thirtyDaysAgo) {
                    await tokenDoc.ref.delete();
                    totalTokensDeleted++;
                }
            }
        }
        console.log(`Limpeza concluída: ${totalTokensDeleted} tokens removidos`);
        return { success: true, tokensDeleted: totalTokensDeleted };
    }
    catch (error) {
        console.error('Erro em cleanupExpiredTokens:', error);
        throw error;
    }
});
/**
 * Cloud Function para notificação automática quando uma OS é criada
 * Disparada quando um documento é criado em serviceOrders
 */
exports.notifyOnServiceOrderCreated = functions.firestore
    .document('serviceOrders/{orderId}')
    .onCreate(async (snap) => {
    try {
        const orderData = snap.data();
        const adminUsers = await db
            .collection('users')
            .where('role', '==', 'admin')
            .get();
        const title = 'Nova Ordem de Serviço';
        const body = `${orderData.churchArea} - Prioridade: ${orderData.priority}`;
        // Enviar notificação para todos os admins
        for (const adminDoc of adminUsers.docs) {
            const tokensSnapshot = await db
                .collection(`users/${adminDoc.id}/fcmTokens`)
                .get();
            const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
            if (tokens.length > 0) {
                try {
                    await messaging.sendMulticast({
                        tokens,
                        notification: { title, body },
                        data: { orderId: snap.id, tag: 'new_order' },
                    });
                }
                catch (err) {
                    console.error(`Erro ao notificar admin ${adminDoc.id}:`, err);
                }
            }
            // Salvar no Firestore
            await db.collection(`users/${adminDoc.id}/notifications`).add({
                userId: adminDoc.id,
                title,
                body,
                tag: 'new_order',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                data: { orderId: snap.id },
            });
        }
        console.log(`Notificações enviadas para ${adminUsers.size} admins`);
    }
    catch (error) {
        console.error('Erro em notifyOnServiceOrderCreated:', error);
    }
});
/**
 * Cloud Function para notificação quando OS é atualizada
 */
exports.notifyOnServiceOrderUpdated = functions.firestore
    .document('serviceOrders/{orderId}')
    .onUpdate(async (change) => {
    try {
        const before = change.before.data();
        const after = change.after.data();
        // Só notificar se o status mudou
        if (before.status === after.status) {
            return;
        }
        const requesterUid = after.requesterId;
        const assignedUids = after.assignedToIds || [];
        const statusTranslations = {
            'open': 'Aberta',
            'in-progress': 'Em Andamento',
            'completed': 'Concluída',
            'cancelled': 'Cancelada',
        };
        const title = `OS Atualizada: ${after.churchArea}`;
        const body = `Status: ${statusTranslations[after.status] || after.status}`;
        // Notificar solicitante
        const tokensSnapshot = await db
            .collection(`users/${requesterUid}/fcmTokens`)
            .get();
        const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
        if (tokens.length > 0) {
            await messaging.sendMulticast({
                tokens,
                notification: { title, body },
                data: { orderId: change.after.id, tag: 'order_updated' },
            });
        }
        // Salvar notificação
        await db.collection(`users/${requesterUid}/notifications`).add({
            userId: requesterUid,
            title,
            body,
            tag: 'order_updated',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            data: { orderId: change.after.id },
        });
        // Notificar responsáveis também
        for (const assignedUid of assignedUids) {
            const assignedTokens = await db
                .collection(`users/${assignedUid}/fcmTokens`)
                .get();
            const tokens = assignedTokens.docs.map(doc => doc.data().token);
            if (tokens.length > 0) {
                await messaging.sendMulticast({
                    tokens,
                    notification: { title, body },
                    data: { orderId: change.after.id, tag: 'order_updated' },
                });
            }
            // Salvar notificação
            await db.collection(`users/${assignedUid}/notifications`).add({
                userId: assignedUid,
                title,
                body,
                tag: 'order_updated',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                data: { orderId: change.after.id },
            });
        }
        console.log('Notificações de atualização enviadas');
    }
    catch (error) {
        console.error('Erro em notifyOnServiceOrderUpdated:', error);
    }
});
//# sourceMappingURL=notifications.js.map