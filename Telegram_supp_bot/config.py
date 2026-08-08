from dataclasses import dataclass
from dotenv import load_dotenv
import os


load_dotenv()


@dataclass
class Config:
    BOT_TOKEN: str
    ADMIN_IDS: set[int]


config = Config(
    BOT_TOKEN=os.getenv("BOT_TOKEN"),
    ADMIN_IDS={
        int(x) for x in os.getenv("ADMIN_IDS", "").replace(",", " ").split()
    },
)