"""Build the complete searchable catalog and exports; fail on lost source records.

The catalog keeps original batch wording, translations and repeated submissions.
Unverified OCR and superseded single-file text remain labeled source records,
never pronunciation exercises. No canonical IDs or progress are rewritten.
"""
import argparse
import collections
import csv
import datetime
import hashlib
import json
import re
from pathlib import Path
from import_note_batch import normalize

ROOT = Path(__file__).resolve().parent.parent
LABELS = {'phrases': 'フレーズ', 'notes': 'ノート', 'dialogues': '会話',
          'reading': '長文', 'speeches': 'スピーチ', 'patterns': 'パターン練習',
          'freetalk': 'AI会話の開始文', 'batches': '提出ごとの記録',
          'ocr': 'OCR原文・未確認', 'legacy': '旧版の原文', 'documents': '教材の原資料'}
SITUATIONS = dict(zip(['greet','work','food','shop','health','travel','home','hobby','study','plan','feel','people','tech','grammar'],
                     ['あいさつ','仕事','食事','買い物','健康・体調','旅行','家','趣味','学校','予定','気持ち','人間関係','スマホ','単語・文法']))

def build(root=ROOT, checked_on=None):
    checked_on = checked_on or datetime.date.today().isoformat()
    datetime.date.fromisoformat(checked_on)
    sources = {}
    def read_text(path):
        raw = (root / path).read_bytes()
        sources[path] = hashlib.sha256(raw).hexdigest()
        return raw.decode()
    def read(path): return json.loads(read_text(path))
    data = {name: read('data/' + name + '.json') for name in ['phrases','notes','dialogues','reading','speeches','patterns','note_batches','situations']}
    assert {p.stem for p in (root/'data').glob('*.json')} - {'catalog'} == set(data), 'Unreviewed data file'
    expected_situations={'p'+str(r['id']) for r in data['phrases']} | {'d'+str(r['id']) for r in data['dialogues']}
    assert set(data['situations']) == expected_situations, 'Missing or orphaned situation key'
    assert set(data['situations'].values()) <= set(SITUATIONS), 'Unknown situation'
    index = read('audio/audio_index.json')
    japanese = read('audio/ja_index.json')['clips']
    rows, canonical = [], {}
    def add(uid, kind, en='', ja='', note='', **extra):
        row = dict(id=uid, kind=kind, en=en, ja=ja, note=note, **extra)
        rows.append(row)
        return row
    def parts(key, en): return [{'key':key, 'en':en}]
    for kind, prefix in [('phrases','p'),('notes','n')]:
        for item in data[kind]:
            key = prefix + str(item['id'])
            tags = SITUATIONS.get(data['situations'].get(key), '')
            if key in ['p1555','p1520','p1524','p1525']: tags += ' 回復 体調が良くなった 元気になった'
            if re.search(r'体調|回復|元気に|調子が', item.get('ja','') + item.get('note','')): tags += ' 健康・体調'
            batch = next((b for b in data['note_batches'] if b['id'] == item.get('source_batch')), None)
            date = (batch.get('lesson_date') or '') if batch else item.get('date','')
            canonical[key] = add(key, kind, item.get('en',''), item.get('ja',''), item.get('note',''),
                source='data/' + kind + '.json', sourceLabel=item.get('src') or LABELS[kind],
                date=date, tags=tags.strip(), favoriteKey=key, parts=parts(key,item['en']) if item.get('en') else [])
    for d in data['dialogues']:
        for side in ['a','b']:
            key = f"d{d['id']}{side}"
            add(key, 'dialogues', d[side], d[side+'Ja'], d.get('note',''),
                source='data/dialogues.json', sourceLabel=f"会話 {d['id']} · {side.upper()}",
                tags=SITUATIONS.get(data['situations'].get('d'+str(d['id'])),''), parts=parts(key,d[side]),
                **({'favoriteKey':'d'+str(d['id'])} if side == 'b' else {}))
    split = lambda t: [s.strip() for s in re.findall(r'[^.!?]+[.!?]*',t) if s.strip()]
    for r in data['reading']:
        key='r'+str(r['id'])
        add(key,'reading',r['en'],r['ja'],r.get('note',''), source='data/reading.json', sourceLabel=r['section'],
            parts=[{'key':key+'_'+str(i),'en':t} for i,t in enumerate(split(r['en']))])
    groups = {}
    for s in data['speeches']:
        group=groups.setdefault(s['section'], {'key':'s'+str(s['id']),'offset':0})
        sentences=split(s['en'])
        add('s'+str(s['id']),'speeches',s['en'],s['ja'],s.get('note',''), source='data/speeches.json', sourceLabel=s['section'],
            parts=[{'key':group['key']+'_'+str(group['offset']+i),'en':t} for i,t in enumerate(sentences)])
        group['offset']+=len(sentences)
    for course in data['patterns']:
        for p in course['items']:
            add(p['key'],'patterns',p['en'],p['ja'],course['note'],source='data/patterns.json',
                sourceLabel=course['title']+' · '+course['pattern'],parts=parts(p['key'],p['en']))
    script=read_text('js/freetalk.js')
    for key, quoted in re.findall(r"key: '([a-z]+)'[^}]+?opener: (\"(?:[^\"\\]|\\.)*\")",script):
        en=json.loads(quoted)
        add('ft_'+key,'freetalk',en,note='AI会話の開始文。和訳は未登録。',source='js/freetalk.js',sourceLabel='AI会話 · '+key,parts=parts('ft_'+key,en))
    manifest_count = 0
    for batch in data['note_batches']:
        path='data/imports/'+batch['id']+'.json'
        manifest=read(path); manifest_count+=1
        digest=hashlib.sha256(json.dumps(manifest,ensure_ascii=False,sort_keys=True).encode()).hexdigest()
        assert digest==batch['source_sha256'], 'Manifest changed: '+path
        assert len(manifest['entries'])==len(batch['items']), 'Batch length mismatch: '+path
        for i,(entry,item) in enumerate(zip(manifest['entries'],batch['items'])):
            source=canonical[item['key']]
            assert normalize(entry['en'])==normalize(source['en']), 'English mismatch: '+path
            assert entry['ja']==item['ja'] and entry.get('note','')==item.get('note',''), 'Batch text mismatch: '+path
            add(batch['id']+':'+str(i),'batches',entry['en'],entry['ja'],entry.get('note',''),
                source=path,sourceLabel=batch['title'],section=entry['section'], date=batch.get('lesson_date') or '',added_on=batch['added_on'],
                tags=source.get('tags',''),favoriteKey=item['key'],parts=parts(item['key'],entry['en']))
    assert {p.stem for p in (root/'data/imports').glob('*.json')}=={b['id'] for b in data['note_batches']}, 'Unlisted manifest'
    ocr_path='for_chatgpt/未収録_OCR要確認_2026-10-29.tsv'
    # These are literal tab-separated OCR strings, not CSV-quoted fields.
    # Leading unmatched quotes are source characters and must never join rows.
    ocr_lines=read_text(ocr_path).splitlines()
    assert all(len(line.split('\t'))==4 for line in ocr_lines), 'Malformed OCR row'
    ocr=list(csv.DictReader(ocr_lines,delimiter='\t',quoting=csv.QUOTE_NONE))
    for raw in ocr:
        add('ocr:'+raw['ID'],'ocr',raw['英語（Excelのまま）'],note='未確認のOCR原文です。文字の欠落・誤認識があり、正しい例文としては未確定です。元の判定: '+raw['判定']+' / 種別: '+raw['種別'],source=ocr_path,sourceLabel='OCR原文 ID '+raw['ID'])
    legacy=json.JSONDecoder().raw_decode(read_text('SpeakStudio.html').split('window.__DATA__=',1)[1])[0]
    legacy_counts, legacy_differences = {}, 0
    for kind, values in legacy.items():
        if not isinstance(values,list): continue
        legacy_counts[kind]=len(values)
        now={r['id']:r for r in data[kind]}
        for old in values:
            if any(now.get(old['id'],{}).get(k)!=v for k,v in old.items() if k not in ['date','src']):
                legacy_differences+=1
                add('legacy:'+kind+':'+str(old['id']),'legacy',old.get('en',''),old.get('ja',''),
                    '旧版保存用の原文。現在の教材では修正されています。'+old.get('note',''),source='SpeakStudio.html',sourceLabel='単一ファイル旧版 · '+LABELS[kind])
    for path in sorted((root/'docs/lesson-notes').glob('*.md')):
        relative=str(path.relative_to(root)); body=read_text(relative)
        add('doc:'+path.stem,'documents',note=body,source=relative,sourceLabel=body.splitlines()[0].lstrip('# '))
    assert len({r['id'] for r in rows})==len(rows), 'Duplicate catalog ID'
    playable=[part for row in rows for part in row.get('parts',[])]
    for part in playable:
        for suffix in ['', '@gentle','@slow','@fast','@faster']:
            assert part['key']+suffix in index, 'Missing English audio: '+part['key']+suffix
    for row in rows:
        if row.get('parts') and row['ja']:
            assert ' '.join(row['ja'].lower().split()) in japanese, 'Missing Japanese audio: '+row['id']
    counts=dict(collections.Counter(r['kind'] for r in rows))
    base_types=['phrases','notes','dialogues','reading','speeches','patterns','freetalk']
    report={'checked_on':checked_on,'catalog_records':len(rows),'teaching_records':sum(counts.get(k,0) for k in base_types),
            'counts':counts,'manifests_checked':manifest_count,'batch_occurrences':counts['batches'],
            'legacy_counts':legacy_counts,'legacy_differences':legacy_differences,
            'source_sha256':sources,'problems':[],
            'scope':'保存中の教材JSON・全提出記録・教材文書・旧単一ファイル版・未確認OCR原文を照合。現在の会話の追加画像32枚も転記。過去の元画像・Excel・PDFファイル自体はこの環境にないため、保存済みの転記との照合であり、元画像全点の再読取ではない。端末内の学習履歴とAI生成会話は個人のブラウザ内にあり、この公開教材一覧には含めない。件数は表現の重複を含む記録数。'}
    result={'labels':LABELS,'audit':{k:v for k,v in report.items() if k!='source_sha256'},'items':rows}
    (root/'data/catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=1)+'\n')
    directory=root/'docs/catalog'; directory.mkdir(exist_ok=True)
    (directory/'audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    with (directory/'all-data.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f,lineterminator='\n');writer.writerow(['記録ID','種別','英文','和訳','説明・原文','学習日','追加日','出典'])
        for r in rows: writer.writerow([r['id'],LABELS[r['kind']],r['en'],r['ja'],r['note'],r.get('date',''),r.get('added_on',''),r['source']])
    md=['# 全教材・原資料の一覧','',report['scope'],'',f"確認日: {report['checked_on']} / 全{len(rows)}記録",'']
    for kind,label in LABELS.items():
        md.extend(['## '+label+f"（{counts.get(kind,0)}件）",''])
        for r in rows:
            if r['kind']!=kind: continue
            md.extend(['### '+r['id'],'',r['en'],r['ja'],r['note'],'出典: '+r['source']+' / '+r['sourceLabel'],''])
    (directory/'all-data.md').write_text('\n'.join(md))
    print(json.dumps({k:v for k,v in report.items() if k!='source_sha256'},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--checked-on')
    build(checked_on=parser.parse_args().checked_on)
