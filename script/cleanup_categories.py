"""Merge duplicate category names and remove unused category rows safely."""

from datetime import datetime, timezone
from pathlib import Path

from enrichment_common import BACKUP_DIR, close_connection, connect


def main() -> None:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = BACKUP_DIR / f"category_cleanup_{timestamp}"
    backup.mkdir(parents=True, exist_ok=False)
    connection = connect()
    try:
        for table in ("categories", "product_categories"):
            path = (backup / f"{table}.parquet").as_posix()
            connection.execute(
                f"COPY (SELECT * FROM postgres_db.{table}) TO '{path}' (FORMAT PARQUET)"
            )

        connection.execute("BEGIN TRANSACTION")
        duplicate_groups = connection.execute(
            """
            SELECT lower(trim(name)) AS normalized, min(id) AS keep_id,
                   list(id) AS category_ids
            FROM postgres_db.categories
            GROUP BY lower(trim(name))
            HAVING count(*) > 1
            """
        ).fetchall()

        merged = 0
        for normalized, keep_id, category_ids in duplicate_groups:
            for category_id in category_ids:
                if category_id == keep_id:
                    continue
                connection.execute(
                    """
                    INSERT INTO postgres_db.product_categories (product_id, category_id)
                    SELECT product_id, ?
                    FROM postgres_db.product_categories
                    WHERE category_id = ?
                    ON CONFLICT (product_id, category_id) DO NOTHING
                    """,
                    [keep_id, category_id],
                )
                connection.execute(
                    "DELETE FROM postgres_db.product_categories WHERE category_id = ?",
                    [category_id],
                )
                connection.execute(
                    "DELETE FROM postgres_db.categories WHERE id = ?",
                    [category_id],
                )
                merged += 1

        unused = connection.execute(
            """
            SELECT c.id
            FROM postgres_db.categories c
            WHERE NOT EXISTS (
              SELECT 1 FROM postgres_db.product_categories pc
              WHERE pc.category_id = c.id
            )
            """
        ).fetchall()
        for (category_id,) in unused:
            connection.execute(
                "DELETE FROM postgres_db.categories WHERE id = ?",
                [category_id],
            )
        connection.execute("COMMIT")
        print(f"Merged duplicate categories: {merged}")
        print(f"Removed unused categories: {len(unused)}")
        print(f"Backup: {backup}")
    except Exception:
        connection.execute("ROLLBACK")
        raise
    finally:
        close_connection(connection)


if __name__ == "__main__":
    main()
