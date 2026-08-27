import React, {useState, useEffect} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import {colors} from '../theme/colors';
import {
  TripExpense, ExpenseItem,
  saveExpenseDraft, getExpenseByTripId,
  getCategoryIcon, getCategoryColor,
} from '../services/expenseService';
import {createAuditEntry} from '../services/expenseService';

const ExpenseDraftScreen = ({route, navigation}: any) => {
  const {trip, expense: initialExpense} = route.params;
  const [expense, setExpense] = useState<TripExpense>(initialExpense);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totalAmount = expense.items.reduce((s, i) => s + i.totalAmount, 0);
  const totalPerPerson = expense.items.reduce((s, i) => s + i.perPersonAmount, 0);

  const updateItem = async (id: string, field: 'perPersonAmount' | 'description', value: any) => {
  const item = expense.items.find(i => i.id === id);
  if (!item) return;

  let auditEntry = null;
  if (field === 'perPersonAmount') {
    const newAmount = parseFloat(value) || 0;
    if (newAmount !== item.perPersonAmount) {
      auditEntry = await createAuditEntry('item_edited', {
        field: `${item.stopName} - ${item.description.substring(0, 30)}`,
        oldValue: `₹${item.perPersonAmount}/person`,
        newValue: `₹${newAmount}/person`,
      });
    }
  }

  setExpense(prev => ({
    ...prev,
    items: prev.items.map(i => {
      if (i.id !== id) return i;
      if (field === 'perPersonAmount') {
        const amount = parseFloat(value) || 0;
        return {...i, perPersonAmount: amount, totalAmount: amount * i.riderCount};
      }
      return {...i, [field]: value};
    }),
    auditLog: auditEntry ? [...(prev.auditLog || []), auditEntry] : prev.auditLog,
  }));
};
 const removeItem = async (id: string) => {
  const item = expense.items.find(i => i.id === id);
  if (!item) return;
  const auditEntry = await createAuditEntry('item_removed', {
    field: item.stopName,
    oldValue: `₹${item.totalAmount} total`,
  });
  setExpense(prev => ({
    ...prev,
    items: prev.items.filter(i => i.id !== id),
    auditLog: [...(prev.auditLog || []), auditEntry],
  }));
};

const [showCategoryPicker, setShowCategoryPicker] = useState(false);

const CATEGORIES: {value: ExpenseItem['category']; label: string; icon: string}[] = [
  {value: 'fuel', label: 'Fuel', icon: '⛽'},
  {value: 'food', label: 'Food', icon: '🍽️'},
  {value: 'stay', label: 'Stay', icon: '🏨'},
  {value: 'entry', label: 'Entry/Tickets', icon: '🎫'},
  {value: 'misc', label: 'Misc', icon: '💰'},
];

const addExpenseWithCategory = async (category: ExpenseItem['category']) => {
  setShowCategoryPicker(false);
  const newItem: ExpenseItem = {
    id: `exp_${category}_${Date.now()}`,
    tripId: expense.tripId,
    category,
    description: 'Additional expense',
    totalAmount: 0,
    perPersonAmount: 0,
    riderCount: expense.riderCount,
    stopName: 'Custom',
    stopType: category,
    editable: true,
  };
  const auditEntry = await createAuditEntry('item_added', {
    field: `Custom ${category} expense added`,
  });
  setExpense(prev => ({
    ...prev,
    items: [...prev.items, newItem],
    auditLog: [...(prev.auditLog || []), auditEntry],
  }));
  setEditingId(newItem.id);
}; 

  const handleSave = async () => {
  setSaving(true);
  try {
    const auditEntry = await createAuditEntry('updated', {
      field: `Total: ₹${Math.round(totalPerPerson)}/person`,
    });
    const updated: TripExpense = {
      ...expense,
      totalAmount,
      totalPerPerson,
      status: 'active',
      auditLog: [...(expense.auditLog || []), auditEntry],
    };
    await saveExpenseDraft(updated);
    Alert.alert('✅ Saved!', 'Expense draft saved successfully.');
    navigation.goBack();
  } catch (e) {
    Alert.alert('Error', 'Could not save expenses.');
  }
  setSaving(false);
};

  // Group items by category
  const grouped: Record<string, ExpenseItem[]> = {};
  expense.items.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>💰 Expense Draft</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{trip.title}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>₹{Math.round(totalAmount).toLocaleString()}</Text>
              <Text style={styles.summaryLabel}>Total Group Cost</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>₹{Math.round(totalPerPerson).toLocaleString()}</Text>
              <Text style={styles.summaryLabel}>Per Person</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{expense.riderCount}</Text>
              <Text style={styles.summaryLabel}>Riders</Text>
            </View>
          </View>
          <Text style={styles.summaryNote}>
            * Estimates based on average costs. Tap any item to edit.
          </Text>
        </View>

        {/* Grouped Items */}
        {Object.entries(grouped).map(([category, items]) => (
          <View key={category} style={styles.card}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryIcon}>{getCategoryIcon(category)}</Text>
              <Text style={[styles.categoryTitle, {color: getCategoryColor(category)}]}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </Text>
              <Text style={styles.categoryTotal}>
                ₹{items.reduce((s, i) => s + i.totalAmount, 0).toLocaleString()}
              </Text>
            </View>

            {items.map(item => (
              <View key={item.id}>
                {editingId === item.id ? (
                  <View style={styles.editItem}>
                    <TextInput
                      style={styles.editDesc}
                      value={item.description}
                      onChangeText={v => updateItem(item.id, 'description', v)}
                      placeholder="Description"
                      placeholderTextColor={colors.textMuted}
                      multiline
                    />
                    <Text style={styles.editLabel}>Category</Text>
<View style={styles.categoryChipsRow}>
  {CATEGORIES.map(cat => (
    <TouchableOpacity
      key={cat.value}
      style={[styles.categoryChip, item.category === cat.value && styles.categoryChipActive]}
      onPress={() => {
        setExpense(prev => ({
          ...prev,
          items: prev.items.map(i => i.id === item.id ? {...i, category: cat.value} : i),
        }));
      }}>
      <Text style={styles.categoryChipText}>{cat.icon} {cat.label}</Text>
    </TouchableOpacity>
  ))}
</View>
                    <View style={styles.editAmountRow}>
                      <Text style={styles.editAmountLabel}>₹ per person:</Text>
                      <TextInput
                        style={styles.editAmountInput}
                        value={item.perPersonAmount.toString()}
                        onChangeText={v => updateItem(item.id, 'perPersonAmount', v)}
                        keyboardType="numeric"
                        placeholderTextColor={colors.textMuted}
                      />
                      <Text style={styles.editTotal}>
                        = ₹{Math.round(item.totalAmount).toLocaleString()} total
                      </Text>
                    </View>
                    <View style={styles.editActions}>
                      <TouchableOpacity
                        style={styles.editDoneBtn}
                        onPress={() => setEditingId(null)}>
                        <Text style={styles.editDoneText}>✅ Done</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editDeleteBtn}
                        onPress={() => {
                          removeItem(item.id);
                          setEditingId(null);
                        }}>
                        <Text style={styles.editDeleteText}>🗑️ Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.expenseItem}
                    onPress={() => setEditingId(item.id)}>
                    <View style={styles.expenseItemLeft}>
                      <Text style={styles.expenseDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                      <Text style={styles.expenseStop}>{item.stopName}</Text>
                    </View>
                    <View style={styles.expenseItemRight}>
                      <Text style={[styles.expenseAmount, {color: getCategoryColor(category)}]}>
                        ₹{Math.round(item.totalAmount).toLocaleString()}
                      </Text>
                      <Text style={styles.expensePerPerson}>
                        ₹{Math.round(item.perPersonAmount)}/person
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ))}

        {/* Add Misc */}
       <TouchableOpacity style={styles.addMiscBtn} onPress={() => setShowCategoryPicker(true)}>
  <Text style={styles.addMiscText}>+ Add Custom Expense</Text>
</TouchableOpacity>

{showCategoryPicker && (
  <View style={styles.categoryModal}>
    <View style={styles.categoryModalBox}>
      <Text style={styles.categoryModalTitle}>Select Category</Text>
      {CATEGORIES.map(cat => (
        <TouchableOpacity
          key={cat.value}
          style={styles.categoryOption}
          onPress={() => addExpenseWithCategory(cat.value)}>
          <Text style={styles.categoryOptionIcon}>{cat.icon}</Text>
          <Text style={styles.categoryOptionText}>{cat.label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={styles.categoryModalCancel}
        onPress={() => setShowCategoryPicker(false)}>
        <Text style={styles.categoryModalCancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  </View>
)}

        {/* Per person breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👥 Per Person Breakdown</Text>
          {['fuel', 'food', 'stay', 'entry', 'misc'].map(cat => {
            const catItems = grouped[cat] || [];
            if (catItems.length === 0) return null;
            const catTotal = catItems.reduce((s, i) => s + i.perPersonAmount, 0);
            return (
              <View key={cat} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {getCategoryIcon(cat)} {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
                <Text style={[styles.breakdownAmount, {color: getCategoryColor(cat)}]}>
                  ₹{Math.round(catTotal).toLocaleString()}
                </Text>
              </View>
            );
          })}
          <View style={styles.breakdownDivider} />
          <View style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, {fontWeight: '700', color: colors.text}]}>
              Total per person
            </Text>
            <Text style={[styles.breakdownAmount, {color: colors.primary, fontSize: 18}]}>
              ₹{Math.round(totalPerPerson).toLocaleString()}
            </Text>
          </View>
        </View>

<View style={styles.header}>
  <View style={styles.headerText}>
    <Text style={styles.headerTitle}> 📋 Expense Change History</Text>
    <Text style={styles.headerSubtitle} numberOfLines={1}>{trip.title}</Text>
  </View>
  {expense.auditLog && expense.auditLog.length > 0 && (
    <TouchableOpacity
      style={styles.historyBtn}
      onPress={() => {
  console.log('Navigating to history, entries:', expense.auditLog?.length);
  navigation.navigate('ExpenseHistory', {auditLog: expense.auditLog});
}}>
      <Text style={styles.historyBtnText}>📋</Text>
    </TouchableOpacity>
  )}
</View>
        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && {opacity: 0.7}]}
          onPress={handleSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Text style={styles.saveBtnText}>💾 Save Expense Draft</Text>
          )}
        </TouchableOpacity>

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 20, gap: 12},
  backBtn: {padding: 8},
  backArrow: {fontSize: 22, color: colors.text},
  headerText: {flex: 1},
  headerTitle: {fontSize: 18, fontWeight: '700', color: colors.text},
  headerSubtitle: {fontSize: 13, color: colors.textSecondary, marginTop: 2},
  summaryCard: {
    backgroundColor: colors.primary + '22', borderRadius: 16,
    padding: 16, marginHorizontal: 16, marginBottom: 14,
    borderWidth: 1, borderColor: colors.primary,
  },
  summaryRow: {flexDirection: 'row', alignItems: 'center'},
  summaryItem: {flex: 1, alignItems: 'center'},
  summaryValue: {fontSize: 20, fontWeight: '700', color: colors.primary},
  summaryLabel: {fontSize: 11, color: colors.textSecondary, marginTop: 4, textAlign: 'center'},
  summaryDivider: {width: 1, height: 40, backgroundColor: colors.border},
  summaryNote: {fontSize: 11, color: colors.textMuted, marginTop: 12, textAlign: 'center', fontStyle: 'italic'},
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 16,
    marginHorizontal: 16, marginBottom: 14,
    borderWidth: 0.5, borderColor: colors.border,
  },
  cardTitle: {fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 14},
  categoryHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8},
  categoryIcon: {fontSize: 18},
  categoryTitle: {flex: 1, fontSize: 14, fontWeight: '700'},
  categoryTotal: {fontSize: 14, fontWeight: '700', color: colors.text},
  expenseItem: {
    flexDirection: 'row', paddingVertical: 10,
    borderTopWidth: 0.5, borderTopColor: colors.border,
  },
  expenseItemLeft: {flex: 1, paddingRight: 8},
  expenseItemRight: {alignItems: 'flex-end'},
  expenseDesc: {fontSize: 13, color: colors.text, lineHeight: 18},
  expenseStop: {fontSize: 11, color: colors.textMuted, marginTop: 2},
  expenseAmount: {fontSize: 15, fontWeight: '700'},
  expensePerPerson: {fontSize: 11, color: colors.textMuted, marginTop: 2},
  editItem: {
    backgroundColor: colors.background, borderRadius: 10,
    padding: 12, marginVertical: 4,
  },
  editDesc: {
    backgroundColor: colors.card, borderRadius: 8, padding: 10,
    color: colors.text, fontSize: 13, borderWidth: 0.5,
    borderColor: colors.border, marginBottom: 8,
  },
  editAmountRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8},
  editAmountLabel: {fontSize: 13, color: colors.textSecondary},
  editAmountInput: {
    backgroundColor: colors.card, borderRadius: 8, padding: 8,
    color: colors.text, fontSize: 15, fontWeight: '700',
    borderWidth: 0.5, borderColor: colors.primary, width: 80, textAlign: 'center',
  },
  editTotal: {fontSize: 12, color: colors.textMuted, flex: 1},
  editActions: {flexDirection: 'row', gap: 8},
  editDoneBtn: {flex: 1, backgroundColor: colors.success, borderRadius: 8, padding: 10, alignItems: 'center'},
  editDoneText: {fontSize: 13, fontWeight: '700', color: colors.text},
  editDeleteBtn: {flex: 1, backgroundColor: colors.danger + '33', borderRadius: 8, padding: 10, alignItems: 'center'},
  editDeleteText: {fontSize: 13, fontWeight: '700', color: colors.danger},
  addMiscBtn: {
    marginHorizontal: 16, marginBottom: 14, borderRadius: 14,
    padding: 14, alignItems: 'center', borderWidth: 1,
    borderColor: colors.primary, borderStyle: 'dashed',
  },
  
  addMiscText: {fontSize: 14, color: colors.primary, fontWeight: '600'},
  breakdownRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },

  historyBtn: {
  padding: 8, backgroundColor: colors.card, borderRadius: 10,
  borderWidth: 0.5, borderColor: colors.border,
},
historyBtnText: {fontSize: 18},
  breakdownLabel: {fontSize: 13, color: colors.textSecondary},
  breakdownAmount: {fontSize: 14, fontWeight: '700'},
  breakdownDivider: {height: 1, backgroundColor: colors.border, marginVertical: 8},
  saveBtn: {
    backgroundColor: colors.primary, marginHorizontal: 16,
    borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10,
  },
  categoryModal: {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center',
  alignItems: 'center', zIndex: 999,
},
categoryModalBox: {
  backgroundColor: colors.card, borderRadius: 20,
  width: '85%', padding: 20,
  borderWidth: 0.5, borderColor: colors.border,
},
categoryModalTitle: {fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 14, textAlign: 'center'},
categoryOption: {
  flexDirection: 'row', alignItems: 'center', gap: 12,
  padding: 14, borderRadius: 12, marginBottom: 8,
  backgroundColor: colors.background, borderWidth: 0.5, borderColor: colors.border,
},
categoryOptionIcon: {fontSize: 20},
categoryOptionText: {fontSize: 15, color: colors.text, fontWeight: '600'},
categoryModalCancel: {padding: 12, alignItems: 'center', marginTop: 4},
categoryModalCancelText: {fontSize: 14, color: colors.textMuted},
editLabel: {fontSize: 12, color: colors.textSecondary, marginBottom: 6, marginTop: 4},
categoryChipsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8},
categoryChip: {
  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
  backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.border,
},
categoryChipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
categoryChipText: {fontSize: 11, color: colors.text},
  saveBtnText: {fontSize: 16, fontWeight: '700', color: colors.text},
});


export default ExpenseDraftScreen;
