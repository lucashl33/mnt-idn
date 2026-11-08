export type UserRole = 'admin' | 'maintenance' | 'viewer';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
}

export type OSStatus = 'open' | 'in-progress' | 'completed' | 'cancelled';
export type OSPriority = 'preventive' | 'complementary' | 'necessary' | 'urgent';

export interface ServiceOrder {
  id: string;
  requesterName: string;
  churchArea: string;
  requestDetails: string;
  justification: string;
  solutionIdea?: string;
  imageUrl?: string;
  budget?: number;
  status: OSStatus;
  priority: OSPriority;
  requesterId: string;
  assignedToIds?: string[];
  cancellationReason?: string;
  deadline?: string;
  completionDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  materialType: string;    // Tipo do Material
  characteristic: string;   // Característica
  quantity: number;         // Quantidade
  imageUrl?: string;        // URL da imagem do material
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceRecord {
  id: string;
  date: string;        // ISO 8601 date
  cost: number;        // Custo da manutenção
  description?: string; // Descrição da manutenção
  createdAt: string;
}

export interface ToolLoan {
  id: string;
  borrowerName: string;  // Nome de quem pegou emprestado
  borrowDate: string;    // Data do empréstimo (ISO 8601)
  returnDate: string;    // Data prevista para devolução (ISO 8601)
  returnedDate?: string; // Data da devolução real (ISO 8601) - opcional
  status: 'active' | 'returned'; // Status do empréstimo
  createdAt: string;
}

export interface Tool {
  id: string;
  toolType: string;      // Tipo da Ferramenta
  characteristic: string; // Característica
  quantity: number;       // Quantidade
  imageUrl?: string;      // URL da imagem principal (compatibilidade retroativa)
  imageUrls?: string[];   // Lista de URLs/base64 de imagens da ferramenta
  maintenanceHistory: MaintenanceRecord[]; // Histórico de manutenção
  loans?: ToolLoan[];     // Histórico de empréstimos
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceDate {
  id: string; // YYYY-MM-DD
  date: string;
  type: 'scheduled';
  note?: string;
  startTime?: string;
  endTime?: string;
  assignedUserIds?: string[];
  createdAt?: string;
}
