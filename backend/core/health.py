import redis
from django.conf import settings
from django.db import connection


def database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return True
    except Exception:
        return False


def redis_ok() -> bool:
    try:
        client = redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        return bool(client.ping())
    except redis.RedisError:
        return False
