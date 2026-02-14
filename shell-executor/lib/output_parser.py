"""
Output Parser for Shell Commands

Intelligent parsing of command output in various formats.
"""

import json
import re
import csv
from io import StringIO
from typing import Dict, Any, List, Tuple, Optional, Union


class OutputParser:
    """
    Parse shell command output into structured formats.
    """

    def __init__(self, options: Optional[Dict[str, Any]] = None):
        """
        Initialize output parser.

        Args:
            options: Parsing options (delimiter, skip_rows, skip_empty, trim)
        """
        self.options = options or {}
        self.delimiter = self.options.get('delimiter')
        self.skip_rows = self.options.get('skip_rows', 0)
        self.skip_empty = self.options.get('skip_empty', True)
        self.trim = self.options.get('trim', True)

    def parse(
        self,
        output: str,
        format_type: str
    ) -> Dict[str, Any]:
        """
        Parse output based on format type.

        Args:
            output: Raw command output
            format_type: Format to parse (raw, json, table, kv, csv, auto)

        Returns:
            Dictionary with parsed data and metadata
        """
        if format_type == 'raw' or not output.strip():
            return {'type': 'raw', 'content': output}

        if format_type == 'auto':
            format_type = self._detect_format(output)

        # Dispatch to appropriate parser
        parsers = {
            'json': self._parse_json,
            'table': self._parse_table,
            'kv': self._parse_kv,
            'csv': self._parse_csv,
        }

        parser = parsers.get(format_type, self._parse_raw)
        return parser(output)

    def _detect_format(self, output: str) -> str:
        """
        Auto-detect output format.

        Args:
            output: Raw output

        Returns:
            Detected format type
        """
        stripped = output.strip()

        # Check for JSON
        if stripped.startswith(('{', '[')):
            try:
                json.loads(stripped)
                return 'json'
            except (json.JSONDecodeError, ValueError):
                pass

        # Check for CSV (comma-separated with multiple lines)
        lines = stripped.split('\n')
        if len(lines) > 1 and ',' in lines[0]:
            # Try to parse as CSV
            try:
                reader = csv.reader(StringIO(stripped))
                rows = list(reader)
                if len(rows) > 1 and all(len(row) == len(rows[0]) for row in rows[1:]):
                    return 'csv'
            except Exception:
                pass

        # Check for table format (psql-like, ls -l, etc.)
        if self._looks_like_table(lines):
            return 'table'

        # Check for key-value pairs
        if self._looks_like_kv(lines):
            return 'kv'

        # Default to raw
        return 'raw'

    def _looks_like_table(self, lines: List[str]) -> bool:
        """
        Check if output looks like a table.

        Args:
            lines: Output lines

        Returns:
            True if looks like table
        """
        if len(lines) < 2:
            return False

        # Check for psql-style table (has separator line with +, -, =)
        for i, line in enumerate(lines):
            if re.match(r'^[\+\|=\-]{10,}', line):
                return True

        # Check for aligned columns
        # Get non-empty lines
        non_empty = [line for line in lines[:10] if line.strip()]
        if len(non_empty) >= 2:
            # Check if lines have consistent word count
            word_counts = [len(line.split()) for line in non_empty[:5]]
            if len(set(word_counts)) <= 2:  # Allow small variation
                return True

        return False

    def _looks_like_kv(self, lines: List[str]) -> bool:
        """
        Check if output looks like key-value pairs.

        Args:
            lines: Output lines

        Returns:
            True if looks like key-value
        """
        if len(lines) < 1:
            return False

        # Check if most lines contain '=' or ':'
        kv_lines = 0
        for line in lines[:10]:
            if ':' in line or '=' in line:
                kv_lines += 1

        return kv_lines >= len(lines[:10]) * 0.5

    def _parse_json(self, output: str) -> Dict[str, Any]:
        """
        Parse JSON output.

        Args:
            output: Raw output

        Returns:
            Parsed JSON data
        """
        try:
            data = json.loads(output)
            return {'type': 'json', 'content': data}
        except json.JSONDecodeError as e:
            return {
                'type': 'error',
                'content': f"Failed to parse JSON: {str(e)}"
            }

    def _parse_table(self, output: str) -> Dict[str, Any]:
        """
        Parse table output (psql, ls -l, etc.).

        Args:
            output: Raw output

        Returns:
            Parsed table data
        """
        lines = output.strip().split('\n')

        # Handle psql-style tables with borders
        if self._is_psql_table(lines):
            return self._parse_psql_table(lines)

        # Handle space-aligned tables
        return self._parse_aligned_table(lines)

    def _is_psql_table(self, lines: List[str]) -> bool:
        """Check if this is a psql-style table."""
        return len(lines) >= 3 and any(
            re.match(r'^[\+\|=\-]{10,}', line)
            for line in lines
        )

    def _parse_psql_table(self, lines: List[str]) -> Dict[str, Any]:
        """
        Parse psql-style table with borders.

        Args:
            lines: Output lines

        Returns:
            Parsed table data
        """
        # Find header line (first line after border that's not a border)
        headers = None
        header_idx = -1
        separator_idx = -1

        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith('|') and not re.match(r'^[\+\|=\-]+$', stripped):
                if headers is None:
                    # Extract headers from between | markers
                    headers = [cell.strip() for cell in stripped.split('|')[1:-1]]
                    header_idx = i
            elif re.match(r'^[\+\|=\-]+$', stripped):
                if header_idx >= 0 and separator_idx < 0:
                    separator_idx = i
                    break

        if not headers:
            return self._parse_aligned_table(lines)

        # Parse data rows (skip headers and separator)
        rows = []
        for line in lines[separator_idx + 1:]:
            stripped = line.strip()
            if stripped.startswith('|'):
                cells = [cell.strip() for cell in stripped.split('|')[1:-1]]
                if len(cells) == len(headers):
                    rows.append(cells)

        return {
            'type': 'table',
            'headers': headers,
            'rows': rows
        }

    def _parse_aligned_table(self, lines: List[str]) -> Dict[str, Any]:
        """
        Parse space-aligned table.

        Args:
            lines: Output lines

        Returns:
            Parsed table data
        """
        # Filter empty lines
        if self.skip_empty:
            lines = [line for line in lines if line.strip()]

        # Skip rows if requested
        if self.skip_rows > 0:
            lines = lines[self.skip_rows:]

        if not lines:
            return {
                'type': 'table',
                'headers': [],
                'rows': []
            }

        # First line is headers
        headers = self._split_line(lines[0])
        rows = [self._split_line(line) for line in lines[1:]]

        return {
            'type': 'table',
            'headers': headers,
            'rows': rows
        }

    def _split_line(self, line: str) -> List[str]:
        """
        Split line into cells, handling multiple spaces.

        Args:
            line: Line to split

        Returns:
            List of cells
        """
        # Split by whitespace
        cells = line.strip().split()

        if self.trim:
            cells = [cell.strip() for cell in cells]

        return cells

    def _parse_kv(self, output: str) -> Dict[str, Any]:
        """
        Parse key-value pair output.

        Args:
            output: Raw output

        Returns:
            Parsed key-value data
        """
        result = {}
        lines = output.strip().split('\n')

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Try different separators
            if '=' in line and not line.startswith('#'):
                key, value = line.split('=', 1)
                result[key.strip()] = value.strip()
            elif ':' in line and not line.startswith('#'):
                parts = line.split(':', 1)
                if len(parts) == 2:
                    key, value = parts
                    result[key.strip()] = value.strip()

        return {
            'type': 'kv',
            'content': result
        }

    def _parse_csv(self, output: str) -> Dict[str, Any]:
        """
        Parse CSV output.

        Args:
            output: Raw output

        Returns:
            Parsed CSV data
        """
        reader = csv.reader(StringIO(output.strip()))
        rows = list(reader)

        if not rows:
            return {
                'type': 'table',
                'headers': [],
                'rows': []
            }

        headers = rows[0]
        data_rows = rows[1:]

        return {
            'type': 'table',
            'headers': headers,
            'rows': data_rows
        }

    def _parse_raw(self, output: str) -> Dict[str, Any]:
        """
        Return raw output.

        Args:
            output: Raw output

        Returns:
            Raw output as text
        """
        return {'type': 'raw', 'content': output}


class PostgresHelper:
    """
    Helper for PostgreSQL-specific output parsing.
    """

    @staticmethod
    def build_psql_command(
        query: str,
        host: Optional[str] = None,
        port: Optional[int] = None,
        database: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        format: str = 'aligned'
    ) -> Tuple[str, List[str]]:
        """
        Build psql command with connection parameters.

        Args:
            query: SQL query or psql command
            host: Database host
            port: Database port
            database: Database name
            user: Database user
            password: Database password
            format: Output format (aligned, csv, json)

        Returns:
            Tuple of (command, args)
        """
        args = []

        # Add host
        if host:
            args.extend(['-h', host])

        # Add port
        if port:
            args.extend(['-p', str(port)])

        # Add database
        if database:
            args.extend(['-d', database])

        # Add user
        if user:
            args.extend(['-U', user])

        # Set password via environment (not in args for security)
        env = {}
        if password:
            env['PGPASSWORD'] = password

        # Add format option
        if format == 'csv':
            args.extend(['-A', '-F', ','])  # Unaligned CSV
        elif format == 'json':
            # psql doesn't support JSON output directly
            # Would need to use row_to_json in query
            pass

        # Add query
        args.extend(['-c', query])

        return ('psql', args, env)

    @staticmethod
    def parse_schema_output(output: str) -> Dict[str, Any]:
        """
        Parse output from \\d table command.

        Args:
            output: Output from \\d command

        Returns:
            Parsed schema information
        """
        lines = output.strip().split('\n')

        # Find the table structure part
        in_table = False
        columns = []

        for line in lines:
            if 'Column' in line and 'Type' in line:
                in_table = True
                continue

            if in_table and line.strip():
                # Parse column line
                # Format: " column_name | column_type | modifiers"
                if '|' in line:
                    parts = [p.strip() for p in line.split('|')]
                    if len(parts) >= 2:
                        columns.append({
                            'name': parts[0],
                            'type': parts[1],
                            'modifiers': parts[2] if len(parts) > 2 else ''
                        })

        return {
            'type': 'schema',
            'columns': columns
        }

    @staticmethod
    def parse_query_output(output: str) -> List[List[str]]:
        """
        Parse output from SELECT query.

        Args:
            output: Query output

        Returns:
            List of rows (including headers)
        """
        parser = OutputParser()
        result = parser.parse(output, 'table')

        if result['type'] == 'table':
            return [result['headers']] + result['rows']

        return []
