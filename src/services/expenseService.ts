import {
  getFirestore, collection, doc,
  setDoc, getDocs, query, where, deleteDoc,
} from '@react-native-firebase/firestore';
import {getAuth} from '@react-native-firebase/auth';
import {getUserProfile} from './authService';

export interface ExpenseItem {
  id: string;
  tripId: string;
  category: 'fuel' | 'food' | 'stay' | 'entry' | 'misc';
  description: string;
  totalAmount: number;
  perPersonAmount: number;
  riderCount: number;
  stopName: string;
  stopType: string;
  editable: boolean;
}

export interface AuditEntry {
  action: 'created' | 'updated' | 'item_added' | 'item_removed' | 'item_edited';
  field?: string;
  oldValue?: string;
  newValue?: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export interface TripExpense {
  id: string;
  tripId: string;
  tripTitle: string;
  uid: string;
  riderCount: number;
  items: ExpenseItem[];
  totalAmount: number;
  totalPerPerson: number;
  status: 'draft' | 'active' | 'settled';
  createdAt: string;
  auditLog?: AuditEntry[];
}

// Cost estimates per person in INR
const COST_ESTIMATES: Record<string, {min: number; max: number; category: ExpenseItem['category']}> = {
  tea:         {min: 50,   max: 100,  category: 'food'},
  lunch:       {min: 150,  max: 250,  category: 'food'},
  food_stop:   {min: 150,  max: 250,  category: 'food'},
  checkpoint:  {min: 0,    max: 0,    category: 'misc'},
  stay:        {min: 800,  max: 2000, category: 'stay'},
  hidden_gem:  {min: 50,   max: 150,  category: 'entry'},
  destination: {min: 0,    max: 0,    category: 'misc'},
  meeting:     {min: 0,    max: 0,    category: 'misc'},
  fuel:        {min: 0,    max: 0,    category: 'fuel'}, // calculated separately
};

export const generateExpenseDraft = (
  tripId: string,
  tripTitle: string,
  stops: any[],
  riderCount: number,
  totalDistanceStr: string,
): TripExpense => {
  const items: ExpenseItem[] = [];

  // Parse total distance
  const totalKm = parseFloat(totalDistanceStr?.replace(/[^0-9.]/g, '') || '0');

  // Fuel estimate: avg 35 kmpl, ₹100/litre
  if (totalKm > 0) {
    const litres = totalKm / 35;
    const fuelCostPerBike = Math.round(litres * 100);
    items.push({
      id: `exp_fuel_${Date.now()}`,
      tripId,
      category: 'fuel',
      description: `Fuel for ${Math.round(totalKm)} km ride (avg 35 kmpl @ ₹100/L)`,
      totalAmount: fuelCostPerBike * riderCount,
      perPersonAmount: fuelCostPerBike,
      riderCount,
      stopName: 'Full Route',
      stopType: 'fuel',
      editable: true,
    });
  }

  // Per-stop expenses
  stops.forEach((stop, index) => {
    const estimate = COST_ESTIMATES[stop.type];
    if (!estimate || (estimate.min === 0 && estimate.max === 0)) return;

    const avgPerPerson = Math.round((estimate.min + estimate.max) / 2);
    const total = avgPerPerson * riderCount;

    items.push({
      id: `exp_${stop.type}_${index}_${Date.now()}`,
      tripId,
      category: estimate.category,
      description: getExpenseDescription(stop.type, stop.name, avgPerPerson),
      totalAmount: total,
      perPersonAmount: avgPerPerson,
      riderCount,
      stopName: stop.name,
      stopType: stop.type,
      editable: true,
    });
  });

  const totalAmount = items.reduce((sum, i) => sum + i.totalAmount, 0);
  const totalPerPerson = items.reduce((sum, i) => sum + i.perPersonAmount, 0);

  return {
    id: `expense_${tripId}`,
    tripId,
    tripTitle,
    uid: getAuth().currentUser?.uid || '',
    riderCount,
    items,
    totalAmount,
    totalPerPerson,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
};

const getExpenseDescription = (type: string, name: string, amount: number): string => {
  switch (type) {
    case 'tea': return `Tea/Coffee break at ${name} (~₹${amount}/person)`;
    case 'lunch': return `Lunch at ${name} (~₹${amount}/person)`;
    case 'food_stop': return `Food at ${name} (~₹${amount}/person)`;
    case 'stay': return `Overnight stay at ${name} (~₹${amount}/person)`;
    case 'hidden_gem': return `Entry/visit fee at ${name} (~₹${amount}/person)`;
    default: return `Expense at ${name}`;
  }
  };

export const saveExpenseDraft = async (expense: TripExpense): Promise<void> => {
  const db = getFirestore();
  await setDoc(
    doc(collection(db, 'expenses'), expense.id),
    expense,
  );
};


export const getExpenseByTripId = async (tripId: string): Promise<TripExpense | null> => {
  const db = getFirestore();
  const snap = await getDocs(
    query(collection(db, 'expenses'), where('tripId', '==', tripId)),
  );
  if (snap.empty) return null;
  return snap.docs[0].data() as TripExpense;
};

export const deleteExpense = async (expenseId: string): Promise<void> => {
  const db = getFirestore();
  await deleteDoc(doc(collection(db, 'expenses'), expenseId));
};

export const getCategoryIcon = (category: string): string => {
  switch (category) {
    case 'fuel':  return '⛽';
    case 'food':  return '🍽️';
    case 'stay':  return '🏨';
    case 'entry': return '🎫';
    default:      return '💰';
  }
};

export const getCategoryColor = (category: string): string => {
  switch (category) {
    case 'fuel':  return '#059669';
    case 'food':  return '#DC2626';
    case 'stay':  return '#0891B2';
    case 'entry': return '#DB2777';
    default:      return '#D97706';
  }
};

export const createAuditEntry = async (
  action: AuditEntry['action'],
  details?: {field?: string; oldValue?: string; newValue?: string},
): Promise<AuditEntry> => {
  const uid = getAuth().currentUser?.uid || '';
  let userName = 'Unknown';
  try {
    const profile = await getUserProfile(uid);
    userName = profile?.name || 'Unknown';
  } catch (e) {}

  return {
    action,
    ...details,
    userId: uid,
    userName,
    timestamp: new Date().toISOString(),
  };
};