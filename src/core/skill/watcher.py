"""
Skill watcher for hot reload support.

Monitors skill directories for changes and supports hot reload:
- Watch skill.yaml files for modifications
- Auto-reload on file changes
- Debounce to prevent excessive reloads
- Event-driven architecture with callbacks
"""

import asyncio
import time
from pathlib import Path
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
from threading import Thread, Event


class WatchEventType(Enum):
    """Types of file system events."""
    CREATED = "created"
    MODIFIED = "modified"
    DELETED = "deleted"
    MOVED = "moved"


class SkillWatcherEvent:
    """Represents a skill watcher event."""

    def __init__(
        self,
        event_type: WatchEventType,
        skill_path: Path,
        skill_name: str,
        timestamp: float
    ):
        self.event_type = event_type
        self.skill_path = skill_path
        self.skill_name = skill_name
        self.timestamp = timestamp

    def __repr__(self):
        return f"SkillWatcherEvent({self.event_type.value}, {self.skill_name})"


class SkillWatcher:
    """
    Watch skill directories for changes and trigger hot reload.

    Features:
    - Monitors skill.yaml files for changes
    - Debounce to prevent excessive reloads
    - Event-driven callback system
    - Graceful shutdown
    """

    def __init__(
        self,
        skills_dir: str = "skills/",
        debounce_interval: float = 1.0,
        recursive: bool = True
    ):
        """
        Initialize the skill watcher.

        Args:
            skills_dir: Path to skills directory to watch
            debounce_interval: Minimum seconds between reloads for same skill
            recursive: Watch subdirectories recursively
        """
        self.skills_dir = Path(skills_dir)
        self.debounce_interval = debounce_interval
        self.recursive = recursive

        # Event tracking
        self._last_event_time: Dict[str, float] = {}
        self._event_callbacks: List[Callable[[SkillWatcherEvent], None]] = []

        # Watcher state
        self._watching = False
        self._stop_event = Event()
        self._watch_thread: Optional[Thread] = None

        # File modification tracking
        self._file_mtimes: Dict[str, float] = {}

    def add_callback(self, callback: Callable[[SkillWatcherEvent], None]):
        """
        Add a callback for skill change events.

        Args:
            callback: Function to call when a skill changes
        """
        self._event_callbacks.append(callback)

    def remove_callback(self, callback: Callable[[SkillWatcherEvent], None]):
        """
        Remove a callback.

        Args:
            callback: Callback function to remove
        """
        if callback in self._event_callbacks:
            self._event_callbacks.remove(callback)

    async def watch_skills(self, callback: Optional[Callable[[SkillWatcherEvent], None]] = None):
        """
        Start watching skills for changes.

        Args:
            callback: Optional callback for skill change events

        This is an async version that uses polling for compatibility.
        For production use, consider using watchdog library for true event-based monitoring.
        """
        if callback:
            self.add_callback(callback)

        self._watching = True
        self._stop_event.clear()

        # Initialize file mtimes
        await self._scan_initial_state()

        print(f"👀 Started watching {self.skills_dir}")

        try:
            while not self._stop_event.is_set():
                await self._check_for_changes()
                await asyncio.sleep(0.5)  # Poll every 500ms
        except asyncio.CancelledError:
            print("⚠️  Watcher cancelled")
        finally:
            self._watching = False
            print("👀 Stopped watching")

    def start_watching(self, callback: Optional[Callable[[SkillWatcherEvent], None]] = None):
        """
        Start watching in a background thread.

        Args:
            callback: Optional callback for skill change events
        """
        if self._watching:
            return

        if callback:
            self.add_callback(callback)

        self._watching = True
        self._stop_event.clear()

        # Run in background thread
        self._watch_thread = Thread(target=self._watch_loop, daemon=True)
        self._watch_thread.start()

        print(f"👀 Started watching {self.skills_dir} (background)")

    def stop_watching(self):
        """Stop watching skills."""
        if not self._watching:
            return

        self._stop_event.set()
        self._watching = False

        if self._watch_thread:
            self._watch_thread.join(timeout=2.0)
            self._watch_thread = None

        print("👀 Stopped watching")

    def _watch_loop(self):
        """Main watch loop (runs in background thread)."""
        import asyncio

        # Initialize file mtimes
        asyncio.run(self._scan_initial_state())

        try:
            while not self._stop_event.is_set():
                # Check for changes
                changes = self._detect_changes_sync()

                # Process changes
                for event in changes:
                    self._handle_event(event)

                # Sleep for debounce interval
                time.sleep(self.debounce_interval)
        except Exception as e:
            print(f"❌ Watcher error: {e}")

    async def _scan_initial_state(self):
        """Scan initial state of skill files."""
        if not self.skills_dir.exists():
            return

        for skill_yaml in self.skills_dir.rglob("skill.yaml"):
            try:
                mtime = skill_yaml.stat().st_mtime
                self._file_mtimes[str(skill_yaml)] = mtime
            except Exception:
                pass

    async def _check_for_changes(self):
        """Check for file changes (async version)."""
        if not self.skills_dir.exists():
            return

        current_files = {}
        changes = []

        # Scan current state
        for skill_yaml in self.skills_dir.rglob("skill.yaml"):
            try:
                mtime = skill_yaml.stat().st_mtime
                current_files[str(skill_yaml)] = mtime

                # Check for modifications
                old_mtime = self._file_mtimes.get(str(skill_yaml))
                if old_mtime is None:
                    # New file
                    skill_name = self._extract_skill_name(skill_yaml)
                    changes.append(SkillWatcherEvent(
                        WatchEventType.CREATED,
                        skill_yaml,
                        skill_name,
                        time.time()
                    ))
                elif mtime > old_mtime:
                    # Modified file
                    skill_name = self._extract_skill_name(skill_yaml)
                    changes.append(SkillWatcherEvent(
                        WatchEventType.MODIFIED,
                        skill_yaml,
                        skill_name,
                        time.time()
                    ))

                self._file_mtimes[str(skill_yaml)] = mtime
            except Exception:
                pass

        # Check for deleted files
        for file_path in list(self._file_mtimes.keys()):
            if file_path not in current_files:
                skill_yaml = Path(file_path)
                skill_name = self._extract_skill_name(skill_yaml)
                changes.append(SkillWatcherEvent(
                    WatchEventType.DELETED,
                    skill_yaml,
                    skill_name,
                    time.time()
                ))
                del self._file_mtimes[file_path]

        # Process changes
        for event in changes:
            await self._handle_event_async(event)

    def _detect_changes_sync(self) -> List[SkillWatcherEvent]:
        """Detect changes synchronously (for background thread)."""
        if not self.skills_dir.exists():
            return []

        current_files = {}
        changes = []

        # Scan current state
        for skill_yaml in self.skills_dir.rglob("skill.yaml"):
            try:
                mtime = skill_yaml.stat().st_mtime
                current_files[str(skill_yaml)] = mtime

                # Check for modifications
                old_mtime = self._file_mtimes.get(str(skill_yaml))
                if old_mtime is None:
                    # New file
                    skill_name = self._extract_skill_name(skill_yaml)
                    changes.append(SkillWatcherEvent(
                        WatchEventType.CREATED,
                        skill_yaml,
                        skill_name,
                        time.time()
                    ))
                elif mtime > old_mtime:
                    # Modified file
                    skill_name = self._extract_skill_name(skill_yaml)
                    changes.append(SkillWatcherEvent(
                        WatchEventType.MODIFIED,
                        skill_yaml,
                        skill_name,
                        time.time()
                    ))

                self._file_mtimes[str(skill_yaml)] = mtime
            except Exception:
                pass

        # Check for deleted files
        for file_path in list(self._file_mtimes.keys()):
            if file_path not in current_files:
                skill_yaml = Path(file_path)
                skill_name = self._extract_skill_name(skill_yaml)
                changes.append(SkillWatcherEvent(
                    WatchEventType.DELETED,
                    skill_yaml,
                    skill_name,
                    time.time()
                ))
                del self._file_mtimes[file_path]

        return changes

    async def _handle_event_async(self, event: SkillWatcherEvent):
        """Handle event asynchronously."""
        # Check debounce
        last_time = self._last_event_time.get(event.skill_name, 0)
        if event.timestamp - last_time < self.debounce_interval:
            return

        self._last_event_time[event.skill_name] = event.timestamp

        # Notify callbacks
        for callback in self._event_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(event)
                else:
                    callback(event)
            except Exception as e:
                print(f"❌ Callback error: {e}")

        # Log event
        print(f"📝 {event.event_type.value.upper()}: {event.skill_name}")

    def _handle_event(self, event: SkillWatcherEvent):
        """Handle event synchronously."""
        # Check debounce
        last_time = self._last_event_time.get(event.skill_name, 0)
        if event.timestamp - last_time < self.debounce_interval:
            return

        self._last_event_time[event.skill_name] = event.timestamp

        # Notify callbacks
        for callback in self._event_callbacks:
            try:
                callback(event)
            except Exception as e:
                print(f"❌ Callback error: {e}")

        # Log event
        print(f"📝 {event.event_type.value.upper()}: {event.skill_name}")

    def _extract_skill_name(self, skill_yaml: Path) -> str:
        """
        Extract skill name from skill.yaml path.

        Args:
            skill_yaml: Path to skill.yaml file

        Returns:
            Skill name (directory name)
        """
        return skill_yaml.parent.name

    def is_watching(self) -> bool:
        """Check if watcher is currently watching."""
        return self._watching

    def get_watched_files(self) -> List[str]:
        """Get list of files being watched."""
        return list(self._file_mtimes.keys())

    def clear_history(self):
        """Clear file modification history."""
        self._file_mtimes.clear()
        self._last_event_time.clear()


class MultiLevelSkillWatcher:
    """
    Watch multiple skill levels for changes.

    Monitors all levels of MultiLevelSkillRegistry:
    - workspace/, managed/, bundled/, extra/
    """

    def __init__(
        self,
        base_dir: str = ".",
        debounce_interval: float = 1.0
    ):
        """
        Initialize multi-level skill watcher.

        Args:
            base_dir: Base directory
            debounce_interval: Minimum seconds between reloads
        """
        self.base_dir = Path(base_dir)
        self.debounce_interval = debounce_interval

        # Create watchers for each level
        self.watchers: Dict[str, SkillWatcher] = {}
        levels = [
            ("workspace", "skills/"),
            ("managed", "skills/managed/"),
            ("bundled", "skills/bundled/"),
            ("extra", "skills/extra/")
        ]

        for level_name, level_dir in levels:
            full_path = self.base_dir / level_dir
            self.watchers[level_name] = SkillWatcher(
                skills_dir=str(full_path),
                debounce_interval=debounce_interval
            )

    async def watch_all(
        self,
        callback: Optional[Callable[[str, SkillWatcherEvent], None]] = None
    ):
        """
        Watch all levels for changes.

        Args:
            callback: Optional callback with (level_name, event) signature
        """
        async def watch_level(watcher: SkillWatcher, level_name: str):
            async def level_callback(event: SkillWatcherEvent):
                if callback:
                    callback(level_name, event)
                else:
                    print(f"[{level_name}] {event.event_type.value}: {event.skill_name}")

            await watcher.watch_skills(level_callback)

        # Start all watchers in parallel
        tasks = [
            watch_level(watcher, level_name)
            for level_name, watcher in self.watchers.items()
        ]

        await asyncio.gather(*tasks)

    def start_all(
        self,
        callback: Optional[Callable[[str, SkillWatcherEvent], None]] = None
    ):
        """
        Start watching all levels in background.

        Args:
            callback: Optional callback with (level_name, event) signature
        """
        for level_name, watcher in self.watchers.items():
            def make_cb(level):
                return lambda event: callback(level, event) if callback else None

            watcher.start_watching(make_cb(level_name))

    def stop_all(self):
        """Stop watching all levels."""
        for watcher in self.watchers.values():
            watcher.stop_watching()

    def is_watching_any(self) -> bool:
        """Check if any watcher is active."""
        return any(w.is_watching() for w in self.watchers.values())
