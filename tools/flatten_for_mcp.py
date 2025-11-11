import json
from typing import Any, Dict


def is_primitive(v: Any) -> bool:
    return v is None or isinstance(v, (str, int, float, bool))


def _flatten(obj: Dict[str, Any], parent: str = '') -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in obj.items():
        key = f"{parent}_{k}" if parent else k
        if is_primitive(v):
            out[key] = v
        elif isinstance(v, list):
            if all(is_primitive(x) for x in v):
                out[key] = v
            else:
                out[f"{key}_raw_json"] = json.dumps(v)
        elif isinstance(v, dict):
            nested = _flatten(v, key)
            out.update(nested)
        else:
            out[key] = str(v)
    return out


def flatten_for_mcp(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}
    return _flatten(payload, '')


if __name__ == '__main__':
    import sys
    data = json.load(sys.stdin)
    print(json.dumps(flatten_for_mcp(data), indent=2))
