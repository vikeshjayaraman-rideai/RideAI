// components/EmergencyContactsSection.tsx
// Drop this inside ProfileScreen to add/remove emergency contacts
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, FlatList, Image, ActivityIndicator, Alert,
} from 'react-native';
import {
  getFirestore, collection, doc, updateDoc,
  getDoc, getDocs, query, where, arrayUnion, arrayRemove,
} from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';
import { colors } from '../theme/colors';

const db = getFirestore();

export interface EmergencyContact {
  uid: string;
  name: string;
  photoURL?: string;
  phone?: string;
}

interface Props {
  contacts: EmergencyContact[];
  onContactsChange: (contacts: EmergencyContact[]) => void;
}

export default function EmergencyContactsSection({ contacts, onContactsChange }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const currentUid = getAuth().currentUser?.uid;

  const searchUsers = async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      // Search by name prefix
      const snap = await getDocs(
        query(
          collection(db, 'users'),
          where('name', '>=', q),
          where('name', '<=', q + '\uf8ff'),
        )
      );
      const results = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter((u: any) => u.uid !== currentUid);
      setSearchResults(results);
    } catch (e) {
      console.error('Search error:', e);
    }
    setSearching(false);
  };

  const addContact = async (user: any) => {
    if (contacts.find(c => c.uid === user.uid)) {
      Alert.alert('Already added', `${user.name} is already an emergency contact.`);
      return;
    }
    if (contacts.length >= 5) {
      Alert.alert('Limit reached', 'You can add up to 5 emergency contacts.');
      return;
    }
    const contact: EmergencyContact = {
      uid: user.uid,
      name: user.name,
      photoURL: user.photoURL || user.profilePhoto || '',
      phone: user.phone || '',
    };
    const newContacts = [...contacts, contact];
    onContactsChange(newContacts);
    // Save to Firestore
    await updateDoc(doc(collection(db, 'users'), currentUid!), {
      emergencyContacts: arrayUnion(contact),
    });
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeContact = async (contact: EmergencyContact) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${contact.name} from emergency contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const newContacts = contacts.filter(c => c.uid !== contact.uid);
            onContactsChange(newContacts);
            await updateDoc(doc(collection(db, 'users'), currentUid!), {
              emergencyContacts: arrayRemove(contact),
            });
          },
        },
      ]
    );
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>🆘 Emergency Contacts</Text>
        <Text style={s.subtitle}>Notified instantly when you send an SOS</Text>
      </View>

      {/* Current contacts */}
      {contacts.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>No emergency contacts added yet</Text>
        </View>
      ) : (
        contacts.map(contact => (
          <View key={contact.uid} style={s.contactRow}>
            <Image
              source={{ uri: contact.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}&background=FF4500&color=fff&size=128` }}
              style={s.contactAvatar}
            />
            <View style={s.contactInfo}>
              <Text style={s.contactName}>{contact.name}</Text>
              {contact.phone ? <Text style={s.contactPhone}>{contact.phone}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => removeContact(contact)} style={s.removeBtn}>
              <Text style={s.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Add contact button */}
      {contacts.length < 5 && (
        <TouchableOpacity style={s.addBtn} onPress={() => setShowSearch(!showSearch)}>
          <Text style={s.addBtnText}>+ Add Contact</Text>
        </TouchableOpacity>
      )}

      {/* Search panel */}
      {showSearch && (
        <View style={s.searchPanel}>
          <TextInput
            style={s.searchInput}
            placeholder="Search by name..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={q => { setSearchQuery(q); searchUsers(q); }}
            autoFocus
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} style={{ margin: 8 }} />}
          {searchResults.map(user => (
            <TouchableOpacity key={user.uid} style={s.resultRow} onPress={() => addContact(user)}>
              <Image
                source={{ uri: user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=333&color=fff&size=128` }}
                style={s.resultAvatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.resultName}>{user.name}</Text>
                {user.phone ? <Text style={s.resultPhone}>{user.phone}</Text> : null}
              </View>
              <Text style={s.resultAdd}>+ Add</Text>
            </TouchableOpacity>
          ))}
          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <Text style={s.noResults}>No riders found for "{searchQuery}"</Text>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    backgroundColor: colors.card, borderRadius: 16,
    marginHorizontal: 16, marginBottom: 14, padding: 16,
    borderWidth: 0.5, borderColor: '#DC262640',
  },
  header: { marginBottom: 12 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  empty: { paddingVertical: 12, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  contactAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#333' },
  contactInfo: { flex: 1 },
  contactName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  contactPhone: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  removeBtn: { padding: 6 },
  removeBtnText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  addBtn: {
    marginTop: 12, borderWidth: 1, borderColor: colors.primary,
    borderRadius: 10, paddingVertical: 8, alignItems: 'center',
    borderStyle: 'dashed',
  },
  addBtnText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
  searchPanel: {
    marginTop: 12, backgroundColor: colors.background,
    borderRadius: 10, padding: 10, borderWidth: 0.5, borderColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.cardLight, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    color: colors.text, fontSize: 14, marginBottom: 8,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  resultAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#333' },
  resultName: { color: colors.text, fontSize: 13, fontWeight: '600' },
  resultPhone: { color: colors.textMuted, fontSize: 11 },
  resultAdd: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  noResults: { color: colors.textMuted, fontSize: 12, textAlign: 'center', padding: 8 },
});
