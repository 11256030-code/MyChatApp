import type {
    AuthSession,
    ChatSummary,
    LoginInput,
    Message,
    ProfileInput,
    RegisterInput,
    User,
} from "../types/chat";
import { ApiRequestError, apiRequest } from "./client";
import {
    mockAddFriend,
    mockChangePassword,
    mockGetChats,
    mockGetFriends,
    mockGetMessages,
    mockGetUser,
    mockLogin,
    mockRegister,
    mockSendMessage,
    mockSyncFriends,
    mockUpdateProfile,
} from "./mockData";

function shouldUseMockFallback(error: unknown) {
  const isNetworkError = error instanceof Error && error.message.includes("無法連線到伺服器");
  const isApiError =
    error instanceof ApiRequestError &&
    (error.status === 401 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status >= 500);
  if (isNetworkError || isApiError) {
    console.log("[API] using mock fallback", { error, isNetworkError, isApiError });
    return true;
  }
  return false;
}

export async function register(input: RegisterInput) {
  try {
    return await apiRequest<User>("/auth/register", {
      method: "POST",
      body: input,
      auth: false,
    });
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      return mockRegister(input);
    }
    throw error;
  }
}

export async function login(input: LoginInput) {
  try {
    return await apiRequest<AuthSession>("/auth/login", {
      method: "POST",
      body: input,
      auth: false,
    });
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      return mockLogin(input.username, input.password);
    }
    throw error;
  }
}

export async function getUser(userId: string) {
  try {
    return await apiRequest<User>(`/users/${userId}`);
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      return mockGetUser(userId);
    }
    throw error;
  }
}

export async function updateProfile(userId: string, input: ProfileInput) {
  try {
    return await apiRequest<User>(`/users/${userId}`, {
      method: "PUT",
      body: input,
    });
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      return mockUpdateProfile(userId, input);
    }
    throw error;
  }
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  try {
    return await apiRequest<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: {
        current_password: currentPassword,
        new_password: newPassword,
      },
    });
  } catch (error) {
    const isNetworkError =
      error instanceof Error &&
      error.message.includes("無法連線到伺服器");
    const isMockSession =
      userId.startsWith("demo-") || userId.startsWith("user-");
    if (isNetworkError || (isMockSession && shouldUseMockFallback(error))) {
      return mockChangePassword(userId, currentPassword, newPassword);
    }
    if (error instanceof ApiRequestError && error.status === 404) {
      throw new ApiRequestError(
        "目前伺服器尚未提供更改密碼功能",
        error.status,
      );
    }
    throw error;
  }
}

export async function getFriends(userId: string) {
  try {
    const friends = await apiRequest<User[]>(`/users/${userId}/friends`);
    mockSyncFriends(userId, friends);
    return friends;
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      return mockGetFriends(userId);
    }
    throw error;
  }
}

export async function addFriend(userId: string, friendIdentifier: string) {
  try {
    return await apiRequest<{ message: string }>(`/users/${userId}/friends`, {
      method: "POST",
      body: { friend_id: friendIdentifier },
    });
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      return mockAddFriend(userId, friendIdentifier);
    }
    throw error;
  }
}

export async function getChats(userId: string) {
  try {
    return await apiRequest<ChatSummary[]>(`/users/${userId}/chats`);
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      try {
        await getFriends(userId);
      } catch {
        // Ignore secondary friend sync failure and fall back to existing mock state.
      }
      return mockGetChats(userId);
    }
    throw error;
  }
}

export async function getMessages(userId: string, friendId: string) {
  try {
    return await apiRequest<Message[]>(`/chats/${userId}/${friendId}/messages`);
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      return mockGetMessages(userId, friendId);
    }
    throw error;
  }
}

export async function sendMessage(userId: string, friendId: string, text: string) {
  try {
    return await apiRequest<Message>(`/chats/${userId}/${friendId}/messages`, {
      method: "POST",
      body: { sender_id: userId, text },
    });
  } catch (error) {
    if (shouldUseMockFallback(error)) {
      return mockSendMessage(userId, friendId, text);
    }
    throw error;
  }
}
