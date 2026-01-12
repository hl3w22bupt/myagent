"""HTML template for infographic rendering."""

HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}}</title>
    <script src="https://unpkg.com/@antv/infographic@latest/dist/infographic.min.js"></script>
    <style>
        body {{
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: #f5f5f5;
        }}
        #container {{
            background-color: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }}
    </style>
</head>
<body>
    <div id="container" style="width: {{width}}px; height: {{height}}px;"></div>
    <script>
        const dsl = `{{dsl}}`;
        const infographic = new Infographic({{
            container: document.getElementById('container'),
            dsl: dsl
        }});
    </script>
</body>
</html>
'''

def generate_html(title: str, dsl: str, width: int = 1920, height: int = 1080) -> str:
    """Generate HTML from template."""
    html = HTML_TEMPLATE.replace('{{title}}', title)
    html = html.replace('{{dsl}}', dsl.replace('`', '\\`'))
    html = html.replace('{{width}}', str(width))
    html = html.replace('{{height}}', str(height))
    return html
