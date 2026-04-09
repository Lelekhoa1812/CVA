from __future__ import annotations

import unittest

from search.sources import (
    parse_linkedin_detail_page,
    parse_linkedin_search_cards,
    parse_source_search_links,
)

LINKEDIN_SEARCH_FIXTURE = """
<li>
  <div class="base-card base-search-card" data-row="1">
    <a class="base-card__full-link" href="https://au.linkedin.com/jobs/view/job-1?trackingId=abc">
      <span class="sr-only">Senior Software Engineer</span>
    </a>
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">Senior Software Engineer</h3>
      <h4 class="base-search-card__subtitle">Acme</h4>
      <div class="base-search-card__metadata">
        <span class="job-search-card__location">Melbourne, VIC</span>
        <time class="job-search-card__listdate">2 days ago</time>
      </div>
      <div class="job-posting-benefits__text">Hybrid role</div>
    </div>
  </div>
</li>
"""

LINKEDIN_DETAIL_FIXTURE = """
<html>
  <body>
    <h1 class="topcard__title">Senior Software Engineer</h1>
    <a class="topcard__org-name-link">Acme</a>
    <span class="topcard__flavor--bullet">Melbourne, VIC</span>
    <span class="posted-time-ago__text">2 days ago</span>
    <div class="show-more-less-html__markup">
      Build resilient platform tooling for product teams across a hybrid environment.
    </div>
  </body>
</html>
"""

SEEK_SEARCH_FIXTURE = """
<html>
  <body>
    <article>
      <a href="/job/12345678">Software Engineer</a>
      <div>Acme Melbourne VIC Full time Hybrid</div>
    </article>
    <article>
      <a href="/safe-job-searching/">Ignore me</a>
    </article>
  </body>
</html>
"""


class SourceParserTests(unittest.TestCase):
    def test_parses_linkedin_search_cards(self) -> None:
        cards = parse_linkedin_search_cards(LINKEDIN_SEARCH_FIXTURE)

        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["title"], "Senior Software Engineer")
        self.assertEqual(cards[0]["company"], "Acme")
        self.assertEqual(cards[0]["listing_url"], "https://au.linkedin.com/jobs/view/job-1")

    def test_parses_linkedin_detail_page(self) -> None:
        detail = parse_linkedin_detail_page(
            LINKEDIN_DETAIL_FIXTURE,
            "https://au.linkedin.com/jobs/view/job-1",
        )

        self.assertEqual(detail["company"], "Acme")
        self.assertEqual(detail["location"], "Melbourne, VIC")
        self.assertIn("hybrid environment", detail["snippet"].lower())
        self.assertEqual(detail["application_type"], "board-detail")

    def test_parses_seek_search_links(self) -> None:
        links = parse_source_search_links(
            "seek",
            SEEK_SEARCH_FIXTURE,
            "https://www.seek.com.au/jobs?keywords=software+engineer&where=Melbourne",
        )

        self.assertEqual(len(links), 1)
        self.assertEqual(links[0]["title"], "Software Engineer")
        self.assertEqual(links[0]["listing_url"], "https://www.seek.com.au/job/12345678")


if __name__ == "__main__":
    unittest.main()
