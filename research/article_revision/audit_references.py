"""Read DOI registry metadata and retain evidence for a manuscript bibliography."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from urllib.parse import quote
from urllib.request import Request, urlopen


def audit(doi):
    record = {"doi": doi, "checked_utc": datetime.now(timezone.utc).isoformat()}
    for registry, url in [("Crossref", "https://api.crossref.org/works/"+quote(doi, safe="")),
                          ("DataCite", "https://api.datacite.org/dois/"+quote(doi, safe=""))]:
        try:
            request = Request(url, headers={"User-Agent": "sslope-manuscript-bibliography-audit/1.0", "Accept": "application/json"})
            with urlopen(request, timeout=30) as response:
                payload = json.load(response)
            metadata = payload["message"] if registry == "Crossref" else payload["data"]["attributes"]
            record.update(status="registered", registry=registry, endpoint=url, metadata=metadata)
            return record
        except Exception as exc:
            record.setdefault("attempts", []).append({"registry": registry, "error": str(exc)})
    record["status"] = "unverified"
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--text", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    dois = set(re.findall(r"https://doi\.org/([^\s]+)", args.text.read_text()))
    dois.update(["10.5281/zenodo.15003054", "10.26443/seismica.v5i1.1902", "10.1007/s10994-020-05910-7", "10.1214/aos/1176347265"])
    with ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(audit, sorted(d.strip(".,;") for d in dois)))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, indent=2, ensure_ascii=False)+"\n")
    for r in records:
        meta = r.get("metadata", {})
        print(r["doi"], r["status"], meta.get("title", meta.get("titles")), flush=True)


if __name__ == "__main__":
    main()
