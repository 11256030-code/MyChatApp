import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { changePassword, updateProfile } from "../../api/chat";
import { Screen } from "../../components/Screen";
import { commonStyles } from "../../components/styles";
import { UserAvatar } from "../../components/UserAvatar";
import { useAuth } from "../../context/AuthContext";

export default function SettingsScreen() {
  const { user, setUser, signOut } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [birthday, setBirthday] = useState(user?.birthday ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setName(user?.name ?? "");
    setBirthday(user?.birthday ?? "");
    setAvatarUrl(user?.avatar_url ?? "");
  }, [user]);

  const onSave = async () => {
    if (!user) return;
    setMessage("");
    setError("");
    try {
      const updated = await updateProfile(user.id, {
        name: name.trim(),
        birthday: birthday || null,
        avatar_url: avatarUrl || null,
      });
      await setUser(updated);
      setMessage("已儲存個人設定");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    }
  };

  const onChangePassword = async () => {
    if (!user) return;
    setMessage("");
    setError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("請完整輸入目前密碼、新密碼與確認密碼");
      return;
    }
    if (newPassword.length < 4 || newPassword.length > 60) {
      setError("新密碼長度需為 4 至 60 碼");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("兩次輸入的新密碼不一致");
      return;
    }
    if (currentPassword === newPassword) {
      setError("新密碼不能與目前密碼相同");
      return;
    }

    try {
      await changePassword(user.id, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("密碼已變更");
    } catch (err) {
      setError(err instanceof Error ? err.message : "變更密碼失敗");
    }
  };

  const onSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.profileHeader}>
          <UserAvatar name={name || user?.name || "我"} uri={avatarUrl} size={72} />
          <View style={styles.profileText}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={commonStyles.rowMeta}>帳號：{user?.username}</Text>
            <Text style={commonStyles.rowMeta}>ID：{user?.id}</Text>
          </View>
        </View>
        <TextInput placeholder="姓名" style={commonStyles.input} value={name} onChangeText={setName} />
        <TextInput placeholder="生日，例如 2001-01-01" style={commonStyles.input} value={birthday} onChangeText={setBirthday} />
        <TextInput
          autoCapitalize="none"
          placeholder="頭像圖片 URL"
          style={commonStyles.input}
          value={avatarUrl}
          onChangeText={setAvatarUrl}
        />
        <TextInput
          placeholder="目前密碼"
          secureTextEntry
          style={commonStyles.input}
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <TextInput
          placeholder="新密碼"
          secureTextEntry
          style={commonStyles.input}
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <TextInput
          placeholder="確認新密碼"
          secureTextEntry
          style={commonStyles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={commonStyles.error}>{error}</Text> : null}
        <Pressable style={commonStyles.button} onPress={onSave}>
          <Text style={commonStyles.buttonText}>儲存設定</Text>
        </Pressable>
        <Pressable style={commonStyles.secondaryButton} onPress={onChangePassword}>
          <Text style={commonStyles.secondaryButtonText}>變更密碼</Text>
        </Pressable>
        <Pressable style={commonStyles.secondaryButton} onPress={onSignOut}>
          <Text style={commonStyles.secondaryButtonText}>登出</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
    paddingBottom: 24,
  },
  name: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "800",
  },
  profileHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    marginBottom: 8,
  },
  profileText: {
    flex: 1,
  },
  success: {
    color: "#16a34a",
    fontSize: 14,
  },
});
