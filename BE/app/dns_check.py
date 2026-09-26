"""MX / SPF / DMARC lookup. Output matches the FE's DnsResult (FE/src/engine/dns.ts)."""
import re

import dns.exception
import dns.resolver

_resolver = dns.resolver.Resolver(configure=False)
_resolver.nameservers = ["1.1.1.1", "8.8.8.8"]
_resolver.lifetime = 3.0

_DOMAIN_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


def normalize_domain(value: str) -> str:
    d = value.strip().lower()
    if "@" in d:
        d = d.rsplit("@", 1)[1]
    d = re.sub(r"^[a-z]+://", "", d).split("/")[0]
    return d.removeprefix("www.").rstrip(".")


def is_valid_domain(d: str) -> bool:
    return bool(_DOMAIN_RE.match(d))


def _query(name: str, rtype: str) -> list[str] | None:
    """Records as strings, [] if the name/record doesn't exist, None if the lookup failed."""
    try:
        answer = _resolver.resolve(name, rtype)
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
        return []
    except dns.exception.DNSException:
        return None
    if rtype == "TXT":
        return [b"".join(r.strings).decode(errors="replace") for r in answer]
    return [r.to_text() for r in answer]


def provider_from_mx(records: list[str]) -> str | None:
    if not records:
        return None
    joined = " ".join(records).lower()
    if "outlook.com" in joined:
        return "m365"
    if "google.com" in joined or "googlemail.com" in joined:
        return "google"
    return "other"


def parse_dmarc_policy(record: str) -> str | None:
    m = re.search(r"(?:^|;)\s*p\s*=\s*([a-z]+)", record, re.I)
    return m.group(1).lower() if m else None


def check_domain(domain: str) -> dict:
    mx, txt, dmarc_txt = _query(domain, "MX"), _query(domain, "TXT"), _query(f"_dmarc.{domain}", "TXT")
    spf = next((t for t in txt or [] if t.lower().startswith("v=spf1")), None)
    dmarc = next((t for t in dmarc_txt or [] if t.lower().startswith("v=dmarc1")), None)
    return {
        "domain": domain,
        "mx": {"status": "error", "records": [], "provider": None}
        if mx is None
        else {"status": "ok" if mx else "missing", "records": mx, "provider": provider_from_mx(mx)},
        "spf": {"status": "error", "record": None} if txt is None else {"status": "ok" if spf else "missing", "record": spf},
        "dmarc": {"status": "error", "record": None, "policy": None}
        if dmarc_txt is None
        else {"status": "ok" if dmarc else "missing", "record": dmarc, "policy": parse_dmarc_policy(dmarc) if dmarc else None},
    }


def all_failed(result: dict) -> bool:
    return all(result[k]["status"] == "error" for k in ("mx", "spf", "dmarc"))
