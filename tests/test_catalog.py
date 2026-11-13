"""Cross-check published catalog exports against independently read sources."""
import csv
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def read(path): return json.loads((ROOT/path).read_text())

class CatalogCoverageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog=read('data/catalog.json');cls.rows=cls.catalog['items']
        cls.by_id={r['id']:r for r in cls.rows}

    def test_every_primary_text_and_translation(self):
        for kind,prefix in [('phrases','p'),('notes','n'),('reading','r'),('speeches','s')]:
            source=read('data/'+kind+'.json')
            self.assertEqual(len([r for r in self.rows if r['kind']==kind]),len(source))
            for original in source:
                row=self.by_id[prefix+str(original['id'])]
                for field in ['en','ja','note']:self.assertEqual(row[field],original.get(field,''))
        for original in read('data/dialogues.json'):
            for side in ['a','b']:
                row=self.by_id[f"d{original['id']}{side}"]
                self.assertEqual((row['en'],row['ja']),(original[side],original[side+'Ja']))
        for course in read('data/patterns.json'):
            for item in course['items']:
                self.assertEqual((self.by_id[item['key']]['en'],self.by_id[item['key']]['ja']),(item['en'],item['ja']))

    def test_every_submission_preserves_original_wording(self):
        count=0
        for path in (ROOT/'data/imports').glob('*.json'):
            batch=json.loads(path.read_text())
            for i,entry in enumerate(batch['entries']):
                row=self.by_id[batch['id']+':'+str(i)]
                self.assertEqual(row['en'],entry['en'])
                self.assertEqual(row['ja'],entry['ja'])
                self.assertEqual(row['note'],entry.get('note',''))
                count+=1
        self.assertEqual(count,self.catalog['audit']['batch_occurrences'])
        # This is an earlier learner attempt, not an approved standalone exercise.
        correction=self.by_id['2026-11-12-01:27']
        self.assertIn('I live in Japan, so the Japanese economy is decreasing.',correction['note'])
        self.assertIn('不自然な因果関係',correction['note'])

    def test_unverified_and_original_documents_are_retained(self):
        path=ROOT/'for_chatgpt/未収録_OCR要確認_2026-10-29.tsv'
        lines=path.read_text().splitlines()
        originals=[dict(zip(lines[0].split('\t'),line.split('\t'))) for line in lines[1:]]
        self.assertEqual(len(originals),self.catalog['audit']['counts']['ocr'])
        self.assertEqual(self.by_id['ocr:1']['en'],'"blew it.')
        self.assertEqual(self.by_id['ocr:2']['en'],'"i leave in about an hour.')
        for old in originals:
            row=self.by_id['ocr:'+old['ID']]
            self.assertEqual(row['en'],old['英語（Excelのまま）'])
            self.assertNotIn('parts',row)
        for path in (ROOT/'docs/lesson-notes').glob('*.md'):
            self.assertEqual(self.by_id['doc:'+path.stem]['note'],path.read_text())

    def test_exports_have_every_record_without_truncating_notes(self):
        with (ROOT/'docs/catalog/all-data.csv').open(encoding='utf-8-sig',newline='') as f:
            exported=list(csv.DictReader(f))
        self.assertEqual(len(exported),len(self.rows))
        markdown=(ROOT/'docs/catalog/all-data.md').read_text()
        for row,export in zip(self.rows,exported):
            self.assertEqual(export['記録ID'],row['id'])
            self.assertEqual(export['英文'],row['en']);self.assertEqual(export['説明・原文'],row['note'])
            self.assertIn('### '+row['id']+'\n',markdown)
        self.assertEqual(len(self.by_id),len(self.rows))

    def test_all_playable_translations_have_real_files(self):
        index=read('audio/ja_index.json')['clips']
        for row in self.rows:
            if row.get('parts') and row['ja']:
                clip=index[' '.join(row['ja'].lower().split())]
                self.assertGreater((ROOT/'audio'/(clip+'.mp3')).stat().st_size,1000,row['id'])

if __name__=='__main__':unittest.main()
