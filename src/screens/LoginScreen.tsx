import React, {useState} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, StatusBar, ActivityIndicator,
  Alert, Image, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import {colors} from '../theme/colors';
import {
  signInWithEmail, signUpWithEmail,
  signInWithGoogle, signInWithFacebook,
  resetPassword, saveUserProfile,
  getUserProfile,
} from '../services/authService';

const LoginScreen = ({navigation}: any) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert('Missing Info', 'Please enter email and password.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return;
    }
    if (mode === 'signup' && !name) {
      Alert.alert('Missing Info', 'Please enter your name.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const user = await signUpWithEmail(email, password, name);
        await saveUserProfile({
          uid: user.uid,
          name: name,
          email: email,
          createdAt: new Date().toISOString(),
        });
        navigation.replace('Onboarding', {
  uid: user.uid,
  email: email,
  name: name,
  photoURL: '',
});

      } else if (mode === 'reset') {
        await resetPassword(email);
        Alert.alert('Email Sent', 'Check your email for password reset instructions.');
        setMode('login');
      } else {
        await signInWithEmail(email, password);
        navigation.replace('Home');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      await saveUserProfile({
        uid: user.uid,
        name: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        createdAt: new Date().toISOString(),
      });
      const profile = await getUserProfile(user.uid);
if (profile?.bikeBrand) {
  navigation.replace('Home', {userName: user.displayName});
} else {
  navigation.replace('Onboarding', {
    uid: user.uid,
    email: user.email,
    name: user.displayName,
    photoURL: user.photoURL,
  });
};
    } catch (error: any) {
      Alert.alert('Google Sign In Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFacebook = async () => {
    setLoading(true);
    try {
      const user = await signInWithFacebook();
      await saveUserProfile({
        uid: user.uid,
        name: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        createdAt: new Date().toISOString(),
      });
      const profile = await getUserProfile(user.uid);
if (profile?.bikeBrand) {
  navigation.replace('Home', {userName: user.displayName});
} else {
  navigation.replace('Onboarding', {
    uid: user.uid,
    email: user.email,
    name: user.displayName,
    photoURL: user.photoURL,
  });
};
    } catch (error: any) {
      Alert.alert('Facebook Sign In Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../android/app/src/main/res/drawable/tripper_logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.appName}>RIDE<Text style={styles.appNameAccent}>AI</Text></Text>
          <Text style={styles.tagline}>Your AI Riding Companion</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>
          {mode === 'login' ? 'Welcome back 👋' :
           mode === 'signup' ? 'Create account 🏍️' :
           'Reset password 🔑'}
        </Text>

        {/* Form */}
        <View style={styles.form}>
          {mode === 'signup' && (
            <>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {mode !== 'reset' && (
            <>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, {flex: 1}]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}>
                  <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {mode === 'signup' && (
            <>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />
            </>
          )}

          {mode === 'login' && (
            <TouchableOpacity onPress={() => setMode('reset')}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {/* Main button */}
          <TouchableOpacity
            style={[styles.mainBtn, loading && styles.mainBtnDisabled]}
            onPress={handleEmailAuth}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={styles.mainBtnText}>
                {mode === 'login' ? '🔓 Sign In' :
                 mode === 'signup' ? '🚀 Create Account' :
                 '📧 Send Reset Email'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Divider */}
        {mode !== 'reset' && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social buttons */}
            <View style={styles.socialRow}>
              <TouchableOpacity
                style={styles.socialBtn}
                onPress={handleGoogle}
                disabled={loading}>
                <Text style={styles.socialBtnText}>🌐 Google</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.socialBtn, styles.facebookBtn]}
                onPress={handleFacebook}
                disabled={loading}>
                <Text style={styles.socialBtnText}>📘 Facebook</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Switch mode */}
        <View style={styles.switchRow}>
          {mode === 'login' ? (
            <>
              <Text style={styles.switchText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => setMode('signup')}>
                <Text style={styles.switchLink}>Sign Up</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.switchText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => setMode('login')}>
                <Text style={styles.switchLink}>Sign In</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.background},
  scroll: {flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40},
  logoContainer: {alignItems: 'center', paddingTop: 60, paddingBottom: 20},
  logo: {width: 180, height: 120, borderColor: colors.background},
  appName: {fontSize: 28, fontWeight: '700', color: colors.text, marginTop: 8, letterSpacing: 3},
  appNameAccent: {color: colors.primary},
  tagline: {fontSize: 13, color: colors.textSecondary, marginTop: 4, letterSpacing: 1},
  title: {fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 24},
  form: {gap: 4},
  label: {fontSize: 13, color: colors.textSecondary, marginBottom: 6, marginTop: 12},
  input: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    color: colors.text, fontSize: 15, borderWidth: 0.5, borderColor: colors.border,
  },
  passwordRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  eyeBtn: {
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    borderWidth: 0.5, borderColor: colors.border,
  },
  eyeText: {fontSize: 16},
  forgotText: {color: colors.primary, fontSize: 13, marginTop: 8, textAlign: 'right'},
  mainBtn: {
    backgroundColor: colors.primary, borderRadius: 14,
    padding: 16, alignItems: 'center', marginTop: 20,
  },
  mainBtnDisabled: {opacity: 0.7},
  mainBtnText: {fontSize: 16, fontWeight: '700', color: colors.text},
  dividerRow: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: 24, gap: 12,
  },
  dividerLine: {flex: 1, height: 0.5, backgroundColor: colors.border},
  dividerText: {fontSize: 13, color: colors.textMuted},
  socialRow: {flexDirection: 'row', gap: 12},
  socialBtn: {
    flex: 1, backgroundColor: colors.card, borderRadius: 14,
    padding: 14, alignItems: 'center', borderWidth: 0.5, borderColor: colors.border,
  },
  facebookBtn: {borderColor: '#1877F2'},
  socialBtnText: {fontSize: 14, fontWeight: '600', color: colors.text},
  switchRow: {
    flexDirection: 'row', justifyContent: 'center',
    marginTop: 24, alignItems: 'center',
  },
  switchText: {fontSize: 14, color: colors.textSecondary},
  switchLink: {fontSize: 14, color: colors.primary, fontWeight: '700'},
});

export default LoginScreen;