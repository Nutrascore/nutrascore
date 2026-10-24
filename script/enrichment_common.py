"""Shared safe helpers for optional product enrichment scripts."""

import os
from getpass import getpass
from pathlib import Path
from urllib.parse import unquote, urlparse

import duckdb


ROOT_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT_DIR / "apps" / "api" / ".env"
BACKUP_DIR = ROOT_DIR / "data" / "backups"
REPORT_DIR = ROOT_DIR / "data" / "reports"


def database_connection_string() -> str:
    values = {}
    if ENV_PATH.is_file():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip("\"'")

    url = values.get("DATABASE_URL")
    if not url:
        raise ValueError(f"DATABASE_URL is missing from {ENV_PATH}")

    parsed = urlparse(url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ValueError("DATABASE_URL must use a PostgreSQL URL")

    password = unquote(parsed.password or "")
    if not password:
        password = getpass(f"Password for PostgreSQL user '{unquote(parsed.username or '')}': ")
    if not password:
        raise ValueError("A PostgreSQL password is required")

    return (
        f"host={parsed.hostname or 'localhost'} port={parsed.port or 5432} "
        f"dbname={parsed.path.lstrip('/')} user={unquote(parsed.username or '')} "
        f"password={password}"
    )


def connect():
    connection = duckdb.connect()
    connection.execute("INSTALL postgres")
    connection.execute("LOAD postgres")
    credentials = database_connection_string().replace("\\", "\\\\").replace("'", "\\'")
    connection.execute(f"ATTACH '{credentials}' AS postgres_db (TYPE postgres)")
    return connection


def backup_table(connection, table: str, prefix: str) -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backup_dir = BACKUP_DIR / prefix
    backup_dir.mkdir(parents=True, exist_ok=True)
    path = backup_dir / f"{table.replace(chr(34), '')}.parquet"
    connection.execute(
        f"COPY (SELECT * FROM postgres_db.{table}) TO '{path.as_posix()}' (FORMAT PARQUET)"
    )
    return path


def require_provider(provider_url: str | None, provider_name: str) -> str:
    configured = provider_url or os.environ.get("NUTRASCORE_ENRICHMENT_PROVIDER_URL")
    if not configured:
        raise RuntimeError(
            f"No {provider_name} provider configured. Set "
            "NUTRASCORE_ENRICHMENT_PROVIDER_URL to an authorized API endpoint."
        )
    parsed = urlparse(configured)
    if parsed.scheme not in {"https"}:
        raise ValueError("Enrichment providers must use HTTPS")
    return configured


def close_connection(connection) -> None:
    try:
        connection.execute("DETACH postgres_db")
    finally:
        connection.close()
