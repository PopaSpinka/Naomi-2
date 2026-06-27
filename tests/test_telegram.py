"""Тесты телеграм-моста: чанкинг, конвертация markdown→MarkdownV2, фолбэк на плейн."""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))

import telegram


class TestChunks(unittest.TestCase):
    def test_short_stays_one(self):
        self.assertEqual(telegram._chunks("привет", 100), ["привет"])

    def test_long_splits_on_lines_and_keeps_all(self):
        text = "\n".join(f"строка номер {i}" for i in range(400))
        chunks = telegram._chunks(text, 120)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(c) <= 120 for c in chunks))
        self.assertEqual("\n".join(chunks).count("строка"), text.count("строка"))  # ничего не потеряли

    def test_overlong_single_line_hard_split(self):
        chunks = telegram._chunks("A" * 250, 100)
        self.assertTrue(all(len(c) <= 100 for c in chunks))
        self.assertEqual(sum(len(c) for c in chunks), 250)


class TestMarkdownV2(unittest.TestCase):
    def test_bold_converts(self):
        md = telegram._to_mdv2("релиз **19 ноября**.")
        self.assertIn("*19 ноября*", md)   # ** → *
        self.assertNotIn("**", md)

    def test_specials_escaped(self):
        md = telegram._to_mdv2("цена 79.99 (скидка)")
        self.assertIn("\\.", md)           # точка экранирована — иначе Телеграм отвергнет


class TestSendFallback(unittest.IsolatedAsyncioTestCase):
    async def _run(self, fail_md):
        calls = []

        async def fake_api(client, token, method, **p):
            calls.append((method, p))
            if p.get("parse_mode") == "MarkdownV2" and fail_md:
                return {"ok": False, "description": "can't parse entities"}
            return {"ok": True, "result": {"message_id": len(calls)}}

        orig = telegram._api
        telegram._api = fake_api
        try:
            await telegram._send(None, "TOK", 1, "текст **жирный**")
        finally:
            telegram._api = orig
        return calls

    async def test_happy_path_uses_markdownv2(self):
        calls = await self._run(fail_md=False)
        self.assertEqual([p.get("parse_mode") for _, p in calls], ["MarkdownV2"])

    async def test_fallback_to_plain_on_parse_error(self):
        calls = await self._run(fail_md=True)
        modes = [p.get("parse_mode") for _, p in calls]
        self.assertIn("MarkdownV2", modes)   # сначала пробуем разметку
        self.assertIn(None, modes)           # затем фолбэк без parse_mode
        self.assertIn("**", calls[-1][1]["text"])  # фолбэк шлёт исходный текст


if __name__ == "__main__":
    unittest.main()
