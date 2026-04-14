import React, { useState, useEffect } from 'react';
import { Bell, X, Check } from 'lucide-react';
import { 
  getUserNotifications, 
  markNotificationAsRead, 
  deleteNotification,
  Notification 
} from '../services/notifications';

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadNotifications();
    
    // Recarregar notificações a cada 30 segundos
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const notifs = await getUserNotifications();
      setNotifications(notifs);
      
      const unread = notifs.filter(n => !n.read).length;
      setUnreadCount(unread);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string | undefined) => {
    if (!id) return;
    
    await markNotificationAsRead(id);
    await loadNotifications();
  };

  const handleDelete = async (id: string | undefined) => {
    if (!id) return;
    
    await deleteNotification(id);
    await loadNotifications();
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate?.() || new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}m atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;
    
    return date.toLocaleDateString('pt-BR');
  };

  return (
    <div className="relative">
      {/* Botão de sino */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
        title="Notificações"
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Painel de notificações */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Notificações</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>

          {loading ? (
            <div className="p-4 text-center text-gray-500">
              Carregando...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              Nenhuma notificação
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    !notif.read ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {notif.title}
                      </h3>
                      <p className="text-gray-600 text-sm mt-1 break-words">
                        {notif.body}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {formatTime(notif.createdAt)}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {!notif.read && (
                        <button
                          onClick={() => handleMarkAsRead(notif.id)}
                          className="p-1 text-blue-500 hover:bg-blue-100 rounded transition-colors"
                          title="Marcar como lida"
                        >
                          <Check size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(notif.id)}
                        className="p-1 text-red-500 hover:bg-red-100 rounded transition-colors"
                        title="Deletar"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
