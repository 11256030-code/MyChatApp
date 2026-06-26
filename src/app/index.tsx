import { Link, Redirect, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { login } from "../api/chat";
import { Screen } from "../components/Screen";
import { commonStyles } from "../components/styles";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { isLoading: isRestoringSession, signIn, user } = useAuth();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    const normalizedAccount = account.trim();
    if (!normalizedAccount || !password) {
      setError("請輸入帳號與密碼");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const session = await login({
        username: normalizedAccount,
        password,
      });
      await signIn(session);
      router.replace("/friends");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登入失敗");
    } finally {
      setLoading(false);
    }
  };

  if (isRestoringSession) return null;
  if (user) return <Redirect href="/friends" />;

  return (
    <Screen>
      <View style={styles.center}>
        <Text style={commonStyles.title}>教學聊天 App</Text>
        <Text style={commonStyles.subtitle}>
          可使用 Email 或帳號登入，並與好友即時交換訊息。
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
          placeholder="密碼"
          secureTextEntry
          style={commonStyles.input}
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={commonStyles.error}>{error}</Text> : null}
        <Pressable style={commonStyles.button} onPress={onLogin} disabled={loading}>
          <Text style={commonStyles.buttonText}>{loading ? "登入中..." : "登入"}</Text>
        </Pressable>
        <Link href="/register" asChild>
          <Pressable style={commonStyles.secondaryButton}>
            <Text style={commonStyles.secondaryButtonText}>建立新帳號</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
});
