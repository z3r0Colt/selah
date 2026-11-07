#!/usr/bin/env python3
"""Validate generated assets against their manifest and cached source snapshots."""
from pathlib import Path
import hashlib,json,re
R=Path(__file__).resolve().parents[1]
index=json.loads((R/'public/bibles/index.json').read_text())
assert len(index['books'])==66
for t in index['translations']:
 count=0
 for b in index['books']:
  for c in range(1,b['chapters']+1):
   ch=json.loads((R/f'public/bibles/{t["id"]}/{b["id"]}/{c}.json').read_text())
   assert (ch['translation'],ch['book'],ch['chapter'])==(t['id'],b['id'],c)
   assert len(ch['verses'])==t['chapterVerseCounts'][f'{b["id"]}:{c}']
   labels=[v['verse'] for v in ch['verses']]
   assert labels==sorted(set(labels))
   for v in ch['verses']:
    assert v['text']==re.sub(r'\s+',' ',''.join(x['text'] for x in v['segments'])).strip()
    assert v['text'] or v.get('sourceEmpty')
    assert '\\v ' not in v['text']
   count+=len(ch['verses'])
 assert count==t['verses']==31102
 cached=R/'.cache/bibles'/t['file']
 if cached.exists():assert hashlib.sha256(cached.read_bytes()).hexdigest()==t['sha256']
 print(f'{t["id"]}: verified 66 books, 1189 chapters, {count} verse records')
# Two well-known references guard against book-ID/verse-offset errors, using exact publisher content.
k=json.loads((R/'public/bibles/KJV/1/1.json').read_text())
assert k['verses'][0]['text']=='In the beginning God created the heaven and the earth.'
a=json.loads((R/'public/bibles/ASV/40/17.json').read_text())
assert next(v for v in a['verses'] if v['verse']==21)['sourceEmpty']
print('Scripture integrity checks passed.')
