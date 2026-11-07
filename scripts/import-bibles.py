#!/usr/bin/env python3
"""Import publisher Scripture files. No AI text, corrections, or verse filling.
Uses Python standard library. --refresh downloads; default reuses .cache/bibles.
The source archives are retained in cache; hashes and verse counts are published.
"""
from pathlib import Path
import argparse, collections, datetime, hashlib, json, re, urllib.request, zipfile
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/bibles'
CACHE=ROOT/'.cache/bibles'
CODES='GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split()
NAMES='Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation'.split('|')
COUNTS=[50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22]
SOURCES={
'KJV':{'name':'King James Version','url':'https://ebible.org/Scriptures/eng-kjv_usfx.zip','file':'kjv-usfx.zip','format':'usfx','publisher':'eBible.org','license':'Public domain (UK Crown rights may apply in the United Kingdom).'},
'ASV':{'name':'American Standard Version','url':'https://ebible.org/Scriptures/eng-asv_usfx.zip','file':'asv-usfx.zip','format':'usfx','publisher':'eBible.org','license':'Public domain'},
'BSB':{'name':'Berean Standard Bible','url':'https://bereanbible.com/bsb.txt','file':'bsb.txt','format':'tsv','publisher':'Berean Bible Translation Committee','license':'Dedicated to the public domain; https://berean.bible/licensing.htm'},
'BLB':{'name':'Berean Literal Bible (Draft)','url':'https://literalbible.com/blb.txt','file':'blb.txt','format':'tsv','publisher':'Berean Bible Translation Committee','draft':True,'license':'Dedicated to the public domain. Early draft, subject to publisher revision.'}}
def norm(s):return re.sub(r'\s+',' ',s).strip()
def dump(path,obj):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':')),encoding='utf8')
class Importer:
 def __init__(self,key):self.key=key;self.chapters={};self.chapter=None;self.current=None;self.pending=False;self.expected=collections.Counter()
 def start_chapter(self,b,c):
  self.chapter=self.chapters.setdefault((b,int(c)),{'translation':self.key,'book':b,'chapter':int(c),'verses':[],'headings':[]});self.current=None
 def verse(self,n):
  assert str(n).isdigit(),f'Unsupported verse label {n}; never silently coerce'
  n=int(n);self.expected[(self.chapter['book'],self.chapter['chapter'])]+=1
  assert n not in [v['verse'] for v in self.chapter['verses']],f'Duplicate verse {n}'
  self.current={'verse':n,'text':'','segments':[],'paragraph':self.pending};self.pending=False;self.chapter['verses'].append(self.current)
 def text(self,s,italic=False):
  if not s or self.current is None:return
  s=re.sub(r'\s+',' ',s)
  seg=self.current['segments']
  if seg and seg[-1].get('italic',False)==italic and not seg[-1].get('lineBreak'):seg[-1]['text']+=s
  else:seg.append({'text':s,**({'italic':True} if italic else {})})
 def heading(self,node,kind):
  if self.chapter is not None:self.chapter['headings'].append({'text':norm(''.join(node.itertext())),'kind':kind,'beforeVerse':len(self.chapter['verses'])+1})
 def walk(self,node,italic=False):
  tag=node.tag;style=node.get('style','')
  if tag in ('c','chapter'):
   if node.get('eid'):return
   self.start_chapter(self.book,node.get('id') or node.get('number'));return
  if tag in ('v','verse'):
   if node.get('eid'):self.current=None;return
   self.verse(node.get('id') or node.get('number'));return
  if tag=='ve':self.current=None;return
  if tag in ('f','x','note'):
   if self.current is not None:self.current.setdefault('notes',[]).append(norm(''.join(node.itertext())))
   return
  if tag in ('fig','figure'):return
  if tag in ('h','toc','id','book','ide') and tag!='book':return
  if tag=='d' or style=='d':self.heading(node,'psalm-title');return
  if tag=='s' or (tag in ('p','para') and (re.match(r'^(s[0-9]*|ms[0-9]*)$',style) or style=='r')):self.heading(node,'editorial');return
  if style.startswith(('mt','imt','is','ip','toc')) or style=='h':return
  if tag in ('p','q','para') and self.chapter:
   self.pending=True
   if self.current:
    self.text(' ')
    self.current['segments'].append({'text':'','lineBreak':True})
  italic=italic or tag in ('add','it') or (tag=='char' and style in ('add','it'))
  self.text(node.text,italic)
  for child in node:
   self.walk(child,italic);self.text(child.tail,italic)
 def finish(self):
  for (b,c),ch in self.chapters.items():
   assert len(ch['verses'])==self.expected[(b,c)]
   for v in ch['verses']:
    # XML formatting whitespace is normalized; all lexical content stays verbatim.
    v['text']=norm(''.join(s['text'] for s in v['segments']))
    if not v['text']:v['sourceEmpty']=True
    # trim only the outer whitespace; retain internal supplied-word spans/line breaks
    for s in v['segments']:
     if s['text']:s['text']=s['text'].lstrip();break
    for s in reversed(v['segments']):
     if s['text']:s['text']=s['text'].rstrip();break
   dump(OUT/self.key/str(b)/f'{c}.json',ch)
  for b,count in enumerate(COUNTS,1):assert sorted(c for book,c in self.chapters if book==b)==list(range(1,count+1)),f'Missing chapter {self.key} {b}'
  assert len(self.chapters)==1189
  return sum(len(c['verses']) for c in self.chapters.values())
def main():
 p=argparse.ArgumentParser();p.add_argument('--refresh',action='store_true');args=p.parse_args();CACHE.mkdir(parents=True,exist_ok=True)
 reports=[]
 for key,meta in SOURCES.items():
  path=CACHE/meta['file']
  if args.refresh or not path.exists():urllib.request.urlretrieve(meta['url'],path)
  raw=path.read_bytes();imp=Importer(key)
  if meta['format']=='usfx':
   z=zipfile.ZipFile(path);root=ET.fromstring(z.read(next(n for n in z.namelist() if n.endswith('_usfx.xml'))))
   for node in root:
    code=node.get('id')
    if code not in CODES:continue
    imp.book=CODES.index(code)+1
    for child in node:imp.walk(child)
  elif meta['format']=='usx':
   z=zipfile.ZipFile(path)
   for code in CODES:
    imp.book=CODES.index(code)+1;root=ET.fromstring(z.read(next(n for n in z.namelist() if n.endswith('/'+code+'.usx'))))
    for child in root:
     if child.tag!='book':imp.walk(child)
  else:
   aliases={n:i+1 for i,n in enumerate(NAMES)};aliases.update({'Psalm':19,'Song of Songs':22})
   for line in raw.decode('utf-8-sig').splitlines():
    m=re.match(r'^(.+) (\d+):(\d+)\t(.*)$',line)
    if not m:continue
    name,c,v,text=m.groups();b=aliases[name]
    if not imp.chapter or (imp.chapter['book'],imp.chapter['chapter'])!=(b,int(c)):imp.start_chapter(b,c)
    imp.verse(v);imp.text(text)
  count=imp.finish();report={**meta,'id':key,'sha256':hashlib.sha256(raw).hexdigest(),'sourceBytes':len(raw),'retrieved':datetime.datetime.now(datetime.timezone.utc).date().isoformat(),'books':66,'chapters':1189,'verses':count,'chapterVerseCounts':{f'{b}:{c}':len(ch['verses']) for (b,c),ch in imp.chapters.items()}}
  reports.append(report);print(key,count,report['sha256'])
 dump(OUT/'index.json',{'schemaVersion':1,'books':[{'id':i+1,'code':code,'name':NAMES[i],'chapters':COUNTS[i]} for i,code in enumerate(CODES)],'translations':reports})
if __name__=='__main__':main()
