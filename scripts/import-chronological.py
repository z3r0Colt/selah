#!/usr/bin/env python3
"""Download/transcribe the published BLB chronological reference sequence.
Requires Poppler pdftotext. No historical order is computed or invented.
"""
from pathlib import Path
import hashlib,json,re,subprocess,urllib.request
ROOT=Path(__file__).resolve().parents[1]
cache=ROOT/'.cache/bibles';cache.mkdir(parents=True,exist_ok=True)
url='https://www.blueletterbible.org/assets/pdf/dbrp/1Yr_ChronologicalPlan.pdf'
pdf=cache/'chronological.pdf'
if not pdf.exists():urllib.request.urlretrieve(url,pdf)
text=subprocess.check_output(['pdftotext','-raw',str(pdf),'-']).decode()
idx=json.loads((ROOT/'public/bibles/index.json').read_text())
books={b['name']:(b['id'],b['chapters']) for b in idx['books']};books['Psalm']=books['Psalms']
days={};day=None
for line in text.splitlines():
 line=line.strip();m=re.match(r'^(\d+)\. (.+)$',line)
 if m:day=int(m[1]);days[day]=m[2]
 elif day and line:days[day]+=' '+line
assert list(days)==list(range(1,366))
assignments=[];allchap=[]
for d,label in days.items():
 text=label.replace('1 & 2 Thessalonians','1 Thessalonians; 2 Thessalonians').replace('2, 3 John','2 John; 3 John').replace('Colossians, Philemon','Colossians; Philemon').replace('2 Peter, Jude','2 Peter; Jude')
 chapters=[]
 for part in text.split(';'):
  part=part.strip();name=next((n for n in sorted(books,key=len,reverse=True) if part==n or part.startswith(n+' ')),None)
  assert name,(d,part)
  b,count=books[name];nums=part[len(name):].strip() or f'1-{count}'
  for v in nums.split(','):
   rng=v.strip().split('-');start=int(rng[0]);end=int(rng[-1]);assert 1<=start<=end<=count,(d,part)
   chapters.extend({'book':b,'chapter':c} for c in range(start,end+1))
 assignments.append({'day':d,'label':label,'chapters':chapters});allchap.extend((v['book'],v['chapter']) for v in chapters)
assert len(set(allchap))==len(allchap)==1189
out={'id':'chronological','name':'Chronological Bible in one year','days':365,'source':'Blue Letter Bible: Daily Bible Reading Program — Chronological Plan','sourceUrl':url,'sourceSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'retrieved':'2026-11-07','assignments':assignments}
(ROOT/'public/plans').mkdir(exist_ok=True)
(ROOT/'public/plans/chronological.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
print('Verified 365 days; all 1189 canonical chapters appear exactly once.')
