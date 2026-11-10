"""Retain primary public-source evidence without claiming a release exists."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
from hashlib import sha256
import json
from pathlib import Path
import time
from urllib.parse import quote
from urllib.request import Request,urlopen


def fetch(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url,headers={'User-Agent':'sslope-independent-review-audit/2.0','Accept':'application/json, text/html, */*'}),timeout=25) as r:return r.read()
        except Exception:
            if attempt==2:raise
            time.sleep(2+attempt)


def main(out):
    out.mkdir(parents=True,exist_ok=True)
    doi_list=['10.1023/A:1010933404324','10.1214/aos/1013203451','10.1145/3292500.3330701','10.3115/v1/D14-1179']
    def registry(doi):
        url='https://api.crossref.org/works/'+quote(doi,safe='')
        metadata=json.loads(fetch(url))['message']
        record={'doi':doi,'endpoint':url,'checked_utc':datetime.now(timezone.utc).isoformat(),'status':'registered','metadata':metadata}
        print('Verified DOI',doi,flush=True);return record
    with ThreadPoolExecutor(max_workers=2) as pool:records=list(pool.map(registry,doi_list))
    (out/'method-reference-audit.json').write_text(json.dumps(records,indent=2)+'\n')
    repo=json.loads(fetch('https://api.github.com/repos/RobertoA1/sslope'))
    commit=json.loads(fetch('https://api.github.com/repos/RobertoA1/sslope/commits/main'))
    zen=json.loads(fetch('https://zenodo.org/api/records/15003054'))
    result={'checked_utc':datetime.now(timezone.utc).isoformat(),
            'repository':{k:repo.get(k) for k in ['html_url','private','default_branch','pushed_at']},
            'public_main_commit':commit['sha'],
            'release_scope':'The public repository is verified. Its current main commit is not automatically a public deposit of the new local revision; no software DOI is claimed.',
            'dataset':{'doi':zen['doi'],'title':zen['metadata']['title'],'license':zen['metadata']['license'],'files':zen['files']}}
    (out/'public-access-audit.json').write_text(json.dumps(result,indent=2)+'\n')
    sources={
      'journal-ethics.pdf':'https://hrcak.srce.hr/upute/etika_en_The_Mining-Geological-Petroleum_Engineering_Bulletin.pdf',
      'journal-submissions.html':'https://ojs.srce.hr/index.php/rgn/about/submissions',
      'keras-citation.html':'https://keras.io/getting_started/faq/',
      'tensorflow-citation.html':'https://www.tensorflow.org/about/bib',
      'scikit-learn-citation.html':'https://www.jmlr.org/papers/v12/pedregosa11a.html'}
    files=[]
    for name,url in sources.items():
        data=fetch(url);(out/name).write_bytes(data)
        files.append({'file':name,'url':url,'sha256':sha256(data).hexdigest()})
    (out/'primary-source-files.json').write_text(json.dumps(files,indent=2)+'\n')
    print(json.dumps({'new_registered_dois':len(records),'repository_public':not repo['private'],'dataset_doi':zen['doi'],'primary_files':len(files)}),flush=True)


if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,required=True);main(ap.parse_args().output)
