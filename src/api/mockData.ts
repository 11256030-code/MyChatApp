import type {
    AuthSession,
    ChatSummary,
    Message,
    ProfileInput,
    RegisterInput,
    User,
} from "../types/chat";

type MockUser = User & {
  password: string;
  email?: string | null;
};

const buildId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const initialUsers: MockUser[] = [
  {
    id: "demo-alice",
    username: "alice@example.com",
    name: "Alice",
    birthday: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    email: "alice@example.com",
    password: "password123",
  },
  {
    id: "demo-bob",
    username: "bob@example.com",
    name: "Bob",
    birthday: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    email: "bob@example.com",
    password: "password123",
  },
  {
    id: "demo-charlie",
    username: "charlie@example.com",
    name: "Charlie",
    birthday: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    email: "charlie@example.com",
    password: "password123",
  },
];

const users = initialUsers.map((user) => ({ ...user }));
const friendships = new Map<string, string[]>();
const conversations = new Map<string, Message[]>();

function cloneUser(user: MockUser | User): User {
  const { password: _password, ...rest } = user as MockUser;
  return rest as User;
}

function ensureFriendships(userId: string) {
  if (!friendships.has(userId)) {
    friendships.set(userId, []);
  }
}

function getUserByIdentifier(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return users.find((user) => {
    const username = user.username.toLowerCase();
    const email = (user.email ?? "").toLowerCase();
    return user.id.toLowerCase() === normalized || username === normalized || email === normalized;
  });
}

function createPlaceholderUser(userId: string, identifier?: string) {
  const raw = identifier?.trim() || userId;
  const isEmail = raw.includes("@");
  const username = isEmail ? raw : userId;
  const email = isEmail ? raw : null;
  const name = isEmail ? raw.split("@")[0] : userId;

  const placeholder: MockUser = {
    id: userId,
    username,
    name,
    birthday: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    email,
    password: "password123",
  };

  users.push(placeholder);
  ensureFriendships(userId);
  return placeholder;
}

function ensureUserExists(userId: string, identifier?: string) {
  const existing = users.find((user) => user.id === userId);
  if (existing) {
    ensureFriendships(userId);
    return existing;
  }
  return createPlaceholderUser(userId, identifier);
}

function getConversationKey(userId: string, friendId: string) {
  return [userId, friendId].sort().join(":");
}

function getMessagesFor(userId: string, friendId: string) {
  const key = getConversationKey(userId, friendId);
  const existing = conversations.get(key) ?? [];
  return [...existing].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function addSeedMessages() {
  if (conversations.size > 0) return;
  const alice = users.find((user) => user.id === "demo-alice");
  const bob = users.find((user) => user.id === "demo-bob");
  const charlie = users.find((user) => user.id === "demo-charlie");

  const messagesForAliceBob = [
    {
      id: "seed-1",
      sender_id: alice!.id,
      receiver_id: bob!.id,
      text: "Hi Bob，這是離線示範訊息。",
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      id: "seed-2",
      sender_id: bob!.id,
      receiver_id: alice!.id,
      text: "嗨 Alice，我已收到訊息。",
      created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    },
  ];

  const messagesForAliceCharlie = [
    {
      id: "seed-3",
      sender_id: alice!.id,
      receiver_id: charlie!.id,
      text: "歡迎使用離線示範聊天室。",
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
  ];

  conversations.set(getConversationKey(alice!.id, bob!.id), messagesForAliceBob);
  conversations.set(getConversationKey(alice!.id, charlie!.id), messagesForAliceCharlie);

  ensureFriendships(alice!.id);
  ensureFriendships(bob!.id);
  ensureFriendships(charlie!.id);
  friendships.set(alice!.id, Array.from(new Set([...(friendships.get(alice!.id) ?? []), bob!.id, charlie!.id])));
  friendships.set(bob!.id, Array.from(new Set([...(friendships.get(bob!.id) ?? []), alice!.id])));
  friendships.set(charlie!.id, Array.from(new Set([...(friendships.get(charlie!.id) ?? []), alice!.id])));
}

export function mockRegister(input: RegisterInput) {
  const normalizedUsername = input.username.trim().toLowerCase();
  const existing = users.find((user) => user.username.toLowerCase() === normalizedUsername);
  if (existing) {
    throw new Error("此帳號已存在");
  }

  const newUser: MockUser = {
    id: buildId("user"),
    username: input.username.trim(),
    name: input.display_name?.trim() || input.username.trim(),
    birthday: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    email: input.username.trim().includes("@") ? input.username.trim() : null,
    password: input.password,
  };

  users.push(newUser);
  ensureFriendships(newUser.id);
  return Promise.resolve(cloneUser(newUser));
}

export function mockLogin(identifier: string, password: string) {
  const user = getUserByIdentifier(identifier);
  if (!user || user.password !== password) {
    throw new Error("帳號或密碼錯誤");
  }

  ensureFriendships(user.id);
  addSeedMessages();
  const session: AuthSession = {
    access_token: buildId("token"),
    token_type: "bearer",
    expires_in: 3600,
    role: "user",
    user: cloneUser(user),
  };

  return Promise.resolve(session);
}

export function mockGetUser(userId: string) {
  const user = users.find((entry) => entry.id === userId) ?? ensureUserExists(userId);
  return Promise.resolve(cloneUser(user));
}

export function mockUpdateProfile(userId: string, input: ProfileInput) {
  const user = users.find((entry) => entry.id === userId) ?? ensureUserExists(userId);

  user.name = input.name.trim();
  user.birthday = input.birthday;
  user.avatar_url = input.avatar_url;

  return Promise.resolve(cloneUser(user));
}

export function mockChangePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = users.find((entry) => entry.id === userId);
  if (!user || user.password !== currentPassword) {
    throw new Error("目前密碼不正確");
  }
  if (currentPassword === newPassword) {
    throw new Error("新密碼不能與目前密碼相同");
  }
  user.password = newPassword;
  return Promise.resolve({ message: "密碼已更新" });
}

export function mockGetFriends(userId: string) {
  ensureUserExists(userId);
  ensureFriendships(userId);
  const ids = friendships.get(userId) ?? [];
  return Promise.resolve(ids.map((id) => cloneUser(users.find((user) => user.id === id) ?? ensureUserExists(id))).filter(Boolean));
}

export function mockSyncFriends(userId: string, friendUsers: User[]) {
  console.log("[MOCK] mockSyncFriends", { userId, friendUsers });
  ensureUserExists(userId);
  ensureFriendships(userId);
  for (const friend of friendUsers) {
    const existing = users.find((user) => user.id === friend.id);
    if (!existing) {
      const placeholder = createPlaceholderUser(friend.id, friend.username || friend.email || friend.id);
      placeholder.name = friend.name;
      placeholder.birthday = friend.birthday;
      placeholder.avatar_url = friend.avatar_url;
      placeholder.created_at = friend.created_at;
      if (friend.email) placeholder.email = friend.email;
    }
    ensureFriendships(friend.id);
    const myFriends = friendships.get(userId) ?? [];
    if (!myFriends.includes(friend.id)) {
      myFriends.push(friend.id);
      friendships.set(userId, myFriends);
    }
    const theirFriends = friendships.get(friend.id) ?? [];
    if (!theirFriends.includes(userId)) {
      theirFriends.push(userId);
      friendships.set(friend.id, theirFriends);
    }
  }
}

export function mockAddFriend(userId: string, friendIdentifier: string) {
  console.log("[MOCK] mockAddFriend", { userId, friendIdentifier });
  const user = users.find((entry) => entry.id === userId) ?? ensureUserExists(userId);
  let friend = getUserByIdentifier(friendIdentifier);
  if (!friend) {
    if (friendIdentifier.trim().toLowerCase() === userId.toLowerCase()) {
      throw new Error("不能加入自己");
    }
    friend = createPlaceholderUser(friendIdentifier.trim(), friendIdentifier.trim());
  }
  if (friend.id === user.id) throw new Error("不能加入自己");

  ensureFriendships(user.id);
  const currentFriends = friendships.get(user.id) ?? [];
  if (currentFriends.includes(friend.id)) {
    throw new Error("此好友已存在");
  }

  currentFriends.push(friend.id);
  friendships.set(user.id, currentFriends);
  ensureFriendships(friend.id);
  const friendList = friendships.get(friend.id) ?? [];
  if (!friendList.includes(user.id)) {
    friendList.push(user.id);
    friendships.set(friend.id, friendList);
  }

  addSeedMessages();
  return Promise.resolve({ message: "success" });
}

export function mockGetChats(userId: string) {
  ensureUserExists(userId);
  ensureFriendships(userId);

  const friendIds = new Set<string>(friendships.get(userId) ?? []);
  for (const key of conversations.keys()) {
    const [a, b] = key.split(":");
    if (a === userId && b !== userId) friendIds.add(b);
    if (b === userId && a !== userId) friendIds.add(a);
  }

  const friends = Array.from(friendIds).map((friendId) =>
    users.find((user) => user.id === friendId) ?? ensureUserExists(friendId),
  ).filter(Boolean) as MockUser[];

  const summaries: ChatSummary[] = friends.map((friend) => {
    const messages = getMessagesFor(userId, friend.id);
    const lastMessage = messages[messages.length - 1] ?? null;
    return {
      friend: cloneUser(friend),
      last_message: lastMessage,
      last_time: lastMessage?.created_at ?? null,
    };
  });

  console.log("[MOCK] mockGetChats", { userId, friendIds: Array.from(friendIds), summaries });
  return Promise.resolve(summaries.sort((a, b) => (b.last_time ?? "").localeCompare(a.last_time ?? "")));
}

export function mockGetMessages(userId: string, friendId: string) {
  return Promise.resolve(getMessagesFor(userId, friendId));
}

export function mockSendMessage(userId: string, friendId: string, text: string) {
  ensureFriendships(userId);
  ensureFriendships(friendId);

  const userFriends = friendships.get(userId) ?? [];
  if (!userFriends.includes(friendId)) {
    userFriends.push(friendId);
    friendships.set(userId, userFriends);
  }

  const friendFriends = friendships.get(friendId) ?? [];
  if (!friendFriends.includes(userId)) {
    friendFriends.push(userId);
    friendships.set(friendId, friendFriends);
  }

  const message: Message = {
    id: buildId("msg"),
    sender_id: userId,
    receiver_id: friendId,
    text,
    created_at: new Date().toISOString(),
  };
  const key = getConversationKey(userId, friendId);
  const existing = conversations.get(key) ?? [];
  existing.push(message);
  conversations.set(key, existing);
  return Promise.resolve(message);
}
