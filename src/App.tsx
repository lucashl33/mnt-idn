import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  deleteField,
  orderBy,
  limit,
  getDocFromServer,
  startAfter,
  QueryDocumentSnapshot,
  QueryConstraint
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { compressImage } from './utils/imageUtils';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotificationCenter } from './components/NotificationCenter';
import { initNotifications } from './services/notifications';
import { ServiceOrder, InventoryItem, UserProfile, UserRole, OSPriority, OSStatus, MaintenanceDate, Tool, MaintenanceRecord, ToolLoan } from './types';
import {
  ClipboardList,
  Package,
  LogOut,
  Plus,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Clock,
  CheckCircle2,
  User as UserIcon,
  LayoutDashboard,
  X,
  Camera,
  Image as ImageIcon,
  Loader2,
  LayoutGrid,
  List,
  Download,
  Search,
  DollarSign,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Calendar,
  Trash2,
  Users,
  Settings2,
  Wrench
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
// Translations
const statusTranslations: Record<string, string> = {
  'open': 'Aberto',
  'in-progress': 'Em Andamento',
  'completed': 'Concluído',
  'cancelled': 'Cancelado'
};

const priorityTranslations: Record<string, string> = {
  'preventive': 'Preventiva/Programada',
  'complementary': 'Complementar',
  'necessary': 'Necessária',
  'urgent': 'Urgente',
  'medium': 'Preventiva/Programada'
};

const roleTranslations: Record<string, string> = {
  'admin': 'Administrador',
  'maintenance': 'Manutenção',
  'viewer': 'Visualizador'
};

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [maintenanceDates, setMaintenanceDates] = useState<MaintenanceDate[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'inventory' | 'tools' | 'users' | 'calendar' | 'escala'>('dashboard');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedOS, setSelectedOS] = useState<ServiceOrder | null>(null);

  // Pagination state
  const [pageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [pagesHistory, setPagesHistory] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [hasNextPage, setHasNextPage] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallBtn(false);
    }
  };
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isOSModalOpen, setIsOSModalOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isEscalaModalOpen, setIsEscalaModalOpen] = useState(false);
  const [selectedMaintenanceDate, setSelectedMaintenanceDate] = useState<MaintenanceDate | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof ServiceOrder;
    direction: 'asc' | 'desc';
  }>({ key: 'createdAt', direction: 'desc' });
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [recentOrders, setRecentOrders] = useState<ServiceOrder[]>([]);

  // Inventory Modal states
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [isEditInventoryModalOpen, setIsEditInventoryModalOpen] = useState(false);
  const [allInventoryItems, setAllInventoryItems] = useState<InventoryItem[]>([]);
  const [newMaterial, setNewMaterial] = useState({
    materialType: '',
    characteristic: '',
    quantity: 0
  });
  const [editingMaterial, setEditingMaterial] = useState<InventoryItem | null>(null);
  const [editFormData, setEditFormData] = useState({
    materialType: '',
    characteristic: '',
    quantity: 0
  });
  const [selectedInventoryImage, setSelectedInventoryImage] = useState<File | null>(null);
  const [editingInventoryImage, setEditingInventoryImage] = useState<File | null>(null);
  const [materialError, setMaterialError] = useState('');
  const [isSubmittingMaterial, setIsSubmittingMaterial] = useState(false);

  // Tools Modal states
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [isEditToolsModalOpen, setIsEditToolsModalOpen] = useState(false);
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [newTool, setNewTool] = useState({
    toolType: '',
    characteristic: '',
    quantity: 0
  });
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [editToolFormData, setEditToolFormData] = useState({
    toolType: '',
    characteristic: '',
    quantity: 0
  });
  const [selectedToolImages, setSelectedToolImages] = useState<File[]>([]);
  const [existingToolImages, setExistingToolImages] = useState<string[]>([]);
  const [newToolImages, setNewToolImages] = useState<File[]>([]);
  const [toolError, setToolError] = useState('');
  const [isSubmittingTool, setIsSubmittingTool] = useState(false);

  // Photo Viewer / Lightbox modal state
  const [photoViewerState, setPhotoViewerState] = useState<{
    isOpen: boolean;
    images: string[];
    currentIndex: number;
    title: string;
  }>({
    isOpen: false,
    images: [],
    currentIndex: 0,
    title: ''
  });

  const openPhotoViewer = (images: string[], title: string, startIndex = 0) => {
    if (!images || images.length === 0) return;
    setPhotoViewerState({
      isOpen: true,
      images,
      currentIndex: startIndex,
      title
    });
  };

  // Keyboard navigation for photo lightbox
  useEffect(() => {
    if (!photoViewerState.isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPhotoViewerState(prev => ({ ...prev, isOpen: false }));
      } else if (e.key === 'ArrowLeft' && photoViewerState.images.length > 1) {
        setPhotoViewerState(prev => ({
          ...prev,
          currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length
        }));
      } else if (e.key === 'ArrowRight' && photoViewerState.images.length > 1) {
        setPhotoViewerState(prev => ({
          ...prev,
          currentIndex: (prev.currentIndex + 1) % prev.images.length
        }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photoViewerState.isOpen, photoViewerState.images.length]);

  // Maintenance History Modal
  const [isMaintenanceHistoryModalOpen, setIsMaintenanceHistoryModalOpen] = useState(false);
  const [selectedToolForMaintenance, setSelectedToolForMaintenance] = useState<Tool | null>(null);
  const [maintenanceFormData, setMaintenanceFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    cost: 0,
    description: ''
  });
  const [maintenanceError, setMaintenanceError] = useState('');
  const [isSubmittingMaintenance, setIsSubmittingMaintenance] = useState(false);

  // Loan Management Modal
  const [isLoansModalOpen, setIsLoansModalOpen] = useState(false);
  const [isAddLoanModalOpen, setIsAddLoanModalOpen] = useState(false);
  const [selectedToolForLoans, setSelectedToolForLoans] = useState<Tool | null>(null);
  const [loanFormData, setLoanFormData] = useState({
    borrowerName: '',
    borrowDate: new Date().toISOString().split('T')[0],
    returnDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  const [loanError, setLoanError] = useState('');
  const [isSubmittingLoan, setIsSubmittingLoan] = useState(false);

  // Helper to check if user is admin (including super admin check)
  const isAdmin = profile?.role === 'admin' || user?.email === 'lucaslh@gmail.com';
  const isMaintenance = profile?.role === 'maintenance' || isAdmin;
  const isViewer = profile?.role === 'viewer' || isMaintenance;
  const isAssigned = (selectedOS?.assignedToIds || []).includes(user?.uid || '');

  const groupOrdersByMonth = (orders: ServiceOrder[]) => {
    const groups: { [key: string]: ServiceOrder[] } = {};
    orders.forEach(order => {
      const date = new Date(order.createdAt);
      const monthYear = date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
      const capitalizedMonthYear = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
      if (!groups[capitalizedMonthYear]) {
        groups[capitalizedMonthYear] = [];
      }
      groups[capitalizedMonthYear].push(order);
    });
    return groups;
  };

  // Separate listener for monthly total — synchronized with selected month/year
  useEffect(() => {
    if (!user || !isAdmin) return;
    const startOfTargetMonth = new Date(selectedYear, selectedMonth, 1).toISOString();
    const startOfNextTargetMonth = new Date(selectedYear, selectedMonth + 1, 1).toISOString();
    const q = query(
      collection(db, 'serviceOrders'),
      where('createdAt', '>=', startOfTargetMonth),
      where('createdAt', '<', startOfNextTargetMonth)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const total = snapshot.docs.reduce((sum, doc) => {
        const data = doc.data();
        if (data.status === 'cancelled') return sum;
        return sum + (data.budget || 0);
      }, 0);
      setMonthlyTotal(total);
    });
    return () => unsubscribe();
  }, [user, isAdmin, selectedMonth, selectedYear]);

  // Global listener for the 5 most recent orders (Dashboard)
  useEffect(() => {
    if (!user) return;

    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(5)];

    // For non-admins, also filter strictly to their own orders for privacy
    if (!isAdmin) {
      if (profile?.role === 'maintenance') {
        constraints.unshift(where('assignedToIds', 'array-contains', user.uid));
      } else {
        constraints.unshift(where('requesterId', '==', user.uid));
      }
    }

    const q = query(collection(db, 'serviceOrders'), ...constraints);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceOrder));
      setRecentOrders(docs);
    }, (error) => {
      console.error("Recent Orders List Error:", error);
    });
    return () => unsubscribe();
  }, [user, isAdmin, profile]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'maintenance_dates'), orderBy('date', 'asc'));
    return onSnapshot(q, (snapshot) => {
      setMaintenanceDates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceDate)));
    });
  }, [user]);

  const handleOpenShift = (date: MaintenanceDate) => {
    setSelectedMaintenanceDate(date);
    setIsEscalaModalOpen(true);
  };

  const updateMaintenanceShift = async (dateId: string, updates: Partial<MaintenanceDate>) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'maintenance_dates', dateId), updates, { merge: true });
      if (selectedMaintenanceDate && selectedMaintenanceDate.id === dateId) {
        setSelectedMaintenanceDate({ ...selectedMaintenanceDate, ...updates });
      }
    } catch (error) {
      console.error('Error updating shift:', error);
    }
  };

  const toggleMaintenanceDate = async (dateStr: string) => {
    if (!isAdmin) return;
    const existing = maintenanceDates.find(d => d.date === dateStr);
    try {
      if (existing) {
        await deleteDoc(doc(db, 'maintenance_dates', existing.id));
      } else {
        await setDoc(doc(db, 'maintenance_dates', dateStr), {
          id: dateStr,
          date: dateStr,
          type: 'scheduled',
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error toggling maintenance date:', error);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (isAdmin) return true;
    if (profile?.role === 'maintenance') {
      return (order.assignedToIds || []).includes(user?.uid || '');
    }
    if (profile?.role === 'viewer') {
      return order.requesterId === user?.uid;
    }
    return false;
  });

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (aValue === undefined || bValue === undefined) return 0;

    // Special case for priority sorting (custom rank)
    if (sortConfig.key === 'priority') {
      const priorityRank = { 'urgent': 4, 'necessary': 3, 'complementary': 2, 'preventive': 1 };
      const aRank = priorityRank[a.priority as keyof typeof priorityRank] || 0;
      const bRank = priorityRank[b.priority as keyof typeof priorityRank] || 0;
      return sortConfig.direction === 'asc' ? aRank - bRank : bRank - aRank;
    }

    // Special case for status sorting
    if (sortConfig.key === 'status') {
      const statusRank = { 'in-progress': 4, 'open': 3, 'completed': 2, 'cancelled': 1 };
      const aRank = statusRank[a.status as keyof typeof statusRank] || 0;
      const bRank = statusRank[b.status as keyof typeof statusRank] || 0;
      return sortConfig.direction === 'asc' ? aRank - bRank : bRank - aRank;
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Client-side pagination for admin view (monthly)
  const displayOrders = isAdmin
    ? sortedOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : sortedOrders;

  const groupedOrders = groupOrdersByMonth(displayOrders);

  // Update hasNextPage for admins whenever sortedOrders or currentPage changes
  useEffect(() => {
    if (isAdmin) {
      setHasNextPage(sortedOrders.length > currentPage * pageSize);
    }
  }, [isAdmin, sortedOrders.length, currentPage, pageSize]);

  const handleSort = (key: keyof ServiceOrder) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: keyof ServiceOrder }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={12} className="opacity-30 group-hover:opacity-100 transition-opacity" />;
    return sortConfig.direction === 'asc'
      ? <ArrowUp size={12} className="text-gray-900" />
      : <ArrowDown size={12} className="text-gray-900" />;
  };

  const getUserNames = (uids: string[]) => {
    return uids.map(uid => {
      const u = allUsers.find(user => user.uid === uid);
      return u?.displayName || u?.email || 'Usuário';
    }).join(', ');
  };

  const MonthCalendar = ({ month, year, maintenanceDates, onToggle, onOpenShift, isAdmin }: {
    month: number;
    year: number;
    maintenanceDates: MaintenanceDate[];
    onToggle: (dateStr: string) => void;
    onOpenShift: (date: MaintenanceDate) => void;
    isAdmin: boolean;
  }) => {
    const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'long' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [...Array(daysInMonth)].map((_, i) => i + 1);

    // Week days: Dom, Seg, Ter, Qua, Qui, Sex, Sáb
    const weekDays = ['Do', 'Se', 'Te', 'Qu', 'Qu', 'Se', 'Sá'];

    return (
      <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden flex flex-col h-full">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-center">
          <h4 className="text-white font-bold text-lg flex items-center justify-center gap-2">
            <Calendar size={18} />
            {capitalizedMonth} {year}
          </h4>
        </div>
        <div className="p-4 flex-1">
          <div className="grid grid-cols-7 gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-tighter mb-2 text-center">
            {weekDays.map((d, idx) => (
              <div key={idx} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {[...Array(firstDay)].map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {days.map(day => {
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const maintenance = maintenanceDates.find(d => d.date === dateStr);
              const isMarked = !!maintenance;

              return (
                <button
                  key={day}
                  onClick={() => {
                    if (isMarked) {
                      onOpenShift(maintenance);
                    } else if (isAdmin) {
                      onToggle(dateStr);
                    }
                  }}
                  disabled={!isAdmin && !isMarked}
                  className={cn(
                    "aspect-square rounded-xl text-sm font-medium transition-all flex items-center justify-center relative group",
                    isMarked
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                      : "text-gray-600 hover:bg-gray-100",
                    (!isAdmin && !isMarked) && "cursor-default"
                  )}
                >
                  {day}
                  {isMarked && (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 border-2 border-white rounded-full shadow-sm" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const [newOS, setNewOS] = useState({
    churchArea: '',
    requestDetails: '',
    justification: '',
    solutionIdea: '',
    budget: 0,
    priority: 'preventive' as OSPriority
  });
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [osError, setOSError] = useState<string | null>(null);

  const resetForm = () => {
    setNewOS({
      churchArea: '',
      requestDetails: '',
      justification: '',
      solutionIdea: '',
      budget: 0,
      priority: 'preventive' as OSPriority
    });
    setSelectedImage(null);
  };

  const createServiceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    setIsUploading(true);
    setOSError(null);
    try {
      let imageUrl = '';
      if (selectedImage) {
        imageUrl = await compressImage(selectedImage);
      }

      const validPriorities: OSPriority[] = ['preventive', 'complementary', 'necessary', 'urgent'];
      const priority: OSPriority = validPriorities.includes(newOS.priority)
        ? newOS.priority
        : 'preventive';

      const osData: any = {
        requesterName: profile.displayName || user.email || 'Usuário',
        churchArea: newOS.churchArea,
        requestDetails: newOS.requestDetails,
        justification: newOS.justification,
        solutionIdea: newOS.solutionIdea,
        status: 'open',
        priority,
        requesterId: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (imageUrl) osData.imageUrl = imageUrl;
      if (isAdmin) osData.budget = newOS.budget;

      await addDoc(collection(db, 'serviceOrders'), osData);
      setIsOSModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Error creating OS:", error);
      setOSError(error.message || "Erro ao criar ordem de serviço. Verifique sua conexão e permissões.");
    } finally {
      setIsUploading(false);
    }
  };

  const updateUserRole = async (targetUid: string, newRole: any) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'users', targetUid), { role: newRole }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  const deleteUser = async (targetUid: string, targetEmail?: string | null) => {
    if (!isAdmin) return;
    if (targetUid === user?.uid) return; // Cannot delete yourself
    if (targetEmail === 'lucaslh@gmail.com') return; // Cannot delete super admin
    const confirmed = window.confirm('Tem certeza que deseja apagar este usuário? Esta ação não pode ser desfeita.');
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, 'users', targetUid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${targetUid}`);
    }
  };

  const createInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setIsSubmittingMaterial(true);
    setMaterialError('');

    try {
      // Validate inputs
      if (!newMaterial.materialType.trim()) {
        setMaterialError('Tipo do Material é obrigatório');
        setIsSubmittingMaterial(false);
        return;
      }
      if (!newMaterial.characteristic.trim()) {
        setMaterialError('Característica é obrigatória');
        setIsSubmittingMaterial(false);
        return;
      }
      if (newMaterial.quantity <= 0) {
        setMaterialError('Quantidade deve ser maior que 0');
        setIsSubmittingMaterial(false);
        return;
      }

      let imageUrl = '';
      if (selectedInventoryImage) {
        imageUrl = await compressImage(selectedInventoryImage);
      }

      const materialData: any = {
        materialType: newMaterial.materialType.trim(),
        characteristic: newMaterial.characteristic.trim(),
        quantity: newMaterial.quantity,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (imageUrl) materialData.imageUrl = imageUrl;

      await addDoc(collection(db, 'inventory'), materialData);

      // Reset form
      setNewMaterial({
        materialType: '',
        characteristic: '',
        quantity: 0
      });
      setSelectedInventoryImage(null);
      setIsInventoryModalOpen(false);
    } catch (error: any) {
      console.error('Error creating inventory item:', error);
      setMaterialError(error.message || 'Erro ao criar material. Verifique sua conexão e permissões.');
    } finally {
      setIsSubmittingMaterial(false);
    }
  };

  const deleteInventoryItem = async (itemId: string) => {
    if (!isAdmin) return;
    const confirmed = window.confirm('Tem certeza que deseja apagar este material? Esta ação não pode ser desfeita.');
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'inventory', itemId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `inventory/${itemId}`);
    }
  };

  const openEditInventoryModal = (item: InventoryItem) => {
    if (!isAdmin) return;
    setEditingMaterial(item);
    setEditFormData({
      materialType: item.materialType,
      characteristic: item.characteristic,
      quantity: item.quantity
    });
    setEditingInventoryImage(null);
    setMaterialError('');
    setIsEditInventoryModalOpen(true);
  };

  const updateInventoryItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingMaterial) return;

    setIsSubmittingMaterial(true);
    setMaterialError('');

    try {
      // Validate inputs
      if (!editFormData.materialType.trim()) {
        setMaterialError('Tipo do Material é obrigatório');
        setIsSubmittingMaterial(false);
        return;
      }
      if (!editFormData.characteristic.trim()) {
        setMaterialError('Característica é obrigatória');
        setIsSubmittingMaterial(false);
        return;
      }
      if (editFormData.quantity <= 0) {
        setMaterialError('Quantidade deve ser maior que 0');
        setIsSubmittingMaterial(false);
        return;
      }

      let imageUrl = editingMaterial.imageUrl || '';

      // Comprimir e converter nova imagem se selecionada
      if (editingInventoryImage) {
        imageUrl = await compressImage(editingInventoryImage);
      }

      const updateData: any = {
        materialType: editFormData.materialType.trim(),
        characteristic: editFormData.characteristic.trim(),
        quantity: editFormData.quantity,
        updatedAt: new Date().toISOString()
      };

      if (imageUrl) updateData.imageUrl = imageUrl;

      await setDoc(doc(db, 'inventory', editingMaterial.id), updateData, { merge: true });

      // Reset form
      setEditingMaterial(null);
      setEditFormData({ materialType: '', characteristic: '', quantity: 0 });
      setEditingInventoryImage(null);
      setIsEditInventoryModalOpen(false);
    } catch (error: any) {
      console.error('Error updating inventory item:', error);
      setMaterialError(error.message || 'Erro ao atualizar material. Verifique sua conexão e permissões.');
    } finally {
      setIsSubmittingMaterial(false);
    }
  };

  const updateOS = async (osId: string, updates: Partial<ServiceOrder>) => {
    try {
      const finalUpdates = { ...updates };

      // Build the Firestore data object separately to handle deleteField()
      const firestoreData: Record<string, any> = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // Auto-set completionDate if status is changed to completed
      if (updates.status === 'completed') {
        finalUpdates.completionDate = new Date().toISOString();
        firestoreData.completionDate = new Date().toISOString();
      } else if (updates.status) {
        // Clear completionDate if status is changed BACK from completed
        finalUpdates.completionDate = undefined;
        firestoreData.completionDate = deleteField();
      }

      await setDoc(doc(db, 'serviceOrders', osId), firestoreData, { merge: true });

      if (selectedOS && selectedOS.id === osId) {
        setSelectedOS({ ...selectedOS, ...finalUpdates });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `serviceOrders/${osId}`);
    }
  };

  const handleCancelOS = async () => {
    if (!selectedOS || !cancellationReason.trim()) return;

    try {
      await updateOS(selectedOS.id, {
        status: 'cancelled',
        cancellationReason: cancellationReason.trim()
      });

      setIsCancelling(false);
      setCancellationReason('');
    } catch (error) {
      console.error('Erro ao cancelar OS:', error);
    }
  };


  // Test connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            setProfile(data);

            // Auto-upgrade super admin if needed
            if (firebaseUser.email === 'lucaslh@gmail.com' && data.role !== 'admin') {
              await setDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' }, { merge: true });
              setProfile({ ...data, role: 'admin' });
            }
          } else {
            // Create default profile for new users
            const isSuperAdmin = firebaseUser.email === 'lucaslh@gmail.com';
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName,
              role: isSuperAdmin ? 'admin' : 'viewer',
              createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);
          }

          // Inicializar notificações após autenticar
          await initNotifications().catch(console.error);
        } catch (error) {
          console.error("Error fetching profile:", error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen for Service Orders with role-based filtering and pagination
  useEffect(() => {
    if (!user || !profile) return;

    let q;
    const baseConstraints = [];

    if (isAdmin) {
      const startOfSelectedMonth = new Date(selectedYear, selectedMonth, 1).toISOString();
      const startOfNextSelectedMonth = new Date(selectedYear, selectedMonth + 1, 1).toISOString();
      baseConstraints.push(where('createdAt', '>=', startOfSelectedMonth));
      baseConstraints.push(where('createdAt', '<', startOfNextSelectedMonth));
      // No server-side pagination for admin monthly view to allow global sorting
      q = query(collection(db, 'serviceOrders'), ...baseConstraints, orderBy('createdAt', 'desc'));
    } else {
      if (profile?.role === 'maintenance') {
        baseConstraints.push(where('assignedToIds', 'array-contains', user.uid));
      } else {
        baseConstraints.push(where('requesterId', '==', user.uid));
        baseConstraints.push(orderBy('createdAt', 'desc'));
      }

      // Apply pagination for non-admins
      const currentCursor = pagesHistory[currentPage - 1];
      const constraints = [...baseConstraints, limit(pageSize + 1)];
      if (currentCursor) {
        constraints.push(startAfter(currentCursor));
      }
      q = query(collection(db, 'serviceOrders'), ...constraints);
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceOrder));

      if (isAdmin) {
        setOrders(docs);
        // hasNextPage is handled by a separate useEffect based on sortedOrders.length
      } else {
        let finalDocs = docs;
        // Check if there is a next page for non-admin paginated view
        if (docs.length > pageSize) {
          setHasNextPage(true);
          finalDocs = docs.slice(0, pageSize);
        } else {
          setHasNextPage(false);
        }
        setOrders(finalDocs);

        // Store the last document for the next page
        if (snapshot.docs.length > 0) {
          const last = snapshot.docs[Math.min(snapshot.docs.length - 1, pageSize - 1)];
          setLastDoc(last);
        } else {
          setLastDoc(null);
        }
      }
    }, (error) => {
      console.error("OS List Error:", error);
    });
    return () => unsubscribe();
  }, [user, profile, currentPage, pageSize, selectedMonth, selectedYear, isAdmin]);

  const handleNextPage = () => {
    if (isAdmin) {
      if (hasNextPage) {
        setCurrentPage(prev => prev + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      if (hasNextPage && lastDoc) {
        setPagesHistory(prev => [...prev, lastDoc]);
        setCurrentPage(prev => prev + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handlePrevPage = () => {
    if (isAdmin) {
      if (currentPage > 1) {
        setCurrentPage(prev => prev - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      if (currentPage > 1) {
        setCurrentPage(prev => prev - 1);
        setPagesHistory(prev => prev.slice(0, -1));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentPage(1);
    setPagesHistory([null]);
    setLastDoc(null);
    if (direction === 'next') {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear(y => y + 1);
      } else {
        setSelectedMonth(m => m + 1);
      }
    } else {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear(y => y - 1);
      } else {
        setSelectedMonth(m => m - 1);
      }
    }
  };

  const isCurrentMonth = selectedMonth === new Date().getMonth() && selectedYear === new Date().getFullYear();
  const selectedMonthLabel = new Date(selectedYear, selectedMonth, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const selectedMonthLabelCap = selectedMonthLabel.charAt(0).toUpperCase() + selectedMonthLabel.slice(1);

  // Listen for Users
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => doc.data() as UserProfile);
      setAllUsers(docs);
    });
    return () => unsubscribe();
  }, [profile]);

  // Listen for Inventory items (all inventory)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'inventory'),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setAllInventoryItems(docs);
      // Filter items with low stock (quantity <= 10) for dashboard
      const lowStock = docs.filter(item => item.quantity <= 10).slice(0, 5);
      setInventory(lowStock);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });
    return () => unsubscribe();
  }, [user]);

  // Listen for Tools (all tools)
  useEffect(() => {
    if (!user || !isAdmin) return;
    const q = query(
      collection(db, 'tools'),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          maintenanceHistory: data.maintenanceHistory || []
        } as Tool;
      });
      setAllTools(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tools');
    });
    return () => unsubscribe();
  }, [user, isAdmin]);

  // Create Tool
  const createTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setIsSubmittingTool(true);
    setToolError('');

    try {
      if (!newTool.toolType.trim()) {
        setToolError('Tipo da Ferramenta é obrigatório');
        setIsSubmittingTool(false);
        return;
      }
      if (!newTool.characteristic.trim()) {
        setToolError('Característica é obrigatória');
        setIsSubmittingTool(false);
        return;
      }
      if (newTool.quantity <= 0) {
        setToolError('Quantidade deve ser maior que 0');
        setIsSubmittingTool(false);
        return;
      }

      const compressedImages = await Promise.all(
        selectedToolImages.map(img => compressImage(img))
      );

      const toolData: any = {
        toolType: newTool.toolType.trim(),
        characteristic: newTool.characteristic.trim(),
        quantity: newTool.quantity,
        maintenanceHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (compressedImages.length > 0) {
        toolData.imageUrls = compressedImages;
        toolData.imageUrl = compressedImages[0];
      }

      await addDoc(collection(db, 'tools'), toolData);

      setNewTool({ toolType: '', characteristic: '', quantity: 0 });
      setSelectedToolImages([]);
      setIsToolsModalOpen(false);
    } catch (error: any) {
      console.error('Error creating tool:', error);
      setToolError(error.message || 'Erro ao criar ferramenta. Verifique sua conexão e permissões.');
    } finally {
      setIsSubmittingTool(false);
    }
  };

  // Update Tool
  const updateTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingTool) return;

    setIsSubmittingTool(true);
    setToolError('');

    try {
      if (!editToolFormData.toolType.trim()) {
        setToolError('Tipo da Ferramenta é obrigatório');
        setIsSubmittingTool(false);
        return;
      }
      if (!editToolFormData.characteristic.trim()) {
        setToolError('Característica é obrigatória');
        setIsSubmittingTool(false);
        return;
      }
      if (editToolFormData.quantity <= 0) {
        setToolError('Quantidade deve ser maior que 0');
        setIsSubmittingTool(false);
        return;
      }

      const compressedNew = await Promise.all(
        newToolImages.map(img => compressImage(img))
      );
      const allImages = [...existingToolImages, ...compressedNew];

      const updateData: any = {
        toolType: editToolFormData.toolType.trim(),
        characteristic: editToolFormData.characteristic.trim(),
        quantity: editToolFormData.quantity,
        imageUrls: allImages,
        imageUrl: allImages.length > 0 ? allImages[0] : '',
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'tools', editingTool.id), updateData, { merge: true });

      setEditingTool(null);
      setEditToolFormData({ toolType: '', characteristic: '', quantity: 0 });
      setExistingToolImages([]);
      setNewToolImages([]);
      setIsEditToolsModalOpen(false);
    } catch (error: any) {
      console.error('Error updating tool:', error);
      setToolError(error.message || 'Erro ao atualizar ferramenta. Verifique sua conexão e permissões.');
    } finally {
      setIsSubmittingTool(false);
    }
  };

  // Delete Tool
  const deleteTool = async (toolId: string) => {
    if (!isAdmin) return;
    const confirmed = window.confirm('Tem certeza que deseja apagar esta ferramenta? Esta ação não pode ser desfeita.');
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'tools', toolId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tools/${toolId}`);
    }
  };

  // Open Tool Edit Modal
  const openEditToolModal = (tool: Tool) => {
    if (!isAdmin) return;
    setEditingTool(tool);
    setEditToolFormData({
      toolType: tool.toolType,
      characteristic: tool.characteristic,
      quantity: tool.quantity
    });
    const images = tool.imageUrls && tool.imageUrls.length > 0
      ? [...tool.imageUrls]
      : (tool.imageUrl ? [tool.imageUrl] : []);
    setExistingToolImages(images);
    setNewToolImages([]);
    setToolError('');
    setIsEditToolsModalOpen(true);
  };

  // Open Maintenance History Modal
  const openMaintenanceHistoryModal = (tool: Tool) => {
    if (!isAdmin) return;
    setSelectedToolForMaintenance(tool);
    setMaintenanceFormData({
      date: new Date().toISOString().split('T')[0],
      cost: 0,
      description: ''
    });
    setMaintenanceError('');
    setIsMaintenanceHistoryModalOpen(true);
  };

  // Open Loans Modal
  const openLoansModal = (tool: Tool) => {
    if (!isAdmin) return;
    setSelectedToolForLoans(tool);
    setLoanFormData({
      borrowerName: '',
      borrowDate: new Date().toISOString().split('T')[0],
      returnDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    setLoanError('');
    setIsLoansModalOpen(true);
  };

  // Add Maintenance Record
  const addMaintenanceRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !selectedToolForMaintenance) return;

    setIsSubmittingMaintenance(true);
    setMaintenanceError('');

    try {
      if (!maintenanceFormData.date) {
        setMaintenanceError('Data da manutenção é obrigatória');
        setIsSubmittingMaintenance(false);
        return;
      }
      if (maintenanceFormData.cost < 0) {
        setMaintenanceError('Custo não pode ser negativo');
        setIsSubmittingMaintenance(false);
        return;
      }

      const newRecord: MaintenanceRecord = {
        id: `${Date.now()}`,
        date: maintenanceFormData.date,
        cost: maintenanceFormData.cost,
        description: maintenanceFormData.description || '',
        createdAt: new Date().toISOString()
      };

      const updatedHistory = [...(selectedToolForMaintenance.maintenanceHistory || []), newRecord];

      await setDoc(doc(db, 'tools', selectedToolForMaintenance.id), {
        maintenanceHistory: updatedHistory,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setMaintenanceFormData({
        date: new Date().toISOString().split('T')[0],
        cost: 0,
        description: ''
      });
    } catch (error: any) {
      console.error('Error adding maintenance record:', error);
      setMaintenanceError(error.message || 'Erro ao adicionar manutenção. Verifique sua conexão.');
    } finally {
      setIsSubmittingMaintenance(false);
    }
  };

  // Delete Maintenance Record
  const deleteMaintenanceRecord = async (maintenanceId: string) => {
    if (!isAdmin || !selectedToolForMaintenance) return;
    const confirmed = window.confirm('Tem certeza que deseja apagar este registro de manutenção?');
    if (!confirmed) return;

    try {
      const updatedHistory = selectedToolForMaintenance.maintenanceHistory.filter(r => r.id !== maintenanceId);
      await setDoc(doc(db, 'tools', selectedToolForMaintenance.id), {
        maintenanceHistory: updatedHistory,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tools/${selectedToolForMaintenance.id}/maintenance`);
    }
  };

  // Add Loan
  const addLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !selectedToolForLoans) return;

    setIsSubmittingLoan(true);
    setLoanError('');

    try {
      if (!loanFormData.borrowerName.trim()) {
        setLoanError('Nome do emprestador é obrigatório');
        setIsSubmittingLoan(false);
        return;
      }
      if (!loanFormData.borrowDate) {
        setLoanError('Data de empréstimo é obrigatória');
        setIsSubmittingLoan(false);
        return;
      }
      if (!loanFormData.returnDate) {
        setLoanError('Data de devolução esperada é obrigatória');
        setIsSubmittingLoan(false);
        return;
      }

      const newLoan: ToolLoan = {
        id: `${Date.now()}`,
        borrowerName: loanFormData.borrowerName.trim(),
        borrowDate: loanFormData.borrowDate,
        returnDate: loanFormData.returnDate,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      const updatedLoans = [...(selectedToolForLoans.loans || []), newLoan];

      await setDoc(doc(db, 'tools', selectedToolForLoans.id), {
        loans: updatedLoans,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setLoanFormData({
        borrowerName: '',
        borrowDate: new Date().toISOString().split('T')[0],
        returnDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
      setIsAddLoanModalOpen(false);
    } catch (error: any) {
      console.error('Error adding loan:', error);
      setLoanError(error.message || 'Erro ao adicionar empréstimo. Verifique sua conexão.');
    } finally {
      setIsSubmittingLoan(false);
    }
  };

  // Finish Loan (mark as returned)
  const finishLoan = async (loanId: string) => {
    if (!isAdmin || !selectedToolForLoans) return;

    try {
      const updatedLoans = selectedToolForLoans.loans.map(loan => {
        if (loan.id === loanId) {
          return {
            ...loan,
            status: 'returned' as const,
            returnedDate: new Date().toISOString().split('T')[0]
          };
        }
        return loan;
      });

      await setDoc(doc(db, 'tools', selectedToolForLoans.id), {
        loans: updatedLoans,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tools/${selectedToolForLoans.id}/loans`);
    }
  };

  // Delete Loan
  const deleteLoan = async (loanId: string) => {
    if (!isAdmin || !selectedToolForLoans) return;
    const confirmed = window.confirm('Tem certeza que deseja apagar este registro de empréstimo?');
    if (!confirmed) return;

    try {
      const updatedLoans = selectedToolForLoans.loans.filter(l => l.id !== loanId);
      await setDoc(doc(db, 'tools', selectedToolForLoans.id), {
        loans: updatedLoans,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tools/${selectedToolForLoans.id}/loans`);
    }
  };

  const handleLogin = async () => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("O login foi cancelado ou a janela foi fechada pelo navegador.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignora, requisição anterior cancelada
      } else if (error.message.includes('identitytoolkit') || error.message.includes('blocked')) {
        setLoginError("Chave de API Bloqueada! Vá ao Google Cloud Console e libere o 'Identity Toolkit API' para sua API Key.");
      } else {
        setLoginError(`Erro no login: ${error.message}`);
      }
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="flex flex-col items-center">
          <img src="/logo.png" alt="Loading" className="w-24 h-24 animate-pulse mb-8 object-cover rounded-3xl" />
          <div className="h-1.5 w-48 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gray-900 animate-[loading_1.5s_infinite]"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-4">
        <div className="max-w-md w-full bg-white rounded-[24px] shadow-sm border border-black/5 p-10 text-center">
          <div className="w-32 h-32 mx-auto mb-8 shadow-2xl shadow-black/20 rounded-[32px] overflow-hidden transition-transform hover:scale-105 duration-300">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Manutenção IDN</h1>
          <p className="text-gray-500 mb-8">Igreja das Nações</p>
          {showInstallBtn && (
            <button
              onClick={handleInstallClick}
              className="mb-4 w-full py-3 px-6 bg-emerald-50 text-emerald-700 rounded-2xl font-semibold border border-emerald-100 flex items-center justify-center gap-2 hover:bg-emerald-100 transition-all text-sm"
            >
              <Download size={18} />
              Instalar App no Celular
            </button>
          )}
          <button
            onClick={handleLogin}
            className="w-full py-4 px-6 bg-gray-900 text-white rounded-2xl font-medium hover:bg-gray-800 transition-all flex items-center justify-center gap-3 shadow-lg shadow-black/10"
          >
            <UserIcon size={20} />
            Entrar com Google
          </button>

          {loginError && (
            <div className="mt-4 p-4 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <p>{loginError}</p>
            </div>
          )}
          <p className="mt-6 text-[10px] text-gray-400">
            Acesso restrito à equipe de manutenção e administração.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-screen bg-[#f5f5f5] flex flex-col md:flex-row overflow-hidden relative">
        {/* Sidebar */}
        {/* Sidebar — visible only on desktop (md+) */}
        <aside className="hidden md:flex w-64 bg-white border-r border-black/5 p-6 flex-col shrink-0 h-full overflow-y-auto">
          <div className="flex items-center gap-3 mb-10 px-2 group cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg shadow-black/10 transition-transform group-hover:scale-110 duration-200">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-xl text-gray-900 tracking-tight">IDN</span>
          </div>

          <nav className="flex-1 space-y-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'dashboard' ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
              )}
            >
              <LayoutDashboard size={20} />
              <span className="font-medium">Dashboard</span>
            </button>
            {(isAdmin || profile?.role === 'maintenance') && (
              <button
                onClick={() => setActiveTab('orders')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                  activeTab === 'orders' ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <ClipboardList size={20} />
                <span className="font-medium">Ordens de Serviço</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setActiveTab('inventory')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                  activeTab === 'inventory' ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <Package size={20} />
                <span className="font-medium">Almoxarifado</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setActiveTab('tools')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                  activeTab === 'tools' ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <Wrench size={20} />
                <span className="font-medium">Grandes Ferramentas</span>
              </button>
            )}
            {(isAdmin || profile?.role === 'maintenance') && (
              <>
                <button
                  onClick={() => setActiveTab('calendar')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                    activeTab === 'calendar' ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  <Calendar size={20} />
                  <span className="font-medium">Calendário</span>
                </button>
                <button
                  onClick={() => setActiveTab('escala')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                    activeTab === 'escala' ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  <Users size={20} />
                  <span className="font-medium">Escala</span>
                </button>
              </>
            )}
            {isAdmin && (
              <button
                onClick={() => setActiveTab('users')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                  activeTab === 'users' ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <UserIcon size={20} />
                <span className="font-medium">Usuários</span>
              </button>
            )}
          </nav>

          <div className="mt-auto pt-6 border-t border-black/5">
            <div className="flex items-center gap-3 px-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-300 text-gray-600">
                    {user.displayName?.charAt(0) || 'U'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user.displayName}</p>
                <p className="text-xs text-gray-500 truncate capitalize">{profile ? (roleTranslations[profile.role] || profile.role) : 'Carregando...'}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all"
            >
              <LogOut size={20} />
              <span className="font-medium">Sair</span>
            </button>
          </div>
        </aside>

        {/* Mobile Top Bar — visible only on mobile/tablet */}
        <header className="flex md:hidden items-center justify-between px-4 py-3 bg-white border-b border-black/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl overflow-hidden shadow shadow-black/10">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="font-bold text-lg text-gray-900 tracking-tight">IDN Manutenção</span>
          </div>
          <div className="flex items-center gap-2">
            {activeTab !== 'users' && (
              <button
                onClick={() => setIsOSModalOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white rounded-xl text-sm font-bold shadow shadow-black/10"
              >
                <Plus size={16} />
                Nova OS
              </button>
            )}
            <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-300 text-gray-600 text-sm font-medium">
                  {user.displayName?.charAt(0) || 'U'}
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-red-500 hover:bg-red-50 transition-all"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-10 overflow-y-auto pb-24 md:pb-10">
           {/* Desktop Header — hidden on mobile (top bar handles mobile) */}
           <header className="hidden md:flex mb-10 flex-col md:flex-row md:items-center justify-between gap-4">
             <div>
               <h2 className="text-3xl font-semibold text-gray-900">
                 {activeTab === 'dashboard' && 'Visão Geral'}
                 {activeTab === 'orders' && 'Ordens de Serviço'}
                 {activeTab === 'inventory' && 'Almoxarifado'}
                 {activeTab === 'users' && 'Gestão de Usuários'}
               </h2>
               <p className="text-gray-500">Igreja das Nações • Controle de Manutenção</p>
             </div>
             <div className="flex gap-3 items-center">
               <NotificationCenter />
               {activeTab === 'orders' && (
                 <div className="flex bg-gray-100 p-1 rounded-xl mr-2">
                   <button
                     onClick={() => setViewMode('grid')}
                     className={cn(
                       "p-2 rounded-lg transition-all",
                       viewMode === 'grid' ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"
                     )}
                     title="Visualização em Quadros"
                   >
                     <LayoutGrid size={20} />
                   </button>
                   <button
                     onClick={() => setViewMode('list')}
                     className={cn(
                       "p-2 rounded-lg transition-all",
                       viewMode === 'list' ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"
                     )}
                     title="Visualização em Lista"
                   >
                     <List size={20} />
                   </button>
                 </div>
               )}
               {activeTab !== 'users' && (
                 <div className="flex items-center gap-3">
                   <button
                     onClick={() => setIsOSModalOpen(true)}
                     className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-xl hover:bg-black transition-all shadow-lg shadow-black/10 font-bold"
                   >
                     <Plus size={20} />
                     Nova OS
                   </button>
                 </div>
               )}
             </div>
           </header>

          {/* Mobile section title */}
          <div className="flex md:hidden items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {activeTab === 'dashboard' && 'Visão Geral'}
              {activeTab === 'orders' && 'Ordens de Serviço'}
              {activeTab === 'inventory' && 'Almoxarifado'}
              {activeTab === 'tools' && 'Grandes Ferramentas'}
              {activeTab === 'users' && 'Gestão de Usuários'}
              {activeTab === 'calendar' && 'Calendário'}
              {activeTab === 'escala' && 'Escala de Trabalho'}
            </h2>
            {activeTab === 'orders' && (
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    viewMode === 'grid' ? "bg-white shadow-sm text-gray-900" : "text-gray-400"
                  )}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    viewMode === 'list' ? "bg-white shadow-sm text-gray-900" : "text-gray-400"
                  )}
                >
                  <List size={18} />
                </button>
              </div>
            )}
          </div>

          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* OS Summary */}
              <section className="bg-white rounded-[24px] shadow-sm border border-black/5 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                    <Clock className="text-amber-500" size={24} />
                    {isMaintenance ? 'Minhas Tarefas' : 'OS Recentes'}
                  </h3>
                  <button
                    onClick={() => setActiveTab('orders')}
                    className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1"
                  >
                    Ver todas <ChevronRight size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  {recentOrders.length > 0 ? (
                    recentOrders.map(order => (
                      <div
                        key={order.id}
                        onClick={() => {
                          setSelectedOS(order);
                          setIsDetailModalOpen(true);
                        }}
                        className="group p-4 rounded-2xl border border-black/5 hover:border-black/10 transition-all cursor-pointer flex gap-4"
                      >
                        {order.imageUrl && (
                          <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-black/5">
                            <img src={order.imageUrl} alt="OS" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-medium text-gray-900 group-hover:text-gray-900">{order.churchArea}</h4>
                              <p className="text-sm text-gray-500 line-clamp-1">{order.requestDetails}</p>
                            </div>
                            <span className={cn(
                              "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md",
                              order.priority === 'urgent' ? "bg-red-100 text-red-600" :
                                order.priority === 'necessary' ? "bg-orange-100 text-orange-600" :
                                  "bg-blue-100 text-blue-600"
                            )}>
                              {priorityTranslations[order.priority] || order.priority}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <UserIcon size={14} />
                              {order.requesterName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={14} />
                              {new Date(order.createdAt).toLocaleDateString()}
                            </span>
                            {isAdmin && order.budget !== undefined && (
                              <span className="text-emerald-600 font-medium">
                                R$ {order.budget.toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 text-gray-400">
                      Nenhuma ordem de serviço encontrada.
                    </div>
                  )}
                </div>
              </section>

              {/* Inventory Summary */}
              <section className="bg-white rounded-[24px] shadow-sm border border-black/5 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="text-red-500" size={24} />
                    Estoque Baixo
                  </h3>
                  <button
                    onClick={() => setActiveTab('inventory')}
                    className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center gap-1"
                  >
                    Ver estoque <ChevronRight size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  {inventory.length > 0 ? (
                    inventory.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl border border-black/5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center">
                            <Package size={20} className="text-gray-400" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">{item.materialType}</h4>
                            <p className="text-xs text-gray-400">{item.characteristic}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            {item.quantity}
                          </p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-tighter">Qtd. Atual</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 text-gray-400">
                      Estoque regularizado.
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'users' && isAdmin && (
            <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left">
                  <thead className="bg-gray-50 border-b border-black/5">
                    <tr>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuário</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Perfil</th>
                      <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {allUsers.map((u) => (
                      <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                              {u.displayName?.charAt(0) || 'U'}
                            </div>
                            <span className="font-medium text-gray-900">{u.displayName || 'Sem nome'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider",
                            u.role === 'admin' ? "bg-purple-100 text-purple-600" :
                              u.role === 'maintenance' ? "bg-blue-100 text-blue-600" :
                                "bg-gray-100 text-gray-600"
                          )}>
                            {roleTranslations[u.role] || u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <select
                              value={u.role}
                              onChange={(e) => updateUserRole(u.uid, e.target.value as UserRole)}
                              className="text-sm border border-black/10 rounded-lg px-2 py-1 outline-none focus:border-black/30 bg-white cursor-pointer"
                              disabled={u.uid === user.uid && u.email !== 'lucaslh@gmail.com'}
                            >
                              <option value="viewer">Visualizador</option>
                              <option value="maintenance">Manutenção</option>
                              <option value="admin">Admin</option>
                            </select>
                            {u.uid !== user.uid && u.email !== 'lucaslh@gmail.com' && (
                              <button
                                onClick={() => deleteUser(u.uid, u.email)}
                                title="Apagar usuário"
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="space-y-6 pb-20">
              {/* Month Navigator */}
              <div className="flex items-center justify-between bg-white rounded-2xl border border-black/5 px-5 py-3 shadow-sm">
                <button
                  onClick={() => changeMonth('prev')}
                  className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-900"
                  title="Mês anterior"
                >
                  <ArrowDown size={18} className="rotate-90" />
                </button>
                <div className="flex items-center gap-3">
                  <Calendar size={18} className="text-gray-400" />
                  <span className="font-semibold text-gray-900">{selectedMonthLabelCap}</span>
                  {isCurrentMonth && (
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full uppercase tracking-wider">Atual</span>
                  )}
                </div>
                <button
                  onClick={() => changeMonth('next')}
                  disabled={isCurrentMonth}
                  className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Próximo mês"
                >
                  <ArrowDown size={18} className="-rotate-90" />
                </button>
              </div>

              <div className="space-y-12">
                {Object.entries(groupedOrders).map(([month, monthOrders]) => (
                  <div key={month} className="space-y-6">
                    <div className="flex items-center gap-4">
                      <h3 className="text-xl font-bold text-gray-900">{month}</h3>
                      <div className="h-px flex-1 bg-black/5"></div>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{monthOrders.length} OS</span>
                    </div>

                    {viewMode === 'grid' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {monthOrders.map(order => (
                          <div
                            key={order.id}
                            onClick={() => {
                              setSelectedOS(order);
                              setIsDetailModalOpen(true);
                            }}
                            className="bg-white p-6 rounded-[24px] shadow-sm border border-black/5 hover:shadow-md transition-all overflow-hidden cursor-pointer"
                          >
                            {order.imageUrl && (
                              <div className="w-full h-40 -mx-6 -mt-6 mb-4 overflow-hidden border-b border-black/5">
                                <img src={order.imageUrl} alt="OS" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                            )}
                            <div className="flex justify-between items-start mb-4">
                              <span className={cn(
                                "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md",
                                order.status === 'completed' ? "bg-emerald-100 text-emerald-600" :
                                  order.status === 'in-progress' ? "bg-amber-100 text-amber-600" :
                                    order.status === 'cancelled' ? "bg-red-100 text-red-600" :
                                      "bg-blue-100 text-blue-600"
                              )}>
                                {statusTranslations[order.status] || order.status}
                              </span>
                              <span className={cn(
                                "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md",
                                order.priority === 'urgent' ? "bg-red-100 text-red-600" :
                                  order.priority === 'necessary' ? "bg-orange-100 text-orange-600" :
                                    order.priority === 'complementary' ? "bg-blue-100 text-blue-600" :
                                      "bg-emerald-100 text-emerald-600"
                              )}>
                                {priorityTranslations[order.priority] || order.priority}
                              </span>
                            </div>
                            <h4 className="text-lg font-semibold text-gray-900 mb-1">{order.churchArea}</h4>
                            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{order.requestDetails}</p>

                            <div className="space-y-2 pt-4 border-t border-black/5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">Solicitante:</span>
                                <span className="font-medium text-gray-700">{order.requesterName}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">Data:</span>
                                <span className="font-medium text-gray-700">{new Date(order.createdAt).toLocaleDateString()}</span>
                              </div>
                              {isAdmin && order.budget !== undefined && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-400">Orçamento:</span>
                                  <span className="font-bold text-emerald-600">R$ {order.budget.toLocaleString()}</span>
                                </div>
                              )}
                              {order.assignedToIds && order.assignedToIds.length > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-400">Responsáveis:</span>
                                  <span className="font-medium text-gray-700 line-clamp-1 text-right ml-4">{getUserNames(order.assignedToIds)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[700px] text-left">
                            <thead className="bg-gray-50 border-b border-black/5">
                              <tr>
                                <th
                                  className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 transition-colors"
                                  onClick={() => handleSort('status')}
                                >
                                  <div className="flex items-center gap-1">
                                    Status <SortIcon column="status" />
                                  </div>
                                </th>
                                <th
                                  className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 transition-colors"
                                  onClick={() => handleSort('churchArea')}
                                >
                                  <div className="flex items-center gap-1">
                                    Área / Detalhes <SortIcon column="churchArea" />
                                  </div>
                                </th>
                                <th
                                  className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 transition-colors"
                                  onClick={() => handleSort('priority')}
                                >
                                  <div className="flex items-center gap-1">
                                    Prioridade <SortIcon column="priority" />
                                  </div>
                                </th>
                                <th
                                  className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 transition-colors"
                                  onClick={() => handleSort('requesterName')}
                                >
                                  <div className="flex items-center gap-1">
                                    Solicitante <SortIcon column="requesterName" />
                                  </div>
                                </th>
                                <th
                                  className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 transition-colors"
                                  onClick={() => handleSort('createdAt')}
                                >
                                  <div className="flex items-center gap-1">
                                    Data <SortIcon column="createdAt" />
                                  </div>
                                </th>
                                {isAdmin && (
                                  <th
                                    className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 transition-colors"
                                    onClick={() => handleSort('budget')}
                                  >
                                    <div className="flex items-center gap-1">
                                      Orçamento <SortIcon column="budget" />
                                    </div>
                                  </th>
                                )}
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Responsáveis</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5">
                              {monthOrders.map(order => (
                                <tr
                                  key={order.id}
                                  onClick={() => {
                                    setSelectedOS(order);
                                    setIsDetailModalOpen(true);
                                  }}
                                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                                >
                                  <td className="px-6 py-4">
                                    <span className={cn(
                                      "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md",
                                      order.status === 'completed' ? "bg-emerald-100 text-emerald-600" :
                                        order.status === 'in-progress' ? "bg-amber-100 text-amber-600" :
                                          order.status === 'cancelled' ? "bg-red-100 text-red-600" :
                                            "bg-blue-100 text-blue-600"
                                    )}>
                                      {statusTranslations[order.status] || order.status}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                      {order.imageUrl && (
                                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-black/5">
                                          <img src={order.imageUrl} alt="OS" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                        </div>
                                      )}
                                      <div>
                                        <h4 className="font-medium text-gray-900">{order.churchArea}</h4>
                                        <p className="text-xs text-gray-500 line-clamp-1">{order.requestDetails}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className={cn(
                                      "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md",
                                      order.priority === 'urgent' ? "bg-red-100 text-red-600" :
                                        order.priority === 'necessary' ? "bg-orange-100 text-orange-600" :
                                          order.priority === 'complementary' ? "bg-blue-100 text-blue-600" :
                                            "bg-emerald-100 text-emerald-600"
                                    )}>
                                      {priorityTranslations[order.priority] || order.priority}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-sm text-gray-600">{order.requesterName}</td>
                                  <td className="px-6 py-4 text-sm text-gray-600">{new Date(order.createdAt).toLocaleDateString()}</td>
                                  {isAdmin && (
                                    <td className="px-6 py-4 text-sm font-bold text-emerald-600">
                                      {order.budget !== undefined ? `R$ ${order.budget.toLocaleString()}` : '-'}
                                    </td>
                                  )}
                                  <td className="px-6 py-4 text-xs text-gray-500">
                                    {order.assignedToIds && order.assignedToIds.length > 0 ? getUserNames(order.assignedToIds) : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Controles de Paginação */}
                {(hasNextPage || currentPage > 1) && (
                  <div className="flex items-center justify-center gap-4 py-8">
                    <button
                      onClick={handlePrevPage}
                      disabled={currentPage === 1}
                      className={cn(
                        "flex items-center gap-2 px-6 py-2 rounded-xl font-semibold transition-all shadow-sm border",
                        currentPage === 1
                          ? "bg-gray-50 text-gray-300 border-black/5 cursor-not-allowed"
                          : "bg-white text-gray-700 border-black/10 hover:bg-gray-50 hover:border-black/20 active:scale-95"
                      )}
                    >
                      <ArrowDown className="rotate-90 w-4 h-4" />
                      Anterior
                    </button>

                    <div className="px-4 py-2 bg-white rounded-xl border border-black/5 shadow-sm text-sm font-bold text-gray-500">
                      Página <span className="text-gray-900">{currentPage}</span>
                    </div>

                    <button
                      onClick={handleNextPage}
                      disabled={!hasNextPage}
                      className={cn(
                        "flex items-center gap-2 px-6 py-2 rounded-xl font-semibold transition-all shadow-sm border",
                        !hasNextPage
                          ? "bg-gray-50 text-gray-300 border-black/5 cursor-not-allowed"
                          : "bg-white text-gray-700 border-black/10 hover:bg-gray-50 hover:border-black/20 active:scale-95"
                      )}
                    >
                      Próximo
                      <ArrowDown className="-rotate-90 w-4 h-4" />
                    </button>
                  </div>
                )}

                {isAdmin && (
                  <div className="fixed bottom-20 md:bottom-6 right-6 bg-gray-900 text-white p-3 rounded-[20px] shadow-2xl border border-white/10 backdrop-blur-md animate-in slide-in-from-bottom-4 duration-500 z-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                        <DollarSign className="text-emerald-400 w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-[0.1em] font-bold text-gray-400 mb-0.5">Total do Mês</p>
                        <p className="text-base font-bold text-white leading-none">R$ {monthlyTotal.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'inventory' && !isAdmin && (
            <div className="bg-white rounded-[24px] shadow-sm border border-black/5 p-8">
              <div className="flex items-center justify-center h-64 flex-col gap-4">
                <AlertTriangle size={48} className="text-red-400" />
                <p className="text-gray-500 text-lg">Acesso restrito a Administradores</p>
                <p className="text-gray-400 text-sm">Apenas usuários com perfil Administrador podem acessar o módulo de Almoxarifado.</p>
              </div>
            </div>
          )}

          {activeTab === 'inventory' && isAdmin && (
            <div className="space-y-8 pb-20">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Almoxarifado</h2>
                  <p className="text-gray-500">Gerencie o estoque de materiais da igreja.</p>
                </div>
                <button
                  onClick={() => {
                    setNewMaterial({ materialType: '', characteristic: '', quantity: 0 });
                    setMaterialError('');
                    setIsInventoryModalOpen(true);
                  }}
                  className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-black/10"
                >
                  <Plus size={20} />
                  Novo Material
                </button>
              </div>

              <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
                {allInventoryItems.length === 0 ? (
                  <div className="p-8 text-center">
                    <Package size={48} className="text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Nenhum material cadastrado ainda.</p>
                    <p className="text-gray-400 text-sm mt-2">Clique em "Novo Material" para começar.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-black/5 bg-gray-50/50">
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Imagem</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo do Material</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Característica</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Quantidade</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Data de Atualização</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allInventoryItems.map((item) => (
                          <tr key={item.id} className="border-b border-black/5 hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.materialType}
                                  className="w-12 h-12 rounded-lg object-cover border border-black/10"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center border border-black/5">
                                  <ImageIcon size={20} className="text-gray-300" />
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-medium text-gray-900">{item.materialType}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-gray-600 line-clamp-2">{item.characteristic}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-semibold text-gray-900">{item.quantity}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm text-gray-500">
                                {new Date(item.updatedAt).toLocaleDateString('pt-BR')}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => openEditInventoryModal(item)}
                                  className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-500 hover:text-blue-600"
                                  title="Editar"
                                >
                                  <Settings2 size={18} />
                                </button>
                                <button
                                  onClick={() => deleteInventoryItem(item.id)}
                                  className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500 hover:text-red-600"
                                  title="Deletar"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tools' && isAdmin && (
            <div className="space-y-8 pb-20">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Grandes Ferramentas</h2>
                  <p className="text-gray-500">Gerencie as grandes ferramentas e seu histórico de manutenção.</p>
                </div>
                <button
                  onClick={() => {
                    setNewTool({ toolType: '', characteristic: '', quantity: 0 });
                    setToolError('');
                    setIsToolsModalOpen(true);
                  }}
                  className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-black/10"
                >
                  <Plus size={20} />
                  Nova Ferramenta
                </button>
              </div>

              <div className="bg-white rounded-[24px] shadow-sm border border-black/5 overflow-hidden">
                {allTools.length === 0 ? (
                  <div className="p-8 text-center">
                    <Wrench size={48} className="text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Nenhuma ferramenta cadastrada ainda.</p>
                    <p className="text-gray-400 text-sm mt-2">Clique em "Nova Ferramenta" para começar.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-black/5 bg-gray-50/50">
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Imagem</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo da Ferramenta</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Característica</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Quantidade</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Último Custo</th>
                          <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allTools.map((tool) => {
                          const lastMaintenance = tool.maintenanceHistory && tool.maintenanceHistory.length > 0
                            ? tool.maintenanceHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
                            : null;
                          return (
                            <tr key={tool.id} className="border-b border-black/5 hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4">
                                {(() => {
                                  const images = tool.imageUrls && tool.imageUrls.length > 0
                                    ? tool.imageUrls
                                    : (tool.imageUrl ? [tool.imageUrl] : []);
                                  if (images.length > 0) {
                                    return (
                                      <div
                                        onClick={() => openPhotoViewer(images, tool.toolType, 0)}
                                        className="relative w-12 h-12 rounded-lg bg-gray-50 border border-black/10 cursor-pointer group overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-blue-500/50 transition-all"
                                        title="Clique para ampliar"
                                      >
                                        <img
                                          src={images[0]}
                                          alt={tool.toolType}
                                          className="w-full h-full object-contain p-0.5"
                                        />
                                        {images.length > 1 && (
                                          <span className="absolute bottom-0 right-0 bg-black/75 text-[10px] font-bold text-white px-1 rounded-tl-md leading-tight">
                                            +{images.length - 1}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center border border-black/5">
                                      <ImageIcon size={20} className="text-gray-300" />
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-6 py-4">
                                <p className="font-medium text-gray-900">{tool.toolType}</p>
                              </td>
                              <td className="px-6 py-4">
                                <p className="text-gray-600 line-clamp-2">{tool.characteristic}</p>
                              </td>
                              <td className="px-6 py-4">
                                <p className="font-semibold text-gray-900">{tool.quantity}</p>
                              </td>
                              <td className="px-6 py-4">
                                <p className="font-semibold text-gray-900">
                                  {lastMaintenance ? `R$ ${lastMaintenance.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Sem registros'}
                                </p>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => openEditToolModal(tool)}
                                    className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-blue-500 hover:text-blue-600"
                                    title="Editar"
                                  >
                                    <Settings2 size={18} />
                                  </button>
                                  <button
                                    onClick={() => openMaintenanceHistoryModal(tool)}
                                    className="p-2 hover:bg-orange-50 rounded-lg transition-colors text-orange-500 hover:text-orange-600"
                                    title="Histórico"
                                  >
                                    <Clock size={18} />
                                  </button>
                                  <button
                                    onClick={() => openLoansModal(tool)}
                                    className="p-2 hover:bg-purple-50 rounded-lg transition-colors text-purple-500 hover:text-purple-600"
                                    title="Empréstimos"
                                  >
                                    <Users size={18} />
                                  </button>
                                  <button
                                    onClick={() => deleteTool(tool.id)}
                                    className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500 hover:text-red-600"
                                    title="Deletar"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="space-y-8 pb-20">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Agenda de Manutenção</h2>
                  <p className="text-gray-500">Cronograma anual de atividades programadas.</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-black/5 shadow-sm">
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold uppercase tracking-wider">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Manutenção Marcada
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(12)].map((_, i) => (
                  <MonthCalendar
                    key={i}
                    month={i}
                    year={2026}
                    maintenanceDates={maintenanceDates}
                    onToggle={toggleMaintenanceDate}
                    onOpenShift={handleOpenShift}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            </div>
          )}

          {activeTab === 'escala' && (
            <div className="space-y-8 pb-20">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">Escala de Trabalho</h2>
                  <p className="text-gray-500 mt-1">Gerencie a equipe e horários para os dias de manutenção.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Filtrar por data e por perfil */}
                {maintenanceDates
                  .filter(d => {
                    const date = new Date(d.date + 'T12:00:00');
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isFuture = date >= today;
                    if (!isFuture) return false;

                    if (isAdmin) return true;
                    if (profile?.role === 'maintenance') {
                      return (d.assignedUserIds || []).includes(user?.uid || '');
                    }
                    return false;
                  })
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map(date => (
                    <div key={date.id} className="bg-white rounded-[24px] shadow-sm border border-black/5 p-6 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex flex-col items-center justify-center text-blue-600">
                            <span className="text-[10px] font-bold uppercase">{new Date(date.date + 'T12:00:00').toLocaleString('pt-BR', { month: 'short' })}</span>
                            <span className="text-lg font-black leading-none">{new Date(date.date + 'T12:00:00').getDate()}</span>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900">Manutenção Programada</h4>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                              {new Date(date.date + 'T12:00:00').toLocaleString('pt-BR', { weekday: 'long' })}
                            </p>
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => handleOpenShift(date)}
                            className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-blue-600 transition-all"
                          >
                            <Settings2 size={20} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 py-2 border-y border-black/5">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Início</p>
                          <p className="text-sm font-semibold text-gray-900">{date.startTime || '--:--'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Término</p>
                          <p className="text-sm font-semibold text-gray-900">{date.endTime || '--:--'}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Equipe Escalada</p>
                        <div className="flex flex-wrap gap-2">
                          {date.assignedUserIds && date.assignedUserIds.length > 0 ? (
                            date.assignedUserIds.map(uid => {
                              const u = allUsers.find(user => user.uid === uid);
                              return (
                                <div key={uid} className="flex items-center gap-2 bg-gray-50 border border-black/5 pl-1 pr-3 py-1 rounded-full group hover:border-blue-200 transition-all" title={u?.email || ''}>
                                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                                    {u?.displayName?.charAt(0) || 'U'}
                                  </div>
                                  <span className="text-xs font-medium text-gray-700">{u?.displayName || 'Usuário'}</span>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-xs text-gray-400 italic">Ninguém escalado ainda.</p>
                          )}
                        </div>
                      </div>

                      {isAdmin && (
                        <button
                          onClick={() => handleOpenShift(date)}
                          className="w-full py-3 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition-all shadow-lg shadow-black/5"
                        >
                          Gerenciar Equipe
                        </button>
                      )}
                    </div>
                  ))}

                {maintenanceDates.filter(d => {
                  const date = new Date(d.date + 'T12:00:00');
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return date >= today;
                }).length === 0 && (
                    <div className="col-span-full py-20 bg-gray-50/50 rounded-[32px] border-2 border-dashed border-black/5 flex flex-col items-center justify-center text-center px-4">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                        <Calendar size={32} className="text-gray-300" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">Sem manutenções futuras</h3>
                      <p className="text-gray-500 max-w-sm">Use o módulo de Calendário para marcar os próximos dias de manutenção comunitária.</p>
                      <button
                        onClick={() => setActiveTab('calendar')}
                        className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
                      >
                        Ir para Calendário
                      </button>
                    </div>
                  )}
              </div>
            </div>
          )}
        </main>

        {/* Bottom Navigation Bar — visible only on mobile/tablet */}
        <nav className="flex md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-black/5 z-40 safe-bottom">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all relative",
              activeTab === 'dashboard' ? "text-gray-900" : "text-gray-400"
            )}
          >
            <LayoutDashboard size={22} />
            <span className="text-[10px] font-medium">Dashboard</span>
            {activeTab === 'dashboard' && <div className="absolute bottom-0 w-8 h-0.5 bg-gray-900 rounded-full" />}
          </button>
          {(isAdmin || profile?.role === 'maintenance') && (
            <button
              onClick={() => setActiveTab('orders')}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all relative",
                activeTab === 'orders' ? "text-gray-900" : "text-gray-400"
              )}
            >
              <ClipboardList size={22} />
              <span className="text-[10px] font-medium">OS</span>
              {activeTab === 'orders' && <div className="absolute bottom-0 w-8 h-0.5 bg-gray-900 rounded-full" />}
            </button>
          )}
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('inventory')}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all relative",
                  activeTab === 'inventory' ? "text-gray-900" : "text-gray-400"
                )}
              >
                <Package size={22} />
                <span className="text-[10px] font-medium">Almox.</span>
                {activeTab === 'inventory' && <div className="absolute bottom-0 w-8 h-0.5 bg-gray-900 rounded-full" />}
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all relative",
                  activeTab === 'tools' ? "text-gray-900" : "text-gray-400"
                )}
              >
                <Wrench size={22} />
                <span className="text-[10px] font-medium">Ferram.</span>
                {activeTab === 'tools' && <div className="absolute bottom-0 w-8 h-0.5 bg-gray-900 rounded-full" />}
              </button>
            </>
          )}
          {(isAdmin || profile?.role === 'maintenance') && (
            <>
              <button
                onClick={() => setActiveTab('calendar')}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all relative",
                  activeTab === 'calendar' ? "text-gray-900" : "text-gray-400"
                )}
              >
                <Calendar size={22} />
                <span className="text-[10px] font-medium">Calendário</span>
                {activeTab === 'calendar' && <div className="absolute bottom-0 w-8 h-0.5 bg-gray-900 rounded-full" />}
              </button>
              <button
                onClick={() => setActiveTab('escala')}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all relative",
                  activeTab === 'escala' ? "text-gray-900" : "text-gray-400"
                )}
              >
                <Users size={22} />
                <span className="text-[10px] font-medium">Escala</span>
                {activeTab === 'escala' && <div className="absolute bottom-0 w-8 h-0.5 bg-gray-900 rounded-full" />}
              </button>
            </>
          )}
          {isAdmin && (
            <button
              onClick={() => setActiveTab('users')}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all relative",
                activeTab === 'users' ? "text-gray-900" : "text-gray-400"
              )}
            >
              <UserIcon size={22} />
              <span className="text-[10px] font-medium">Usuários</span>
              {activeTab === 'users' && <div className="absolute bottom-0 w-8 h-0.5 bg-gray-900 rounded-full" />}
            </button>
          )}
        </nav>
      </div>

      {/* OS Detail Modal */}
      {isDetailModalOpen && selectedOS && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-gray-50/50">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md",
                    selectedOS.status === 'completed' ? "bg-emerald-100 text-emerald-600" :
                      selectedOS.status === 'in-progress' ? "bg-amber-100 text-amber-600" :
                        selectedOS.status === 'cancelled' ? "bg-red-100 text-red-600" :
                          "bg-blue-100 text-blue-600"
                  )}>
                    {statusTranslations[selectedOS.status]}
                  </span>
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md",
                    selectedOS.priority === 'urgent' ? "bg-red-100 text-red-600" :
                      selectedOS.priority === 'necessary' ? "bg-orange-100 text-orange-600" :
                        "bg-gray-100 text-gray-600"
                  )}>
                    {priorityTranslations[selectedOS.priority]}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedOS.churchArea}</h2>
              </div>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedOS(null);
                  setIsCancelling(false);
                  setCancellationReason('');
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {selectedOS.imageUrl && (
                <div className="rounded-2xl overflow-hidden border border-black/5 shadow-sm">
                  <img src={selectedOS.imageUrl} alt="OS" className="w-full object-contain max-h-[400px] bg-gray-50" referrerPolicy="no-referrer" />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Solicitação</h4>
                    <p className="text-gray-700 leading-relaxed">{selectedOS.requestDetails}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Justificativa</h4>
                    <p className="text-gray-700 leading-relaxed">{selectedOS.justification}</p>
                  </div>
                  {selectedOS.solutionIdea && (
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ideia de Solução</h4>
                      <p className="text-gray-700 leading-relaxed">{selectedOS.solutionIdea}</p>
                    </div>
                  )}
                  {selectedOS.cancellationReason && (
                    <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                      <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Motivo do Cancelamento</h4>
                      <p className="text-red-700 leading-relaxed">{selectedOS.cancellationReason}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="bg-gray-50 p-6 rounded-2xl space-y-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Solicitante:</span>
                      <span className="font-medium text-gray-900">{selectedOS.requesterName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Data de Abertura:</span>
                      <span className="font-medium text-gray-900">{new Date(selectedOS.createdAt).toLocaleString()}</span>
                    </div>
                    {selectedOS.deadline && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Prazo de Entrega:</span>
                        <span className={cn(
                          "font-bold",
                          new Date(selectedOS.deadline) < new Date() ? "text-red-500" : "text-blue-600"
                        )}>
                          {new Date(selectedOS.deadline).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {selectedOS.status === 'completed' && selectedOS.completionDate && (
                      <div className="flex justify-between text-sm bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                        <span className="text-emerald-700 font-medium">Concluído em:</span>
                        <span className="font-bold text-emerald-700">{new Date(selectedOS.completionDate).toLocaleString()}</span>
                      </div>
                    )}
                    {isAdmin && selectedOS.budget !== undefined && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Orçamento:</span>
                        <span className="font-bold text-emerald-600">R$ {selectedOS.budget.toLocaleString()}</span>
                      </div>
                    )}
                    {selectedOS.assignedToIds && selectedOS.assignedToIds.length > 0 && (
                      <div className="pt-2 border-t border-black/5">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Responsáveis</span>
                        <div className="flex flex-wrap gap-2">
                          {selectedOS.assignedToIds.map(uid => {
                            const u = allUsers.find(user => user.uid === uid);
                            return (
                              <span key={uid} className="bg-white border border-black/5 px-2 py-1 rounded-lg text-xs font-medium text-gray-700">
                                {u?.displayName || u?.email || 'Usuário'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {(isAdmin || (isMaintenance && isAssigned)) && selectedOS.status !== 'cancelled' && (
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gerenciar OS</h4>

                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">Alterar Status</label>
                        <select
                          value={selectedOS.status}
                          onChange={(e) => updateOS(selectedOS.id, { status: e.target.value as OSStatus })}
                          className="w-full border border-black/10 rounded-xl px-4 py-2 focus:border-black outline-none bg-white text-sm"
                        >
                          <option value="open">Aberto</option>
                          <option value="in-progress">Em Andamento</option>
                          <option value="completed">Concluído</option>
                        </select>
                      </div>

                      <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-700">Alterar Prioridade</label>
                        <select
                          value={selectedOS.priority}
                          onChange={(e) => updateOS(selectedOS.id, { priority: e.target.value as OSPriority })}
                          className="w-full border border-black/10 rounded-xl px-4 py-2 focus:border-black outline-none bg-white text-sm"
                        >
                          <option value="low">Baixa</option>
                          <option value="medium">Média</option>
                          <option value="high">Alta</option>
                          <option value="urgent">Urgente</option>
                        </select>
                      </div>

                      {isAdmin && (
                        <div className="space-y-3">
                          <label className="block text-sm font-medium text-gray-700">Responsáveis (Máx. 3)</label>

                          {/* Selected Users Tags */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            {selectedOS.assignedToIds?.map(uid => {
                              const u = allUsers.find(user => user.uid === uid);
                              return (
                                <div key={uid} className="flex items-center gap-2 bg-gray-900 text-white px-3 py-1.5 rounded-full text-xs animate-in zoom-in duration-200">
                                  <span>{u?.displayName || u?.email || 'Usuário'}</span>
                                  <button
                                    onClick={() => {
                                      const newIds = selectedOS.assignedToIds?.filter(id => id !== uid) || [];
                                      updateOS(selectedOS.id, { assignedToIds: newIds });
                                    }}
                                    className="hover:text-red-400 transition-colors"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              );
                            })}
                            {(!selectedOS.assignedToIds || selectedOS.assignedToIds.length === 0) && (
                              <span className="text-xs text-gray-400 italic">Nenhum responsável atribuído</span>
                            )}
                          </div>

                          {/* Dropdown for adding users */}
                          {(selectedOS.assignedToIds?.length || 0) < 3 && (
                            <select
                              value=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                const currentIds = selectedOS.assignedToIds || [];
                                if (currentIds.length < 3) {
                                  updateOS(selectedOS.id, { assignedToIds: [...currentIds, e.target.value] });
                                }
                              }}
                              className="w-full border border-black/10 rounded-xl px-4 py-2 focus:border-black outline-none bg-white text-sm"
                            >
                              <option value="">Adicionar responsável...</option>
                              {allUsers
                                .filter(u => !selectedOS.assignedToIds?.includes(u.uid))
                                .map(u => (
                                  <option key={u.uid} value={u.uid}>
                                    {u.displayName || u.email}
                                  </option>
                                ))
                              }
                            </select>
                          )}

                          {(selectedOS.assignedToIds?.length || 0) >= 3 && (
                            <p className="text-[10px] text-amber-600 font-medium">Limite de 3 responsáveis atingido.</p>
                          )}
                        </div>
                      )}

                      {isAdmin && (
                        <>
                          <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">Orçamento (R$)</label>
                            <input
                              type="number"
                              value={selectedOS.budget || ''}
                              onChange={(e) => updateOS(selectedOS.id, { budget: Number(e.target.value) })}
                              placeholder="Definir valor do orçamento"
                              className="w-full border border-black/10 rounded-xl px-4 py-2 focus:border-black outline-none bg-white text-sm"
                            />
                          </div>
                          <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">Prazo de Entrega</label>
                            <input
                              type="date"
                              value={selectedOS.deadline || ''}
                              onChange={(e) => updateOS(selectedOS.id, { deadline: e.target.value })}
                              className="w-full border border-black/10 rounded-xl px-4 py-2 focus:border-black outline-none bg-white text-sm"
                            />
                          </div>
                        </>
                      )}

                      {!isCancelling ? (
                        <button
                          onClick={() => setIsCancelling(true)}
                          className="w-full py-3 rounded-xl font-bold text-red-500 border border-red-100 hover:bg-red-50 transition-all text-sm mt-4"
                        >
                          Cancelar Ordem de Serviço
                        </button>
                      ) : (
                        <div className="space-y-3 p-4 bg-red-50 rounded-2xl border border-red-100 animate-in slide-in-from-top-2 duration-200">
                          <label className="block text-sm font-bold text-red-600 uppercase tracking-wider">Justificativa do Cancelamento</label>
                          <textarea
                            required
                            rows={3}
                            placeholder="Por que esta OS está sendo cancelada?"
                            value={cancellationReason}
                            onChange={(e) => setCancellationReason(e.target.value)}
                            className="w-full border border-red-200 rounded-xl px-4 py-3 focus:border-red-500 outline-none transition-all resize-none text-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setIsCancelling(false);
                                setCancellationReason('');
                              }}
                              className="flex-1 py-2 rounded-lg font-bold text-gray-500 hover:bg-white transition-all text-xs"
                            >
                              Voltar
                            </button>
                            <button
                              onClick={handleCancelOS}
                              disabled={!cancellationReason.trim()}
                              className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold hover:bg-red-700 transition-all shadow-sm disabled:opacity-50 text-xs"
                            >
                              Confirmar Cancelamento
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEscalaModalOpen && selectedMaintenanceDate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Gerenciar Escala</h2>
                <p className="text-gray-500">Escala para o dia {new Date(selectedMaintenanceDate.date + 'T12:00:00').toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => {
                  setIsEscalaModalOpen(false);
                  setSelectedMaintenanceDate(null);
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Início</label>
                  <input
                    type="time"
                    value={selectedMaintenanceDate.startTime || ''}
                    onChange={(e) => updateMaintenanceShift(selectedMaintenanceDate.id, { startTime: e.target.value })}
                    disabled={!isAdmin}
                    className="w-full border border-black/10 rounded-xl px-4 py-2 focus:border-black outline-none bg-white font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fim</label>
                  <input
                    type="time"
                    value={selectedMaintenanceDate.endTime || ''}
                    onChange={(e) => updateMaintenanceShift(selectedMaintenanceDate.id, { endTime: e.target.value })}
                    disabled={!isAdmin}
                    className="w-full border border-black/10 rounded-xl px-4 py-2 focus:border-black outline-none bg-white font-medium"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Inscritos na Manutenção</label>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {allUsers.map(u => {
                    const isAssigned = (selectedMaintenanceDate.assignedUserIds || []).includes(u.uid);
                    return (
                      <div
                        key={u.uid}
                        onClick={() => {
                          if (!isAdmin) return;
                          const current = selectedMaintenanceDate.assignedUserIds || [];
                          const updated = isAssigned
                            ? current.filter(id => id !== u.uid)
                            : [...current, u.uid];
                          updateMaintenanceShift(selectedMaintenanceDate.id, { assignedUserIds: updated });
                        }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer",
                          isAssigned
                            ? "border-blue-200 bg-blue-50/50"
                            : "border-black/5 hover:bg-gray-50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                            isAssigned ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"
                          )}>
                            {u.displayName?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{u.displayName || 'Sem nome'}</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">{u.role}</p>
                          </div>
                        </div>
                        {isAssigned && (
                          <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                            <CheckCircle2 size={12} className="text-white" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {isAdmin && (
                <div className="pt-4 border-t border-black/5 flex gap-4">
                  <button
                    onClick={async () => {
                      if (window.confirm('Deseja desmarcar esta data de manutenção?')) {
                        await toggleMaintenanceDate(selectedMaintenanceDate.date);
                        setIsEscalaModalOpen(false);
                      }
                    }}
                    className="flex-1 bg-red-50 text-red-600 px-6 py-3 rounded-2xl font-bold text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} />
                    Desmarcar Dia
                  </button>
                  <button
                    onClick={() => {
                      setIsEscalaModalOpen(false);
                      setSelectedMaintenanceDate(null);
                    }}
                    className="flex-1 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-black transition-colors"
                  >
                    Salvar Escala
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* OS Modal */}
      {isOSModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Nova Ordem de Serviço</h2>
                <p className="text-sm text-gray-500">Preencha os detalhes da solicitação de manutenção.</p>
              </div>
              <button
                onClick={() => {
                  setIsOSModalOpen(false);
                  resetForm();
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={createServiceOrder} className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              {osError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <p>{osError}</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Solicitante</label>
                  <input
                    type="text"
                    value={profile?.displayName || user?.email || ''}
                    disabled
                    className="w-full bg-gray-100 border border-black/5 rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Área da Igreja</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Templo, Cozinha, Estacionamento"
                    value={newOS.churchArea}
                    onChange={(e) => setNewOS({ ...newOS, churchArea: e.target.value })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Solicitação</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descreva o que precisa ser feito..."
                  value={newOS.requestDetails}
                  onChange={(e) => setNewOS({ ...newOS, requestDetails: e.target.value })}
                  className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Justificativa</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Por que isso é necessário?"
                  value={newOS.justification}
                  onChange={(e) => setNewOS({ ...newOS, justification: e.target.value })}
                  className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ideia para Solução (Opcional)</label>
                <textarea
                  rows={2}
                  placeholder="Alguma sugestão de como resolver?"
                  value={newOS.solutionIdea}
                  onChange={(e) => setNewOS({ ...newOS, solutionIdea: e.target.value })}
                  className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Prioridade</label>
                  <select
                    value={newOS.priority}
                    onChange={(e) => setNewOS({ ...newOS, priority: e.target.value as OSPriority })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all bg-white"
                  >
                    <option value="preventive">Preventiva/Programada</option>
                    <option value="complementary">Complementar</option>
                    <option value="necessary">Necessária</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
                {isAdmin && (
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Orçamento (Admin)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">R$</span>
                      <input
                        type="number"
                        placeholder="0,00"
                        value={newOS.budget}
                        onChange={(e) => setNewOS({ ...newOS, budget: Number(e.target.value) })}
                        className="w-full border border-black/10 rounded-xl pl-10 pr-4 py-3 focus:border-black outline-none transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Foto da Ocorrência (Opcional)</label>
                {selectedImage ? (
                  <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-50 border border-black/10">
                    <img
                      src={URL.createObjectURL(selectedImage)}
                      alt="Preview"
                      className="w-full h-full object-contain p-1"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedImage(null)}
                      className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors shadow-sm"
                      title="Remover foto"
                    >
                      <X size={18} />
                    </button>
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-xl text-xs">
                      <span className="truncate max-w-[180px] sm:max-w-xs">{selectedImage.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedImage(null)}
                        className="underline hover:text-gray-200 ml-2 font-medium"
                      >
                        Trocar foto
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-black/10 rounded-2xl hover:border-black/30 hover:bg-black/[0.02] active:scale-[0.98] transition-all cursor-pointer bg-gray-50/50 group text-center">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setSelectedImage(file);
                          e.target.value = '';
                        }}
                      />
                      <div className="p-3 bg-white rounded-full shadow-sm text-gray-500 group-hover:text-black group-hover:scale-105 transition-all mb-2">
                        <Camera size={24} />
                      </div>
                      <span className="text-sm font-semibold text-gray-800">Tirar Foto</span>
                      <span className="text-[11px] text-gray-400 mt-0.5">Abrir a câmera</span>
                    </label>

                    <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-black/10 rounded-2xl hover:border-black/30 hover:bg-black/[0.02] active:scale-[0.98] transition-all cursor-pointer bg-gray-50/50 group text-center">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setSelectedImage(file);
                          e.target.value = '';
                        }}
                      />
                      <div className="p-3 bg-white rounded-full shadow-sm text-gray-500 group-hover:text-black group-hover:scale-105 transition-all mb-2">
                        <ImageIcon size={24} />
                      </div>
                      <span className="text-sm font-semibold text-gray-800">Galeria</span>
                      <span className="text-[11px] text-gray-400 mt-0.5">Escolher arquivo</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => {
                    setIsOSModalOpen(false);
                    resetForm();
                  }}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex-1 bg-gray-900 text-white px-6 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-black/10 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Criar Ordem de Serviço'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isInventoryModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Novo Material</h2>
                <p className="text-sm text-gray-500">Adicione um novo material ao almoxarifado.</p>
              </div>
              <button
                onClick={() => {
                  setIsInventoryModalOpen(false);
                  setNewMaterial({ materialType: '', characteristic: '', quantity: 0 });
                  setMaterialError('');
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={createInventoryItem} className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              {materialError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <p>{materialError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tipo do Material</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Parafuso, Tubo PVC, Tinta, etc."
                    value={newMaterial.materialType}
                    onChange={(e) => setNewMaterial({ ...newMaterial, materialType: e.target.value })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Quantidade</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Quantidade disponível"
                    value={newMaterial.quantity}
                    onChange={(e) => setNewMaterial({ ...newMaterial, quantity: Number(e.target.value) })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Característica</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descreva as características do material (tamanho, cor, marca, especificações, etc.)"
                  value={newMaterial.characteristic}
                  onChange={(e) => setNewMaterial({ ...newMaterial, characteristic: e.target.value })}
                  className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Foto do Material (Opcional)</label>
                <div className="flex items-center gap-4">
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-2xl p-6 hover:border-black/30 transition-all cursor-pointer bg-gray-50/50 group">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setSelectedInventoryImage(file);
                      }}
                    />
                    {selectedInventoryImage ? (
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-50 border border-black/10">
                        <img
                          src={URL.createObjectURL(selectedInventoryImage)}
                          alt="Preview"
                          className="w-full h-full object-contain p-1"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedInventoryImage(null);
                          }}
                          className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-gray-600">
                        <div className="p-3 bg-white rounded-full shadow-sm">
                          <Camera size={24} />
                        </div>
                        <span className="text-sm font-medium">Clique para selecionar uma imagem</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  disabled={isSubmittingMaterial}
                  onClick={() => {
                    setIsInventoryModalOpen(false);
                    setNewMaterial({ materialType: '', characteristic: '', quantity: 0 });
                    setMaterialError('');
                  }}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMaterial}
                  className="flex-1 bg-gray-900 text-white px-6 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-black/10 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingMaterial ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Adicionar Material'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditInventoryModalOpen && isAdmin && editingMaterial && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Editar Material</h2>
                <p className="text-sm text-gray-500">Atualize as informações do material.</p>
              </div>
              <button
                onClick={() => {
                  setIsEditInventoryModalOpen(false);
                  setEditingMaterial(null);
                  setEditFormData({ materialType: '', characteristic: '', quantity: 0 });
                  setEditingInventoryImage(null);
                  setMaterialError('');
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={updateInventoryItem} className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              {materialError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <p>{materialError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tipo do Material</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Parafuso, Tubo PVC, Tinta, etc."
                    value={editFormData.materialType}
                    onChange={(e) => setEditFormData({ ...editFormData, materialType: e.target.value })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Quantidade</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Quantidade disponível"
                    value={editFormData.quantity}
                    onChange={(e) => setEditFormData({ ...editFormData, quantity: Number(e.target.value) })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Característica</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descreva as características do material (tamanho, cor, marca, especificações, etc.)"
                  value={editFormData.characteristic}
                  onChange={(e) => setEditFormData({ ...editFormData, characteristic: e.target.value })}
                  className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Foto do Material</label>
                <div className="space-y-4">
                  {editingMaterial.imageUrl && !editingInventoryImage && (
                    <div className="relative bg-slate-50 rounded-xl overflow-hidden border border-black/10">
                      <img
                        src={editingMaterial.imageUrl}
                        alt={editingMaterial.materialType}
                        className="w-full h-44 object-contain p-1"
                      />
                      <button
                        type="button"
                        onClick={() => setEditingInventoryImage(new File([], 'delete'))}
                        className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors text-sm"
                      >
                        Trocar Imagem
                      </button>
                    </div>
                  )}
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-2xl p-6 hover:border-black/30 transition-all cursor-pointer bg-gray-50/50 group">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setEditingInventoryImage(file);
                      }}
                    />
                    {editingInventoryImage && editingInventoryImage.name !== 'delete' ? (
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-50 border border-black/10">
                        <img
                          src={URL.createObjectURL(editingInventoryImage)}
                          alt="Preview"
                          className="w-full h-full object-contain p-1"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingInventoryImage(null);
                          }}
                          className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-gray-600">
                        <div className="p-3 bg-white rounded-full shadow-sm">
                          <Camera size={24} />
                        </div>
                        <span className="text-sm font-medium">Clique para selecionar uma imagem</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  disabled={isSubmittingMaterial}
                  onClick={() => {
                    setIsEditInventoryModalOpen(false);
                    setEditingMaterial(null);
                    setEditFormData({ materialType: '', characteristic: '', quantity: 0 });
                    setEditingInventoryImage(null);
                    setMaterialError('');
                  }}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingMaterial}
                  className="flex-1 bg-gray-900 text-white px-6 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-black/10 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingMaterial ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Alterações'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isToolsModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Nova Ferramenta</h2>
                <p className="text-sm text-gray-500">Adicione uma nova ferramenta.</p>
              </div>
              <button
                onClick={() => {
                  setIsToolsModalOpen(false);
                  setNewTool({ toolType: '', characteristic: '', quantity: 0 });
                  setToolError('');
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={createTool} className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              {toolError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <p>{toolError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tipo da Ferramenta</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Furadeira, Serra, Compressor, etc."
                    value={newTool.toolType}
                    onChange={(e) => setNewTool({ ...newTool, toolType: e.target.value })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Quantidade</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Quantidade"
                    value={newTool.quantity}
                    onChange={(e) => setNewTool({ ...newTool, quantity: Number(e.target.value) })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Característica</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descreva as características (marca, modelo, especificações, etc.)"
                  value={newTool.characteristic}
                  onChange={(e) => setNewTool({ ...newTool, characteristic: e.target.value })}
                  className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all resize-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Fotos da Ferramenta ({selectedToolImages.length}/5) - Opcional
                  </label>
                  {selectedToolImages.length > 0 && (
                    <span className="text-xs text-gray-400">Toque na foto para ampliar</span>
                  )}
                </div>

                {/* Previews Grid */}
                {selectedToolImages.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    {selectedToolImages.map((file, idx) => {
                      const url = URL.createObjectURL(file);
                      return (
                        <div key={idx} className="relative group rounded-xl border border-black/10 bg-slate-50 overflow-hidden h-44 flex items-center justify-center p-1.5">
                          <img
                            src={url}
                            alt={`Foto ${idx + 1}`}
                            onClick={() => openPhotoViewer(selectedToolImages.map(f => URL.createObjectURL(f)), newTool.toolType || 'Prévia', idx)}
                            className="w-full h-full object-contain cursor-pointer transition-transform group-hover:scale-105"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedToolImages(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600 text-white rounded-full transition-colors shadow-sm"
                            title="Remover foto"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Upload Dropzone (only if < 5 photos) */}
                {selectedToolImages.length < 5 && (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-2xl p-5 hover:border-black/30 transition-all cursor-pointer bg-gray-50/50 group">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          setSelectedToolImages(prev => [...prev, ...files].slice(0, 5));
                        }
                      }}
                    />
                    <div className="flex flex-col items-center gap-1.5 text-gray-400 group-hover:text-gray-600">
                      <div className="p-2.5 bg-white rounded-full shadow-sm">
                        <Camera size={22} />
                      </div>
                      <span className="text-sm font-medium">
                        {selectedToolImages.length === 0 ? 'Clique para selecionar fotos (até 5)' : 'Adicionar mais fotos'}
                      </span>
                    </div>
                  </label>
                )}
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  disabled={isSubmittingTool}
                  onClick={() => {
                    setIsToolsModalOpen(false);
                    setNewTool({ toolType: '', characteristic: '', quantity: 0 });
                    setToolError('');
                  }}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTool}
                  className="flex-1 bg-gray-900 text-white px-6 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-black/10 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingTool ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Adicionar Ferramenta'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditToolsModalOpen && isAdmin && editingTool && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-gray-50/50">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Editar Ferramenta</h2>
                <p className="text-sm text-gray-500">Atualize as informações da ferramenta.</p>
              </div>
              <button
                onClick={() => {
                  setIsEditToolsModalOpen(false);
                  setEditingTool(null);
                  setEditToolFormData({ toolType: '', characteristic: '', quantity: 0 });
                  setExistingToolImages([]);
                  setNewToolImages([]);
                  setToolError('');
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={updateTool} className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
              {toolError && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <p>{toolError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Tipo da Ferramenta</label>
                  <input
                    type="text"
                    required
                    value={editToolFormData.toolType}
                    onChange={(e) => setEditToolFormData({ ...editToolFormData, toolType: e.target.value })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Quantidade</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editToolFormData.quantity}
                    onChange={(e) => setEditToolFormData({ ...editToolFormData, quantity: Number(e.target.value) })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Característica</label>
                <textarea
                  required
                  rows={3}
                  value={editToolFormData.characteristic}
                  onChange={(e) => setEditToolFormData({ ...editToolFormData, characteristic: e.target.value })}
                  className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all resize-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Fotos da Ferramenta ({existingToolImages.length + newToolImages.length}/5)
                  </label>
                  {(existingToolImages.length + newToolImages.length) > 0 && (
                    <span className="text-xs text-gray-400">Toque na foto para ampliar</span>
                  )}
                </div>

                {/* Grid of Existing and New Photos */}
                {(existingToolImages.length > 0 || newToolImages.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    {/* Existing Photos */}
                    {existingToolImages.map((imgUrl, idx) => (
                      <div key={`existing-${idx}`} className="relative group rounded-xl border border-black/10 bg-slate-50 overflow-hidden h-44 flex items-center justify-center p-1.5">
                        <img
                          src={imgUrl}
                          alt={`Foto salva ${idx + 1}`}
                          onClick={() => {
                            const allUrls = [
                              ...existingToolImages,
                              ...newToolImages.map(f => URL.createObjectURL(f))
                            ];
                            openPhotoViewer(allUrls, editToolFormData.toolType || editingTool.toolType, idx);
                          }}
                          className="w-full h-full object-contain cursor-pointer transition-transform group-hover:scale-105"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setExistingToolImages(prev => prev.filter((_, i) => i !== idx));
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600 text-white rounded-full transition-colors shadow-sm"
                          title="Remover foto"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}

                    {/* Newly Selected Photos */}
                    {newToolImages.map((file, idx) => {
                      const url = URL.createObjectURL(file);
                      return (
                        <div key={`new-${idx}`} className="relative group rounded-xl border-2 border-blue-200 bg-blue-50/30 overflow-hidden h-44 flex items-center justify-center p-1.5">
                          <img
                            src={url}
                            alt={`Nova foto ${idx + 1}`}
                            onClick={() => {
                              const allUrls = [
                                ...existingToolImages,
                                ...newToolImages.map(f => URL.createObjectURL(f))
                              ];
                              openPhotoViewer(allUrls, editToolFormData.toolType || editingTool.toolType, existingToolImages.length + idx);
                            }}
                            className="w-full h-full object-contain cursor-pointer transition-transform group-hover:scale-105"
                          />
                          <span className="absolute bottom-2 left-2 text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-md">
                            Nova
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setNewToolImages(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600 text-white rounded-full transition-colors shadow-sm"
                            title="Remover foto"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Upload Dropzone (if < 5 photos) */}
                {(existingToolImages.length + newToolImages.length) < 5 && (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-2xl p-5 hover:border-black/30 transition-all cursor-pointer bg-gray-50/50 group">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length > 0) {
                          const currentTotal = existingToolImages.length + newToolImages.length;
                          const availableSlots = 5 - currentTotal;
                          setNewToolImages(prev => [...prev, ...files.slice(0, availableSlots)]);
                        }
                      }}
                    />
                    <div className="flex flex-col items-center gap-1.5 text-gray-400 group-hover:text-gray-600">
                      <div className="p-2.5 bg-white rounded-full shadow-sm">
                        <Camera size={22} />
                      </div>
                      <span className="text-sm font-medium">
                        {(existingToolImages.length + newToolImages.length) === 0 ? 'Clique para selecionar fotos (até 5)' : 'Adicionar mais fotos'}
                      </span>
                    </div>
                  </label>
                )}
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="button"
                  disabled={isSubmittingTool}
                  onClick={() => {
                    setIsEditToolsModalOpen(false);
                    setEditingTool(null);
                    setEditToolFormData({ toolType: '', characteristic: '', quantity: 0 });
                    setExistingToolImages([]);
                    setNewToolImages([]);
                    setToolError('');
                  }}
                  className="flex-1 px-6 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTool}
                  className="flex-1 bg-gray-900 text-white px-6 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-black/10 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingTool ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Alterações'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMaintenanceHistoryModalOpen && isAdmin && selectedToolForMaintenance && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-gray-50/50 flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Histórico de Manutenção</h2>
                <p className="text-sm text-gray-500">{selectedToolForMaintenance.toolType}</p>
              </div>
              <button
                onClick={() => {
                  setIsMaintenanceHistoryModalOpen(false);
                  setSelectedToolForMaintenance(null);
                  setMaintenanceFormData({
                    date: new Date().toISOString().split('T')[0],
                    cost: 0,
                    description: ''
                  });
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto flex-1">
              <form onSubmit={addMaintenanceRecord} className="space-y-4 pb-6 border-b border-black/5">
                <h3 className="font-semibold text-gray-900">Adicionar Registro de Manutenção</h3>

                {maintenanceError && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
                    <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                    <p>{maintenanceError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Data da Manutenção</label>
                    <input
                      type="date"
                      required
                      value={maintenanceFormData.date}
                      onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, date: e.target.value })}
                      className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Custo (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={maintenanceFormData.cost}
                      onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, cost: Number(e.target.value) })}
                      className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Descrição (Opcional)</label>
                  <textarea
                    rows={2}
                    placeholder="Descreva o trabalho realizado..."
                    value={maintenanceFormData.description}
                    onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, description: e.target.value })}
                    className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingMaintenance}
                  className="w-full bg-gray-900 text-white px-4 py-3 rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-black/10 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmittingMaintenance ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Adicionando...
                    </>
                  ) : (
                    <>
                      <Plus size={18} />
                      Adicionar Manutenção
                    </>
                  )}
                </button>
              </form>

              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Registros de Manutenção</h3>
                {selectedToolForMaintenance.maintenanceHistory && selectedToolForMaintenance.maintenanceHistory.length > 0 ? (
                  <div className="space-y-3">
                    {[...selectedToolForMaintenance.maintenanceHistory]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((record) => (
                        <div key={record.id} className="p-4 bg-gray-50 rounded-xl border border-black/5 flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {new Date(record.date).toLocaleDateString('pt-BR')}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">Custo: <span className="font-semibold text-gray-900">R$ {record.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
                            {record.description && (
                              <p className="text-sm text-gray-500 mt-2">{record.description}</p>
                            )}
                          </div>
                          <button
                            onClick={() => deleteMaintenanceRecord(record.id)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500 hover:text-red-600 flex-shrink-0"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    Nenhum registro de manutenção ainda.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoansModalOpen && isAdmin && selectedToolForLoans && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="p-8 border-b border-black/5 flex items-center justify-between bg-gray-50/50 flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Gerenciar Empréstimos</h2>
                <p className="text-sm text-gray-500">{selectedToolForLoans.toolType}</p>
              </div>
              <button
                onClick={() => {
                  setIsLoansModalOpen(false);
                  setSelectedToolForLoans(null);
                  setIsAddLoanModalOpen(false);
                  setLoanFormData({
                    borrowerName: '',
                    borrowDate: new Date().toISOString().split('T')[0],
                    returnDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                  });
                }}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto flex-1">
              {!isAddLoanModalOpen ? (
                <>
                  <button
                    onClick={() => setIsAddLoanModalOpen(true)}
                    className="w-full bg-purple-600 text-white px-4 py-3 rounded-2xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
                  >
                    <Plus size={18} />
                    Adicionar Novo Empréstimo
                  </button>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4">Empréstimos Ativos</h3>
                    {selectedToolForLoans.loans && selectedToolForLoans.loans.filter(l => l.status === 'active').length > 0 ? (
                      <div className="space-y-3">
                        {selectedToolForLoans.loans
                          .filter(l => l.status === 'active')
                          .sort((a, b) => new Date(b.borrowDate).getTime() - new Date(a.borrowDate).getTime())
                          .map((loan) => {
                            const returnDate = new Date(loan.returnDate);
                            const today = new Date();
                            const isOverdue = today > returnDate;
                            return (
                              <div key={loan.id} className={`p-4 bg-gradient-to-r from-purple-50 to-purple-50/50 rounded-xl border ${isOverdue ? 'border-red-100 bg-red-50/30' : 'border-purple-100'} flex items-start justify-between`}>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-medium text-gray-900">{loan.borrowerName}</p>
                                    {isOverdue && (
                                      <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-full">ATRASADO</span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600">Emprestado: {new Date(loan.borrowDate).toLocaleDateString('pt-BR')}</p>
                                  <p className={`text-sm font-medium mt-1 ${isOverdue ? 'text-red-600' : 'text-purple-600'}`}>
                                    Devolução esperada: {new Date(loan.returnDate).toLocaleDateString('pt-BR')}
                                  </p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                  <button
                                    onClick={() => finishLoan(loan.id)}
                                    className="p-2 hover:bg-emerald-50 rounded-lg transition-colors text-emerald-500 hover:text-emerald-600"
                                    title="Marcar como devolvido"
                                  >
                                    <CheckCircle2 size={18} />
                                  </button>
                                  <button
                                    onClick={() => deleteLoan(loan.id)}
                                    className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500 hover:text-red-600"
                                    title="Deletar"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-xl">
                        Nenhum empréstimo ativo no momento.
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4">Empréstimos Devolvidos</h3>
                    {selectedToolForLoans.loans && selectedToolForLoans.loans.filter(l => l.status === 'returned').length > 0 ? (
                      <div className="space-y-3">
                        {selectedToolForLoans.loans
                          .filter(l => l.status === 'returned')
                          .sort((a, b) => new Date(b.returnedDate || b.createdAt).getTime() - new Date(a.returnedDate || a.createdAt).getTime())
                          .map((loan) => (
                            <div key={loan.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-start justify-between">
                              <div className="flex-1">
                                <p className="font-medium text-gray-600">{loan.borrowerName}</p>
                                <p className="text-xs text-gray-500">Emprestado: {new Date(loan.borrowDate).toLocaleDateString('pt-BR')} → Devolvido: {new Date(loan.returnedDate || '').toLocaleDateString('pt-BR')}</p>
                              </div>
                              <button
                                onClick={() => deleteLoan(loan.id)}
                                className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-500 hover:text-red-600 flex-shrink-0"
                                title="Deletar"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-xl">
                        Nenhum empréstimo devolvido ainda.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <form onSubmit={addLoan} className="space-y-4">
                  <h3 className="font-semibold text-gray-900">Novo Empréstimo</h3>

                  {loanError && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm">
                      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                      <p>{loanError}</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Nome de Quem Pegou Emprestado</label>
                    <input
                      type="text"
                      placeholder="Ex: João da Silva"
                      required
                      value={loanFormData.borrowerName}
                      onChange={(e) => setLoanFormData({ ...loanFormData, borrowerName: e.target.value })}
                      className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Data do Empréstimo</label>
                      <input
                        type="date"
                        required
                        value={loanFormData.borrowDate}
                        onChange={(e) => setLoanFormData({ ...loanFormData, borrowDate: e.target.value })}
                        className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Data Esperada de Devolução</label>
                      <input
                        type="date"
                        required
                        value={loanFormData.returnDate}
                        onChange={(e) => setLoanFormData({ ...loanFormData, returnDate: e.target.value })}
                        className="w-full border border-black/10 rounded-xl px-4 py-3 focus:border-black outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={isSubmittingLoan}
                      className="flex-1 bg-purple-600 text-white px-4 py-3 rounded-2xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmittingLoan ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Adicionando...
                        </>
                      ) : (
                        <>
                          <Plus size={18} />
                          Adicionar Empréstimo
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddLoanModalOpen(false)}
                      className="flex-1 bg-gray-100 text-gray-900 px-4 py-3 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Visualizador de Fotos em Tela Cheia */}
      {photoViewerState.isOpen && photoViewerState.images.length > 0 && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex flex-col items-center justify-between p-4 md:p-6 animate-in fade-in duration-200"
          onClick={() => setPhotoViewerState(prev => ({ ...prev, isOpen: false }))}
        >
          {/* Top Bar */}
          <div 
            className="w-full max-w-5xl flex items-center justify-between text-white py-2 px-2 md:px-4 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-bold text-base md:text-lg">{photoViewerState.title || 'Foto da Ferramenta'}</h3>
              <p className="text-xs text-white/60">
                Foto {photoViewerState.currentIndex + 1} de {photoViewerState.images.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhotoViewerState(prev => ({ ...prev, isOpen: false }))}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              title="Fechar (Esc)"
            >
              <X size={22} />
            </button>
          </div>

          {/* Main Photo Area */}
          <div 
            className="relative flex-1 w-full max-w-5xl flex items-center justify-center overflow-hidden my-2"
            onClick={(e) => e.stopPropagation()}
          >
            {photoViewerState.images.length > 1 && (
              <button
                type="button"
                onClick={() => setPhotoViewerState(prev => ({
                  ...prev,
                  currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length
                }))}
                className="absolute left-2 md:left-4 z-10 p-3 bg-black/60 hover:bg-black/80 text-white rounded-full transition-all backdrop-blur-sm shadow-lg hover:scale-110"
                title="Foto anterior (Seta esquerda)"
              >
                <ChevronLeft size={24} />
              </button>
            )}

            <img
              src={photoViewerState.images[photoViewerState.currentIndex]}
              alt={photoViewerState.title}
              className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl transition-all select-none"
            />

            {photoViewerState.images.length > 1 && (
              <button
                type="button"
                onClick={() => setPhotoViewerState(prev => ({
                  ...prev,
                  currentIndex: (prev.currentIndex + 1) % prev.images.length
                }))}
                className="absolute right-2 md:right-4 z-10 p-3 bg-black/60 hover:bg-black/80 text-white rounded-full transition-all backdrop-blur-sm shadow-lg hover:scale-110"
                title="Próxima foto (Seta direita)"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>

          {/* Thumbnails strip (if > 1 photo) */}
          {photoViewerState.images.length > 1 && (
            <div 
              className="flex items-center gap-2 max-w-full overflow-x-auto py-2 px-4 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {photoViewerState.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPhotoViewerState(prev => ({ ...prev, currentIndex: idx }))}
                  className={cn(
                    "w-14 h-14 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 bg-white/5 p-0.5",
                    idx === photoViewerState.currentIndex 
                      ? "border-white scale-105 shadow-lg bg-white/10" 
                      : "border-white/20 opacity-50 hover:opacity-80"
                  )}
                >
                  <img src={img} alt="" className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </ErrorBoundary>
  );
}
