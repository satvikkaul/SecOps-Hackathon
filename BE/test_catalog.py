"""Needs a real Postgres: DATABASE_URL=postgresql://... pytest test_catalog.py"""
import copy
import os

import psycopg
import pytest
from psycopg.rows import dict_row

from app import catalog, chat

FILES = catalog.read_files()


@pytest.fixture()
def conn(c):
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, row_factory=dict_row) as connection:
        yield connection


def test_rows_read_back_as_the_source_files(conn):
    assert catalog.stored_version(conn) == catalog.version_of(FILES)
    assert catalog.load(conn) == FILES


def test_seed_is_a_no_op_when_nothing_changed(conn):
    assert catalog.seed(conn, FILES) is False


def test_a_field_the_tables_do_not_model_is_rejected_and_rolled_back(conn):
    changed = copy.deepcopy(FILES)
    changed["actions"][0]["newField"] = "not stored anywhere"
    with pytest.raises(catalog.CatalogMismatch, match="actions"):
        catalog.seed(conn, changed)
    assert catalog.stored_version(conn) == catalog.version_of(FILES)
    assert catalog.load(conn) == FILES


def test_a_content_change_is_reseeded(conn):
    changed = copy.deepcopy(FILES)
    changed["actions"][0]["title"] = "Edited title"
    try:
        assert catalog.seed(conn, changed) is True
        assert catalog.load(conn)["actions"][0]["title"] == "Edited title"
        assert catalog.current(conn).actions[changed["actions"][0]["id"]]["title"] == "Edited title"
    finally:
        catalog.seed(conn, FILES)
        catalog.current(conn)


def test_catalog_endpoint_with_etag(c):
    first = c.get("/api/catalog")
    assert first.status_code == 200
    assert first.json() == FILES
    etag = first.headers["etag"]
    assert etag == f'"{catalog.version_of(FILES)}"'
    assert first.headers["cache-control"] == "no-cache"

    again = c.get("/api/catalog", headers={"If-None-Match": etag})
    assert again.status_code == 304 and again.content == b""
    assert c.get("/api/catalog", headers={"If-None-Match": '"stale"'}).status_code == 200


def test_single_question_and_action(c):
    q26 = c.get("/api/catalog/questions/Q26")
    assert q26.status_code == 200 and q26.json()["id"] == "Q26"
    a19 = c.get("/api/catalog/actions/A19")
    assert a19.status_code == 200 and a19.json()["questionIds"] == ["Q26"]
    assert c.get("/api/catalog/questions/Q999").status_code == 404
    assert c.get("/api/catalog/actions/A999").status_code == 404


def test_chat_tools_read_the_seeded_catalog(c):
    assert chat.lookup_action("A19")["id"] == "A19"
    assert chat.explain_question("Q26")["id"] == "Q26"
