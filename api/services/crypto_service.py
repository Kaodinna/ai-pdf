"""
Symmetric encryption for secrets we have to store ourselves (right now:
mailbox IMAP passwords — see mailbox_config_service.py). Previously these
were saved in plain text in data/mailboxes.json.

Key handling, in priority order:
1. MAILBOX_ENCRYPTION_KEY env var, if set — the recommended production
   setup, since the key then lives in the server's .env, separate from the
   data volume it protects. A leak of just the data directory (e.g. a bad
   backup, a misconfigured volume mount) doesn't also leak the key.
2. Otherwise, a key is generated on first use and persisted to
   data/encryption.key (mode 0600). This means the app works correctly out
   of the box with no required deploy step, but the key sits next to what
   it encrypts — weaker, but still strictly better than plain text, and a
   startup log line says so.

Rotating the key (replacing it without re-encrypting existing values first)
makes every previously-stored password undecryptable — there is no
migration path for that here, so don't rotate casually.
"""

import os
import stat
from pathlib import Path

from cryptography.fernet import Fernet

KEY_FILE = Path(__file__).parent.parent / "data" / "encryption.key"
KEY_FILE.parent.mkdir(parents=True, exist_ok=True)

_fernet: Fernet | None = None


def _load_or_create_key() -> bytes:
    env_key = os.environ.get("MAILBOX_ENCRYPTION_KEY")
    if env_key:
        return env_key.encode()

    if KEY_FILE.exists():
        return KEY_FILE.read_bytes().strip()

    key = Fernet.generate_key()
    KEY_FILE.write_bytes(key)
    KEY_FILE.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0600 — owner read/write only
    print(
        "[crypto_service] Generated a new encryption key at "
        f"{KEY_FILE} — set MAILBOX_ENCRYPTION_KEY in production instead "
        "so the key isn't stored alongside the data it protects."
    )
    return key


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_load_or_create_key())
    return _fernet


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()


def is_encrypted(value: str) -> bool:
    """Fernet tokens are always valid, base64-url-safe and start with 'gAAAAA'
    (version byte 0x80 + timestamp). Used to tell an already-encrypted
    password apart from a legacy plain-text one during migration, without
    needing a separate schema version field."""
    try:
        _get_fernet().decrypt(value.encode())
        return True
    except Exception:
        return False
