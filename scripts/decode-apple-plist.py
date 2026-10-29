"""Convert Apple's binary/XML plists to JSON without losing data/date fields."""
import base64
import datetime
import json
import plistlib
import sys


def normalize(value):
    if isinstance(value, bytes):
        return base64.b64encode(value).decode("ascii")
    if isinstance(value, datetime.datetime):
        return value.replace(tzinfo=datetime.timezone.utc).isoformat()
    raise TypeError("Unsupported plist value")


def decode(raw):
    return json.dumps(plistlib.loads(raw), default=normalize)


if __name__ == "__main__":
    sys.stdout.write(decode(sys.stdin.buffer.read()))
