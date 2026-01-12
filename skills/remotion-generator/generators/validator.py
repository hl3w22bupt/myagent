"""
Code Validator - Phase 3 of Generation Pipeline

Validates generated Remotion code for correctness and quality.
"""

import re
import logging
from typing import Dict, Any, List, Tuple

logger = logging.getLogger(__name__)


class CodeValidator:
    """
    Validates generated Remotion TypeScript code.

    Performs structural and syntax checks to ensure code quality.
    """

    def __init__(self):
        """Initialize validator."""
        self.validation_stats = {
            "total_validations": 0,
            "passed": 0,
            "failed": 0,
            "warnings": 0
        }

    def validate(self, code: str) -> Tuple[bool, List[str], List[str]]:
        """
        Validate generated Remotion code.

        Args:
            code: Generated TypeScript code

        Returns:
            Tuple of (is_valid, errors, warnings)
        """
        self.validation_stats["total_validations"] += 1

        errors = []
        warnings = []

        # Check 1: Basic structure
        structure_errors = self._check_structure(code)
        errors.extend(structure_errors)

        # Check 2: Required imports
        import_errors = self._check_imports(code)
        errors.extend(import_errors)

        # Check 3: Composition definition
        composition_errors = self._check_composition(code)
        errors.extend(composition_errors)

        # Check 4: Register root
        register_errors = self._check_register_root(code)
        errors.extend(register_errors)

        # Check 5: TypeScript interfaces
        interface_warnings = self._check_interfaces(code)
        warnings.extend(interface_warnings)

        # Check 6: Scene timing
        timing_warnings = self._check_scene_timing(code)
        warnings.extend(timing_warnings)

        # Check 7: Common issues
        common_errors = self._check_common_issues(code)
        errors.extend(common_errors)

        # Determine overall validity
        is_valid = len(errors) == 0

        if is_valid:
            self.validation_stats["passed"] += 1
            logger.info("Code validation passed")
        else:
            self.validation_stats["failed"] += 1
            logger.warning(f"Code validation failed with {len(errors)} errors")

        if warnings:
            self.validation_stats["warnings"] += len(warnings)
            logger.info(f"Validation produced {len(warnings)} warnings")

        return is_valid, errors, warnings

    def _check_structure(self, code: str) -> List[str]:
        """Check basic code structure."""
        errors = []

        if not code or len(code.strip()) < 100:
            errors.append("Code is too short or empty")
            return errors

        # Check for basic TypeScript/React patterns
        if "import" not in code:
            errors.append("Missing import statements")

        if "from 'remotion'" not in code and 'from "remotion"' not in code:
            errors.append("Missing Remotion imports")

        return errors

    def _check_imports(self, code: str) -> List[str]:
        """Check for required Remotion imports."""
        errors = []
        required_imports = [
            "Composition",
            "registerRoot"
        ]

        for imp in required_imports:
            if imp not in code:
                errors.append(f"Missing required import: {imp}")

        return errors

    def _check_composition(self, code: str) -> List[str]:
        """Check for Composition component."""
        errors = []

        # Check for Composition usage
        if "<Composition" not in code:
            errors.append("Missing Composition component")

        # Check for required Composition props
        if "id=" not in code and "id :" not in code:
            errors.append("Composition missing 'id' prop")

        if "component=" not in code and "component :" not in code:
            errors.append("Composition missing 'component' prop")

        if "durationInFrames=" not in code and "durationInFrames :" not in code:
            errors.append("Composition missing 'durationInFrames' prop")

        if "fps=" not in code and "fps :" not in code:
            errors.append("Composition missing 'fps' prop")

        if "width=" not in code and "width :" not in code:
            errors.append("Composition missing 'width' prop")

        if "height=" not in code and "height :" not in code:
            errors.append("Composition missing 'height' prop")

        return errors

    def _check_register_root(self, code: str) -> List[str]:
        """Check for registerRoot call."""
        errors = []

        if "registerRoot" not in code:
            errors.append("Missing registerRoot() call")
        else:
            # Check if it's actually called (not just imported)
            if not re.search(r'registerRoot\s*\(', code):
                errors.append("registerRoot imported but not called")

        return errors

    def _check_interfaces(self, code: str) -> List[str]:
        """Check for TypeScript interfaces (warnings only)."""
        warnings = []

        if "interface" not in code:
            warnings.append("No TypeScript interfaces defined (recommended for type safety)")

        return warnings

    def _check_scene_timing(self, code: str) -> List[str]:
        """Check for scene timing issues."""
        warnings = []

        # Check for hardcoded frame numbers
        # Look for patterns like: frame > 100, frame < 200
        hardcoded_frames = re.findall(r'frame\s*[<>]=?\s*\d+', code)
        if len(hardcoded_frames) > 5:
            warnings.append(
                f"Multiple hardcoded frame numbers detected ({len(hardcoded_frames)}). "
                "Consider using percentages of durationInFrames for flexibility."
            )

        return warnings

    def _check_common_issues(self, code: str) -> List[str]:
        """Check for common code issues."""
        errors = []

        # Check for any types (generally discouraged)
        if "any" in code:
            # Check if it's justified (commented or in specific context)
            any_matches = re.findall(r':\s*any\b', code, re.IGNORECASE)
            if any_matches and len(any_matches) > 3:
                errors.append(
                    f"Excessive use of 'any' type detected ({len(any_matches)}). "
                    "Use proper TypeScript types for type safety."
                )

        # Check for console.log (should be removed in production)
        if "console.log" in code:
            errors.append("console.log statements should be removed")

        # Check for missing React imports
        if "React.FC" in code or "<" in code:  # Likely JSX
            if "import React" not in code:
                errors.append("Using React components but missing React import")

        return errors

    def get_validation_summary(self) -> Dict[str, Any]:
        """
        Get validation statistics summary.

        Returns:
            Dict with validation statistics
        """
        total = self.validation_stats["total_validations"]
        pass_rate = (
            self.validation_stats["passed"] / total * 100
            if total > 0 else 0
        )

        return {
            **self.validation_stats,
            "pass_rate": f"{pass_rate:.1f}%"
        }

    def reset_stats(self):
        """Reset validation statistics."""
        self.validation_stats = {
            "total_validations": 0,
            "passed": 0,
            "failed": 0,
            "warnings": 0
        }
        logger.info("Validator stats reset")

    def generate_error_feedback(self, errors: List[str]) -> str:
        """
        Generate user-friendly error feedback for LLM retry.

        Args:
            errors: List of error messages

        Returns:
            Formatted error feedback
        """
        if not errors:
            return ""

        feedback = "The following issues were found in the generated code:\n\n"

        for i, error in enumerate(errors, 1):
            feedback += f"{i}. {error}\n"

        feedback += "\nPlease fix these issues and regenerate the code."

        return feedback

    def quick_check(self, code: str) -> bool:
        """
        Perform quick validation check (errors only, no warnings).

        Args:
            code: Generated code

        Returns:
            True if code passes basic checks
        """
        is_valid, errors, _ = self.validate(code)
        return is_valid
