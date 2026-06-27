"""Тесты веб-поиска (search.py): формат результата для модели + маскировка ключа."""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))

import search


class TestFormat(unittest.TestCase):
    def test_format_shape_and_trim(self):
        data = {"answer": "Ответ", "results": [
            {"title": "T", "url": "http://x", "content": "C" * 1000, "score": 0.9},
            {"title": "T2", "url": "u2", "content": "c2"},
        ]}
        d = json.loads(search._format(data))
        self.assertEqual(d["answer"], "Ответ")
        self.assertEqual(len(d["results"]), 2)
        self.assertEqual(len(d["results"][0]["content"]), 500)   # контент обрезается
        self.assertNotIn("score", d["results"][0])               # score модели не нужен

    def test_format_empty(self):
        d = json.loads(search._format({}))
        self.assertEqual(d["answer"], "")
        self.assertEqual(d["results"], [])


class TestStatus(unittest.TestCase):
    def test_masks_key(self):
        FAKE = "tvly-test-EXAMPLE-not-a-real-key-0000"   # заведомо фейковый, не настоящий ключ
        orig = search.load_key
        search.load_key = lambda: FAKE
        try:
            st = search.status()
        finally:
            search.load_key = orig
        self.assertTrue(st["configured"])
        self.assertNotEqual(st["key_hint"], FAKE)   # наружу — только маска, не сырой ключ
        self.assertIn("…", st["key_hint"])

    def test_no_key(self):
        orig = search.load_key
        search.load_key = lambda: ""
        try:
            st = search.status()
        finally:
            search.load_key = orig
        self.assertFalse(st["configured"])


if __name__ == "__main__":
    unittest.main()
