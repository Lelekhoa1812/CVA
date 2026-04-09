from __future__ import annotations

import unittest

from search.fallback import extract_duckduckgo_candidate_urls


class DuckDuckGoFallbackTests(unittest.TestCase):
    def test_extracts_only_source_domain_urls(self) -> None:
        html = """
        <html>
          <body>
            <a href="https://www.seek.com.au/software-engineer-jobs/in-All-Melbourne-VIC">SEEK search</a>
            <a href="https://www.seek.com.au/software-engineer-jobs/in-All-Melbourne-VIC">SEEK search again</a>
            <a href="https://au.indeed.com/q-software-engineer-l-melbourne-vic-jobs.html">Indeed search</a>
            <a href="https://example.com/not-a-job-board">Noise</a>
          </body>
        </html>
        """

        urls = extract_duckduckgo_candidate_urls("seek", html)

        self.assertEqual(
            urls,
            ["https://www.seek.com.au/software-engineer-jobs/in-All-Melbourne-VIC"],
        )


if __name__ == "__main__":
    unittest.main()
