"""Template definitions and matching rules."""

TEMPLATES = {
    "sequence": {
        "strict_order": [
            "sequence-zigzag-steps-underline-text",
            "sequence-horizontal-zigzag-simple",
        ],
        "timeline": ["sequence-timeline-simple", "sequence-timeline-rounded-rect-node"],
        "roadmap": [
            "sequence-roadmap-vertical-simple",
            "sequence-snake-steps-underline-text",
        ],
        "ascending": ["sequence-ascending-steps", "sequence-stairs-front-compact-card"],
    },
    "list": {
        "horizontal": ["list-row-horizontal-icon-arrow", "list-row-simple-illus"],
        "vertical": ["list-column-vertical-icon-arrow", "list-column-done-list"],
        "grid": ["list-grid-badge-card", "list-grid-candy-card-lite"],
    },
    "compare": {
        "binary": [
            "compare-binary-horizontal-simple-fold",
            "compare-binary-horizontal-badge-card-arrow",
        ],
        "swot": ["compare-swot"],
    },
    "hierarchy": {
        "tree": [
            "hierarchy-tree-tech-style-capsule-item",
            "hierarchy-tree-curved-line-rounded-rect-node",
        ],
        "structure": ["hierarchy-structure"],
    },
    "chart": {
        "column": ["chart-column-simple"],
        "bar": ["chart-bar-plain-text"],
        "pie": ["chart-pie-donut-pill-badge", "chart-pie-plain-text"],
        "line": ["chart-line-plain-text"],
    },
    "quadrant": {
        "simple": ["quadrant-quarter-simple-card"],
        "circular": ["quadrant-quarter-circular"],
    },
    "relation": {
        "circle": ["relation-circle-icon-badge", "relation-circle-circular-progress"]
    },
}

CONTENT_TYPE_KEYWORDS = {
    "sequence": [
        "步骤",
        "流程",
        "阶段",
        "step",
        "process",
        "phase",
        "timeline",
        "时间线",
        "timeline",
        "flow",
        "顺序",
        "sequence",
        "roadmap",
    ],
    "list": [
        "要点",
        "列表",
        "特性",
        "features",
        "list",
        "points",
        "items",
        "要点",
        "key points",
        "collection",
        "集合",
    ],
    "compare": [
        "对比",
        "比较",
        "优缺点",
        "vs",
        "compare",
        "pros and cons",
        "差异",
        "difference",
        "swot",
        "binary",
        "binary",
    ],
    "hierarchy": [
        "结构",
        "架构",
        "层级",
        "organization",
        "structure",
        "hierarchy",
        "组织",
        "tree",
        "树形",
        "分类",
        "classification",
    ],
    "chart": [
        "数据",
        "统计",
        "占比",
        "data",
        "statistics",
        "chart",
        "percentage",
        "百分比",
        "pie",
        "bar",
        "column",
        "graph",
        "trend",
    ],
    "quadrant": ["矩阵", "象限", "quadrant", "matrix", "four quadrant", "2x2"],
    "relation": ["关系", "关联", "relation", "connection", "association", "link"],
}


def identify_content_type(content: str) -> str:
    """Identify content type based on keywords."""
    content_lower = content.lower()

    max_matches = 0
    best_match = "list"

    for content_type, keywords in CONTENT_TYPE_KEYWORDS.items():
        matches = sum(1 for keyword in keywords if keyword.lower() in content_lower)
        if matches > max_matches:
            max_matches = matches
            best_match = content_type

    return best_match


def recommend_template(content_type: str, content: str = "") -> str:
    """Recommend best template for content type."""
    if content_type not in TEMPLATES:
        return "list-column-vertical-icon-arrow"

    type_dict = TEMPLATES[content_type]
    if not type_dict:
        return "list-column-vertical-icon-arrow"

    first_category = list(type_dict.keys())[0]
    template_list = type_dict[first_category]

    if isinstance(template_list, list) and len(template_list) > 0:
        return template_list[0]

    return "list-column-vertical-icon-arrow"

    templates = TEMPLATES[content_type]

    if not templates:
        return "list-column-vertical-icon-arrow"

    if isinstance(templates, list):
        return templates[0] if len(templates) > 0 else "list-column-vertical-icon-arrow"

    if isinstance(templates, dict):
        template_groups = list(templates.values())
        if template_groups and template_groups[0]:
            group = template_groups[0]
            if isinstance(group, list) and len(group) > 0:
                return group[0]
        return "list-column-vertical-icon-arrow"

    return "list-column-vertical-icon-arrow"
