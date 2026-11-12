"""bkt-dia-common: shared settings, query client and tool factory for every ``bkt-dia-*`` module.

Registers no model tools. Modules import ``plugins.bkt_dia_common.tool_factory`` directly (an
in-tree module-to-module import, not a core crossing); this plugin being *enabled* is the opt-in
gate ``query_client.query`` checks before any request. See ``tool_factory`` for the module contract.
"""

from __future__ import annotations

import logging

from plugins.bkt_dia_common.settings import PLUGIN_ID, configured_endpoint, query_url

logger = logging.getLogger(__name__)


def register(ctx) -> None:
    """Warn early about a missing or malformed endpoint; the tools fail closed either way.

    Reads only the endpoint: resolving the API key here could hit an unbound secret scope at load.
    """
    endpoint = configured_endpoint()
    if not endpoint:
        logger.warning("%s: plugins.entries.%s.settings.endpoint is not set; bkt-dia tools will refuse "
                       "to query until it is", PLUGIN_ID, PLUGIN_ID)
        return
    try:
        query_url(endpoint)
    except ValueError as exc:
        # The endpoint value itself is not logged: it may carry userinfo credentials.
        logger.warning("%s: the configured endpoint is invalid (%s); bkt-dia tools will refuse to query",
                       PLUGIN_ID, exc)
