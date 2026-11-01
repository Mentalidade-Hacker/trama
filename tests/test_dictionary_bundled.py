"""Checks the actual shipped data when present; source-only CI omits the database."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dictionary import DictionaryService

RESOURCE = Path(__file__).resolve().parents[1] / 'resources' / 'dictionary.sqlite'


@unittest.skipUnless(RESOURCE.is_file(), 'The generated dictionary is included in full release packages only.')
class BundledDictionaryTests(unittest.TestCase):
    def setUp(self):
        self.service = DictionaryService(RESOURCE)

    def test_full_english_edition_is_bundled_alongside_portuguese(self):
        status = self.service.status()
        self.assertTrue(status['available'])
        self.assertGreater(status['counts']['en'], 1_000_000)
        self.assertGreater(status['counts']['pt'], 300_000)
        self.assertEqual(status['sources'][1]['name'], 'English Wiktionary')

    def test_expanded_terms_and_expressions_have_real_definitions(self):
        for word in ('metacognition', 'epistemology', 'idempotent', 'counterfactual',
                     'thought-provoking', 'silver lining', 'cognitive dissonance',
                     'overfitting', 'synecdoche', 'due diligence'):
            with self.subTest(word=word):
                result = self.service.lookup(word, 'en')
                self.assertTrue(result['found'])
                for entry in result['entries']:
                    self.assertTrue(entry['partOfSpeech'])
                    self.assertTrue(entry['definitions'])
                    self.assertTrue(entry['source']['url'].startswith('https://en.wiktionary.org/wiki/'))

    def test_real_examples_and_portuguese_remain_available_without_network(self):
        result = self.service.lookup('dictionary', 'en')
        self.assertTrue(any(sense['examples'] for entry in result['entries'] for sense in entry['definitions']))
        self.assertTrue(self.service.lookup('ação', 'pt')['found'])
        self.assertFalse(self.service.lookup('trama-nonexistent-fixture-word-097521', 'en')['found'])


if __name__ == '__main__':
    unittest.main()
