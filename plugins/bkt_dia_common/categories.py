"""Category slugs for ``bkt-*`` modules: the Python source of truth for ``category:<slug>`` tags.

Every bkt plugin manifest carries exactly one ``category:<slug>`` tag whose slug is a key of
:data:`CATEGORIES`. The dashboard BKT Modules page groups modules by that tag; the cross-module
contract test checks every manifest against this map.
"""

from __future__ import annotations

from typing import Mapping

CATEGORY_TAG_PREFIX = "category:"

CATEGORIES: Mapping[str, Mapping[str, str]] = {
    "shared": {"vi": "Thành phần dùng chung", "en": "Shared foundation"},
    "knowledge-rag": {"vi": "Tri thức & RAG", "en": "Knowledge & RAG"},
    "assistant-channels": {"vi": "Trợ lý & kênh hội thoại", "en": "Assistants & channels"},
    "domain-lookup": {"vi": "Tra cứu nghiệp vụ", "en": "Domain lookup"},
    "analysis-forecast": {"vi": "Phân tích & dự báo", "en": "Analysis & forecast"},
    "decision-support": {"vi": "Hỗ trợ ra quyết định", "en": "Decision support"},
    "monitoring-personalization": {"vi": "Giám sát & cá nhân hóa", "en": "Monitoring & personalization"},
}


def category_tag(slug: str) -> str:
    """The manifest tag for *slug* (``domain-lookup`` -> ``category:domain-lookup``); unknown slugs raise."""
    if slug not in CATEGORIES:
        raise ValueError(f"unknown bkt category slug {slug!r}; expected one of {sorted(CATEGORIES)}")
    return f"{CATEGORY_TAG_PREFIX}{slug}"


def category_label(slug: str, lang: str = "en") -> str:
    """Display label for *slug* in ``vi`` or ``en`` (English for any other language)."""
    labels = CATEGORIES[slug]
    return labels.get(lang, labels["en"])
