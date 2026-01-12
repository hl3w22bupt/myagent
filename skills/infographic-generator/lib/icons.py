"""Icon mapping for semantic icon selection."""

ICON_MAPPING = {
    "process": ["mdi/cog", "mdi/settings", "mdi/settings-outline"],
    "step": ["mdi/step-forward", "mdi/arrow-right", "mdi/chevron-right"],
    "timeline": ["mdi/timeline", "mdi/clock-outline", "mdi/history"],
    "flow": ["mdi/flow-arrow", "mdi/arrow-decision", "mdi/trending-up"],
    "list": ["mdi/format-list-bulleted", "mdi/format-list-numbered", "mdi/view-list"],
    "compare": ["mdi/compare", "mdi/balance", "mdi/scale-balance"],
    "hierarchy": ["mdi/sitemap", "mdi/organizational-chart", "mdi/file-tree"],
    "chart": ["mdi/chart-bar", "mdi/chart-pie", "mdi/chart-line"],
    "data": ["mdi/database", "mdi/server", "mdi/storage"],
    "technology": ["mdi/laptop", "mdi/developer-board", "mdi/microchip"],
    "business": ["mdi/briefcase", "mdi/office-building", "mdi/account-tie"],
    "user": ["mdi/account", "mdi/user", "mdi/person"],
    "time": ["mdi/clock", "mdi/timer", "mdi/watch"],
    "success": ["mdi/check-circle", "mdi/check-bold", "mdi-checkbox-marked-circle"],
    "warning": ["mdi/alert", "mdi/alert-circle", "mdi/exclamation"],
    "error": ["mdi/close-circle", "mdi/close-octagon", "mdi/alert-octagon"],
    "idea": ["mdi/lightbulb", "mdi/lightbulb-outline", "mdi/sparkles"],
    "target": ["mdi/target", "mdi-crosshairs", "mdi-flag"],
    "web": ["mdi/web", "mdi/earth", "mdi/globe"],
    "mobile": ["mdi/cellphone", "mdi/tablet", "mdi/devices"],
    "cloud": ["mdi/cloud", "mdi/cloud-outline", "mdi-cloud-upload"],
    "security": ["mdi/shield", "mdi/lock", "mdi/security"],
    "analytics": ["mdi/analytics", "mdi/chart-line-variant", "mdi/chart-multiple"],
    "design": ["mdi/palette", "mdi/draw", "mdi/color-palette"],
    "code": ["mdi/code-tags", "mdi/xml", "mdi/file-code"],
    "test": ["mdi/test-tube", "mdi/flask", "mdi-bug-check"],
    "deploy": ["mdi/rocket-launch", "mdi/upload", "mdi-cloud-upload"],
    "development": ["mdi/code-braces", "mdi-console", "mdi-terminal"],
}


def suggest_icon(keyword: str) -> str:
    """Suggest icon based on keyword."""
    keyword_lower = keyword.lower()

    for icon_type, icons in ICON_MAPPING.items():
        if icon_type.lower() == keyword_lower or keyword_lower in icon_type.lower():
            return icons[0]

    return "mdi/star"


def suggest_icon_for_context(label: str) -> str:
    """Suggest icon based on label context."""
    label_lower = label.lower()

    if any(kw in label_lower for kw in ["process", "流程", "步骤"]):
        return suggest_icon("process")
    if any(kw in label_lower for kw in ["time", "时间", "时间线"]):
        return suggest_icon("time")
    if any(kw in label_lower for kw in ["data", "数据", "统计"]):
        return suggest_icon("data")
    if any(kw in label_lower for kw in ["tech", "技术", "科技"]):
        return suggest_icon("technology")
    if any(kw in label_lower for kw in ["business", "商业", "企业"]):
        return suggest_icon("business")
    if any(kw in label_lower for kw in ["success", "成功", "完成"]):
        return suggest_icon("success")
    if any(kw in label_lower for kw in ["error", "错误", "失败"]):
        return suggest_icon("error")
    if any(kw in label_lower for kw in ["test", "测试"]):
        return suggest_icon("test")
    if any(kw in label_lower for kw in ["deploy", "部署", "发布"]):
        return suggest_icon("deploy")

    return suggest_icon("idea")
