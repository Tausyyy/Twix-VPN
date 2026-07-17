"""
Читает ту же базу, что и Express (backend/db/database.sqlite).
Только чтение - никаких записей отсюда, чтобы не конфликтовать
с Node-процессом, который держит эту базу открытой на запись.
"""
import sqlite3
from pathlib import Path

# Telegram_bot/db.py -> project_root/backend/db/database.sqlite
DB_PATH = Path(__file__).resolve().parent.parent / "backend" / "db" / "database.sqlite"


def _connect():
	conn = sqlite3.connect(DB_PATH)
	conn.row_factory = sqlite3.Row
	return conn


def get_all_telegram_ids() -> list[int]:
	"""Все telegram_id пользователей, которые приходили через бота."""
	conn = _connect()
	try:
		rows = conn.execute(
			"SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL"
		).fetchall()
		return [row["telegram_id"] for row in rows]
	finally:
		conn.close()


def get_stats() -> dict:
	conn = _connect()
	try:
		total = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
		with_telegram = conn.execute(
			"SELECT COUNT(*) AS c FROM users WHERE telegram_id IS NOT NULL"
		).fetchone()["c"]
		with_link = conn.execute(
			"SELECT COUNT(*) AS c FROM users WHERE vpn_link IS NOT NULL"
		).fetchone()["c"]
		return {
			"total": total,
			"with_telegram": with_telegram,
			"with_link": with_link,
		}
	finally:
		conn.close()