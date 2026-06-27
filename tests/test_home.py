"""Тесты слоя «умный дом» (home/): оркестратор, deep_merge, контекст, персона, модули."""
import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend"))

import home
from home import registry


class TestOrchestrator(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self._orig = (home.STATE_FILE, home.LEGACY_FILE, home._state)
        home.STATE_FILE = os.path.join(self._tmp, "state.json")
        home.LEGACY_FILE = os.path.join(self._tmp, "nope.json")   # без миграции
        home._state = None

    def tearDown(self):
        home.STATE_FILE, home.LEGACY_FILE, home._state = self._orig

    def test_state_has_all_modules(self):
        st = home.state()
        for m in registry.MODULES:
            self.assertIn(m.KEY, st)

    def test_update_deep_merge_keeps_siblings(self):
        home.update({"people": {"Слава": {"home": False}}})
        st = home.state()
        self.assertFalse(st["people"]["Слава"]["home"])
        self.assertIn("room", st["people"]["Слава"])   # частичный патч не снёс room
        self.assertIn("Настя", st["people"])           # другой человек цел

    def test_update_persists_to_file(self):
        home.update({"vacuum": {"on": True}})
        self.assertTrue(os.path.exists(home.STATE_FILE))
        with open(home.STATE_FILE, encoding="utf-8") as f:
            saved = json.load(f)
        self.assertTrue(saved["vacuum"]["on"])

    def test_defaults_not_mutated(self):
        presence = next(m for m in registry.MODULES if m.KEY == "people")
        before = json.dumps(presence.DEFAULT, ensure_ascii=False, sort_keys=True)
        home.update({"people": {"Настя": {"home": True, "room": "кухня"}}})
        after = json.dumps(presence.DEFAULT, ensure_ascii=False, sort_keys=True)
        self.assertEqual(before, after)   # модульный DEFAULT не испортился

    def test_context_note_shape(self):
        note = home.build_context_note()
        self.assertTrue(note.startswith("[Сейчас]"))
        self.assertIn("°", note)

    def test_context_note_reflects_state(self):
        home.update({"vacuum": {"on": True, "mode": "mop"}})
        self.assertIn("моет", home.build_context_note())

    def test_persona_includes_home_md(self):
        p = home.persona()
        self.assertIn("[Сейчас]", p)
        self.assertGreater(len(p), 50)


class TestModuleContracts(unittest.TestCase):
    def test_each_module_contract(self):
        for m in registry.MODULES:
            self.assertTrue(hasattr(m, "KEY") and isinstance(m.KEY, str))
            self.assertTrue(hasattr(m, "DEFAULT") and isinstance(m.DEFAULT, dict))
            out = m.context(m.DEFAULT)
            self.assertIsInstance(out, str)
            self.assertTrue(out)

    def test_presence_skips_non_dict(self):
        from home.modules import presence
        out = presence.context({"X": "строка", "Y": {"home": True, "room": "кухня"}})
        self.assertIn("Y дома", out)
        self.assertNotIn("X", out)   # битый патч не уронил и не попал в вывод

    def test_climate_off(self):
        from home.modules import climate
        self.assertIn("выкл", climate.context({"on": False}))


if __name__ == "__main__":
    unittest.main()
