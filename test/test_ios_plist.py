import datetime
import importlib.util
import json
import pathlib
import plistlib
import unittest

spec = importlib.util.spec_from_file_location("decoder", pathlib.Path(__file__).resolve().parents[1] / "scripts/decode-apple-plist.py")
decoder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(decoder)


class ApplePlistTests(unittest.TestCase):
    def test_binary_and_xml_profiles_keep_dates_certificates_and_entitlements(self):
        value = {"UUID": "synthetic", "ExpirationDate": datetime.datetime(2027, 9, 4, 2, 14, 35), "DeveloperCertificates": [b"synthetic-certificate"], "Entitlements": {"get-task-allow": False, "aps-environment": "production"}}
        for fmt in (plistlib.FMT_XML, plistlib.FMT_BINARY):
            with self.subTest(fmt=fmt):
                result = json.loads(decoder.decode(plistlib.dumps(value, fmt=fmt)))
                self.assertEqual(result["ExpirationDate"], "2027-09-04T02:14:35+00:00")
                self.assertEqual(result["DeveloperCertificates"], ["c3ludGhldGljLWNlcnRpZmljYXRl"])
                self.assertIs(result["Entitlements"]["get-task-allow"], False)
                self.assertEqual(result["Entitlements"]["aps-environment"], "production")

    def test_invalid_plist_is_rejected(self):
        with self.assertRaises(plistlib.InvalidFileException):
            decoder.decode(b"invalid")


if __name__ == "__main__":
    unittest.main()
