"""The check-up's content (questions, fixes, risks, standards, wording) in Postgres.

The JSON files in app/catalog/ are the source of truth: seed() writes them into the catalog schema when
they change, and load() reads them back in exactly the shape of the files, which is what the frontend
engine and the chatbot consume. seed() refuses to commit if the rows don't read back identical to the
files, so a new field the tables don't model fails the deploy instead of silently disappearing."""

import hashlib
import json
import threading
from pathlib import Path
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb

SOURCE_DIR = Path(__file__).parent / "catalog"
FILES = (
    "actions", "cccs", "cis", "ciosc", "impactRules", "profile", "prompts",
    "questions", "ranking", "rules", "scenarios", "supplyChain", "templates",
)

# Children before parents, so deletes never trip a foreign key.
TABLES = (
    "question_cccs", "question_cis", "action_questions", "rule_signs", "prompt_rows", "ladder_options",
    "supply_links", "profile_options", "cccs_requirements", "prompts", "questions", "actions", "sections",
    "scenarios", "supply_impacts", "profile_questions", "impact_rules", "cccs_controls", "cis_controls",
    "cis_safeguards", "ciosc_groups", "ciosc_sections", "report_templates", "frameworks", "settings", "meta",
)

SEED_LOCK = 7_331_001  # pg advisory lock id: one instance seeds at a time


class CatalogMismatch(RuntimeError):
    pass


def read_files(directory: Path = SOURCE_DIR) -> dict[str, Any]:
    return {name: json.loads((directory / f"{name}.json").read_text(encoding="utf-8")) for name in FILES}


def version_of(files: dict[str, Any]) -> str:
    canonical = json.dumps(files, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def stored_version(conn: Connection) -> str | None:
    row = conn.execute("select version from catalog.meta").fetchone()
    return row["version"] if row else None


def seed(conn: Connection, files: dict[str, Any]) -> bool:
    """Replaces the catalog with the files, in one transaction. No-op when the stored version matches.
    Returns True when it wrote."""
    version = version_of(files)
    if stored_version(conn) == version:
        return False
    with conn.transaction():
        conn.execute("select pg_advisory_xact_lock(%s)", (SEED_LOCK,))
        if stored_version(conn) == version:  # another instance seeded while we waited
            return False
        for table in TABLES:
            conn.execute(f"delete from catalog.{table}")
        _insert(conn, files)
        conn.execute("insert into catalog.meta (version) values (%s)", (version,))
        loaded = load(conn)
        if loaded != files:
            differing = sorted(k for k in files if loaded.get(k) != files[k])
            raise CatalogMismatch(f"Catalog rows do not read back as the source files: {', '.join(differing)}")
    return True


def _many(conn: Connection, sql: str, rows: list[tuple]) -> None:
    if rows:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)


def _jsonb(value: Any) -> Jsonb | None:
    return None if value is None else Jsonb(value)


def _insert(conn: Connection, f: dict[str, Any]) -> None:
    _many(conn, "insert into catalog.frameworks (id, source, url) values (%s, %s, %s)",
          [(k, f[k]["source"], f[k]["url"]) for k in ("cccs", "cis", "ciosc")])

    controls = f["cccs"]["controls"]
    _many(conn, "insert into catalog.cccs_controls (id, position, name, applies_if_profile, applies_if_in) values (%s, %s, %s, %s, %s)",
          [(c["id"], i, c["name"], c.get("appliesIf", {}).get("profile"), c.get("appliesIf", {}).get("in")) for i, c in enumerate(controls)])
    _many(conn, "insert into catalog.cccs_requirements (id, control_id, position, summary) values (%s, %s, %s, %s)",
          [(r["id"], c["id"], j, r["summary"]) for c in controls for j, r in enumerate(c["requirements"])])

    _many(conn, "insert into catalog.cis_controls (id, title) values (%s, %s)", list(f["cis"]["controls"].items()))
    _many(conn, "insert into catalog.cis_safeguards (id, position, title, ig) values (%s, %s, %s, %s)",
          [(s["id"], i, s["title"], s["ig"]) for i, s in enumerate(f["cis"]["safeguards"])])

    _many(conn, "insert into catalog.ciosc_groups (id, title) values (%s, %s)", list(f["ciosc"]["groups"].items()))
    _many(conn, "insert into catalog.ciosc_sections (id, position, name, cccs, questions, note) values (%s, %s, %s, %s, %s, %s)",
          [(s["id"], i, s["name"], s["cccs"], s.get("questions"), s.get("note")) for i, s in enumerate(f["ciosc"]["sections"])])

    _many(conn, "insert into catalog.report_templates (id, position, name, tagline, best_for, reports_on) values (%s, %s, %s, %s, %s, %s)",
          [(t["id"], i, t["name"], t["tagline"], t["bestFor"], t["reportsOn"]) for i, t in enumerate(f["templates"])])

    _many(conn, """insert into catalog.scenarios (id, position, name, short, phrase, description, category, base, chain)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
          [(s["id"], i, s["name"], s["short"], s["phrase"], s["description"], s["category"], Jsonb(s["base"]), Jsonb(s["chain"]))
           for i, s in enumerate(f["scenarios"])])

    supply = f["supplyChain"]
    _many(conn, "insert into catalog.supply_impacts (id, position, label, description) values (%s, %s, %s, %s)",
          [(m["id"], i, m["label"], m["description"]) for i, m in enumerate(supply["impacts"])])
    _many(conn, "insert into catalog.supply_links (scenario_id, impact_id, position, weight) values (%s, %s, %s, %s)",
          [(sid, iid, j, w) for sid, links in supply["links"].items() for j, (iid, w) in enumerate(links.items())])

    _many(conn, "insert into catalog.profile_questions (id, position, text, why) values (%s, %s, %s, %s)",
          [(q["id"], i, q["text"], q["why"]) for i, q in enumerate(f["profile"])])
    _many(conn, "insert into catalog.profile_options (question_id, value, position, label, icon) values (%s, %s, %s, %s, %s)",
          [(q["id"], o["value"], j, o["label"], o.get("icon")) for q in f["profile"] for j, o in enumerate(q["options"])])

    impact = f["impactRules"]
    _many(conn, "insert into catalog.impact_rules (position, profile, values_in, label, modifiers) values (%s, %s, %s, %s, %s)",
          [(i, r["profile"], r["in"], r["label"], Jsonb(r["modifiers"])) for i, r in enumerate(impact["rules"])])

    _many(conn, "insert into catalog.sections (id, position, title, intro) values (%s, %s, %s, %s)",
          [(s["id"], i, s["title"], s["intro"]) for i, s in enumerate(f["questions"]["sections"])])
    questions = f["questions"]["questions"]
    _many(conn, """insert into catalog.questions (id, position, section_id, topic, text, why, gap_label, tech, weights,
                     impact_reduction, mapping_note, show_if_profile, show_if_in, auto_from)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
          [(q["id"], i, q["section"], q["topic"], q["text"], q["why"], q["gapLabel"], q["tech"], Jsonb(q["weights"]),
            _jsonb(q.get("impactReduction")), q.get("mappingNote"), (q.get("showIf") or {}).get("profile"),
            (q.get("showIf") or {}).get("in"), q.get("autoFrom"))
           for i, q in enumerate(questions)])
    _many(conn, "insert into catalog.question_cccs (question_id, control_id, position, reqs, strength) values (%s, %s, %s, %s, %s)",
          [(q["id"], m["control"], j, m["reqs"], m["strength"]) for q in questions for j, m in enumerate(q["cccs"])])
    _many(conn, "insert into catalog.question_cis (question_id, safeguard_id, position, strength) values (%s, %s, %s, %s)",
          [(q["id"], m["safeguard"], j, m["strength"]) for q in questions for j, m in enumerate(q["cis"])])

    prompts = f["prompts"]["prompts"]
    _many(conn, "insert into catalog.prompts (id, position, section_id, type, title, why, questions) values (%s, %s, %s, %s, %s, %s, %s)",
          [(p["id"], i, p["section"], p["type"], p["title"], p["why"], p.get("questions") if p["type"] == "ladder" else None)
           for i, p in enumerate(prompts)])
    _many(conn, """insert into catalog.prompt_rows (prompt_id, question_id, position, label, label_basic, label_by_sector, label_when, options, na)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
          [(p["id"], r["question"], j, r["label"], r.get("labelBasic"), _jsonb(r.get("labelBySector")), _jsonb(r.get("labelWhen")),
            Jsonb(r["options"]), r.get("na"))
           for p in prompts if p["type"] == "rows" for j, r in enumerate(p["rows"])])
    _many(conn, "insert into catalog.ladder_options (prompt_id, position, label, sets) values (%s, %s, %s, %s)",
          [(p["id"], j, o["label"], Jsonb(o["sets"])) for p in prompts if p["type"] == "ladder" for j, o in enumerate(p["options"])])

    actions = f["actions"]
    _many(conn, """insert into catalog.actions (id, position, title, what_to_do, why, steps, steps_by_provider, cost, time, effort)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
          [(a["id"], i, a["title"], a["whatToDo"], a["why"], a["steps"], _jsonb(a.get("stepsByProvider")), a["cost"], a["time"], a["effort"])
           for i, a in enumerate(actions)])
    _many(conn, "insert into catalog.action_questions (action_id, question_id, position) values (%s, %s, %s)",
          [(a["id"], qid, j) for a in actions for j, qid in enumerate(a["questionIds"])])

    _many(conn, """insert into catalog.rule_signs (action_id, position, title, lead, must, approvers, warnings, contacts, log_title, log_columns)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
          [(r["actionId"], i, r["title"], r["lead"], r["must"], r.get("approvers"), r.get("warnings"), _jsonb(r.get("contacts")),
            r.get("logTitle"), r.get("logColumns"))
           for i, r in enumerate(f["rules"])])

    _many(conn, "insert into catalog.settings (key, value) values (%s, %s)", [
        ("impact", Jsonb({k: impact[k] for k in ("start", "min", "max")})),
        ("ranking", Jsonb(f["ranking"])),
        ("promptIntro", Jsonb(f["prompts"]["intro"])),
        ("quickCheck", Jsonb(f["prompts"]["quick"])),
    ])


def _put(target: dict, key: str, value: Any) -> dict:
    """Optional fields are absent from the files rather than null."""
    if value is not None:
        target[key] = value
    return target


def _rows(conn: Connection, sql: str) -> list[dict]:
    return conn.execute(sql).fetchall()


def _group(rows: list[dict], key: str) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for r in rows:
        out.setdefault(r[key], []).append(r)
    return out


def load(conn: Connection) -> dict[str, Any]:
    """The whole catalog, in the shape of the source files."""
    frameworks = {r["id"]: {"source": r["source"], "url": r["url"]} for r in _rows(conn, "select * from catalog.frameworks")}
    settings = {r["key"]: r["value"] for r in _rows(conn, "select * from catalog.settings")}

    reqs = _group(_rows(conn, "select * from catalog.cccs_requirements order by control_id, position"), "control_id")
    cccs = {
        **frameworks["cccs"],
        "controls": [
            _put(
                {"id": c["id"], "name": c["name"], "requirements": [{"id": r["id"], "summary": r["summary"]} for r in reqs.get(c["id"], [])]},
                "appliesIf", {"profile": c["applies_if_profile"], "in": c["applies_if_in"]} if c["applies_if_profile"] else None,
            )
            for c in _rows(conn, "select * from catalog.cccs_controls order by position")
        ],
    }

    cis = {
        **frameworks["cis"],
        "controls": {r["id"]: r["title"] for r in _rows(conn, "select * from catalog.cis_controls order by id::int")},
        "safeguards": [{"id": s["id"], "title": s["title"], "ig": s["ig"]} for s in _rows(conn, "select * from catalog.cis_safeguards order by position")],
    }

    ciosc = {
        **frameworks["ciosc"],
        "groups": {r["id"]: r["title"] for r in _rows(conn, "select * from catalog.ciosc_groups order by id::int")},
        "sections": [
            _put(_put({"id": s["id"], "name": s["name"], "cccs": s["cccs"]}, "questions", s["questions"]), "note", s["note"])
            for s in _rows(conn, "select * from catalog.ciosc_sections order by position")
        ],
    }

    templates = [
        {"id": t["id"], "name": t["name"], "tagline": t["tagline"], "bestFor": t["best_for"], "reportsOn": t["reports_on"]}
        for t in _rows(conn, "select * from catalog.report_templates order by position")
    ]

    scenarios = [
        {k: s[k] for k in ("id", "name", "short", "phrase", "description", "category", "base", "chain")}
        for s in _rows(conn, "select * from catalog.scenarios order by position")
    ]

    links: dict[str, dict[str, float]] = {}
    for r in _rows(conn, "select l.* from catalog.supply_links l join catalog.scenarios s on s.id = l.scenario_id order by s.position, l.position"):
        links.setdefault(r["scenario_id"], {})[r["impact_id"]] = r["weight"]
    supply_chain = {
        "impacts": [{"id": m["id"], "label": m["label"], "description": m["description"]} for m in _rows(conn, "select * from catalog.supply_impacts order by position")],
        "links": links,
    }

    options = _group(_rows(conn, "select * from catalog.profile_options order by question_id, position"), "question_id")
    profile = [
        {"id": q["id"], "text": q["text"], "why": q["why"],
         "options": [_put({"value": o["value"], "label": o["label"]}, "icon", o["icon"]) for o in options.get(q["id"], [])]}
        for q in _rows(conn, "select * from catalog.profile_questions order by position")
    ]

    impact_rules = {
        **settings["impact"],
        "rules": [
            {"profile": r["profile"], "in": r["values_in"], "label": r["label"], "modifiers": r["modifiers"]}
            for r in _rows(conn, "select * from catalog.impact_rules order by position")
        ],
    }

    q_cccs = _group(_rows(conn, "select * from catalog.question_cccs order by question_id, position"), "question_id")
    q_cis = _group(_rows(conn, "select * from catalog.question_cis order by question_id, position"), "question_id")
    questions = []
    for q in _rows(conn, "select * from catalog.questions order by position"):
        item = {
            "id": q["id"], "section": q["section_id"], "topic": q["topic"], "text": q["text"], "why": q["why"],
            "gapLabel": q["gap_label"], "tech": q["tech"], "weights": q["weights"],
            "cccs": [{"control": m["control_id"], "reqs": m["reqs"], "strength": m["strength"]} for m in q_cccs.get(q["id"], [])],
            "cis": [{"safeguard": m["safeguard_id"], "strength": m["strength"]} for m in q_cis.get(q["id"], [])],
        }
        _put(item, "impactReduction", q["impact_reduction"])
        _put(item, "mappingNote", q["mapping_note"])
        _put(item, "showIf", {"profile": q["show_if_profile"], "in": q["show_if_in"]} if q["show_if_profile"] else None)
        _put(item, "autoFrom", q["auto_from"])
        questions.append(item)
    sections = [{"id": s["id"], "title": s["title"], "intro": s["intro"]} for s in _rows(conn, "select * from catalog.sections order by position")]

    rows = _group(_rows(conn, "select * from catalog.prompt_rows order by prompt_id, position"), "prompt_id")
    ladder = _group(_rows(conn, "select * from catalog.ladder_options order by prompt_id, position"), "prompt_id")
    prompts = []
    for p in _rows(conn, "select * from catalog.prompts order by position"):
        item = {"id": p["id"], "section": p["section_id"], "type": p["type"], "title": p["title"], "why": p["why"]}
        if p["type"] == "rows":
            item["rows"] = []
            for r in rows.get(p["id"], []):
                row = {"question": r["question_id"], "label": r["label"], "options": r["options"]}
                _put(row, "labelBySector", r["label_by_sector"])
                _put(row, "labelWhen", r["label_when"])
                _put(row, "na", r["na"])
                _put(row, "labelBasic", r["label_basic"])
                item["rows"].append(row)
        else:
            item["questions"] = p["questions"]
            item["options"] = [{"label": o["label"], "sets": o["sets"]} for o in ladder.get(p["id"], [])]
        prompts.append(item)

    action_qs = _group(_rows(conn, "select * from catalog.action_questions order by action_id, position"), "action_id")
    actions = []
    for a in _rows(conn, "select * from catalog.actions order by position"):
        item = {"id": a["id"], "title": a["title"], "whatToDo": a["what_to_do"], "why": a["why"], "steps": a["steps"]}
        _put(item, "stepsByProvider", a["steps_by_provider"])
        item.update(cost=a["cost"], time=a["time"], effort=a["effort"], questionIds=[r["question_id"] for r in action_qs.get(a["id"], [])])
        actions.append(item)

    rules = []
    for r in _rows(conn, "select * from catalog.rule_signs order by position"):
        item = {"actionId": r["action_id"], "title": r["title"], "lead": r["lead"], "must": r["must"]}
        for key, col in (("approvers", "approvers"), ("warnings", "warnings"), ("contacts", "contacts"), ("logTitle", "log_title"), ("logColumns", "log_columns")):
            _put(item, key, r[col])
        rules.append(item)

    return {
        "actions": actions,
        "cccs": cccs,
        "cis": cis,
        "ciosc": ciosc,
        "impactRules": impact_rules,
        "profile": profile,
        "prompts": {"intro": settings["promptIntro"], "quick": settings["quickCheck"], "prompts": prompts},
        "questions": {"sections": sections, "questions": questions},
        "ranking": settings["ranking"],
        "rules": rules,
        "scenarios": scenarios,
        "supplyChain": supply_chain,
        "templates": templates,
    }


# ---------- in-process cache ----------
# The catalog changes only when a deploy reseeds it, so each process keeps one copy (plus its
# serialized JSON for GET /api/catalog) and re-reads only when catalog.meta.version moves.

class Snapshot:
    def __init__(self, version: str, data: dict[str, Any]):
        self.version = version
        self.data = data
        self.json = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
        self.questions = {q["id"]: q for q in data["questions"]["questions"]}
        self.actions = {a["id"]: a for a in data["actions"]}


_current: Snapshot | None = None
_lock = threading.Lock()


def current(conn: Connection) -> Snapshot:
    """The catalog as stored, re-read if another deploy has reseeded it since this process loaded it."""
    global _current
    version = stored_version(conn)
    if version is None:
        raise RuntimeError("Catalog has not been seeded")
    if _current is None or _current.version != version:
        with _lock:
            if _current is None or _current.version != version:
                _current = Snapshot(version, load(conn))
    return _current


def cached() -> Snapshot:
    """The last catalog this process loaded. Set at startup."""
    if _current is None:
        raise RuntimeError("Catalog not loaded")
    return _current


def set_cached(snapshot: Snapshot) -> None:
    global _current
    _current = snapshot
