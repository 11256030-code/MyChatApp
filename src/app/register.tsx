import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { login, register } from "../api/chat";
import { Screen } from "../components/Screen";
import { commonStyles } from "../components/styles";
import { useAuth } from "../context/AuthContext";

export default function RegisterScreen() {
  const { signIn } = useAuth();
  const [account, setAccount] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onRegister = async () => {
    const normalizedAccount = account.trim();
    if (!normalizedAccount || !password || !confirmPassword) {
      setError("請填寫帳號、密碼與確認密碼");
      return;
    }
    if (password.length < 4) {
      setError("密碼至少需要 4 碼");
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次輸入的密碼不一致");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await register({
        username: normalizedAccount,
        password,
        display_name: displayName.trim() || undefined,
      });
      const session = await login({ username: normalizedAccount, password });
      await signIn(session);
      router.replace("/friends");
    } catch (err) {
      setError(err instanceof Error ? err.message : "註冊失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.form}>
        <Text style={commonStyles.title}>註冊帳號</Text>
        <Text style={commonStyles.subtitle}>
          可使用 Email 或帳號註冊，註冊後也可用這個識別碼加好友。
        </Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email / 帳號"
          style={commonStyles.input}
          value={account}
          onChangeText={setAccount}
        />
        <TextInput
          placeholder="顯示名稱"
          style={commonStyles.input}
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          placeholder="密碼"
          secureTextEntry
          style={commonStyles.input}
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          placeholder="確認密碼"
          secureTextEntry
          style={commonStyles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {error ? <Text style={commonStyles.error}>{error}</Text> : null}
        <Pressable style={commonStyles.button} onPress={onRegister} disabled={loading}>
          <Text style={commonStyles.buttonText}>{loading ? "建立中..." : "註冊並登入"}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
    paddingTop: 24,
  },
});
