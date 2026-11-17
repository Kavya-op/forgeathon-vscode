import os

def get_debug_flag() -> bool:
    """Get whether debug mode should be enabled for the app, indicated by the
    :envvar:`FLASK_DEBUG` environment variable. The default is ``False``.

    Values treated as false: '0', 'false', 'no', 'off', 'n' (case-insensitive).
    """
    val = os.environ.get("FLASK_DEBUG")

    if not val:
        return False

    return val.lower() not in {"0", "false", "no", "off", "n"}
