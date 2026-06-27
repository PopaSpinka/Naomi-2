"""Тесты клиента LLM (oai.py): формат input-items, блок контекста, разбор JWT."""
import base64
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))

import oai


class TestInput(unittest.TestCase):
    def test_roles_and_types(self):
        items = oai._to_input([
            {"role": "user", "content": "привет"},
            {"role": "assistant", "content": "ну привет"},
        ])
        self.assertEqual(items[0]["role"], "user")
        self.assertEqual(items[0]["content"][0]["type"], "input_text")     # юзер → input_text
        self.assertEqual(items[1]["content"][0]["type"], "output_text")    # ассистент → output_text

    def test_context_item_is_labeled_user_note(self):
        it = oai._context_item("СОСТОЯНИЕ ДОМА")
        self.assertEqual(it["role"], "user")
        text = it["content"][0]["text"]
        self.assertIn("СОСТОЯНИЕ ДОМА", text)
        self.assertIn("не реплика", text.lower())   # помечено как НЕ слова собеседника

    def test_web_search_tool_requires_english(self):
        d = oai.WEB_SEARCH_TOOL
        self.assertEqual(d["name"], "web_search")
        self.assertIn("ENGLISH", d["description"])
        self.assertTrue(d.get("strict"))


class TestJwt(unittest.TestCase):
    def test_jwt_exp_parses(self):
        payload = base64.urlsafe_b64encode(json.dumps({"exp": 1234567890}).encode()).decode().rstrip("=")
        self.assertEqual(oai._jwt_exp(f"head.{payload}.sig"), 1234567890)

    def test_jwt_exp_bad_token(self):
        self.assertEqual(oai._jwt_exp("не-jwt"), 0)   # битый токен → 0, без исключений


if __name__ == "__main__":
    unittest.main()
