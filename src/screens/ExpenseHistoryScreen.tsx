import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar} from 'react-native';
import {colors} from '../theme/colors';
import {AuditEntry} from '../services/expenseService';

const ExpenseHistoryScreen = ({route, navigation}: any) => {
  const auditLog: AuditEntry[] = route.params?.auditLog || [];

  const getIcon = (action: string) => {
    switch (action) {
      case 'item_added': return '➕';
      case 'item_removed': return '🗑️';
      case 'item_edited': return '✏️';
      default: return '📝';
    }
  };

  const getActionText = (entry: AuditEntry) => {
    switch (entry.action) {
      case 'item_added': return 'added';
      case 'item_removed': return 'removed';
      case 'item_edited': return 'changed';
      default: return 'updated';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>📋 Change History</Text>
          <Text style={styles.headerSubtitle}>{auditLog.length} changes</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{paddingHorizontal: 16}}>
        {auditLog.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyText}>No changes recorded yet</Text>
          </View>
        ) : (
          auditLog.slice().reverse().map((entry, i) => (
            <View key={i} style={styles.entryCard}>
              <View style={styles.entryIcon}>
                <Text style={styles.entryIconText}>{getIcon(entry.action)}</Text>
              </View>
              <View style={styles.entryContent}>
                <Text style={styles.entryUser}>
                  <Text style={styles.entryUserName}>{entry.userName}</Text>
                  {' '}{getActionText(entry)} {entry.field}
                </Text>
                {entry.oldValue && entry.newValue && (
                  <View style={styles.changeRow}>
                    <Text style={styles.oldValue}>{entry.oldValue}</Text>
                    <Text style={styles.arrow}>→</Text>
                    <Text style={styles.newValue}>{entry.newValue}</Text>
                  </View>
                )}
                {entry.oldValue && !entry.newValue && (
                  <Text style={styles.singleValue}>{entry.oldValue}</Text>
                )}
                <Text style={styles.entryTime}>
                  {new Date(entry.timestamp).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          ))
        )}
        <View style={{height: 30}} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 20, gap: 12},
  backBtn: {padding: 8},
  backArrow: {fontSize: 22, color: colors.text},
  headerTitle: {fontSize: 18, fontWeight: '700', color: colors.text},
  headerSubtitle: {fontSize: 13, color: colors.textSecondary, marginTop: 2},
  empty: {alignItems: 'center', justifyContent: 'center', paddingTop: 100},
  emptyEmoji: {fontSize: 50, marginBottom: 12},
  emptyText: {fontSize: 14, color: colors.textSecondary},
  entryCard: {
    flexDirection: 'row', gap: 12, backgroundColor: colors.card,
    borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 0.5, borderColor: colors.border,
  },
  entryIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
  },
  entryIconText: {fontSize: 16},
  entryContent: {flex: 1},
  entryUser: {fontSize: 13, color: colors.textSecondary, lineHeight: 19},
  entryUserName: {fontWeight: '700', color: colors.text},
  changeRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap'},
  oldValue: {fontSize: 12, color: colors.danger, textDecorationLine: 'line-through'},
  arrow: {fontSize: 12, color: colors.textMuted},
  newValue: {fontSize: 12, color: colors.success, fontWeight: '700'},
  singleValue: {fontSize: 12, color: colors.warning, marginTop: 6},
  entryTime: {fontSize: 10, color: colors.textMuted, marginTop: 6},
});

export default ExpenseHistoryScreen;