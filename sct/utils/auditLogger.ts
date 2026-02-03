import { AuditLog, UserRole, StaffUser } from '../types';

interface LogParams {
  action: 'CREATE' | 'EDIT' | 'DELETE' | 'VOID' | 'LOGIN' | 'LOGOUT';
  entityType: 'PAYMENT' | 'INVOICE' | 'CUSTOMER' | 'LOAN' | 'CHIT' | 'INVESTMENT' | 'SETTINGS' | 'USER';
  entityId: string;
  description: string;
  currentUser?: StaffUser | null;
  oldData?: any;
  newData?: any;
  changes?: string;
}

export const createAuditLog = (params: LogParams): AuditLog => {
  const {
    action,
    entityType,
    entityId,
    description,
    currentUser,
    oldData,
    newData,
    changes
  } = params;

  return {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
    action,
    entityType,
    entityId,
    description,
    performedBy: currentUser?.role || 'OWNER',
    userId: currentUser?.id,
    userName: currentUser?.name,
    oldData: oldData ? JSON.stringify(oldData) : undefined,
    newData: newData ? JSON.stringify(newData) : undefined,
    changes
  };
};

// Helper to generate change summary
export const generateChangeSummary = (oldData: any, newData: any): string => {
  if (!oldData || !newData) return '';
  
  const changes: string[] = [];
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  
  allKeys.forEach(key => {
    if (oldData[key] !== newData[key]) {
      // Skip internal fields
      if (['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].includes(key)) return;
      
      const oldValue = oldData[key];
      const newValue = newData[key];
      
      if (oldValue === undefined) {
        changes.push(`Added ${key}: ${newValue}`);
      } else if (newValue === undefined) {
        changes.push(`Removed ${key}`);
      } else {
        changes.push(`Changed ${key}: ${oldValue} → ${newValue}`);
      }
    }
  });
  
  return changes.join('; ');
};
