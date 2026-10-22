import importlib.util
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

spec = importlib.util.spec_from_file_location('site_verifier', Path(__file__).with_name('verify-site.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class VerificationUrls(unittest.TestCase):
    def test_media_identity_survives_probe(self):
        url = verifier.cache_bust('https://cloud.test/media?id=star-dream')
        self.assertEqual(parse_qs(urlsplit(url).query)['id'], ['star-dream'])
        self.assertIn('verify', parse_qs(urlsplit(url).query))

    def test_existing_encoding_duplicates_blanks_and_fragment_are_preserved(self):
        original = 'https://site.test/file?v=a%2Fb&x=&x=two%20words#section'
        result = verifier.cache_bust(original)
        parts = urlsplit(result)
        self.assertTrue(parts.query.startswith('v=a%2Fb&x=&x=two%20words&verify='))
        self.assertEqual(parts.fragment, 'section')
        self.assertEqual(parts.path, '/file')

    def test_plain_asset_remains_a_single_verification_query(self):
        result = urlsplit(verifier.cache_bust('https://site.test/style.css'))
        self.assertEqual(result.netloc, 'site.test')
        self.assertEqual(result.path, '/style.css')
        self.assertEqual(list(parse_qs(result.query)), ['verify'])


if __name__ == '__main__':
    unittest.main()
