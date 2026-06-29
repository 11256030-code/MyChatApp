import os
import tempfile
import unittest
from pathlib import Path

database = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
database.close()
os.environ["DATABASE_PATH"] = database.name
os.environ["JWT_SECRET"] = "test-secret"

from fastapi.testclient import TestClient

from app.main import app


class ChangePasswordTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = TestClient(app)
        cls.client = cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)
        Path(database.name).unlink(missing_ok=True)

    def test_old_password_stops_working(self):
        username = "password-test"
        old_password = "old-password"
        new_password = "new-password"
        self.client.post(
            "/auth/register",
            json={"username": username, "password": old_password},
        )
        login = self.client.post(
            "/auth/login",
            json={"username": username, "password": old_password},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        wrong = self.client.post(
            "/auth/change-password",
            headers=headers,
            json={"current_password": "wrong-password", "new_password": new_password},
        )
        self.assertEqual(wrong.status_code, 400)

        changed = self.client.post(
            "/auth/change-password",
            headers=headers,
            json={"current_password": old_password, "new_password": new_password},
        )
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(
            self.client.post(
                "/auth/login",
                json={"username": username, "password": old_password},
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.post(
                "/auth/login",
                json={"username": username, "password": new_password},
            ).status_code,
            200,
        )


if __name__ == "__main__":
    unittest.main()

