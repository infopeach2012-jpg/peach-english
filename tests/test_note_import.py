import importlib.util, json, tempfile, unittest
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'for_chatgpt/import_note_batch.py'
spec = importlib.util.spec_from_file_location('import_note_batch', path)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class NoteImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); (self.root / 'data').mkdir()
        self.notes_path = self.root / 'data/notes.json'
        self.notes_path.write_text(json.dumps([{'id': 42, 'date': '2025/1/1', 'en': "I'll call you.", 'ja': '電話します。', 'note': '既存メモ'}]))
        self.batch = {'id': '2026-10-30-01', 'added_on': '2026-10-30', 'lesson_date': '2026-10-29', 'title': 'Example', 'source': 'User screenshot',
                      'entries': [{'en': 'I’ll call you.', 'ja': '電話するね。', 'note': '今回の補足', 'section': 'Conversation'},
                                  {'en': 'See you tomorrow.', 'ja': 'また明日。', 'note': '', 'section': 'Conversation'}]}
        self.manifest = self.root / 'input.json'
    def run_import(self):
        self.manifest.write_text(json.dumps(self.batch)); return module.import_batch(self.manifest, self.root)
    def test_reuses_existing_id_preserves_progress_key_and_source_notes(self):
        result = self.run_import(); self.assertEqual(result['added'], 1); self.assertEqual(result['reused'], 1)
        rows = json.loads(self.notes_path.read_text()); self.assertEqual([n['id'] for n in rows], [42, 43]); self.assertEqual(rows[0]['note'], '既存メモ')
        batch = json.loads((self.root / 'data/note_batches.json').read_text())[0]
        self.assertEqual([n['key'] for n in batch['items']], ['n42', 'n43']); self.assertEqual(batch['items'][0]['note'], '今回の補足')
        self.assertIn('また明日。', (self.root / 'docs/lesson-notes/2026-10-30-01.md').read_text())
    def test_repeated_submission_is_idempotent(self):
        self.run_import(); before = self.notes_path.read_bytes()
        result = self.run_import(); self.assertTrue(result['unchanged']); self.assertEqual(self.notes_path.read_bytes(), before)
        self.assertEqual(len(json.loads((self.root / 'data/note_batches.json').read_text())), 1)
    def test_changed_batch_is_rejected_without_overwriting_existing_notes(self):
        self.run_import(); before = self.notes_path.read_bytes(); self.batch['entries'][0]['ja'] = '訂正'
        with self.assertRaisesRegex(ValueError, 'already exists'): self.run_import()
        self.assertEqual(self.notes_path.read_bytes(), before)
    def test_later_batch_reuses_text_and_is_shown_first(self):
        self.run_import(); self.batch['id'] = '2026-10-31-01'; self.batch['added_on'] = '2026-10-31'
        result = self.run_import(); self.assertEqual(result['added'], 0)
        batches = json.loads((self.root / 'data/note_batches.json').read_text()); self.assertEqual(batches[0]['id'], self.batch['id'])
    def test_incomplete_translation_is_rejected_before_writing(self):
        before = self.notes_path.read_bytes(); self.batch['entries'][0]['ja'] = ''
        with self.assertRaisesRegex(ValueError, 'Missing entry ja'): self.run_import()
        self.assertEqual(self.notes_path.read_bytes(), before)

if __name__ == '__main__': unittest.main()
