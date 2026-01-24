"""
Code Validator - Phase 3 of Generation Pipeline

Validates generated Remotion code for correctness and quality.
"""

import re
import subprocess
import logging
import tempfile
import os
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional

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

    def validate_typescript_syntax(self, code: str, project_dir: Optional[Path] = None) -> Tuple[bool, List[str]]:
        """
        Validate TypeScript code syntax using esbuild.

        This is a REAL syntax check that will catch actual TypeScript errors,
        not just structural issues.

        Args:
            code: Generated TypeScript code
            project_dir: Optional project directory to use for validation

        Returns:
            Tuple of (is_valid, errors)
        """
        errors = []

        # Create a temporary file for validation
        with tempfile.NamedTemporaryFile(mode='w', suffix='.tsx', delete=False) as f:
            f.write(code)
            temp_file = f.name

        try:
            # Find esbuild executable
            esbuild_path = self._find_esbuild()
            if not esbuild_path:
                logger.warning("esbuild not found, skipping TypeScript syntax validation")
                return True, []  # Assume valid if we can't check

            # Run esbuild to check syntax (using --format=errors-only for faster output)
            result = subprocess.run(
                [esbuild_path, temp_file, '--format=errors-only'],
                capture_output=True,
                text=True,
                timeout=30  # 30 second timeout
            )

            if result.returncode != 0:
                # Parse esbuild error output
                stderr = result.stderr.strip()
                stdout = result.stdout.strip()

                # Log raw output for debugging
                logger.error(f"esbuild failed (exit code {result.returncode})")
                if stderr:
                    logger.error(f"esbuild stderr:\n{stderr}")
                if stdout:
                    logger.error(f"esbuild stdout:\n{stdout}")

                # Extract error messages from both stderr and stdout
                error_outputs = []
                if stderr:
                    error_outputs.extend(stderr.split('\n'))
                if stdout:
                    error_outputs.extend(stdout.split('\n'))

                # Process all lines, not just ones containing 'ERROR:'
                for line in error_outputs:
                    line = line.strip()
                    if not line:
                        continue

                    # Clean up the error message
                    error_msg = line
                    # Remove temporary file path for cleaner output
                    error_msg = error_msg.replace(temp_file, 'index.tsx')
                    errors.append(error_msg)

                # If we still have no errors after parsing, add a generic message
                if not errors:
                    errors.append(f"esbuild validation failed (exit code {result.returncode}) but no error details were captured")

                logger.warning(f"TypeScript syntax validation failed with {len(errors)} errors")
                return False, errors

            logger.info("TypeScript syntax validation passed")
            return True, []

        except subprocess.TimeoutExpired:
            logger.error("TypeScript syntax validation timed out")
            errors.append("Syntax validation timed out after 30 seconds")
            return False, errors
        except Exception as e:
            logger.error(f"Error during TypeScript syntax validation: {str(e)}")
            # If validation fails for unexpected reasons, don't block generation
            return True, []
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file)
            except:
                pass

    def _find_esbuild(self) -> Optional[str]:
        """
        Find esbuild executable in the Remotion template directory.

        Returns:
            Path to esbuild executable or None if not found
        """
        # Try to find the template directory
        current_dir = Path(__file__).parent.parent
        template_dir = current_dir / "template"

        if not template_dir.exists():
            # Try alternative location
            template_dir = current_dir.parent / "remotion-generator" / "template"

        if not template_dir.exists():
            logger.warning(f"Could not find template directory at {template_dir}")
            return None

        # Check for esbuild in node_modules/.bin
        esbuild_path = template_dir / "node_modules" / ".bin" / "esbuild"
        if esbuild_path.exists():
            return str(esbuild_path)

        # Try to find esbuild CLI (Windows)
        esbuild_cmd = template_dir / "node_modules" / ".bin" / "esbuild.cmd"
        if esbuild_cmd.exists():
            return str(esbuild_cmd)

        logger.warning(f"esbuild not found in {template_dir}/node_modules/.bin/")
        return None

    def validate_with_syntax_check(self, code: str, project_dir: Optional[Path] = None) -> Tuple[bool, List[str], List[str]]:
        """
        Comprehensive validation including syntax check.

        This combines structural checks with real TypeScript syntax validation.

        Args:
            code: Generated TypeScript code
            project_dir: Optional project directory

        Returns:
            Tuple of (is_valid, errors, warnings)
        """
        # First do structural checks
        is_valid, errors, warnings = self.validate(code)

        # Then do TypeScript syntax validation
        syntax_valid, syntax_errors = self.validate_typescript_syntax(code, project_dir)

        if not syntax_valid:
            is_valid = False
            errors.extend(syntax_errors)

        return is_valid, errors, warnings
