import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { addFriend, getFriends } from "../../api/chat";
import { Screen } from "../../components/Screen";
import { commonStyles } from "../../components/styles";
import { UserAvatar } from "../../components/UserAvatar";
import { useAuth } from "../../context/AuthContext";
import type { User } from "../../types/chat";

export default function FriendsScreen() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<User[]>([]);
  const [friendIdentifier, setFriendIdentifier] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const loadFriends = useCallback(async () => {
    if (!user) return;
    setError("");
    const data = await getFriends(user.id);
    setFriends(data);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadFriends().catch((err) =>
        setError(err instanceof Error ? err.message : "載入好友失敗"),
      );
    }, [loadFriends]),
  );

  const onAddFriend = async () => {
    const identifier = friendIdentifier.trim();
    if (!user || !identifier) {
      setError("請輸入好友的 ID、帳號或 Email");
      return;
    }
    if (identifier === user.id || identifier === user.username) {
      setError("不能把自己加入好友");
      return;
    }

    setError("");
    setSuccess("");
    setIsAdding(true);
    try {
      await addFriend(user.id, identifier);
      setFriendIdentifier("");
      setSuccess(`已成功加入好友：${identifier}`);
      await loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入好友失敗");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Screen>
      <View style={styles.addBox}>
        <Text style={styles.myId}>我的 ID：{user?.id}</Text>
        <Text style={styles.helper}>可用 ID、帳號或 Email 加好友</Text>
        <View style={styles.addRow}>
          <TextInput
            autoCapitalize="none"
            placeholder="輸入好友 ID / 帳號 / Email"
            style={[commonStyles.input, styles.addInput]}
            value={friendIdentifier}
            onChangeText={setFriendIdentifier}
          />
          <Pressable
            disabled={isAdding}
            style={[styles.addButton, isAdding && styles.addButtonDisabled]}
            onPress={onAddFriend}
          >
            <Text style={commonStyles.buttonText}>{isAdding ? "處理中" : "加入"}</Text>
          </Pressable>
        </View>
        {success ? <Text style={styles.success}>{success}</Text> : null}
        {error ? <Text style={commonStyles.error}>{error}</Text> : null}
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={friends}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>尚未加入好友</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={commonStyles.row}
            onPress={() => router.push(`/chat/${item.id}`)}
          >
            <UserAvatar name={item.name} uri={item.avatar_url} />
            <View style={styles.rowText}>
              <Text style={commonStyles.rowTitle}>{item.name}</Text>
              <Text style={commonStyles.rowMeta}>帳號：{item.username}</Text>
            </View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBox: {
    gap: 10,
    marginBottom: 16,
  },
  addButton: {
    ...commonStyles.button,
    minWidth: 76,
  },
  addButtonDisabled: {
    opacity: 0.7,
  },
  addInput: {
    flex: 1,
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
  },
  empty: {
    color: "#64748b",
    paddingTop: 32,
    textAlign: "center",
  },
  helper: {
    color: "#64748b",
    fontSize: 13,
  },
  list: {
    gap: 10,
    paddingBottom: 24,
  },
  myId: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },
  rowText: {
    flex: 1,
  },
  success: {
    color: "#16a34a",
    fontSize: 14,
  },
});
