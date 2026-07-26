import aiosqlite
from datetime import datetime

DB_NAME = "tickets.db"


async def init_db():
    async with aiosqlite.connect(DB_NAME) as db:

        await db.execute("""
        CREATE TABLE IF NOT EXISTS users(
            telegram_id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            is_banned INTEGER DEFAULT 0,
            created_at TEXT
        )
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS tickets(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            status TEXT DEFAULT 'open',
            created_at TEXT,
            closed_at TEXT
        )
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS messages(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER,
            sender TEXT,
            text TEXT,
            admin_message_id INTEGER,
            user_message_id INTEGER,
            created_at TEXT
        )
        """)

        await db.commit()


async def add_user(user):
    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            "SELECT telegram_id FROM users WHERE telegram_id=?",
            (user.id,)
        )

        exists = await cursor.fetchone()

        if exists:
            return

        await db.execute(
            """
            INSERT INTO users(
                telegram_id,
                username,
                first_name,
                created_at
            )
            VALUES(?,?,?,?)
            """,
            (
                user.id,
                user.username,
                user.first_name,
                datetime.now().isoformat()
            )
        )

        await db.commit()


async def is_banned(user_id):

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            "SELECT is_banned FROM users WHERE telegram_id=?",
            (user_id,)
        )

        row = await cursor.fetchone()

        if not row:
            return False

        return bool(row[0])


async def ban_user(user_id):

    async with aiosqlite.connect(DB_NAME) as db:

        await db.execute(
            "UPDATE users SET is_banned=1 WHERE telegram_id=?",
            (user_id,)
        )

        await db.commit()


async def unban_user(user_id):

    async with aiosqlite.connect(DB_NAME) as db:

        await db.execute(
            "UPDATE users SET is_banned=0 WHERE telegram_id=?",
            (user_id,)
        )

        await db.commit()


async def get_user(user_id):

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            """
            SELECT
                telegram_id,
                username,
                first_name,
                is_banned,
                created_at
            FROM users
            WHERE telegram_id=?
            """,
            (user_id,)
        )

        return await cursor.fetchone()

async def create_ticket(user_id: int):

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            """
            INSERT INTO tickets(
                user_id,
                status,
                created_at
            )
            VALUES(?,?,?)
            """,
            (
                user_id,
                "open",
                datetime.now().isoformat()
            )
        )

        await db.commit()

        return cursor.lastrowid


async def get_open_ticket(user_id: int):

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            """
            SELECT id
            FROM tickets
            WHERE user_id=?
            AND status='open'
            ORDER BY id DESC
            LIMIT 1
            """,
            (user_id,)
        )

        row = await cursor.fetchone()

        if row:
            return row[0]

        return None


async def close_ticket(ticket_id: int):

    async with aiosqlite.connect(DB_NAME) as db:

        await db.execute(
            """
            UPDATE tickets
            SET
                status='closed',
                closed_at=?
            WHERE id=?
            """,
            (
                datetime.now().isoformat(),
                ticket_id
            )
        )

        await db.commit()


async def save_message(
    ticket_id: int,
    sender: str,
    text: str = "",
    admin_message_id: int | None = None,
    user_message_id: int | None = None
):

    async with aiosqlite.connect(DB_NAME) as db:

        await db.execute(
            """
            INSERT INTO messages(
                ticket_id,
                sender,
                text,
                admin_message_id,
                user_message_id,
                created_at
            )
            VALUES(?,?,?,?,?,?)
            """,
            (
                ticket_id,
                sender,
                text,
                admin_message_id,
                user_message_id,
                datetime.now().isoformat()
            )
        )

        await db.commit()


async def link_admin_message(
    user_message_id: int,
    admin_message_id: int
):

    async with aiosqlite.connect(DB_NAME) as db:

        await db.execute(
            """
            UPDATE messages
            SET admin_message_id=?
            WHERE user_message_id=?
            """,
            (
                admin_message_id,
                user_message_id
            )
        )

        await db.commit()

async def get_user_by_admin_message(admin_message_id: int):

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            """
            SELECT 
                t.user_id,
                t.id
            FROM messages m
            JOIN tickets t ON m.ticket_id = t.id
            WHERE m.admin_message_id=?
            """,
            (admin_message_id,)
        )

        row = await cursor.fetchone()

        if row:
            return {
                "user_id": row[0],
                "ticket_id": row[1]
            }

        return None



async def get_ticket_info(ticket_id: int):

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            """
            SELECT
                t.id,
                t.status,
                t.created_at,
                u.telegram_id,
                u.username,
                u.first_name,
                u.is_banned
            FROM tickets t
            JOIN users u
            ON t.user_id=u.telegram_id
            WHERE t.id=?
            """,
            (ticket_id,)
        )

        return await cursor.fetchone()



async def get_history(user_id: int):

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            """
            SELECT
                m.sender,
                m.text,
                m.created_at
            FROM messages m
            JOIN tickets t
            ON m.ticket_id=t.id
            WHERE t.user_id=?
            ORDER BY m.id ASC
            """,
            (user_id,)
        )

        return await cursor.fetchall()



async def get_user_stats(user_id: int):

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            """
            SELECT
                COUNT(*)
            FROM tickets
            WHERE user_id=?
            """,
            (user_id,)
        )

        tickets = await cursor.fetchone()


        cursor = await db.execute(
            """
            SELECT
                status
            FROM tickets
            WHERE user_id=?
            ORDER BY id DESC
            LIMIT 1
            """,
            (user_id,)
        )

        last_ticket = await cursor.fetchone()


        return {
            "tickets": tickets[0],
            "last_status": (
                last_ticket[0]
                if last_ticket
                else "нет"
            )
        }



async def get_all_users():

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            """
            SELECT telegram_id
            FROM users
            WHERE is_banned=0
            """
        )

        return await cursor.fetchall()



async def get_global_stats():

    async with aiosqlite.connect(DB_NAME) as db:

        cursor = await db.execute(
            """
            SELECT COUNT(*)
            FROM users
            """
        )

        users = await cursor.fetchone()


        cursor = await db.execute(
            """
            SELECT COUNT(*)
            FROM tickets
            """
        )

        tickets = await cursor.fetchone()


        cursor = await db.execute(
            """
            SELECT COUNT(*)
            FROM tickets
            WHERE status='open'
            """
        )

        opened = await cursor.fetchone()


        return {
            "users": users[0],
            "tickets": tickets[0],
            "opened": opened[0]
        }