import pytest


@pytest.fixture(scope="session")
def c():
    # One app for the whole run: the DB pool opens once per process, as in production.
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        yield client
