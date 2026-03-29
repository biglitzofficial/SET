import type { StaffUser } from '../types';

/** Returns true if record's date/createdAt/startDate falls within today (local date). */
export function isRecordFromToday(record: { date?: number; startDate?: number; createdAt?: number } | null | undefined): boolean {
  if (!record) return false;
  const ts = record.date ?? record.startDate ?? record.createdAt;
  if (ts == null) return false;
  const d = new Date(typeof ts === 'number' ? ts : ts);
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
}

/** Staff can edit only if they have canEdit AND record is from today. Owner can always edit. */
export function canStaffEditRecord(user: StaffUser | null | undefined, record: { date?: number; startDate?: number; createdAt?: number } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'OWNER') return true;
  if (!user.permissions?.canEdit) return false;
  return isRecordFromToday(record);
}

/** Staff can delete only if they have canDelete AND record is from today. Owner can always delete. */
export function canStaffDeleteRecord(user: StaffUser | null | undefined, record: { date?: number; startDate?: number; createdAt?: number } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'OWNER') return true;
  if (!user.permissions?.canDelete) return false;
  return isRecordFromToday(record);
}
