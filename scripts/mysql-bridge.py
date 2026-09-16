#!/usr/bin/env python3
"""
MySQL-protokol -> SQLite geliştirme köprüsü (İpek Tuhafiye önizleme veritabanı).

Gerçek bir MySQL sunucusu olmayan ortamlarda (bu sandbox gibi) uygulamaya
MySQL gibi görünür: mysql-mimic MySQL protokolünü konuşur, gelen SQL sqlglot
ile SQLite lehçesine çevrilip bir SQLite dosyasında çalıştırılır.

Kullanım:
    pip install mysql-mimic            # sqlglot ile birlikte gelir
    python3 scripts/mysql-bridge.py    # 0.0.0.0:3306, şifre: tuhafiye

    # başka bir uçta şema + örnek veri:
    DATABASE_URL="mysql://tuhafiye:tuhafiye@127.0.0.1:3306/tuhafiye" npm run db:seed
    # (şema ilk bağlantıda migrate script'i ile kurulur, bkz. scripts/db-apply.mjs)

Kapsam / kısıtlar (bilinçli tercihler):
- DDL/DML + SELECT'ler çevrilir; SET/USE/SHOW/DESCRIBE/BEGIN/COMMIT/ROLLBACK ve
  INFORMATION_SCHEMA sorguları mysql-mimic'in gömülü davranışıyla yanıtlanır.
- Her ifade sonrası commit yapılır (BEGIN/COMMIT çerçeve tarafından yutulur;
  çok-ifadeli işlem atomikliği YOKTUR — önizleme için yeterli).
- Desteklenmeyenler: ON DUPLICATE KEY UPDATE, FOR UPDATE (yok sayılır),
  saklı yordamlar, trigger'lar, kilitler.
"""

from __future__ import annotations

import argparse
import asyncio
import inspect
import logging
import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional

import sqlglot
from sqlglot import exp

from mysql_mimic import MysqlServer, Session
from mysql_mimic import packets
from mysql_mimic.auth import IdentityProvider, NativePasswordAuthPlugin, User
from mysql_mimic.connection import Connection
from mysql_mimic.constants import INFO_SCHEMA
from mysql_mimic.control import LocalControl, TooManyConnections
from mysql_mimic.errors import ErrorCode, MysqlError
from mysql_mimic.results import AllowedResult
from mysql_mimic.stream import MysqlStream
from mysql_mimic.types import Capabilities
from mysql_mimic.utils import find_dbs

logger = logging.getLogger("mysql-bridge")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(REPO_ROOT, ".bridge-data", "tuhafiye.db")

_SQLITE_TO_MYSQL: Dict[str, str] = {
    "INTEGER": "int",
    "INT": "int",
    "BIGINT": "bigint",
    "SMALLINT": "smallint",
    "TINYINT": "tinyint",
    "TEXT": "text",
    "VARCHAR": "varchar",
    "CHARACTER": "char",
    "CHAR": "char",
    "DECIMAL": "decimal",
    "NUMERIC": "decimal",
    "REAL": "double",
    "DOUBLE": "double",
    "FLOAT": "float",
    "BOOLEAN": "boolean",
    "TIMESTAMP": "timestamp",
    "TIMESTAMPTZ": "timestamp",
    "DATETIME": "datetime",
    "DATE": "date",
    "TIME": "time",
    "BLOB": "blob",
}


def _fix_now(node: exp.Expression) -> exp.Expression:
    """NOW() -> CURRENT_TIMESTAMP (SQLite'ta NOW() yoktur).

    AST seviyesinde yapılır; string sabitlerindeki 'now()' metinlerine
    dokunulmaz. Hem WHERE NOW() hem DEFAULT (now()) kapsanır.
    """
    if (
        isinstance(node, exp.Anonymous)
        and str(node.this).upper() == "NOW"
        and not node.expressions
    ):
        return exp.CurrentTimestamp()
    return node


class BridgeAuth(IdentityProvider):
    """Tek şifreli geliştirme kimlik doğrulaması (mysql_native_password)."""

    def __init__(self, password: str):
        self._auth_string = NativePasswordAuthPlugin.create_auth_string(password)

    async def get_user(self, username: str) -> Optional[User]:
        return User(
            name=username,
            auth_string=self._auth_string,
            auth_plugin=NativePasswordAuthPlugin.name,
        )


class BridgeSession(Session):
    """SQL'i SQLite'ta çalıştıran oturum (bağlantı başına bir örnek)."""

    def __init__(self, db_path: str):
        super().__init__()
        self.db_path = db_path
        self._sqlite: Optional[sqlite3.Connection] = None
        # Son DML'in OK paketi bilgileri (BridgeConnection okur).
        self.last_ok: Dict[str, int] = {}
        # {tablo: (sütun sırası, {sütun: varsayılan ifade})} — INSERT DEFAULT açılımı için.
        self._defaults_cache: Dict[str, Any] = {}

    @property
    def sqlite(self) -> sqlite3.Connection:
        if self._sqlite is None:
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
            con = sqlite3.connect(self.db_path, timeout=30.0)
            con.execute("PRAGMA journal_mode=WAL")
            con.execute("PRAGMA synchronous=NORMAL")
            con.execute("PRAGMA busy_timeout=30000")
            self._sqlite = con
        return self._sqlite

    async def close(self) -> None:
        await super().close()
        if self._sqlite is not None:
            try:
                self._sqlite.close()
            except Exception:  # pylint: disable=broad-except
                pass
            self._sqlite = None

    async def schema(self) -> dict:
        """SHOW / INFORMATION_SCHEMA için canlı şema {tablo: {sütun: tip}}."""
        try:
            tables = [
                r[0]
                for r in self.sqlite.execute(
                    "SELECT name FROM sqlite_master "
                    "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                ).fetchall()
            ]
        except sqlite3.Error:
            return {}
        out: Dict[str, Dict[str, str]] = {}
        for table in tables:
            cols: Dict[str, str] = {}
            try:
                safe = table.replace('"', '""')
                for _cid, name, decl, *_rest in self.sqlite.execute(
                    f'PRAGMA table_info("{safe}")'
                ).fetchall():
                    base = (decl or "").upper().split("(")[0].strip()
                    cols[name] = _SQLITE_TO_MYSQL.get(base, "text")
            except sqlite3.Error:
                continue
            out[table] = cols
        return out

    async def query(
        self, expression: exp.Expression, sql: str, attrs: Dict[str, str]
    ) -> AllowedResult:
        # handle_query her ifadeyi kendisi yönlendirir; buraya bir şey
        # düşerse (örn. EXPLAIN) açıkça hata ver — sessiz yanlış sonuç yok.
        raise MysqlError(
            f"Desteklenmeyen ifade köprüye düştü: {type(expression).__name__}",
            code=ErrorCode.NOT_SUPPORTED_YET,
        )

    def _framework_handled(self, e: exp.Expression) -> bool:
        """Çerçevenin gömülü middleware'lerine bırakılacak ifadeler."""
        if isinstance(
            e,
            (
                exp.Set,
                exp.Use,
                exp.Show,
                exp.Describe,
                exp.Kill,
                exp.Transaction,
                exp.Commit,
                exp.Rollback,
            ),
        ):
            return True
        if isinstance(e, exp.Select):
            if not any(
                e.args.get(a)
                for a in set(exp.Select.arg_types) - {"expressions", "limit", "hint"}
            ):
                return True  # SELECT 1 / SELECT DATABASE() vb. statik sorgular
            dbs = find_dbs(e)
            if (self.database and self.database.lower() in INFO_SCHEMA) or (
                dbs and all(db.lower() in INFO_SCHEMA for db in dbs)
            ):
                return True
        return False

    async def handle_query(self, sql: str, attrs: Dict[str, str]) -> AllowedResult:
        self.timestamp = datetime.now(tz=self.timezone())
        try:
            exprs: List[exp.Expression] = [
                e for e in sqlglot.parse(sql, read="mysql") if e
            ]
        except Exception as exc:
            raise MysqlError(
                f"SQL ayrıştırılamadı: {exc}", code=ErrorCode.PARSE_ERROR
            ) from exc
        if not exprs:
            return [], []
        result: AllowedResult = ([], [])
        for e in exprs:
            if self._framework_handled(e):
                # Temiz SQL'i çerçeveye ver (ifadenin kendisi middleware'de
                # değişime uğrayabilir; yeniden üretilmiş metin güvenlidir).
                result = await super().handle_query(e.sql(dialect="mysql"), attrs)
                self.last_ok = {}
            else:
                result = await self._run_sqlite(e)
        return result

    def _table_defaults(self, table: str) -> Any:
        """(sütun sırası, {sütun: varsayılan ifade}) — PRAGMA'dan, önbellekli."""
        if table not in self._defaults_cache:
            cols: List[str] = []
            dflts: Dict[str, exp.Expression] = {}
            try:
                safe = table.replace('"', '""')
                rows = self.sqlite.execute(
                    f'PRAGMA table_info("{safe}")'
                ).fetchall()
            except sqlite3.Error:
                rows = []
            for _cid, name, _decl, _nn, dflt, _pk in rows:
                cols.append(name)
                if dflt is None:
                    dflts[name] = exp.Null()
                else:
                    try:
                        dflts[name] = sqlglot.parse_one(str(dflt), read="sqlite")
                    except Exception:
                        dflts[name] = exp.Null()
            self._defaults_cache[table] = (cols, dflts)
        return self._defaults_cache[table]

    def _expand_insert_defaults(self, e: exp.Insert) -> exp.Insert:
        """VALUES içindeki DEFAULT'ları gerçek varsayılanlarla değiştirir.

        drizzle `values (default, ...)` üretir; SQLite (3.40) VALUES içinde
        DEFAULT anahtar sözcüğünü kabul etmez. INTEGER PK için NULL
        (otomatik artar), diğerleri için PRAGMA'daki varsayılan yazılır.
        """
        values = e.args.get("expression")
        if not isinstance(values, exp.Values):
            return e
        target = e.this
        if isinstance(target, exp.Schema) and isinstance(target.this, exp.Table):
            table = target.this.name
            columns: Optional[List[str]] = [i.name for i in target.expressions]
        elif isinstance(target, exp.Table):
            table = target.name
            columns = None  # PRAGMA sırası kullanılır
        else:
            return e
        order, dflts = self._table_defaults(table)
        if not order:
            return e  # tablo yok; sqlite zaten bağıracak
        if columns is None:
            columns = order
        for tup in values.expressions:
            if not isinstance(tup, exp.Tuple):
                continue
            for idx, val in enumerate(tup.expressions):
                if isinstance(val, exp.Var) and str(val.this).upper() == "DEFAULT":
                    col = columns[idx] if idx < len(columns) else None
                    repl = dflts.get(col, exp.Null()) if col else exp.Null()
                    tup.expressions[idx] = repl.copy()
        return e

    async def _run_sqlite(self, e: exp.Expression) -> AllowedResult:
        e = e.transform(_fix_now, copy=False)
        if isinstance(e, (exp.Create, exp.Drop, exp.Alter)):
            self._defaults_cache = {}
        if isinstance(e, exp.Insert):
            e = self._expand_insert_defaults(e)
        if isinstance(e, exp.Select) and e.args.get("lock") is not None:
            e = e.copy()
            e.set("lock", None)  # FOR UPDATE SQLite'ta yok; kilitsiz çalıştır
        if isinstance(e, exp.TruncateTable):
            target = e.this
            name = target.name if hasattr(target, "name") else str(target)
            lite = f'DELETE FROM "{name.replace(chr(34), chr(34) * 2)}"'
        else:
            try:
                lite = e.sql(dialect="sqlite")
            except Exception as exc:
                raise MysqlError(
                    f"SQLite'a çevrilemedi: {exc}", code=ErrorCode.NOT_SUPPORTED_YET
                ) from exc
        cur = self.sqlite.cursor()
        try:
            cur.execute(lite)
        except sqlite3.Error as exc:
            raise MysqlError(
                f"SQLite hatası: {exc} [SQL: {lite[:300]}]",
                code=ErrorCode.PARSE_ERROR,
            ) from exc
        self.sqlite.commit()
        if cur.description is not None:
            cols = [d[0] for d in cur.description]
            rows = [tuple(r) for r in cur.fetchall()]
            self.last_ok = {}
            return rows, cols
        affected = cur.rowcount if cur.rowcount and cur.rowcount > 0 else 0
        last_id = 0
        if isinstance(e, (exp.Insert, exp.Replace)) and cur.lastrowid:
            # drizzle $returningId(): çok satırlı INSERT'te MySQL İLK id'yi
            # döner; sqlite lastrowid SON satırdır → aralığın başını hesapla.
            last_id = (
                cur.lastrowid - affected + 1
                if affected > 1
                else cur.lastrowid
            )
        self.last_ok = {"affected_rows": affected, "last_insert_id": last_id}
        return [], []


class BridgeConnection(Connection):
    """Boş sonuçlarda OK paketine affected_rows/last_insert_id yazar."""

    async def handle_query(self, data: bytes) -> None:
        com_query = packets.parse_com_query(
            capabilities=self.capabilities,
            client_charset=self.client_charset,
            data=data,
        )
        result_set = await self.query(com_query.sql, com_query.query_attrs)
        if not result_set:
            extra: Dict[str, int] = {}
            last_ok = getattr(self.session, "last_ok", None)
            if isinstance(last_ok, dict):
                if last_ok.get("affected_rows"):
                    extra["affected_rows"] = int(last_ok["affected_rows"])
                if last_ok.get("last_insert_id"):
                    extra["last_insert_id"] = int(last_ok["last_insert_id"])
            await self.stream.write(self.ok(**extra))
            return
        await self.write_text_resultset(result_set)


class BridgeServer(MysqlServer):
    """BridgeConnection kullanan sunucu (isabetsiz kopya + sınıf değişimi)."""

    async def _client_connected_cb(  # type: ignore[override]
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        stream = MysqlStream(reader, writer)
        try:
            if inspect.iscoroutinefunction(self.session_factory):
                session = await self.session_factory()
            else:
                session = self.session_factory()
            connection = BridgeConnection(
                stream=stream,
                session=session,
                control=self.control,
                server_capabilities=self.capabilities,
                identity_provider=self.identity_provider,
                ssl=self.ssl,
            )
        except Exception:  # pylint: disable=broad-except
            logger.exception("Failed to create connection")
            await stream.write(
                packets.make_error(capabilities=self.capabilities)
            )
            return
        try:
            connection_id = await self.control.add(connection)
            connection.connection_id = connection_id
        except TooManyConnections:
            await stream.write(
                connection.error(
                    msg="Too many connections",
                    code=ErrorCode.CON_COUNT_ERROR,
                )
            )
            return
        except Exception:  # pylint: disable=broad-except
            logger.exception("Failed to register connection")
            await stream.write(connection.error(msg="Failed to register connection"))
            return
        try:
            return await connection.start()
        finally:
            writer.close()
            await self.control.remove(connection_id)


async def amain(args: argparse.Namespace) -> None:
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # mysql-mimic kendi loglarını kısık tutsun
    logging.getLogger("mysql_mimic").setLevel(logging.WARNING)
    db_path = os.path.abspath(args.db)
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    server = BridgeServer(
        session_factory=lambda: BridgeSession(db_path),
        identity_provider=BridgeAuth(args.password),
        control=LocalControl(),
    )
    await server.start_server(host=args.host, port=args.port)
    socks = ", ".join(str(s.getsockname()) for s in server.sockets())
    logger.info("MySQL köprüsü dinliyor: %s (db=%s)", socks, db_path)
    try:
        await server.serve_forever()
    except asyncio.CancelledError:
        pass
    finally:
        server.close()
        await server.wait_closed()


def main() -> None:
    parser = argparse.ArgumentParser(description="MySQL -> SQLite geliştirme köprüsü")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--db", default=DEFAULT_DB_PATH)
    parser.add_argument("--password", default="tuhafiye")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    try:
        asyncio.run(amain(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
