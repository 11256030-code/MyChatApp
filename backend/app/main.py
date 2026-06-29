import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.getenv("DATABASE_PATH", str(ROOT / "chat.db")))
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret-in-production")
JWT_EXPIRES_IN = int(os.getenv("JWT_EXPIRES_IN", "86400"))
bearer = HTTPBearer()


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    with db() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE,
              password_hash TEXT NOT NULL, name TEXT NOT NULL, birthday TEXT,
              avatar_url TEXT, role TEXT NOT NULL DEFAULT 'user',
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS friendships (
              user_a TEXT NOT NULL, user_b TEXT NOT NULL, created_at TEXT NOT NULL,
              PRIMARY KEY (user_a, user_b),
              FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS messages (
              id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL,
              text TEXT NOT NULL, created_at TEXT NOT NULL,
              FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="MyChat API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[item.strip() for item in os.getenv("ALLOWED_ORIGINS", "*").split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=4, max_length=60)
    display_name: str | None = Field(default=None, max_length=40)


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=4, max_length=60)
    new_password: str = Field(min_length=4, max_length=60)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    birthday: date | None = None
    avatar_url: str | None = None


class AddFriendRequest(BaseModel):
    friend_id: str


class MessageCreate(BaseModel):
    sender_id: str | None = None
    text: str = Field(min_length=1, max_length=1000)


def b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32
    )
    return f"scrypt${b64encode(salt)}${b64encode(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt, expected = stored.split("$", 2)
        if algorithm != "scrypt":
            return False
        actual = hashlib.scrypt(
            password.encode(), salt=b64decode(salt), n=2**14, r=8, p=1, dklen=32
        )
        return hmac.compare_digest(actual, b64decode(expected))
    except (TypeError, ValueError):
        return False


def create_token(user: sqlite3.Row) -> str:
    header = b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    issued_at = int(time.time())
    payload = b64encode(
        json.dumps(
            {
                "sub": user["id"],
                "role": user["role"],
                "iat": issued_at,
                "exp": issued_at + JWT_EXPIRES_IN,
            }
        ).encode()
    )
    signature = b64encode(
        hmac.new(
            JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256
        ).digest()
    )
    return f"{header}.{payload}.{signature}"


def token_subject(token: str) -> str:
    try:
        header, payload, signature = token.split(".")
        expected = b64encode(
            hmac.new(
                JWT_SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256
            ).digest()
        )
        claims = json.loads(b64decode(payload))
        if (
            not hmac.compare_digest(signature, expected)
            or claims.get("exp", 0) < time.time()
            or not isinstance(claims.get("sub"), str)
        ):
            raise ValueError
        return claims["sub"]
    except (ValueError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="登入憑證無效或已過期")


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
) -> sqlite3.Row:
    with db() as connection:
        user = connection.execute(
            "SELECT * FROM users WHERE id = ?", (token_subject(credentials.credentials),)
        ).fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="找不到登入使用者")
    return user


CurrentUser = Annotated[sqlite3.Row, Depends(current_user)]


def public_user(user: sqlite3.Row) -> dict:
    return {
        key: user[key]
        for key in ("id", "username", "name", "birthday", "avatar_url", "created_at")
    }


def require_owner(user_id: str, user: sqlite3.Row) -> None:
    if user["id"] != user_id:
        raise HTTPException(status_code=403, detail="沒有權限操作其他使用者")


def pair(first: str, second: str) -> tuple[str, str]:
    return (first, second) if first < second else (second, first)


def require_friendship(connection: sqlite3.Connection, first: str, second: str) -> None:
    user_a, user_b = pair(first, second)
    if not connection.execute(
        "SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?",
        (user_a, user_b),
    ).fetchone():
        raise HTTPException(status_code=403, detail="雙方不是好友")


@app.get("/")
def root():
    return {"message": "MyChat API is running"}


@app.post("/auth/register")
def register(payload: RegisterRequest):
    user_id, created_at = str(uuid.uuid4()), now()
    try:
        with db() as connection:
            connection.execute(
                """INSERT INTO users
                   (id, username, password_hash, name, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    user_id,
                    payload.username.strip(),
                    hash_password(payload.password),
                    payload.display_name or payload.username.strip(),
                    created_at,
                ),
            )
            user = connection.execute(
                "SELECT * FROM users WHERE id = ?", (user_id,)
            ).fetchone()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="帳號已存在")
    return public_user(user)


@app.post("/auth/login")
def login(payload: LoginRequest):
    with db() as connection:
        user = connection.execute(
            "SELECT * FROM users WHERE username = ?", (payload.username.strip(),)
        ).fetchone()
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
    return {
        "access_token": create_token(user),
        "token_type": "bearer",
        "expires_in": JWT_EXPIRES_IN,
        "role": user["role"],
        "user": public_user(user),
    }


@app.post("/auth/change-password")
def change_password(payload: ChangePasswordRequest, user: CurrentUser):
    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="目前密碼不正確")
    if hmac.compare_digest(payload.current_password, payload.new_password):
        raise HTTPException(status_code=400, detail="新密碼不能與目前密碼相同")
    with db() as connection:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(payload.new_password), user["id"]),
        )
    return {"message": "密碼已更新"}


@app.get("/users/{user_id}")
def get_user(user_id: str, _: CurrentUser):
    with db() as connection:
        user = connection.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="找不到使用者")
    return public_user(user)


@app.put("/users/{user_id}")
def update_profile(user_id: str, payload: ProfileUpdate, user: CurrentUser):
    require_owner(user_id, user)
    with db() as connection:
        connection.execute(
            "UPDATE users SET name = ?, birthday = ?, avatar_url = ? WHERE id = ?",
            (
                payload.name.strip(),
                payload.birthday.isoformat() if payload.birthday else None,
                payload.avatar_url,
                user_id,
            ),
        )
        updated = connection.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return public_user(updated)


@app.get("/users/{user_id}/friends")
def get_friends(user_id: str, user: CurrentUser):
    require_owner(user_id, user)
    with db() as connection:
        rows = connection.execute(
            """SELECT u.* FROM users u JOIN friendships f
               ON (f.user_a = ? AND f.user_b = u.id)
               OR (f.user_b = ? AND f.user_a = u.id)
               ORDER BY u.name COLLATE NOCASE""",
            (user_id, user_id),
        ).fetchall()
    return [public_user(row) for row in rows]


@app.post("/users/{user_id}/friends")
def add_friend(user_id: str, payload: AddFriendRequest, user: CurrentUser):
    require_owner(user_id, user)
    if user_id == payload.friend_id:
        raise HTTPException(status_code=400, detail="不能加入自己為好友")
    with db() as connection:
        friend = connection.execute(
            """SELECT * FROM users
               WHERE id = ? OR username = ? COLLATE NOCASE""",
            (payload.friend_id, payload.friend_id),
        ).fetchone()
        if not friend:
            raise HTTPException(status_code=404, detail="找不到好友")
        user_a, user_b = pair(user_id, friend["id"])
        cursor = connection.execute(
            """INSERT OR IGNORE INTO friendships (user_a, user_b, created_at)
               VALUES (?, ?, ?)""",
            (user_a, user_b, now()),
        )
    return {"message": "已加入好友" if cursor.rowcount else "已經是好友"}


@app.get("/users/{user_id}/chats")
def get_chats(user_id: str, user: CurrentUser):
    require_owner(user_id, user)
    with db() as connection:
        friends = connection.execute(
            """SELECT u.* FROM users u JOIN friendships f
               ON (f.user_a = ? AND f.user_b = u.id)
               OR (f.user_b = ? AND f.user_a = u.id)""",
            (user_id, user_id),
        ).fetchall()
        chats = []
        for friend in friends:
            last = connection.execute(
                """SELECT * FROM messages
                   WHERE (sender_id = ? AND receiver_id = ?)
                      OR (sender_id = ? AND receiver_id = ?)
                   ORDER BY created_at DESC LIMIT 1""",
                (user_id, friend["id"], friend["id"], user_id),
            ).fetchone()
            chats.append(
                {
                    "friend": public_user(friend),
                    "last_message": dict(last) if last else None,
                    "last_time": last["created_at"] if last else None,
                }
            )
    return sorted(chats, key=lambda item: item["last_time"] or "", reverse=True)


@app.get("/chats/{user_id}/{friend_id}/messages")
def get_messages(user_id: str, friend_id: str, user: CurrentUser):
    require_owner(user_id, user)
    with db() as connection:
        require_friendship(connection, user_id, friend_id)
        rows = connection.execute(
            """SELECT * FROM messages
               WHERE (sender_id = ? AND receiver_id = ?)
                  OR (sender_id = ? AND receiver_id = ?)
               ORDER BY created_at""",
            (user_id, friend_id, friend_id, user_id),
        ).fetchall()
    return [dict(row) for row in rows]


@app.post("/chats/{user_id}/{friend_id}/messages")
def send_message(
    user_id: str, friend_id: str, payload: MessageCreate, user: CurrentUser
):
    require_owner(user_id, user)
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="訊息不能是空白")
    message = {
        "id": str(uuid.uuid4()),
        "sender_id": user_id,
        "receiver_id": friend_id,
        "text": text,
        "created_at": now(),
    }
    with db() as connection:
        require_friendship(connection, user_id, friend_id)
        connection.execute(
            """INSERT INTO messages
               (id, sender_id, receiver_id, text, created_at)
               VALUES (:id, :sender_id, :receiver_id, :text, :created_at)""",
            message,
        )
    return message

