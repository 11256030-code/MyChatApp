import json
import urllib.request
import urllib.error

BASE = 'https://mychatbackend-eu2n.onrender.com'
accounts = [
    {'username': 'alice@example.com', 'password': 'password123', 'display_name': 'Alice'},
    {'username': 'bob@example.com', 'password': 'password123', 'display_name': 'Bob'},
    {'username': 'charlie@example.com', 'password': 'password123', 'display_name': 'Charlie'},
]


def request(path, method='GET', body=None, token=None):
    headers = {}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = f'Bearer {token}'
    data = None if body is None else json.dumps(body).encode('utf-8')
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode('utf-8')
            return resp.status, json.loads(text) if text else None
    except urllib.error.HTTPError as exc:
        text = exc.read().decode('utf-8')
        raise RuntimeError(f'{exc.code}: {text}') from exc

sessions = []
for account in accounts:
    try:
        request('/auth/register', 'POST', account)
    except RuntimeError as exc:
        if '400' not in str(exc) and '409' not in str(exc):
            raise
    status, session = request('/auth/login', 'POST', {
        'username': account['username'],
        'password': account['password'],
    })
    sessions.append({**account, 'id': session['user']['id'], 'token': session['access_token']})

for me in sessions:
    for other in sessions:
        if me['username'] == other['username']:
            continue
        try:
            request(f'/users/{me["id"]}/friends', 'POST', {'friend_id': other['id']}, me['token'])
        except RuntimeError as exc:
            if '400' not in str(exc) and '409' not in str(exc):
                print(f'friend add failed: {me["username"]} -> {other["username"]}: {exc}')

for me in sessions:
    for other in sessions:
        if me['username'] == other['username']:
            continue
        try:
            request(f'/chats/{me["id"]}/{other["id"]}/messages', 'POST', {
                'sender_id': me['id'],
                'text': f'Hi from {me["display_name"]} to {other["display_name"]}',
            }, me['token'])
        except RuntimeError as exc:
            print(f'message failed: {me["username"]} -> {other["username"]}: {exc}')

print('Demo accounts ready:', [s['username'] for s in sessions])
